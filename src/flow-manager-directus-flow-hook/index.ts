import { defineHook } from '@directus/extensions-sdk';
import { generateUUID } from '../utils/common.util';
import type { FlowExecutionData, RevisionCreateActionData } from '../types';

type ExceptionConstructor = new (message: string) => Error;

export default defineHook(({ action, filter }, context) => {
  const { services, env } = context;
  const exceptions = (context as Record<string, unknown>).exceptions as
    | Record<string, ExceptionConstructor>
    | undefined;
  // Safety Lock: Prevent deletion of locked flows if enforcement is enabled
  filter('flows.delete', async (keys: string[], _meta, { database }) => {
    const rawVal =
      env?.FLOW_MANAGER_ENFORCE_SAFETY_LOCK ?? process.env.FLOW_MANAGER_ENFORCE_SAFETY_LOCK;
    const isEnforced = rawVal === 'true' || rawVal === true;
    if (!isEnforced || !keys || !keys.length) {
      return keys;
    }

    try {
      const flows = await database('directus_flows')
        .whereIn('id', keys)
        .select('id', 'name', 'options');

      for (const flow of flows) {
        let opts = flow.options;
        if (typeof opts === 'string') {
          try {
            opts = JSON.parse(opts);
          } catch {}
        }
        if (opts && typeof opts === 'object' && opts.locked === true) {
          const flowName = flow.name || flow.id;
          const msg = `Flow "${flowName}" is protected by Safety Lock. Unlock it before deleting.`;
          if (exceptions?.ForbiddenException) {
            throw new exceptions.ForbiddenException(msg);
          }
          throw new Error(msg);
        }
      }
    } catch (err: unknown) {
      // Re-throw if it's our lock error
      if (err instanceof Error && err.message.includes('Safety Lock')) {
        throw err;
      }
      // Otherwise log and allow delete to prevent breaking flows if DB query fails
      console.warn('[flow-manager] Error checking flow safety lock in flows.delete hook:', err);
    }

    return keys;
  });

  action('revisions.create', async (data: RevisionCreateActionData, { database, schema }) => {
    if (!data.payload) return;
    const { RevisionsService, ActivityService } = services;
    const activityService = new ActivityService({
      knex: database,
      schema: schema!,
    });
    const [activity] = await activityService.readByQuery({
      filter: {
        _and: [
          {
            id: {
              _eq: data.payload.activity,
            },
          },
        ],
      },
    });
    if (activity?.action === 'run') {
      const revisionsService = new RevisionsService({
        knex: database,
        schema: schema!,
      });

      const [countResult] = await revisionsService.readByQuery({
        aggregate: {
          countDistinct: ['id'],
        },
        filter: {
          _and: [
            {
              collection: {
                _eq: 'directus_flows',
              },
            },
            {
              item: {
                _eq: data.payload.item,
              },
            },
            {
              version: {
                _null: true,
              },
            },
            {
              activity: {
                action: {
                  _eq: 'run',
                },
              },
            },
          ],
        },
      });

      const flow = await database('directus_flows')
        .select(
          'directus_flows.id as id',
          'flow_manager_metadata.id as metadata_id',
          'flow_manager_metadata.flow_manager_success_counter',
          'flow_manager_metadata.flow_manager_error_counter',
        )
        .leftJoin(
          'flow_manager_metadata',
          'directus_flows.flow_manager_metadata_id',
          'flow_manager_metadata.id',
        )
        .where({ 'directus_flows.id': data.payload.item })
        .first();

      if (!flow) {
        return;
      }

      const successCounter = flow.flow_manager_success_counter || 0;
      const errorCounter = flow.flow_manager_error_counter || 0;

      let lastExecutionData: FlowExecutionData | null = null;
      if (typeof data.payload.data === 'string') {
        try {
          lastExecutionData = JSON.parse(data.payload.data) as FlowExecutionData;
        } catch {}
      } else if (data.payload.data && typeof data.payload.data === 'object') {
        lastExecutionData = data.payload.data as FlowExecutionData;
      }

      let lastStepErrorMessage = '';
      let lastStepOperation = '';
      let lastStepStatus = '';
      if (lastExecutionData) {
        const lastStep = lastExecutionData.steps?.[lastExecutionData.steps.length - 1];
        lastStepStatus = lastStep?.status ?? '';
        if (lastStepStatus === 'reject') {
          // A rejected step does not always carry a $last payload. When it is
          // null, Array.isArray(null) is false, so the else branch used to read
          // .message off null and throw inside the action handler.
          const lastError = lastExecutionData.data?.$last;
          if (Array.isArray(lastError)) {
            lastStepErrorMessage = lastError[0]?.message ?? '';
          } else {
            lastStepErrorMessage = lastError?.message ?? '';
          }
          lastStepOperation = lastStep?.operation ?? '';
        }
      }

      const payload = {
        flow_manager_last_run_at: new Date(),
        flow_manager_run_counter: countResult?.countDistinct.id || 0,
        flow_manager_last_run_message: lastStepErrorMessage,
        flow_manager_last_run_operation: lastStepOperation,
        flow_manager_success_counter:
          lastStepStatus === 'resolve' ? successCounter + 1 : successCounter,
        flow_manager_error_counter: lastStepStatus === 'reject' ? errorCounter + 1 : errorCounter,
      };

      if (flow.metadata_id) {
        await database('flow_manager_metadata').update(payload).where('id', flow.metadata_id);
      } else {
        const metadataId = generateUUID();
        await database('flow_manager_metadata').insert({
          id: metadataId,
          ...payload,
        });
        await database('directus_flows')
          .update({ flow_manager_metadata_id: metadataId })
          .where('id', flow.id);
      }
    }
  });
});

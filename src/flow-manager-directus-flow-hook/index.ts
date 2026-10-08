import { defineHook } from '@directus/extensions-sdk';
import { generateUUID } from '../utils/common.util';
import type { FlowExecutionData, RevisionCreateActionData } from '../types';

export default defineHook(({ action }, { services }) => {
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

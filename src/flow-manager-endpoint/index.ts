import { defineEndpoint } from '@directus/extensions-sdk';
import axios from 'axios';
import { transformData } from '../utils/flow.util';
import type { IFlow, IOperation, ISyncFlowCounter } from '../types';
import isEqual from 'lodash/isEqual';
import { generateUUID } from '../utils/common.util';
import { extendedFormatDate } from '../utils/date.util';
import { simulateFlow, type SimulationReaderService } from '../utils/flow-simulator.util';

function validateRemoteUrl(rawUrl: unknown): { valid: true; url: string } | { valid: false; error: string } {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, error: 'Remote URL is required and must be a valid string.' };
  }
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Invalid URL protocol: only http: and https: are allowed.' };
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').trim();
  if (
    host === '169.254.169.254' ||
    host === '169.254.170.2' ||
    host.startsWith('169.254.') ||
    host === 'metadata.google.internal' ||
    host === 'metadata.titus.netflix.com' ||
    host === 'fd00:ec2::254' ||
    host.startsWith('fe80:')
  ) {
    return { valid: false, error: 'Access to cloud metadata and link-local endpoints is prohibited.' };
  }
  return { valid: true, url: trimmed.replace(/\/+$/, '') };
}

export default defineEndpoint((router, { database, services, getSchema, logger }) => {
  router.post('/flow-manager/process', async (_req, res) => {
    // @ts-expect-error this is the internal directus accountability data
    if (!_req.accountability?.admin) {
      res.status(401).send({
        error: 'Unauthorized',
      });
      return;
    }
    const { url, staticToken, method, payload, headers: customHeaders } = _req.body;

    if (url) {
      const urlValidation = validateRemoteUrl(url);
      if (!urlValidation.valid) {
        res.status(400).json({ error: urlValidation.error });
        return;
      }
    }

    try {
      const { data } = await axios.request({
        url,
        method: method || 'GET',
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
          ...(staticToken ? { Authorization: `Bearer ${staticToken}` } : {}),
          ...(customHeaders || {}),
        },
        data: payload,
      });

      res.send(data);
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        res.status(500).send({
          error: e.response?.data || e.message,
          status: e.response?.status ?? e.status,
          code: e.code,
        });
      } else {
        const error = e instanceof Error ? e.message : String(e);
        res.status(500).send({
          error,
        });
      }
    }
  });

  router.post('/flow-manager/sync-counters', async (_req, res) => {
    // @ts-expect-error this is the internal directus accountability data
    if (!_req.accountability?.admin) {
      res.status(401).send({
        error: 'Unauthorized',
      });
      return;
    }
    const { staticToken, url, type } = _req.body as ISyncFlowCounter;
    if (type === 'local') {
      try {
        const { ActivityService } = services;
        const schema = await getSchema({ database });
        const activityService = new ActivityService({
          knex: database,
          schema,
        });
        const flows = await database('directus_flows')
          .select('directus_flows.id', 'flow_manager_metadata.id as metadata_id')
          .leftJoin(
            'flow_manager_metadata',
            'directus_flows.flow_manager_metadata_id',
            'flow_manager_metadata.id',
          );

        for (let i = 0; i < flows.length; i++) {
          const flow = flows[i];
          let successCounter = 0;
          let errorCounter = 0;
          let lastStepErrorMessage = '';
          let lastStepOperation = '';
          const activities = await activityService.readByQuery({
            filter: {
              _and: [
                {
                  item: {
                    _eq: flow.id,
                  },
                },
                {
                  action: {
                    _eq: 'run',
                  },
                },
                {
                  collection: {
                    _eq: 'directus_flows',
                  },
                },
              ],
            },
            fields: ['id', 'revisions.data', 'timestamp'],
            limit: -1,
            sort: ['-id'],
          });
          const lastRunAt: string | null = activities[0]?.timestamp || null;

          for (let j = 0; j < activities.length; j++) {
            const activity = activities[j];
            if (activity) {
              const revisions = activity.revisions;
              for (let k = 0; k < revisions.length; k++) {
                const revision = revisions[k];

                let lastExecutionData = revision.data;

                if (typeof lastExecutionData === 'string') {
                  try {
                    lastExecutionData = JSON.parse(lastExecutionData);
                  } catch {}
                }

                let lastStepStatus = '';
                if (lastExecutionData) {
                  const lastStep = lastExecutionData.steps?.[lastExecutionData.steps?.length - 1];
                  lastStepStatus = lastStep?.status;
                  if (lastStepStatus === 'reject') {
                    // A rejected step does not always carry a $last payload. When it is
                    // null, Array.isArray(null) is false, so the else branch used to read
                    // .message off null and throw inside the action handler.
                    const lastError = lastExecutionData.data?.$last;
                    // last activity because we sorted it desc(id)
                    if (j === 0) {
                      if (Array.isArray(lastError)) {
                        lastStepErrorMessage = lastError[0]?.message ?? '';
                      } else {
                        lastStepErrorMessage = lastError?.message ?? '';
                      }
                      lastStepOperation = lastStep.operation;
                    }
                  }
                }

                if (lastStepStatus === 'reject') {
                  errorCounter += 1;
                } else {
                  successCounter += 1;
                }
              }
            }
          }

          const payload = {
            flow_manager_last_run_at: lastRunAt
              ? extendedFormatDate(lastRunAt, 'YYYY-MM-DD HH:mm:ss')
              : null,
            flow_manager_success_counter: successCounter,
            flow_manager_error_counter: errorCounter,
            flow_manager_run_counter: successCounter + errorCounter,
            flow_manager_last_run_message: lastStepErrorMessage,
            flow_manager_last_run_operation: lastStepOperation,
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
        res.status(200).send({
          flows,
        });
      } catch (e: unknown) {
        if (axios.isAxiosError(e)) {
          res.status(500).send({
            error: e.response?.data || e.message,
            status: e.response?.status ?? e.status,
          });
        } else {
          const error = e instanceof Error ? e.message : String(e);
          res.status(500).send({
            error,
          });
        }
      }
    } else if (type === 'remote' && staticToken && url) {
      const urlValidation = validateRemoteUrl(url);
      if (!urlValidation.valid) {
        res.status(400).json({ error: urlValidation.error });
        return;
      }
      const remoteUrl = urlValidation.url;
      try {
        const {
          data: { data: currentUser },
        } = await axios.get(
          `${remoteUrl}/users/me?fields[]=role.policies.policy.admin_access&fields[]=policies.policy.admin_access`,
          {
            headers: {
              Authorization: `Bearer ${staticToken}`,
            },
          },
        );
        if (!currentUser) {
          throw new Error('User not found');
        }
        const policies = [];
        policies.push(...currentUser.policies);
        const rolePolicies = currentUser.role?.policies || [];
        policies.push(...rolePolicies);
        const isAdmin = policies.some((p) => p.policy.admin_access);
        if (!isAdmin) {
          res.status(401).send({
            error: 'Unauthorized',
          });
          return;
        }

        const {
          data: { data: flows },
        } = await axios.get(
          `${remoteUrl}/flows?fields[]=*&fields[]=flow_manager_metadata_id.*&limit=-1`,
          {
            headers: {
              Authorization: `Bearer ${staticToken}`,
            },
          },
        );

        for (let i = 0; i < flows.length; i++) {
          const flow = flows[i];
          let successCounter = 0;
          let errorCounter = 0;
          let lastStepErrorMessage = '';
          let lastStepOperation = '';
          const {
            data: { data: activities },
          } = await axios.get(
            `${remoteUrl}/activity?fields[]=id&fields[]=timestamp&filter[_and][0][item][_eq]=${flow.id}&filter[_and][1][action][_eq]=run&filter[_and][2][collection][_eq]=directus_flows&limit=-1`,
            {
              headers: {
                Authorization: `Bearer ${staticToken}`,
              },
            },
          );
          const lastRunAt: string | null = activities[0]?.timestamp || null;

          for (let j = 0; j < activities.length; j++) {
            const activity = activities[j];
            if (activity) {
              const {
                data: { data: revisions },
              } = await axios.get(
                `${remoteUrl}/revisions?fields[]=data&filter[activity][_eq]=${activity.id}&limit=-1&sort=-id`,
                {
                  headers: {
                    Authorization: `Bearer ${staticToken}`,
                  },
                },
              );
              for (let k = 0; k < revisions.length; k++) {
                const revision = revisions[k];

                let lastExecutionData = revision.data;
                if (typeof lastExecutionData === 'string') {
                  try {
                    lastExecutionData = JSON.parse(lastExecutionData);
                  } catch {}
                }

                let lastStepStatus = '';
                if (lastExecutionData) {
                  const lastStep = lastExecutionData.steps?.[lastExecutionData.steps?.length - 1];
                  lastStepStatus = lastStep?.status;
                  if (lastStepStatus === 'reject') {
                    // A rejected step does not always carry a $last payload. When it is
                    // null, Array.isArray(null) is false, so the else branch used to read
                    // .message off null and throw inside the action handler.
                    const lastError = lastExecutionData.data?.$last;
                    // last activity because we sorted it desc(id)
                    if (j === 0 && k === 0) {
                      if (Array.isArray(lastError)) {
                        lastStepErrorMessage = lastError[0]?.message ?? '';
                      } else {
                        lastStepErrorMessage = lastError?.message ?? '';
                      }
                      lastStepOperation = lastStep.operation;
                    }
                  }
                }

                if (lastStepStatus === 'reject') {
                  errorCounter += 1;
                } else {
                  successCounter += 1;
                }
              }
            }
          }

          const payload = {
            flow_manager_last_run_at: lastRunAt
              ? extendedFormatDate(lastRunAt, 'YYYY-MM-DD HH:mm:ss')
              : null,
            flow_manager_success_counter: successCounter,
            flow_manager_error_counter: errorCounter,
            flow_manager_run_counter: successCounter + errorCounter,
            flow_manager_last_run_message: lastStepErrorMessage,
            flow_manager_last_run_operation: lastStepOperation,
          };
          if (flow.flow_manager_metadata_id?.id) {
            await axios.patch(
              `${remoteUrl}/items/flow_manager_metadata/${flow.flow_manager_metadata_id.id}`,
              payload,
              {
                headers: {
                  Authorization: `Bearer ${staticToken}`,
                },
              },
            );
          } else {
            const { data: createdMetadata } = await axios.post(
              `${remoteUrl}/items/flow_manager_metadata`,
              payload,
              {
                headers: {
                  Authorization: `Bearer ${staticToken}`,
                },
              },
            );
            await axios.patch(
              `${remoteUrl}/flows/${flow.id}`,
              {
                flow_manager_metadata_id: createdMetadata.id,
              },
              {
                headers: {
                  Authorization: `Bearer ${staticToken}`,
                },
              },
            );
          }
        }
        res.status(200).send({
          flows,
        });
      } catch (e: unknown) {
        const error = e as { message: string };
        res.status(500).send({
          error: error.message || 'Internal server error',
        });
      }
    }
  });

  type EndpointHandler = Parameters<typeof router.post>[1];
  type EndpointReq = Parameters<EndpointHandler>[0];
  type EndpointRes = Parameters<EndpointHandler>[1];

  const handleDashboardDetail = async (_req: EndpointReq, res: EndpointRes) => {
    // @ts-expect-error this is the internal directus accountability data
    if (!_req.accountability?.admin) {
      res.status(401).send({
        error: 'Unauthorized',
      });
      return;
    }
    try {
      const page = _req.query.page
        ? parseInt(String(_req.query.page), 10)
        : _req.body?.page
          ? parseInt(String(_req.body.page), 10)
          : 1;
      const limit = _req.query.limit
        ? parseInt(String(_req.query.limit), 10)
        : _req.body?.limit
          ? parseInt(String(_req.body.limit), 10)
          : 10;
      const url = (_req.query.url || _req.body?.url) as string | undefined;
      const staticToken = (_req.query.staticToken || _req.body?.staticToken) as string | undefined;

      if (url && staticToken) {
        const urlValidation = validateRemoteUrl(url);
        if (!urlValidation.valid) {
          res.status(400).json({ error: urlValidation.error });
          return;
        }
        const remoteUrl = urlValidation.url;

        const { data: flowRes } = await axios.get(
          `${remoteUrl}/flows/${_req.params.flowId}?fields[]=id&fields[]=name&fields[]=operations.id&fields[]=operations.name&fields[]=flow_manager_metadata_id.flow_manager_success_counter&fields[]=flow_manager_metadata_id.flow_manager_error_counter`,
          {
            headers: { Authorization: `Bearer ${staticToken}` },
          },
        );
        const flow = flowRes?.data ?? flowRes;
        if (!flow) {
          res.status(404).send({ error: 'Flow not found' });
          return;
        }

        const operationMap = (flow.operations || []).reduce(
          (acc: Record<string, string>, op: { id: string; name: string }) => {
            acc[op.id] = op.name;
            return acc;
          },
          {},
        );

        const { data: actRes } = await axios.get(
          `${remoteUrl}/activity?filter[_and][0][item][_eq]=${_req.params.flowId}&filter[_and][1][action][_eq]=run&filter[_and][2][collection][_eq]=directus_flows&fields[]=id&fields[]=timestamp&sort=-timestamp&limit=${limit}&page=${page}`,
          {
            headers: { Authorization: `Bearer ${staticToken}` },
          },
        );

        const activities = actRes?.data ?? actRes ?? [];
        const activityHistories: {
          id: number;
          type: 'success' | 'error';
          date: Date;
          operation: string;
          message: string;
          data: unknown;
        }[] = [];

        for (let j = 0; j < activities.length; j++) {
          const activity = activities[j];
          if (activity) {
            const { data: revRes } = await axios.get(
              `${remoteUrl}/revisions?fields[]=data&filter[activity][_eq]=${activity.id}&limit=-1&sort=-id`,
              {
                headers: { Authorization: `Bearer ${staticToken}` },
              },
            );
            const revisions = revRes?.data ?? revRes ?? [];
            for (let k = 0; k < revisions.length; k++) {
              const revision = revisions[k];

              let lastExecutionData = revision.data;
              if (typeof lastExecutionData === 'string') {
                try {
                  lastExecutionData = JSON.parse(lastExecutionData);
                } catch {}
              }

              let lastStepStatus = '';
              let lastStepErrorMessage = '';
              let lastStepOperationName = '';

              if (lastExecutionData) {
                const lastStep = lastExecutionData.steps?.[lastExecutionData.steps?.length - 1];
                lastStepStatus = lastStep?.status;
                const lastData = lastExecutionData.data?.$last;
                if (lastStepStatus === 'reject' && lastData != null) {
                  lastStepOperationName = lastStep?.operation
                    ? (operationMap[lastStep.operation] ?? '')
                    : '';
                  lastStepErrorMessage = Array.isArray(lastData)
                    ? (lastData[0]?.message ?? '')
                    : (lastData?.message ?? '');
                }
              }

              if (lastStepStatus === 'reject') {
                activityHistories.push({
                  id: activity.id,
                  type: 'error',
                  date: new Date(activity.timestamp),
                  operation: lastStepOperationName,
                  message: lastStepErrorMessage,
                  data: lastExecutionData,
                });
              } else {
                activityHistories.push({
                  id: activity.id,
                  type: 'success',
                  date: new Date(activity.timestamp),
                  operation: lastStepOperationName,
                  message: lastStepErrorMessage,
                  data: lastExecutionData,
                });
              }
            }
          }
        }

        const successCount = flow.flow_manager_metadata_id?.flow_manager_success_counter ?? 0;
        const errorCount = flow.flow_manager_metadata_id?.flow_manager_error_counter ?? 0;

        res.status(200).send({
          successCount,
          errorCount,
          activityHistories,
        });
        return;
      }

      const { ActivityService, FlowsService } = services;
      const schema = await getSchema({ database });
      const flowsService = new FlowsService({
        knex: database,
        schema,
      });
      const activityService = new ActivityService({
        knex: database,
        schema,
      });
      const activityHistories: {
        id: number;
        type: 'success' | 'error';
        date: Date;
        operation: string;
        message: string;
        data: unknown;
      }[] = [];
      const [flow] = (await flowsService.readByQuery({
        filter: {
          id: {
            _eq: String(_req.params.flowId),
          },
        },
        fields: [
          'id',
          'flow_manager_metadata_id.flow_manager_success_counter',
          'flow_manager_metadata_id.flow_manager_error_counter',
          'operations.id',
          'operations.name',
        ],
      })) as unknown as {
        id: string;
        flow_manager_metadata_id?: {
          flow_manager_success_counter?: number;
          flow_manager_error_counter?: number;
        } | null;
        operations: { id: string; name: string }[];
      }[];
      if (!flow) {
        res.status(404).send({ error: 'Flow not found' });
        return;
      }
      const activities = await activityService.readByQuery({
        filter: {
          _and: [
            {
              item: {
                _eq: flow.id,
              },
            },
            {
              action: {
                _eq: 'run',
              },
            },
            {
              collection: {
                _eq: 'directus_flows',
              },
            },
          ],
        },
        fields: ['id', 'timestamp', 'revisions.data'],
        sort: ['-timestamp'],
        limit,
        page,
      });

      const operationMap = flow.operations.reduce(
        (acc, operation) => {
          acc[operation.id] = operation.name;
          return acc;
        },
        {} as Record<string, string>,
      );
      for (let j = 0; j < activities.length; j++) {
        const activity = activities[j];
        if (activity) {
          const revisions = activity.revisions;
          for (let k = 0; k < revisions.length; k++) {
            const revision = revisions[k];

            let lastExecutionData = revision.data;
            if (typeof lastExecutionData === 'string') {
              try {
                lastExecutionData = JSON.parse(lastExecutionData);
              } catch {}
            }

            let lastStepStatus = '';
            let lastStepErrorMessage = '';
            let lastStepOperationName = '';

            if (lastExecutionData) {
              const lastStep = lastExecutionData.steps?.[lastExecutionData.steps?.length - 1];
              lastStepStatus = lastStep?.status;
              const lastData = lastExecutionData.data?.$last;
              if (lastStepStatus === 'reject' && lastData != null) {
                lastStepOperationName = lastStep?.operation
                  ? (operationMap[lastStep.operation] ?? '')
                  : '';
                lastStepErrorMessage = Array.isArray(lastData)
                  ? (lastData[0]?.message ?? '')
                  : (lastData?.message ?? '');
              }
            }

            if (lastStepStatus === 'reject') {
              activityHistories.push({
                id: activity.id,
                type: 'error',
                date: new Date(activity.timestamp),
                operation: lastStepOperationName,
                message: lastStepErrorMessage,
                data: lastExecutionData,
              });
            } else {
              activityHistories.push({
                id: activity.id,
                type: 'success',
                date: new Date(activity.timestamp),
                operation: lastStepOperationName,
                message: lastStepErrorMessage,
                data: lastExecutionData,
              });
            }
          }
        }
      }
      const successCount = flow.flow_manager_metadata_id?.flow_manager_success_counter ?? 0;
      const errorCount = flow.flow_manager_metadata_id?.flow_manager_error_counter ?? 0;

      res.status(200).send({
        successCount,
        errorCount,
        activityHistories,
      });
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        res.status(500).send({
          error: e.response?.data || e.message,
          status: e.response?.status ?? e.status,
          code: e.code,
        });
      } else {
        const error = e instanceof Error ? e.message : String(e);
        res.status(500).send({
          error,
        });
      }
    }
  };

  router.get('/flow-manager/dashboard/:flowId', (_req, res) => {
    handleDashboardDetail(_req, res);
  });
  router.post('/flow-manager/dashboard/:flowId', (_req, res) => {
    handleDashboardDetail(_req, res);
  });

  router.post('/flow-manager/push-to-cloud/preflight', async (_req, res) => {
    // @ts-expect-error this is the internal directus accountability data
    if (!_req.accountability?.admin) {
      res.status(401).send({
        error: 'Unauthorized',
      });
      return;
    }
    try {
      const { FlowsService } = services;
      const flowsService = new FlowsService({
        knex: database,
        schema: await getSchema({ database }),
      });
      const operationFields = [
        'operations.id',
        'operations.name',
        'operations.key',
        'operations.type',
        'operations.position_x',
        'operations.position_y',
        'operations.options',
        'operations.resolve',
        'operations.reject',
        'operations.flow',
      ];
      const {
        config: { url, staticToken },
        flowId,
      } = _req.body;

      const urlValidation = validateRemoteUrl(url);
      if (!urlValidation.valid) {
        res.status(400).json({ error: urlValidation.error });
        return;
      }
      const remoteUrl = urlValidation.url;

      const [localFlow] = await flowsService.readByQuery({
        filter: {
          id: {
            _eq: flowId,
          },
        },
        fields: ['*', ...operationFields],
      });
      if (!localFlow) {
        res.status(404).send({ error: 'Local flow not found' });
        return;
      }

      const axiosInstance = axios.create({
        baseURL: remoteUrl,
        headers: {
          'Content-Type': 'application/json',
          ...(staticToken ? { Authorization: `Bearer ${staticToken}` } : {}),
        },
        timeout: 15000,
      });

      const fields = [`fields[]=*`, ...operationFields.map((f) => `fields[]=${f}`)];
      const {
        data: { data: remoteFlows },
      } = await axiosInstance.request({
        url: `/flows?filter[id][_eq]=${flowId}&${fields.join('&')}`,
        method: 'GET',
      });

      const remoteFlow = remoteFlows?.[0] || null;

      res.json({
        exists: !!remoteFlow,
        localFlow,
        remoteFlow,
      });
    } catch (e: unknown) {
      let message = 'Failed to inspect remote instance';
      if (axios.isAxiosError(e)) {
        message = e.response?.data?.errors?.[0]?.message || e.message;
      } else if (e instanceof Error) {
        message = e.message;
      }
      res.status(500).json({ error: message });
    }
  });

  router.post('/flow-manager/push-to-cloud', async (_req, res) => {
    // @ts-expect-error this is the internal directus accountability data
    if (!_req.accountability?.admin) {
      res.status(401).send({
        error: 'Unauthorized',
      });
      return;
    }
    try {
      const { FlowsService } = services;
      const flowsService = new FlowsService({
        knex: database,
        schema: await getSchema({ database }),
      });
      const operationFields = [
        'operations.id',
        'operations.name',
        'operations.key',
        'operations.type',
        'operations.position_x',
        'operations.position_y',
        'operations.options',
        'operations.resolve',
        'operations.reject',
        'operations.flow',
      ];
      const {
        config: { url, staticToken },
        flowId,
        mergePlan,
      } = _req.body;

      const urlValidation = validateRemoteUrl(url);
      if (!urlValidation.valid) {
        res.status(400).json({ error: urlValidation.error });
        return;
      }
      const remoteUrl = urlValidation.url;

      const [flow] = await flowsService.readByQuery({
        filter: {
          id: {
            _eq: flowId,
          },
        },
        fields: ['*', ...operationFields],
      });
      if (!flow) {
        res.status(404).send({ error: 'Flow not found' });
        return;
      }

      const flowFields = [
        'name',
        'icon',
        'color',
        'description',
        'trigger',
        'operation',
        'options',
      ];

      const axiosInstance = axios.create({
        baseURL: remoteUrl,
        headers: {
          'Content-Type': 'application/json',
          ...(staticToken ? { Authorization: `Bearer ${staticToken}` } : {}),
        },
        timeout: 25000,
      });
      const fields = [`fields[]=*`, ...operationFields.map((f) => `fields[]=${f}`)];
      const {
        data: { data: flowResponse },
      } = await axiosInstance.request({
        url: `/flows?filter[id][_eq]=${flow.id}&${fields.join('&')}`,
        method: 'GET',
      });

      if (!flowResponse[0]) {
        // flow does not exist on remote -> CREATE NEW FLOW WITH SAME ID
        const initialStatus =
          mergePlan?.remoteStatus && mergePlan.remoteStatus !== 'keep'
            ? mergePlan.remoteStatus
            : flow.status || 'inactive';

        const {
          data: { data: flowCreationResponse },
        } = await axiosInstance.request({
          url: `/flows`,
          method: 'POST',
          data: {
            id: flow.id,
            name: flow.name,
            status: initialStatus,
            icon: flow.icon,
            accountability: flow.accountability,
            description: flow.description,
            trigger: flow.trigger,
            options: flow.options,
            color: flow.color,
          },
        });

        const data = transformData(flow.operations, flow.id, flow.operation || '', true);
        await axiosInstance.request({
          url: `/flows/${flowCreationResponse.id}`,
          method: 'PATCH',
          data: {
            operation: flow.operation ? data.operation : null,
            operations: {
              create: data.operations,
            },
          },
        });

        res.json({
          success: true,
          isNew: true,
          message: `Flow "${flow.name}" successfully created on remote instance`,
        });
        return;
      }

      // Flow exists on remote with the same ID!
      if (mergePlan) {
        // SELECTIVE GIT-STYLE MERGE
        const patchData: Record<string, unknown> = {};
        const selectedMeta = mergePlan.metadataFields || [];
        const flowRecord = flow as unknown as Record<string, unknown>;
        for (const f of selectedMeta) {
          if (f !== 'operation' && flowRecord[f] !== undefined) {
            patchData[f] = flowRecord[f];
          }
        }
        if (mergePlan.remoteStatus && mergePlan.remoteStatus !== 'keep') {
          patchData.status = mergePlan.remoteStatus;
        }

        const localOps = flow.operations || [];
        const remoteOps: IOperation[] = flowResponse[0]?.operations || [];
        const createIds: string[] = mergePlan.createOperationIds || [];
        const updateIds: string[] = mergePlan.updateOperationIds || [];
        const deleteIds: string[] = mergePlan.deleteOperationIds || [];
        const deleteIdSet = new Set(deleteIds);

        // If remote root operation is about to be deleted, nullify it immediately so flow FK doesn't block deletion
        const remoteRootOp = flowResponse[0]?.operation;
        if (remoteRootOp && deleteIdSet.has(remoteRootOp)) {
          patchData.operation = null;
        }

        if (Object.keys(patchData).length > 0) {
          await axiosInstance.request({
            url: `/flows/${flowId}`,
            method: 'PATCH',
            data: patchData,
          });
          logger.info(`[FLOW MANAGER] Flow ${flowId} metadata updated via merge plan`);
        }

        // 1. Sever FK links (resolve/reject) on remote operations pointing to deleteIds
        // and on the operations being deleted themselves so they don't block each other
        if (deleteIds.length > 0) {
          for (const rop of remoteOps) {
            const pointsToDeleted =
              deleteIdSet.has(rop.resolve || '') || deleteIdSet.has(rop.reject || '');
            const isBeingDeleted = deleteIdSet.has(rop.id);

            if (pointsToDeleted || (isBeingDeleted && (rop.resolve || rop.reject))) {
              const severPayload: Record<string, null> = {};
              if (deleteIdSet.has(rop.resolve || '') || (isBeingDeleted && rop.resolve)) {
                severPayload.resolve = null;
              }
              if (deleteIdSet.has(rop.reject || '') || (isBeingDeleted && rop.reject)) {
                severPayload.reject = null;
              }
              if (Object.keys(severPayload).length > 0) {
                try {
                  await axiosInstance.request({
                    url: `/operations/${rop.id}`,
                    method: 'PATCH',
                    data: severPayload,
                  });
                } catch (e) {
                  logger.warn(`[FLOW MANAGER] Failed to sever FK on remote operation ${rop.id}:`, e);
                }
              }
            }
          }

          // 2. Safe deletion of remote operations
          for (const id of deleteIds) {
            try {
              await axiosInstance.request({
                url: `/operations/${id}`,
                method: 'DELETE',
              });
              logger.info(`[FLOW MANAGER] Operation ${id} deleted on remote`);
            } catch (e) {
              logger.error(`[FLOW MANAGER] Failed to delete Operation ${id} on remote:`, e);
              throw e;
            }
          }
        }

        // 3. Create selected operations (first without resolve/reject to avoid FK errors)
        for (const id of createIds) {
          const op = localOps.find((o) => o.id === id);
          if (!op) continue;
          try {
            await axiosInstance.request({
              url: `/operations`,
              method: 'POST',
              data: {
                id: op.id,
                name: op.name,
                key: op.key,
                type: op.type,
                position_x: op.position_x,
                position_y: op.position_y,
                options: op.options,
                flow: flowId,
                resolve: null,
                reject: null,
              },
            });
            logger.info(`[FLOW MANAGER] Operation ${id} created on remote`);
          } catch (e) {
            logger.error(`[FLOW MANAGER] Failed to create Operation ${id} on remote:`, e);
            throw e;
          }
        }

        // 4. Update selected operations
        for (const id of updateIds) {
          const op = localOps.find((o) => o.id === id);
          if (!op) continue;
          try {
            await axiosInstance.request({
              url: `/operations/${id}`,
              method: 'PATCH',
              data: {
                name: op.name,
                key: op.key,
                type: op.type,
                position_x: op.position_x,
                position_y: op.position_y,
                options: op.options,
                resolve: op.resolve || null,
                reject: op.reject || null,
              },
            });
            logger.info(`[FLOW MANAGER] Operation ${id} updated on remote`);
          } catch (e) {
            logger.error(`[FLOW MANAGER] Failed to update Operation ${id} on remote:`, e);
            throw e;
          }
        }

        // 5. Patch resolve/reject for newly created operations
        for (const id of createIds) {
          const op = localOps.find((o) => o.id === id);
          if (!op || (!op.resolve && !op.reject)) continue;
          try {
            await axiosInstance.request({
              url: `/operations/${id}`,
              method: 'PATCH',
              data: {
                resolve: op.resolve || null,
                reject: op.reject || null,
              },
            });
          } catch (e) {
            logger.error(`[FLOW MANAGER] Failed to patch links for Operation ${id}:`, e);
          }
        }

        // 6. Ensure root operation on flow is updated if needed
        if (flow.operation) {
          try {
            await axiosInstance.request({
              url: `/flows/${flowId}`,
              method: 'PATCH',
              data: {
                operation: flow.operation,
              },
            });
          } catch (e) {
            logger.error(`[FLOW MANAGER] Failed to update root operation pointer on flow ${flowId}:`, e);
          }
        }

        res.json({
          success: true,
          isNew: false,
          message: `Flow "${flow.name}" successfully merged to remote instance`,
          createdCount: createIds.length,
          updatedCount: updateIds.length,
          deletedCount: deleteIds.length,
        });
        return;
      }

      // Legacy overwrite fallback if mergePlan is omitted
      const newFlow: Record<string, unknown> = {};
      const oldFlow: Record<string, unknown> = {};

      for (let i = 0; i < flowFields.length; i += 1) {
        const field = flowFields[i] as keyof IFlow;
        if (field !== 'operation') {
          newFlow[field] = (flow as unknown as Record<string, unknown>)[field];
          oldFlow[field] = (flowResponse[0] as unknown as Record<string, unknown>)[field];
        }
      }

      const newOperations = flow.operations.reduce(
        (acc: Record<string, IOperation>, o: IOperation) => {
          acc[o.id] = o;
          return acc;
        },
        {},
      );
      const oldOperations = flowResponse[0].operations.reduce(
        (acc: Record<string, IOperation>, o: IOperation) => {
          acc[o.id] = o;
          return acc;
        },
        {},
      );

      const newOperationIds = Object.keys(newOperations);
      const oldOperationIds = Object.keys(oldOperations);

      const removedOperationIds = oldOperationIds.filter((id) => !newOperationIds.includes(id));
      const removedIdSet = new Set(removedOperationIds);
      const needUpdateIds: string[] = [];
      const needCreatedIds: string[] = [];

      for (let i = 0; i < newOperationIds.length; i += 1) {
        const newOperationId = String(newOperationIds[i]);
        const newOperation = newOperations[newOperationId];
        const oldOperation = oldOperations[newOperationId];

        if (!oldOperation) {
          needCreatedIds.push(newOperationId);
        } else {
          if (!isEqual(newOperation, oldOperation)) {
            needUpdateIds.push(newOperationId);
          }
        }
      }

      // If remote root operation is being deleted, nullify it immediately
      const remoteRootOp = flowResponse[0]?.operation;
      if (remoteRootOp && removedIdSet.has(remoteRootOp)) {
        newFlow.operation = null;
      }

      if (!isEqual(newFlow, oldFlow)) {
        await axiosInstance.request({
          url: `/flows/${flowId}`,
          method: 'PATCH',
          data: newFlow,
        });

        logger.info(`[FLOW MANAGER] Flow ${flowId} Updated`);
      }

      // 1. Sever FK links on remote operations pointing to removedOperationIds
      // and on removed operations themselves before deleting
      if (removedOperationIds.length > 0) {
        const remoteOps: IOperation[] = flowResponse[0].operations || [];
        for (const rop of remoteOps) {
          const pointsToDeleted =
            removedIdSet.has(rop.resolve || '') || removedIdSet.has(rop.reject || '');
          const isBeingDeleted = removedIdSet.has(rop.id);

          if (pointsToDeleted || (isBeingDeleted && (rop.resolve || rop.reject))) {
            const severPayload: Record<string, null> = {};
            if (removedIdSet.has(rop.resolve || '') || (isBeingDeleted && rop.resolve)) {
              severPayload.resolve = null;
            }
            if (removedIdSet.has(rop.reject || '') || (isBeingDeleted && rop.reject)) {
              severPayload.reject = null;
            }
            if (Object.keys(severPayload).length > 0) {
              try {
                await axiosInstance.request({
                  url: `/operations/${rop.id}`,
                  method: 'PATCH',
                  data: severPayload,
                });
              } catch (e) {
                logger.warn(`[FLOW MANAGER] Failed to sever FK on remote operation ${rop.id}:`, e);
              }
            }
          }
        }

        // 2. Safe deletion of removed operations
        for (let i = 0; i < removedOperationIds.length; i += 1) {
          const id = String(removedOperationIds[i]);
          try {
            await axiosInstance.request({
              url: `/operations/${id}`,
              method: 'DELETE',
            });
            logger.info(`[FLOW MANAGER] Operation ${id} deleted on remote`);
          } catch (e) {
            logger.error(`[FLOW MANAGER] Failed to delete Operation ${id} on remote:`, e);
            throw e;
          }
        }
      }

      // 3. Create new operations with null resolve/reject first
      for (let i = 0; i < needCreatedIds.length; i += 1) {
        const id = String(needCreatedIds[i]);
        const data = newOperations[id];
        await axiosInstance.request({
          url: `/operations`,
          method: 'POST',
          data: {
            ...data,
            resolve: null,
            reject: null,
          },
        });
      }

      // 4. Update existing operations
      for (let i = 0; i < needUpdateIds.length; i += 1) {
        const id = String(needUpdateIds[i]);
        const data = newOperations[id];
        await axiosInstance.request({
          url: `/operations/${id}`,
          method: 'PATCH',
          data: {
            ...data,
            resolve: data?.resolve || null,
            reject: data?.reject || null,
          },
        });
      }

      // 5. Patch resolve/reject for newly created operations
      for (let i = 0; i < needCreatedIds.length; i += 1) {
        const id = String(needCreatedIds[i]);
        const data = newOperations[id];
        if (data && (data.resolve || data.reject)) {
          await axiosInstance.request({
            url: `/operations/${id}`,
            method: 'PATCH',
            data: {
              resolve: data.resolve || null,
              reject: data.reject || null,
            },
          });
        }
      }

      // 6. Ensure root operation on flow is updated if needed
      if (flow.operation) {
        try {
          await axiosInstance.request({
            url: `/flows/${flowId}`,
            method: 'PATCH',
            data: {
              operation: flow.operation,
            },
          });
        } catch (e) {
          logger.error(`[FLOW MANAGER] Failed to update root operation pointer on flow ${flowId}:`, e);
        }
      }

      res.json({
        success: true,
        isNew: false,
        message: `Flow "${flow.name}" successfully updated on remote instance`,
      });
    } catch (e: unknown) {
      let message = 'Push to cloud failed';
      if (axios.isAxiosError(e)) {
        message = e.response?.data?.errors?.[0]?.message || e.message;
      } else if (e instanceof Error) {
        message = e.message;
      }
      logger.error(`[FLOW MANAGER] Push to cloud error: ${message}`);
      res.status(500).json({ error: message, message });
    }
  });

  const handleServerTime = async (
    _req: unknown,
    res: {
      json: (body: unknown) => void;
      status: (code: number) => { json: (body: unknown) => void };
    },
  ) => {
    try {
      const req = _req as {
        accountability?: { admin?: boolean; user?: string; role?: string };
        body?: { url?: string; staticToken?: string; timezone?: string };
        query?: { url?: string; staticToken?: string; timezone?: string };
      };
      const rawUrl = req.body?.url || req.query?.url;
      const remoteToken = req.body?.staticToken || req.query?.staticToken;
      const configuredTimezone = req.body?.timezone || req.query?.timezone;

      if (rawUrl && typeof rawUrl === 'string') {
        // SSRF protection: Probing remote instance requires admin accountability
        if (!req.accountability?.admin) {
          res.status(401).json({
            error: 'Unauthorized: Admin privileges required to probe remote instance server time.',
          });
          return;
        }

        const urlValidation = validateRemoteUrl(rawUrl);
        if (!urlValidation.valid) {
          res.status(400).json({ error: urlValidation.error });
          return;
        }
        const remoteUrl = urlValidation.url;

        // 1. Try remote flow-manager extension endpoint first
        try {
          const extRes = await axios.request({
            url: `${remoteUrl}/flow-manager/server-time`,
            method: 'GET',
            timeout: 5000,
            headers: {
              ...(remoteToken ? { Authorization: `Bearer ${remoteToken}` } : {}),
            },
          });

          if (extRes.data && typeof extRes.data.serverTimestamp === 'number') {
            const data = extRes.data;
            if (configuredTimezone) {
              data.timezone = configuredTimezone;
            }
            res.json({
              ...data,
              isRemote: true,
              hasExtension: true,
              source: 'extension',
            });
            return;
          }
        } catch {
          // Flow-manager extension may not be installed on remote instance; fallback below
        }

        // 2. Fallback to standard Directus endpoint (/server/ping or /server/info)
        try {
          const pingRes = await axios.request({
            url: `${remoteUrl}/server/ping`,
            method: 'GET',
            timeout: 5000,
            headers: {
              ...(remoteToken ? { Authorization: `Bearer ${remoteToken}` } : {}),
            },
          });

          const httpDate = pingRes.headers['date'];
          const remoteNow = httpDate ? new Date(httpDate) : new Date();
          const targetTz = configuredTimezone || 'UTC';

          let offsetMinutes = 0;
          let offsetString = 'UTC+00:00';
          try {
            const tzFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: targetTz,
              timeZoneName: 'longOffset',
            });
            const parts = tzFormatter.formatToParts(remoteNow);
            const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value;
            if (tzPart && tzPart.startsWith('GMT')) {
              offsetString = tzPart.replace('GMT', 'UTC');
              const match = offsetString.match(/UTC([+-])(\d{2}):(\d{2})/);
              if (match && match[2] && match[3]) {
                const sign = match[1] === '+' ? 1 : -1;
                offsetMinutes = sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10));
              }
            } else if (targetTz === 'UTC') {
              offsetString = 'UTC+00:00';
              offsetMinutes = 0;
            }
          } catch {
            // fallback
          }

          res.json({
            serverTime: remoteNow.toISOString(),
            serverTimestamp: remoteNow.getTime(),
            timezone: targetTz,
            offsetMinutes,
            offsetString,
            envTz: null,
            isRemote: true,
            hasExtension: false,
            source: 'http-date',
          });
          return;
        } catch (pingErr) {
          logger.warn(
            `[FLOW MANAGER] Remote server time probe failed for ${remoteUrl}: ${pingErr}`,
          );
          res.status(502).json({
            error: 'Failed to reach remote Directus server to synchronize time.',
            url: remoteUrl,
          });
          return;
        }
      }

      // Default: Local Directus server time
      const now = new Date();
      const timezone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const offsetMinutes = -now.getTimezoneOffset();
      const offsetHours = offsetMinutes / 60;
      const sign = offsetMinutes >= 0 ? '+' : '-';
      const absHours = String(Math.abs(Math.trunc(offsetHours))).padStart(2, '0');
      const absMins = String(Math.abs(offsetMinutes % 60)).padStart(2, '0');
      const offsetString = `UTC${sign}${absHours}:${absMins}`;

      res.json({
        serverTime: now.toISOString(),
        serverTimestamp: now.getTime(),
        timezone,
        offsetMinutes,
        offsetString,
        envTz: process.env.TZ || null,
        isRemote: false,
        hasExtension: true,
        source: 'local',
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      res.status(500).json({ message });
    }
  };

  router.get('/flow-manager/server-time', handleServerTime);
  router.post('/flow-manager/server-time', handleServerTime);
  router.get('/server-time', handleServerTime);
  router.post('/server-time', handleServerTime);

  router.post('/flow-manager/simulate', async (_req, res) => {
    // @ts-expect-error accountability check
    if (!_req.accountability?.admin) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      const { flow, triggerPayload, url, staticToken, mockResponses } = _req.body || {};

      if (!flow) {
        res.status(400).json({ error: 'Flow object is required for simulation.' });
        return;
      }

      let readerService: SimulationReaderService | undefined;

      if (url && typeof url === 'string') {
        const urlValidation = validateRemoteUrl(url);
        if (!urlValidation.valid) {
          res.status(400).json({ error: urlValidation.error });
          return;
        }
        const remoteUrl = urlValidation.url;
        readerService = {
          async readItem(
            collection: string,
            key: string | number,
            query?: Record<string, unknown>,
          ) {
            try {
              const { data } = await axios.get(`${remoteUrl}/items/${collection}/${key}`, {
                params: query,
                headers: staticToken ? { Authorization: `Bearer ${staticToken}` } : {},
                timeout: 5000,
              });
              return data?.data || null;
            } catch {
              return null;
            }
          },
          async readItems(
            collection: string,
            query?: Record<string, unknown>,
            keys?: Array<string | number>,
          ) {
            try {
              const params: Record<string, unknown> = { ...(query || {}) };
              if (keys && keys.length > 0) {
                params.filter = {
                  ...((params.filter as Record<string, unknown>) || {}),
                  id: { _in: keys },
                };
              }
              const { data } = await axios.get(`${remoteUrl}/items/${collection}`, {
                params,
                headers: staticToken ? { Authorization: `Bearer ${staticToken}` } : {},
                timeout: 5000,
              });
              return Array.isArray(data?.data) ? data.data : [];
            } catch {
              return [];
            }
          },
        };
      } else {
        const schema = await getSchema({ database });
        readerService = {
          async readItem(
            collection: string,
            key: string | number,
            query?: Record<string, unknown>,
          ) {
            try {
              const itemsService = new services.ItemsService(collection, {
                knex: database,
                schema,
              });
              return await itemsService.readOne(key, query || {});
            } catch {
              return null;
            }
          },
          async readItems(
            collection: string,
            query?: Record<string, unknown>,
            keys?: Array<string | number>,
          ) {
            try {
              const itemsService = new services.ItemsService(collection, {
                knex: database,
                schema,
              });
              if (keys && keys.length > 0) {
                if (keys.length === 1) {
                  const item = await itemsService.readOne(keys[0]!, query || {});
                  return item ? [item] : [];
                }
                const items = await itemsService.readMany(keys, query || {});
                return Array.isArray(items) ? items : [];
              }
              const items = await itemsService.readByQuery(query || {});
              return Array.isArray(items) ? items : [];
            } catch {
              return [];
            }
          },
        };
      }

      // @ts-expect-error internal directus accountability
      const reqAccountability = _req.accountability as Record<string, unknown> | undefined;

      const result = await simulateFlow(flow, {
        triggerPayload,
        readerService,
        mockResponses,
        accountability: reqAccountability,
      });

      res.json(result);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`[FLOW MANAGER] Simulation error: ${message}`);
      res.status(500).json({ error: message });
    }
  });
});

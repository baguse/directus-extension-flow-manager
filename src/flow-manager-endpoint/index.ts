import { defineEndpoint } from '@directus/extensions-sdk';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { transformData } from '../utils/flow.util';
import type { IFlow, IOperation, ISyncFlowCounter } from '../types';
import isEqual from 'lodash/isEqual';
import { generateUUID } from '../utils/common.util';
import { formatDirectusDateTime, parseDirectusDate } from '../utils/date.util';
import { simulateFlow, type SimulationReaderService } from '../utils/flow-simulator.util';

function validateRemoteUrl(
  rawUrl: unknown,
): { valid: true; url: string } | { valid: false; error: string } {
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
  const host = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .trim();
  if (
    host === '169.254.169.254' ||
    host === '169.254.170.2' ||
    host.startsWith('169.254.') ||
    host === 'metadata.google.internal' ||
    host === 'metadata.titus.netflix.com' ||
    host === 'fd00:ec2::254' ||
    host.startsWith('fe80:')
  ) {
    return {
      valid: false,
      error: 'Access to cloud metadata and link-local endpoints is prohibited.',
    };
  }
  return { valid: true, url: trimmed.replace(/\/+$/, '') };
}

interface PolicyAccessItem {
  admin_access?: boolean | number | string;
  policy?: { admin_access?: boolean | number | string };
}

function checkAdminAccess(userData: Record<string, unknown> | null | undefined): boolean {
  if (!userData) return false;

  const hasAdmin = (val: unknown): boolean =>
    val === true || val === 1 || val === 'true' || val === '1';

  // 1. Direct admin_access flag on user (Directus 11+)
  if (hasAdmin(userData.admin_access)) return true;

  // 2. Direct admin_access flag or admin role name on role object (Directus 9/10)
  if (typeof userData.role === 'object' && userData.role !== null) {
    const role = userData.role as Record<string, unknown> & { policies?: PolicyAccessItem[] };
    if (hasAdmin(role.admin_access)) return true;

    // Admin role by standard name
    if (typeof role.name === 'string') {
      const roleName = role.name.toLowerCase();
      if (roleName === 'administrator' || roleName === 'admin') return true;
    }

    // 3. Policies on role (Directus 10.10+)
    const rolePolicies = role.policies;
    if (Array.isArray(rolePolicies)) {
      if (
        rolePolicies.some((p) => hasAdmin(p?.admin_access) || hasAdmin(p?.policy?.admin_access))
      ) {
        return true;
      }
    }
  }

  // 4. Direct policies on user (Directus 10.10+)
  const userPolicies = userData.policies as PolicyAccessItem[] | undefined;
  if (Array.isArray(userPolicies)) {
    if (userPolicies.some((p) => hasAdmin(p?.admin_access) || hasAdmin(p?.policy?.admin_access))) {
      return true;
    }
  }

  return false;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

interface SyncJobStatus {
  id: string;
  type: 'local' | 'remote';
  targetFlowId?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  totalFlows: number;
  completedFlows: number;
  currentFlowId?: string;
  currentFlowName?: string;
  processedActivities: number;
  totalActivities: number;
  evaluatedErrors: number;
  evaluatedSuccesses: number;
  error?: string;
  cancelRequested?: boolean;
}

const activeSyncJobs = new Map<string, SyncJobStatus>();

async function axiosWithRetry<T = unknown>(
  config: AxiosRequestConfig,
  retries = 3,
  delayMs = 1000,
): Promise<AxiosResponse<T>> {
  try {
    return await axios(config);
  } catch (err: unknown) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return axiosWithRetry<T>(config, retries - 1, delayMs * 2);
    }
    throw err;
  }
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

  router.get('/flow-manager/sync-status', async (_req, res) => {
    // @ts-expect-error this is the internal directus accountability data
    if (!_req.accountability?.admin) {
      res.status(401).send({
        error: 'Unauthorized',
      });
      return;
    }
    const jobs = Array.from(activeSyncJobs.values());
    res.status(200).send({
      isSyncing: jobs.some((j) => j.status === 'running'),
      jobs,
    });
  });

  router.post('/flow-manager/cancel-sync', async (_req, res) => {
    // @ts-expect-error this is the internal directus accountability data
    if (!_req.accountability?.admin) {
      res.status(401).send({
        error: 'Unauthorized',
      });
      return;
    }
    const { jobId } = _req.body || {};

    let cancelledAny = false;
    for (const [key, job] of activeSyncJobs.entries()) {
      if (job.status === 'running') {
        if (!jobId || job.id === jobId || key === jobId) {
          job.cancelRequested = true;
          job.status = 'cancelled';
          job.finishedAt = new Date().toISOString();
          cancelledAny = true;
        }
      }
    }

    res.status(200).send({
      success: true,
      cancelled: cancelledAny,
      message: cancelledAny
        ? 'Synchronization cancelled successfully.'
        : 'No running synchronization found to cancel.',
    });
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
    const targetFlowId = (_req.body?.flowId || _req.query?.flowId) as string | undefined;

    if (type === 'local') {
      const jobKey = `local:${targetFlowId || 'all'}`;
      const existingJob = activeSyncJobs.get(jobKey);
      if (existingJob && existingJob.status === 'running') {
        res.status(200).send({
          success: true,
          syncing: true,
          message: 'Synchronization is already running in background.',
          job: existingJob,
        });
        return;
      }

      const job: SyncJobStatus = {
        id: jobKey,
        type: 'local',
        targetFlowId,
        status: 'running',
        startedAt: new Date().toISOString(),
        totalFlows: 0,
        completedFlows: 0,
        processedActivities: 0,
        totalActivities: 0,
        evaluatedErrors: 0,
        evaluatedSuccesses: 0,
      };
      activeSyncJobs.set(jobKey, job);

      // Return immediately so HTTP client does not timeout
      res.status(200).send({
        success: true,
        syncing: true,
        message: 'Synchronization started in background.',
        jobId: jobKey,
      });

      // Background worker to process all items chunk by chunk without limit
      setImmediate(async () => {
        try {
          let flowsQuery = database('directus_flows')
            .select(
              'directus_flows.id',
              'directus_flows.name',
              'flow_manager_metadata.id as metadata_id',
              'flow_manager_metadata.flow_manager_success_counter',
              'flow_manager_metadata.flow_manager_error_counter',
              'flow_manager_metadata.flow_manager_run_counter',
            )
            .leftJoin(
              'flow_manager_metadata',
              'directus_flows.flow_manager_metadata_id',
              'flow_manager_metadata.id',
            );

          if (targetFlowId) {
            flowsQuery = flowsQuery.where('directus_flows.id', targetFlowId);
          }
          const flows = await flowsQuery;
          const flowIds = flows.map((f: { id: string }) => f.id);

          // Get total activity run count per flow in 1 fast SQL aggregate query
          const countResults = (await database('directus_activity')
            .select('item')
            .count('id as total')
            .where({ action: 'run', collection: 'directus_flows' })
            .whereIn('item', flowIds)
            .groupBy('item')) as unknown as Array<{ item: string; total: string | number }>;

          const totalCountByFlow = new Map<string, number>();
          for (const row of countResults) {
            totalCountByFlow.set(row.item, Number(row.total || 0));
          }

          job.totalFlows = flows.length;

          for (let i = 0; i < flows.length; i++) {
            if (job.cancelRequested) {
              job.status = 'cancelled';
              job.finishedAt = new Date().toISOString();
              return;
            }
            const flow = flows[i];
            const totalCount = totalCountByFlow.get(flow.id) ?? 0;

            job.currentFlowId = flow.id;
            job.currentFlowName = (flow as { name?: string }).name || flow.id;
            job.totalActivities = totalCount;
            job.processedActivities = 0;
            job.evaluatedErrors = 0;
            job.evaluatedSuccesses = 0;

            let lastRunAt: string | null = null;
            let lastStepErrorMessage = '';
            let lastStepOperation = '';
            let evaluatedErrors = 0;
            let evaluatedSuccesses = 0;
            let isFirstActivity = true;
            let lastSeenId: number | null = null;

            const CHUNK_SIZE = 100;

            while (true) {
              if (job.cancelRequested) {
                job.status = 'cancelled';
                job.finishedAt = new Date().toISOString();
                return;
              }
              let query = database('directus_activity')
                .select('id', 'item', 'timestamp')
                .where({ item: flow.id, action: 'run', collection: 'directus_flows' })
                .orderBy('id', 'desc')
                .limit(CHUNK_SIZE);

              if (lastSeenId !== null) {
                query = query.where('id', '<', lastSeenId);
              }

              const activities = (await query) as unknown as Array<{
                id: number;
                item: string;
                timestamp?: string;
              }>;

              if (!activities || activities.length === 0) {
                break;
              }

              const lastAct = activities[activities.length - 1];
              if (lastAct?.id != null) {
                lastSeenId = lastAct.id;
              }

              if (isFirstActivity) {
                lastRunAt = activities[0]?.timestamp || null;
              }

              const actIds = activities.map((a) => a.id);
              const revisions = (await database('directus_revisions')
                .select('id', 'activity', 'data')
                .whereIn('activity', actIds)
                .orderBy('id', 'desc')) as unknown as Array<{
                id: number;
                activity: number | string;
                data?: unknown;
              }>;

              const revisionsByActivity = new Map<number, typeof revisions>();
              for (const rev of revisions) {
                const actId = Number(rev.activity);
                if (!isNaN(actId)) {
                  if (!revisionsByActivity.has(actId)) {
                    revisionsByActivity.set(actId, []);
                  }
                  revisionsByActivity.get(actId)!.push(rev);
                }
              }

              for (let j = 0; j < activities.length; j++) {
                const act = activities[j];
                if (!act) continue;

                const actRevs = revisionsByActivity.get(act.id) || [];
                let isReject = false;
                let stepErrorMessage = '';
                let stepOperation = '';

                for (let k = 0; k < actRevs.length; k++) {
                  const revision = actRevs[k];
                  if (!revision) continue;

                  let lastExecutionData = revision.data;
                  if (typeof lastExecutionData === 'string') {
                    try {
                      lastExecutionData = JSON.parse(lastExecutionData);
                    } catch {}
                  }

                  if (lastExecutionData && typeof lastExecutionData === 'object') {
                    const execObj = lastExecutionData as {
                      steps?: Array<{ status?: string; operation?: string }>;
                      data?: { $last?: { message?: string } | Array<{ message?: string }> };
                    };
                    const lastStep = execObj.steps?.[(execObj.steps?.length || 0) - 1];
                    if (lastStep?.status === 'reject') {
                      isReject = true;
                      const lastError = execObj.data?.$last;
                      stepErrorMessage = Array.isArray(lastError)
                        ? (lastError[0]?.message ?? '')
                        : (lastError?.message ?? '');
                      stepOperation = lastStep?.operation || '';
                      break;
                    }
                  }
                }

                if (isFirstActivity && j === 0) {
                  if (isReject) {
                    lastStepErrorMessage = stepErrorMessage;
                    lastStepOperation = stepOperation;
                  }
                }

                if (isReject) {
                  evaluatedErrors += 1;
                } else {
                  evaluatedSuccesses += 1;
                }
              }

              isFirstActivity = false;
              job.processedActivities += activities.length;
              job.evaluatedErrors = evaluatedErrors;
              job.evaluatedSuccesses = evaluatedSuccesses;

              // Periodic progress persistence every 1000 activities
              if (job.processedActivities % 1000 === 0) {
                const interimPayload = {
                  flow_manager_last_run_at: formatDirectusDateTime(lastRunAt),
                  flow_manager_success_counter: evaluatedSuccesses,
                  flow_manager_error_counter: evaluatedErrors,
                  flow_manager_run_counter: evaluatedSuccesses + evaluatedErrors,
                  flow_manager_last_run_message: lastStepErrorMessage,
                  flow_manager_last_run_operation: lastStepOperation,
                };
                if (flow.metadata_id) {
                  await database('flow_manager_metadata')
                    .update(interimPayload)
                    .where('id', flow.metadata_id);
                }
              }

              // Cooperative event loop yield
              await new Promise((resolve) => setTimeout(resolve, 5));
            }

            if (job.cancelRequested) {
              job.status = 'cancelled';
              job.finishedAt = new Date().toISOString();
              return;
            }

            // Final persistence for this flow
            const finalPayload = {
              flow_manager_last_run_at: formatDirectusDateTime(lastRunAt),
              flow_manager_success_counter: evaluatedSuccesses,
              flow_manager_error_counter: evaluatedErrors,
              flow_manager_run_counter: Math.max(totalCount, evaluatedSuccesses + evaluatedErrors),
              flow_manager_last_run_message: lastStepErrorMessage,
              flow_manager_last_run_operation: lastStepOperation,
            };

            if (flow.metadata_id) {
              await database('flow_manager_metadata')
                .update(finalPayload)
                .where('id', flow.metadata_id);
            } else {
              const metadataId = generateUUID();
              await database('flow_manager_metadata').insert({
                id: metadataId,
                ...finalPayload,
              });
              await database('directus_flows')
                .update({ flow_manager_metadata_id: metadataId })
                .where('id', flow.id);
              flow.metadata_id = metadataId;
            }

            job.completedFlows++;
          }

          job.status = 'completed';
          job.finishedAt = new Date().toISOString();
        } catch (err: unknown) {
          logger.error(
            `[flow-manager] Local sync error: ${err instanceof Error ? err.message : String(err)}`,
          );
          job.status = 'failed';
          job.finishedAt = new Date().toISOString();
          job.error = err instanceof Error ? err.message : String(err);
        }
      });
    } else if (type === 'remote' && staticToken && url) {
      const urlValidation = validateRemoteUrl(url);
      if (!urlValidation.valid) {
        res.status(400).json({ error: urlValidation.error });
        return;
      }
      const remoteUrl = urlValidation.url;

      try {
        let currentUser: Record<string, unknown> | null = null;
        try {
          const { data } = await axios.get(
            `${remoteUrl}/users/me?fields[]=*&fields[]=role.*&fields[]=policies.policy.admin_access&fields[]=role.policies.policy.admin_access`,
            {
              headers: {
                Authorization: `Bearer ${staticToken}`,
              },
            },
          );
          currentUser = data?.data || null;
        } catch {
          const { data } = await axios.get(`${remoteUrl}/users/me?fields[]=*&fields[]=role.*`, {
            headers: {
              Authorization: `Bearer ${staticToken}`,
            },
          });
          currentUser = data?.data || null;
        }

        if (!currentUser) {
          throw new Error('User not found');
        }
        const isAdmin = checkAdminAccess(currentUser);
        if (!isAdmin) {
          res.status(401).send({
            error: 'Unauthorized',
          });
          return;
        }

        const jobKey = `remote:${remoteUrl}:${targetFlowId || 'all'}`;
        const existingJob = activeSyncJobs.get(jobKey);
        if (existingJob && existingJob.status === 'running') {
          res.status(200).send({
            success: true,
            syncing: true,
            message: 'Synchronization is already running in background.',
            job: existingJob,
          });
          return;
        }

        const job: SyncJobStatus = {
          id: jobKey,
          type: 'remote',
          targetFlowId,
          status: 'running',
          startedAt: new Date().toISOString(),
          totalFlows: 0,
          completedFlows: 0,
          processedActivities: 0,
          totalActivities: 0,
          evaluatedErrors: 0,
          evaluatedSuccesses: 0,
        };
        activeSyncJobs.set(jobKey, job);

        // Return immediately so HTTP client does not timeout
        res.status(200).send({
          success: true,
          syncing: true,
          message: 'Synchronization started in background.',
          jobId: jobKey,
        });

        // Background worker to process all items chunk by chunk without limit
        setImmediate(async () => {
          try {
            const flowsFilter = targetFlowId ? `&filter[id][_eq]=${targetFlowId}` : '';
            const {
              data: { data: flows },
            } = await axios.get(
              `${remoteUrl}/flows?fields[]=*&fields[]=flow_manager_metadata_id.*&limit=-1${flowsFilter}`,
              {
                headers: {
                  Authorization: `Bearer ${staticToken}`,
                },
                timeout: 30000,
              },
            );

            if (!Array.isArray(flows) || flows.length === 0) {
              job.status = 'completed';
              job.finishedAt = new Date().toISOString();
              return;
            }

            interface RemoteFlow {
              id: string;
              name?: string;
              flow_manager_metadata_id?: {
                id?: string;
                flow_manager_success_counter?: number;
                flow_manager_error_counter?: number;
                flow_manager_run_counter?: number;
              } | null;
            }

            interface RemoteRevision {
              id?: number;
              activity?: number | { id: number };
              data?: unknown;
            }

            job.totalFlows = flows.length;

            const persistRemoteMetadata = async (
              flow: RemoteFlow,
              payload: Record<string, unknown>,
            ) => {
              if (flow.flow_manager_metadata_id?.id) {
                await axiosWithRetry({
                  method: 'patch',
                  url: `${remoteUrl}/items/flow_manager_metadata/${flow.flow_manager_metadata_id.id}`,
                  data: payload,
                  headers: { Authorization: `Bearer ${staticToken}` },
                  timeout: 15000,
                });
              } else {
                const { data: createdRes } = await axiosWithRetry({
                  method: 'post',
                  url: `${remoteUrl}/items/flow_manager_metadata`,
                  data: payload,
                  headers: { Authorization: `Bearer ${staticToken}` },
                  timeout: 15000,
                });
                const createdData =
                  (createdRes as { data?: { id: string }; id?: string })?.data ??
                  (createdRes as { id?: string });
                const metadataId = createdData?.id;
                if (metadataId) {
                  await axiosWithRetry({
                    method: 'patch',
                    url: `${remoteUrl}/flows/${flow.id}`,
                    data: { flow_manager_metadata_id: metadataId },
                    headers: { Authorization: `Bearer ${staticToken}` },
                    timeout: 15000,
                  });
                  flow.flow_manager_metadata_id = { id: metadataId };
                }
              }
            };

            for (const flow of flows as RemoteFlow[]) {
              if (job.cancelRequested) {
                job.status = 'cancelled';
                job.finishedAt = new Date().toISOString();
                return;
              }
              job.currentFlowId = flow.id;
              job.currentFlowName = flow.name || flow.id;
              let totalCount = 0;
              let latestActivityTimestamp: string | null = null;

              try {
                const { data: actRes } = await axiosWithRetry({
                  method: 'get',
                  url: `${remoteUrl}/activity?filter[_and][0][item][_eq]=${flow.id}&filter[_and][1][action][_eq]=run&filter[_and][2][collection][_eq]=directus_flows&fields[]=id&fields[]=timestamp&sort=-id&limit=1&meta=*`,
                  headers: { Authorization: `Bearer ${staticToken}` },
                  timeout: 15000,
                });

                const actObj = actRes as {
                  data?: Array<{ timestamp?: string }>;
                  meta?: { filter_count?: number; total_count?: number };
                };
                const initialActivities = actObj?.data ?? [];
                latestActivityTimestamp = initialActivities[0]?.timestamp || null;

                const remoteMeta = actObj?.meta;
                const remoteCount = remoteMeta?.filter_count ?? remoteMeta?.total_count;

                if (
                  remoteCount !== undefined &&
                  remoteCount !== null &&
                  !Number.isNaN(Number(remoteCount))
                ) {
                  totalCount = Number(remoteCount);
                } else {
                  // Fallback to aggregate[count]=*
                  try {
                    const { data: aggRes } = await axiosWithRetry({
                      method: 'get',
                      url: `${remoteUrl}/activity?filter[_and][0][item][_eq]=${flow.id}&filter[_and][1][action][_eq]=run&filter[_and][2][collection][_eq]=directus_flows&aggregate[count]=*`,
                      headers: { Authorization: `Bearer ${staticToken}` },
                      timeout: 10000,
                    });
                    const countRows = (aggRes as { data?: unknown })?.data ?? aggRes;
                    const countVal = Array.isArray(countRows)
                      ? countRows[0]?.count
                      : (countRows as { count?: unknown })?.count;
                    const parsedCount =
                      typeof countVal === 'object' && countVal !== null
                        ? ((countVal as Record<string, unknown>).id ?? Object.values(countVal)[0])
                        : countVal;
                    if (
                      parsedCount !== undefined &&
                      parsedCount !== null &&
                      !Number.isNaN(Number(parsedCount))
                    ) {
                      totalCount = Number(parsedCount);
                    }
                  } catch {}
                }
              } catch {
                totalCount = 0;
              }

              job.totalActivities = totalCount;
              job.processedActivities = 0;
              job.evaluatedErrors = 0;
              job.evaluatedSuccesses = 0;

              let lastRunAt: string | null = latestActivityTimestamp;
              let lastStepErrorMessage = '';
              let lastStepOperation = '';
              let evaluatedErrors = 0;
              let evaluatedSuccesses = 0;
              let isFirstActivity = true;
              let lastSeenId: number | null = null;
              let fallbackPage = 1;
              let usePageFallback = false;

              const CHUNK_SIZE = 100;

              while (true) {
                if (job.cancelRequested) {
                  job.status = 'cancelled';
                  job.finishedAt = new Date().toISOString();
                  return;
                }
                let activities: Array<{ id: number; timestamp?: string }> = [];
                let actUrl = `${remoteUrl}/activity?filter[_and][0][item][_eq]=${flow.id}&filter[_and][1][action][_eq]=run&filter[_and][2][collection][_eq]=directus_flows&fields[]=id&fields[]=timestamp&sort=-id&limit=${CHUNK_SIZE}`;
                if (!usePageFallback && lastSeenId !== null) {
                  actUrl += `&filter[_and][3][id][_lt]=${lastSeenId}`;
                } else if (usePageFallback) {
                  actUrl += `&page=${fallbackPage}`;
                }

                try {
                  const { data: actPageRes } = await axiosWithRetry({
                    method: 'get',
                    url: actUrl,
                    headers: { Authorization: `Bearer ${staticToken}` },
                    timeout: 20000,
                  });
                  const pageObj = actPageRes as {
                    data?: Array<{ id: number; timestamp?: string }>;
                  };
                  activities = pageObj?.data ?? (Array.isArray(actPageRes) ? actPageRes : []);
                } catch {
                  if (!usePageFallback && lastSeenId !== null) {
                    usePageFallback = true;
                    continue;
                  }
                  break;
                }

                if (!activities || activities.length === 0) {
                  break;
                }

                const lastAct = activities[activities.length - 1];
                if (lastAct?.id != null) {
                  lastSeenId = lastAct.id;
                }
                fallbackPage++;

                if (isFirstActivity) {
                  lastRunAt = activities[0]?.timestamp || null;
                }

                const actIds = activities.map((a) => a.id);
                let revisions: RemoteRevision[] = [];

                // Batch query revisions for the chunk
                try {
                  const { data: revRes } = await axiosWithRetry({
                    method: 'get',
                    url: `${remoteUrl}/revisions?fields[]=id&fields[]=activity&fields[]=data&filter[activity][_in]=${actIds.join(
                      ',',
                    )}&sort=-id&limit=-1`,
                    headers: { Authorization: `Bearer ${staticToken}` },
                    timeout: 20000,
                  });
                  const rObj = revRes as { data?: RemoteRevision[] };
                  revisions = Array.isArray(rObj?.data)
                    ? rObj.data
                    : Array.isArray(revRes)
                      ? revRes
                      : [];
                } catch {
                  try {
                    const { data: revFallback } = await axiosWithRetry({
                      method: 'get',
                      url: `${remoteUrl}/revisions?fields[]=id&fields[]=activity&fields[]=data&filter[activity][id][_in]=${actIds.join(
                        ',',
                      )}&sort=-id&limit=-1`,
                      headers: { Authorization: `Bearer ${staticToken}` },
                      timeout: 20000,
                    });
                    const rObj = revFallback as { data?: RemoteRevision[] };
                    revisions = Array.isArray(rObj?.data)
                      ? rObj.data
                      : Array.isArray(revFallback)
                        ? revFallback
                        : [];
                  } catch {
                    // Fallback to sub-batches of 20
                    const subBatches = chunkArray(actIds, 20);
                    for (const subBatch of subBatches) {
                      const revPromises = subBatch.map(async (actId) => {
                        try {
                          const { data: singleRevRes } = await axiosWithRetry({
                            method: 'get',
                            url: `${remoteUrl}/revisions?fields[]=id&fields[]=activity&fields[]=data&filter[activity][_eq]=${actId}&sort=-id&limit=1`,
                            headers: { Authorization: `Bearer ${staticToken}` },
                            timeout: 10000,
                          });
                          const sObj = singleRevRes as { data?: RemoteRevision[] };
                          return Array.isArray(sObj?.data)
                            ? sObj.data
                            : Array.isArray(singleRevRes)
                              ? (singleRevRes as RemoteRevision[])
                              : [];
                        } catch {
                          return [];
                        }
                      });
                      const batchResults = await Promise.all(revPromises);
                      for (const rList of batchResults) {
                        revisions.push(...rList);
                      }
                    }
                  }
                }

                const revisionsByActivity = new Map<number, RemoteRevision[]>();
                for (const rev of revisions) {
                  const actId =
                    typeof rev.activity === 'object' && rev.activity !== null
                      ? (rev.activity as { id: number }).id
                      : Number(rev.activity);
                  if (!isNaN(actId)) {
                    if (!revisionsByActivity.has(actId)) {
                      revisionsByActivity.set(actId, []);
                    }
                    revisionsByActivity.get(actId)!.push(rev);
                  }
                }

                for (let j = 0; j < activities.length; j++) {
                  const act = activities[j];
                  if (!act) continue;

                  const actRevs = revisionsByActivity.get(act.id) || [];
                  let isReject = false;
                  let stepErrorMessage = '';
                  let stepOperation = '';

                  for (let k = 0; k < actRevs.length; k++) {
                    const revision = actRevs[k];
                    if (!revision) continue;

                    let lastExecutionData = revision.data;
                    if (typeof lastExecutionData === 'string') {
                      try {
                        lastExecutionData = JSON.parse(lastExecutionData);
                      } catch {}
                    }

                    if (lastExecutionData && typeof lastExecutionData === 'object') {
                      const execObj = lastExecutionData as {
                        steps?: Array<{ status?: string; operation?: string }>;
                        data?: { $last?: { message?: string } | Array<{ message?: string }> };
                      };
                      const lastStep = execObj.steps?.[(execObj.steps?.length || 0) - 1];
                      if (lastStep?.status === 'reject') {
                        isReject = true;
                        const lastError = execObj.data?.$last;
                        stepErrorMessage = Array.isArray(lastError)
                          ? (lastError[0]?.message ?? '')
                          : (lastError?.message ?? '');
                        stepOperation = lastStep?.operation || '';
                        break;
                      }
                    }
                  }

                  if (isFirstActivity && j === 0) {
                    if (isReject) {
                      lastStepErrorMessage = stepErrorMessage;
                      lastStepOperation = stepOperation;
                    }
                  }

                  if (isReject) {
                    evaluatedErrors += 1;
                  } else {
                    evaluatedSuccesses += 1;
                  }
                }

                isFirstActivity = false;
                job.processedActivities += activities.length;
                job.evaluatedErrors = evaluatedErrors;
                job.evaluatedSuccesses = evaluatedSuccesses;

                // Periodic progress update every 1000 activities
                if (job.processedActivities % 1000 === 0) {
                  try {
                    await persistRemoteMetadata(flow, {
                      flow_manager_last_run_at: formatDirectusDateTime(lastRunAt),
                      flow_manager_success_counter: evaluatedSuccesses,
                      flow_manager_error_counter: evaluatedErrors,
                      flow_manager_run_counter: evaluatedSuccesses + evaluatedErrors,
                      flow_manager_last_run_message: lastStepErrorMessage,
                      flow_manager_last_run_operation: lastStepOperation,
                    });
                  } catch (err) {
                    logger.warn(
                      `[flow-manager] Failed interim metadata update for ${flow.id}: ${err}`,
                    );
                  }
                }

                // Cooperative yield between chunks
                await new Promise((resolve) => setTimeout(resolve, 10));
              }

              if (job.cancelRequested) {
                job.status = 'cancelled';
                job.finishedAt = new Date().toISOString();
                return;
              }

              // Final persistence for this flow
              try {
                await persistRemoteMetadata(flow, {
                  flow_manager_last_run_at: formatDirectusDateTime(lastRunAt),
                  flow_manager_success_counter: evaluatedSuccesses,
                  flow_manager_error_counter: evaluatedErrors,
                  flow_manager_run_counter: Math.max(
                    totalCount,
                    evaluatedSuccesses + evaluatedErrors,
                  ),
                  flow_manager_last_run_message: lastStepErrorMessage,
                  flow_manager_last_run_operation: lastStepOperation,
                });
              } catch (err) {
                logger.error(`[flow-manager] Failed final metadata update for ${flow.id}: ${err}`);
              }

              job.completedFlows++;
            }

            job.status = 'completed';
            job.finishedAt = new Date().toISOString();
          } catch (err: unknown) {
            logger.error(
              `[flow-manager] Remote sync error: ${err instanceof Error ? err.message : String(err)}`,
            );
            job.status = 'failed';
            job.finishedAt = new Date().toISOString();
            job.error = err instanceof Error ? err.message : String(err);
          }
        });
      } catch (e: unknown) {
        if (axios.isAxiosError(e)) {
          res.status(500).send({
            error: e.response?.data || e.message,
            status: e.response?.status ?? e.status,
          });
        } else {
          const error = e as { message: string };
          res.status(500).send({
            error: error.message || 'Internal server error',
          });
        }
      }
    } else {
      res.status(400).send({
        error: 'Invalid synchronization type or missing credentials',
      });
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
          `${remoteUrl}/flows/${_req.params.flowId}?fields[]=id&fields[]=name&fields[]=operations.id&fields[]=operations.name&fields[]=flow_manager_metadata_id.flow_manager_success_counter&fields[]=flow_manager_metadata_id.flow_manager_error_counter&fields[]=flow_manager_metadata_id.flow_manager_run_counter`,
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
          `${remoteUrl}/activity?filter[_and][0][item][_eq]=${_req.params.flowId}&filter[_and][1][action][_eq]=run&filter[_and][2][collection][_eq]=directus_flows&fields[]=id&fields[]=timestamp&sort=-timestamp&limit=${limit}&page=${page}&meta=*`,
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
                  date: parseDirectusDate(activity.timestamp) ?? new Date(),
                  operation: lastStepOperationName,
                  message: lastStepErrorMessage,
                  data: lastExecutionData,
                });
              } else {
                activityHistories.push({
                  id: activity.id,
                  type: 'success',
                  date: parseDirectusDate(activity.timestamp) ?? new Date(),
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

        let totalCount = successCount + errorCount;
        const remoteMeta =
          actRes && typeof actRes === 'object' && 'meta' in actRes
            ? (actRes as { meta?: { filter_count?: number; total_count?: number } }).meta
            : null;
        const remoteCount = remoteMeta?.filter_count ?? remoteMeta?.total_count;
        if (
          remoteCount !== undefined &&
          remoteCount !== null &&
          !Number.isNaN(Number(remoteCount))
        ) {
          totalCount = Number(remoteCount);
        } else {
          // Fallback: Query remote aggregation endpoint (?aggregate[count]=*) if meta is not supported or deprecated
          try {
            const { data: aggRes } = await axios.get(
              `${remoteUrl}/activity?filter[_and][0][item][_eq]=${_req.params.flowId}&filter[_and][1][action][_eq]=run&filter[_and][2][collection][_eq]=directus_flows&aggregate[count]=*`,
              {
                headers: { Authorization: `Bearer ${staticToken}` },
                timeout: 5000,
              },
            );
            const countRows = aggRes?.data ?? aggRes;
            const countVal = Array.isArray(countRows) ? countRows[0]?.count : countRows?.count;
            const parsedCount =
              typeof countVal === 'object' && countVal !== null
                ? ((countVal as Record<string, unknown>).id ?? Object.values(countVal)[0])
                : countVal;
            if (
              parsedCount !== undefined &&
              parsedCount !== null &&
              !Number.isNaN(Number(parsedCount))
            ) {
              totalCount = Number(parsedCount);
            } else if (flow.flow_manager_metadata_id?.flow_manager_run_counter != null) {
              totalCount = Number(flow.flow_manager_metadata_id.flow_manager_run_counter);
            }
          } catch {
            if (flow.flow_manager_metadata_id?.flow_manager_run_counter != null) {
              totalCount = Number(flow.flow_manager_metadata_id.flow_manager_run_counter);
            }
          }
        }

        res.status(200).send({
          totalCount,
          successCount,
          errorCount,
          activityHistories,
          meta: {
            total_count: totalCount,
            filter_count: totalCount,
          },
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
          'flow_manager_metadata_id.flow_manager_run_counter',
          'operations.id',
          'operations.name',
        ],
      })) as unknown as {
        id: string;
        flow_manager_metadata_id?: {
          flow_manager_success_counter?: number;
          flow_manager_error_counter?: number;
          flow_manager_run_counter?: number;
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
                date: parseDirectusDate(activity.timestamp) ?? new Date(),
                operation: lastStepOperationName,
                message: lastStepErrorMessage,
                data: lastExecutionData,
              });
            } else {
              activityHistories.push({
                id: activity.id,
                type: 'success',
                date: parseDirectusDate(activity.timestamp) ?? new Date(),
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

      let totalCount = successCount + errorCount;
      try {
        const [countResult] = await database('directus_activity').count('id as total').where({
          item: flow.id,
          action: 'run',
          collection: 'directus_flows',
        });
        const rawTotal =
          countResult?.total ?? (countResult ? (Object.values(countResult)[0] as unknown) : null);
        if (rawTotal !== undefined && rawTotal !== null && !Number.isNaN(Number(rawTotal))) {
          totalCount = Number(rawTotal);
        }
      } catch {
        if (flow.flow_manager_metadata_id?.flow_manager_run_counter != null) {
          totalCount = Number(flow.flow_manager_metadata_id.flow_manager_run_counter);
        }
      }

      res.status(200).send({
        totalCount,
        successCount,
        errorCount,
        activityHistories,
        meta: {
          total_count: totalCount,
          filter_count: totalCount,
        },
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
                  logger.warn(
                    `[FLOW MANAGER] Failed to sever FK on remote operation ${rop.id}:`,
                    e,
                  );
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
            logger.error(
              `[FLOW MANAGER] Failed to update root operation pointer on flow ${flowId}:`,
              e,
            );
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
          logger.error(
            `[FLOW MANAGER] Failed to update root operation pointer on flow ${flowId}:`,
            e,
          );
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

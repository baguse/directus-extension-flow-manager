import { ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import type { FlowWithMetadata, FlowHealthStats, ActivityRunItem } from './types';
import { parseDirectusDate } from './time.util';

export function usePanelFlows() {
  const api = useApi();
  const loading = ref(false);
  const error = ref<string | null>(null);
  const flows = ref<FlowWithMetadata[]>([]);
  const activities = ref<ActivityRunItem[]>([]);

  async function loadFlows(): Promise<FlowWithMetadata[]> {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.get('/flows', {
        params: {
          fields: [
            'id',
            'name',
            'icon',
            'color',
            'description',
            'status',
            'trigger',
            'options',
            'flow_manager_metadata_id.*',
          ],
          limit: -1,
        },
      });

      const items = (response.data?.data || response.data || []) as Record<string, unknown>[];
      flows.value = items.map((f) => {
        const metadata = (f.flow_manager_metadata_id || {}) as Record<string, unknown>;
        return {
          id: f.id as string,
          name: f.name as string,
          icon: f.icon as string | undefined,
          color: f.color as string | undefined,
          description: f.description as string | undefined,
          status: f.status as 'active' | 'inactive',
          trigger: f.trigger as string,
          options: (f.options || {}) as FlowWithMetadata['options'],
          flow_manager_metadata: {
            id: metadata.id as string | undefined,
            flow_manager_run_counter: Number(metadata.flow_manager_run_counter || 0),
            flow_manager_success_counter: Number(metadata.flow_manager_success_counter || 0),
            flow_manager_error_counter: Number(metadata.flow_manager_error_counter || 0),
            flow_manager_last_run_at: (metadata.flow_manager_last_run_at as string) || null,
            flow_manager_last_run_message:
              (metadata.flow_manager_last_run_message as string) || undefined,
            flow_manager_last_run_operation:
              (metadata.flow_manager_last_run_operation as string) || undefined,
            flow_manager_category: (metadata.flow_manager_category as string) || undefined,
          },
        };
      });
      return flows.value;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch flows';
      error.value = message;
      return [];
    } finally {
      loading.value = false;
    }
  }

  function getHealthStats(options: {
    scope?: 'all' | 'single';
    flowId?: string | null;
    failureThreshold?: number;
  }): FlowHealthStats {
    const threshold = options.failureThreshold ?? 5;
    const targetFlows =
      options.scope === 'single' && options.flowId
        ? flows.value.filter((f) => f.id === options.flowId)
        : flows.value;

    let totalRuns = 0;
    let successRuns = 0;
    let errorRuns = 0;
    let latestRunAt: string | null = null;
    let latestRunStatus: 'success' | 'error' | 'none' = 'none';
    let latestRunMessage = '';
    const failingList: FlowHealthStats['failingFlows'] = [];

    const activeFlowsCount = targetFlows.filter((f) => f.status === 'active').length;

    for (const flow of targetFlows) {
      const meta = flow.flow_manager_metadata;
      if (!meta) continue;

      const runs = meta.flow_manager_run_counter || 0;
      const successes = meta.flow_manager_success_counter || 0;
      const errors = meta.flow_manager_error_counter || 0;

      totalRuns += runs;
      successRuns += successes;
      errorRuns += errors;

      if (meta.flow_manager_last_run_at) {
        const flowDate = parseDirectusDate(meta.flow_manager_last_run_at);
        const currentLatest = latestRunAt ? parseDirectusDate(latestRunAt) : null;
        if (flowDate && (!currentLatest || flowDate.getTime() > currentLatest.getTime())) {
          latestRunAt = meta.flow_manager_last_run_at;
          latestRunMessage = meta.flow_manager_last_run_message || '';
          latestRunStatus = meta.flow_manager_last_run_message ? 'error' : 'success';
        }
      }

      if (errors > 0) {
        failingList.push({
          id: flow.id,
          name: flow.name,
          errorCount: errors,
          lastMessage: meta.flow_manager_last_run_message,
        });
      }
    }

    failingList.sort((a, b) => b.errorCount - a.errorCount);

    const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 1000) / 10 : 100;
    const errorRate = totalRuns > 0 ? (errorRuns / totalRuns) * 100 : 0;

    let healthStatus: FlowHealthStats['healthStatus'] = 'healthy';
    if (totalRuns === 0) {
      healthStatus = 'idle';
    } else if (errorRate > 25) {
      healthStatus = 'failing';
    } else if (errorRate > threshold) {
      healthStatus = 'degraded';
    }

    return {
      totalRuns,
      successRuns,
      errorRuns,
      successRate,
      lastRunAt: latestRunAt,
      lastRunStatus: latestRunStatus,
      lastRunMessage: latestRunMessage,
      healthStatus,
      flowsCount: targetFlows.length,
      activeFlowsCount,
      failingFlows: failingList,
    };
  }

  async function loadRecentActivity(options: {
    limit?: number;
    flowId?: string | null;
    statusFilter?: 'all' | 'errors_only' | 'success_only';
  }): Promise<ActivityRunItem[]> {
    loading.value = true;
    error.value = null;
    try {
      if (flows.value.length === 0) {
        await loadFlows();
      }

      const flowMap = new Map(flows.value.map((f) => [f.id, f]));

      const filterConditions: Record<string, unknown>[] = [
        { action: { _eq: 'run' } },
        { collection: { _eq: 'directus_flows' } },
      ];

      if (options.flowId) {
        filterConditions.push({ item: { _eq: options.flowId } });
      }

      const response = await api.get('/activity', {
        params: {
          filter: { _and: filterConditions },
          sort: ['-timestamp'],
          limit: Math.max(options.limit || 5, 20),
          fields: [
            'id',
            'action',
            'timestamp',
            'item',
            'user.first_name',
            'user.last_name',
            'revisions.data',
          ],
        },
      });

      const records = (response.data?.data || response.data || []) as Record<string, unknown>[];
      const items: ActivityRunItem[] = [];

      for (const rec of records) {
        const flowId = String(rec.item || '');
        const flow = flowMap.get(flowId);
        const flowName = flow?.name || `Flow ${flowId.slice(0, 8)}`;

        let runStatus: 'success' | 'error' | 'running' = 'success';
        let errorMessage: string | undefined;
        let durationMs: number | undefined;

        const revisions = Array.isArray(rec.revisions) ? rec.revisions : [];
        const latestRevision = revisions[0] as Record<string, unknown> | undefined;

        if (latestRevision && latestRevision.data) {
          let revData = latestRevision.data;
          if (typeof revData === 'string') {
            try {
              revData = JSON.parse(revData);
            } catch {}
          }
          if (typeof revData === 'object' && revData !== null) {
            const parsed = revData as Record<string, unknown>;
            const steps = Array.isArray(parsed.steps)
              ? (parsed.steps as Record<string, unknown>[])
              : [];
            const lastStep = steps[steps.length - 1];

            if (lastStep?.status === 'reject') {
              runStatus = 'error';
              const lastPayload = (parsed.data as Record<string, unknown> | undefined)?.$last;
              if (Array.isArray(lastPayload)) {
                errorMessage = (lastPayload[0] as { message?: string })?.message;
              } else if (typeof lastPayload === 'object' && lastPayload !== null) {
                errorMessage = (lastPayload as { message?: string }).message;
              }
            }
          }
        }

        if (options.statusFilter === 'errors_only' && runStatus !== 'error') {
          continue;
        }
        if (options.statusFilter === 'success_only' && runStatus !== 'success') {
          continue;
        }

        const userObj = rec.user as { first_name?: string; last_name?: string } | undefined;
        const userName = userObj
          ? `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim()
          : undefined;

        items.push({
          id: rec.id as string | number,
          flowId,
          flowName,
          flowIcon: flow?.icon,
          flowColor: flow?.color,
          timestamp: String(rec.timestamp || ''),
          status: runStatus,
          errorMessage,
          durationMs,
          user: userName,
        });

        if (items.length >= (options.limit || 5)) {
          break;
        }
      }

      activities.value = items;
      return items;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch activity runs';
      error.value = message;
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function triggerFlow(
    flowId: string,
    payload: Record<string, unknown> = {},
  ): Promise<{ success: boolean; data?: unknown; error?: string; durationMs: number }> {
    const startTime = performance.now();
    try {
      const response = await api.post(`/flows/trigger/${flowId}`, payload);
      const durationMs = Math.round(performance.now() - startTime);
      return {
        success: true,
        data: response.data,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      let errMsg = 'Failed to execute flow';
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response?: { data?: { errors?: { message?: string }[] } } })
          .response;
        errMsg = resp?.data?.errors?.[0]?.message || errMsg;
      } else if (err instanceof Error) {
        errMsg = err.message;
      }
      return {
        success: false,
        error: errMsg,
        durationMs,
      };
    }
  }

  return {
    flows,
    activities,
    loading,
    error,
    loadFlows,
    getHealthStats,
    loadRecentActivity,
    triggerFlow,
  };
}

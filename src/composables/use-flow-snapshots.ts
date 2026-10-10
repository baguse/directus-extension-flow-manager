import { ref, type Ref, type ComputedRef } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import type { ICredential, IFlow, IFlowSnapshot, IFlowSnapshotData, IOperation } from '../types';
import { ENDPOINT_EXTENSION_NAME } from '../constants';

export interface UseFlowSnapshotsOptions {
  selectedCredential?: Ref<string> | ComputedRef<string>;
  credentials?: Ref<ICredential[]> | ComputedRef<ICredential[]>;
  hydrateLocalFlow?: () => Promise<void>;
}

export function useFlowSnapshots(options?: UseFlowSnapshotsOptions) {
  const api = useApi();
  const snapshots = ref<IFlowSnapshot[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const selectedCredential = options?.selectedCredential ?? ref('local');
  const credentials = options?.credentials ?? ref([]);

  function getTargetCredential(): ICredential | null {
    if (!selectedCredential.value || selectedCredential.value === 'local') {
      return null;
    }
    const cred = credentials.value.find((c) => c.id === selectedCredential.value);
    if (!cred) {
      throw new Error(`Credential "${selectedCredential.value}" not found`);
    }
    return cred;
  }

  function extractErrorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;
      const response = anyErr.response as Record<string, unknown> | undefined;
      const respData = response?.data as Record<string, unknown> | undefined;
      if (respData?.error) {
        const e = respData.error;
        if (typeof e === 'string') return e;
        if (typeof e === 'object' && e !== null) {
          const errObj = e as Record<string, unknown>;
          if (errObj.message && typeof errObj.message === 'string') return errObj.message;
          if (Array.isArray(errObj.errors) && errObj.errors[0]?.message) {
            return String(errObj.errors[0].message);
          }
        }
      }
      if (typeof respData?.message === 'string') return respData.message;
      if (typeof anyErr.message === 'string') return anyErr.message;
    }
    return fallback;
  }

  async function requestDirectus<T = unknown>(req: {
    path: string;
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    params?: Record<string, string | number | boolean>;
    payload?: unknown;
  }): Promise<T> {
    const cred = getTargetCredential();
    if (!cred) {
      let res;
      switch (req.method) {
        case 'GET':
          res = await api.get(req.path, { params: req.params });
          break;
        case 'POST':
          res = await api.post(req.path, req.payload);
          break;
        case 'PATCH':
          res = await api.patch(req.path, req.payload);
          break;
        case 'DELETE':
          res = await api.delete(req.path);
          break;
      }
      return (res.data?.data !== undefined ? res.data.data : res.data) as T;
    } else {
      let fullUrl = `${cred.url}${req.path}`;
      if (req.params && Object.keys(req.params).length > 0) {
        const queryParts = Object.entries(req.params).map(
          ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        );
        fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryParts.join('&');
      }

      const res = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
        url: fullUrl,
        staticToken: cred.staticToken,
        method: req.method,
        payload: req.payload,
      });
      return (res.data?.data !== undefined ? res.data.data : res.data) as T;
    }
  }

  /**
   * Fetches the complete flow object with operations and metadata.
   */
  async function fetchFlow(flowId: string): Promise<IFlow | null> {
    try {
      const res = await requestDirectus<IFlow>({
        path: `/flows/${flowId}`,
        method: 'GET',
        params: {
          fields: ['*', 'operations.*', 'flow_manager_metadata_id.*'].join(','),
        },
      });
      return res || null;
    } catch (err: unknown) {
      console.error('Failed to fetch flow:', err);
      return null;
    }
  }

  /**
   * Loads all snapshots for a given flow, ordered newest first.
   */
  async function loadSnapshots(flowId: string): Promise<IFlowSnapshot[]> {
    if (!flowId) return [];
    loading.value = true;
    error.value = null;
    try {
      const items = await requestDirectus<IFlowSnapshot[]>({
        path: '/items/flow_manager_snapshots',
        method: 'GET',
        params: {
          'filter[flow][_eq]': flowId,
          sort: '-date_created',
          fields: '*,user_created.first_name,user_created.last_name,user_created.email',
          limit: -1,
        },
      });

      const list = Array.isArray(items) ? [...items] : [];
      list.forEach((snap) => {
        if (typeof snap.data === 'string') {
          try {
            snap.data = JSON.parse(snap.data);
          } catch (e) {
            console.warn('Failed to parse snapshot data as JSON:', e);
          }
        }
      });
      list.sort((a, b) => {
        const timeA = a.date_created ? new Date(a.date_created).getTime() : 0;
        const timeB = b.date_created ? new Date(b.date_created).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
        return Number(b.id || 0) - Number(a.id || 0);
      });
      snapshots.value = list;
      return list;
    } catch (err: unknown) {
      const message = extractErrorMessage(err, 'Failed to load snapshots');
      error.value = message;
      snapshots.value = [];
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Helper to construct frozen snapshot data from a live IFlow object.
   */
  function buildSnapshotData(flow: IFlow): IFlowSnapshotData {
    const ops = flow.operations || [];
    const idToKeyMap = new Map<string, string>();
    for (const op of ops) {
      if (op.id && op.key) {
        idToKeyMap.set(op.id, op.key);
      }
    }

    const portableOperations = ops.map((op) => ({
      key: op.key,
      name: op.name ?? null,
      type: op.type,
      position_x: op.position_x,
      position_y: op.position_y,
      options: op.options
        ? (JSON.parse(JSON.stringify(op.options)) as Record<string, unknown>)
        : null,
      resolve: op.resolve ? idToKeyMap.get(op.resolve) || op.resolve : null,
      reject: op.reject ? idToKeyMap.get(op.reject) || op.reject : null,
    }));

    const rootKey = flow.operation ? idToKeyMap.get(flow.operation) || null : null;

    return {
      flow: {
        name: flow.name,
        icon: flow.icon,
        color: flow.color,
        description: flow.description,
        status: flow.status,
        trigger: flow.trigger,
        accountability: flow.accountability,
        options: flow.options
          ? (JSON.parse(JSON.stringify(flow.options)) as Record<string, unknown>)
          : {},
      },
      operations: portableOperations,
      rootOperationKey: rootKey,
      category: flow.flow_manager_metadata_id?.flow_manager_category ?? null,
    };
  }

  /**
   * Creates a new snapshot for a flow.
   */
  async function createSnapshot(
    flow: IFlow,
    options: {
      version: string;
      name: string;
      description?: string;
      tag?: 'manual' | 'release' | 'auto_pre_restore' | 'auto_pre_rollback';
    },
  ): Promise<IFlowSnapshot | null> {
    loading.value = true;
    error.value = null;
    try {
      const snapshotData = buildSnapshotData(flow);
      const payload = {
        flow: flow.id,
        version: options.version.trim(),
        name: options.name.trim(),
        description: options.description?.trim() || '',
        tag: options.tag || 'manual',
        data: snapshotData,
      };

      const created = await requestDirectus<IFlowSnapshot>({
        path: '/items/flow_manager_snapshots',
        method: 'POST',
        payload,
      });

      await loadSnapshots(flow.id);
      return created;
    } catch (err: unknown) {
      const message = extractErrorMessage(err, 'Failed to create snapshot');
      error.value = message;
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Atomically rolls back a flow to a previous snapshot state.
   * Creates an auto safety snapshot of the live state prior to rolling back.
   */
  async function rollbackToSnapshot(
    flow: IFlow,
    snapshot: IFlowSnapshot,
    onProgress?: (step: string) => void,
  ): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      onProgress?.('Creating safety snapshot of current flow...');
      // Create safety snapshot of live flow
      const autoVer = `pre-rollback-${Date.now().toString().slice(-6)}`;
      await createSnapshot(flow, {
        version: autoVer,
        name: `Auto-backup before rollback to ${snapshot.version}`,
        description: `Automatic snapshot taken before reverting to snapshot "${snapshot.name}" (${snapshot.version}).`,
        tag: 'auto_pre_rollback',
      });

      onProgress?.('Clearing existing operations graph...');
      // Clear root operation pointer on flow so FK constraints don't block deletion
      await requestDirectus({
        path: `/flows/${flow.id}`,
        method: 'PATCH',
        payload: { operation: null },
      });

      // Fetch and delete existing operations
      const existingOps = await requestDirectus<Array<{ id: string }>>({
        path: '/operations',
        method: 'GET',
        params: {
          'filter[flow][_eq]': flow.id,
          limit: -1,
          fields: 'id',
        },
      });
      const opsList = Array.isArray(existingOps) ? existingOps : [];
      for (const op of opsList) {
        await requestDirectus({
          path: `/operations/${op.id}`,
          method: 'DELETE',
        });
      }

      onProgress?.('Reconstructing operations from snapshot...');
      // Create all operations with null resolve/reject and record key -> newId map
      const snapData: IFlowSnapshotData =
        typeof snapshot.data === 'string' ? JSON.parse(snapshot.data) : snapshot.data;
      const keyToNewId = new Map<string, string>();
      const snapOps = snapData?.operations || [];

      for (const op of snapOps) {
        const createdOp = await requestDirectus<IOperation>({
          path: '/operations',
          method: 'POST',
          payload: {
            flow: flow.id,
            key: op.key,
            name: op.name,
            type: op.type,
            position_x: op.position_x,
            position_y: op.position_y,
            options: op.options,
            resolve: null,
            reject: null,
          },
        });
        if (createdOp?.id) {
          keyToNewId.set(op.key, createdOp.id);
        }
      }

      onProgress?.('Linking operation execution paths...');
      // Update resolve and reject references using mapped new IDs
      for (const op of snapOps) {
        const newOpId = keyToNewId.get(op.key);
        if (!newOpId) continue;

        const resolveId = op.resolve ? keyToNewId.get(op.resolve) || null : null;
        const rejectId = op.reject ? keyToNewId.get(op.reject) || null : null;

        if (resolveId !== null || rejectId !== null) {
          await requestDirectus({
            path: `/operations/${newOpId}`,
            method: 'PATCH',
            payload: {
              resolve: resolveId,
              reject: rejectId,
            },
          });
        }
      }

      onProgress?.('Restoring flow configuration...');
      // Restore flow root operation and settings
      const flowObj = snapData?.flow as Record<string, unknown> | undefined;
      const rootKey =
        snapData?.rootOperationKey ||
        (flowObj?.root_operation_key as string | undefined) ||
        (flowObj?.rootOperationKey as string | undefined);
      const newRootId = rootKey ? keyToNewId.get(rootKey) || null : null;

      await requestDirectus({
        path: `/flows/${flow.id}`,
        method: 'PATCH',
        payload: {
          name: snapData.flow.name,
          icon: snapData.flow.icon,
          color: snapData.flow.color,
          description: snapData.flow.description,
          status: snapData.flow.status,
          trigger: snapData.flow.trigger,
          accountability: snapData.flow.accountability,
          options: snapData.flow.options,
          operation: newRootId,
        },
      });

      // Reload snapshots list
      await loadSnapshots(flow.id);
      await options?.hydrateLocalFlow?.();
      return true;
    } catch (err: unknown) {
      const message = extractErrorMessage(err, 'Rollback failed');
      error.value = message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Deletes a snapshot by ID.
   */
  async function deleteSnapshot(snapshotId: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      await requestDirectus({
        path: `/items/flow_manager_snapshots/${snapshotId}`,
        method: 'DELETE',
      });
      snapshots.value = snapshots.value.filter((s) => s.id !== snapshotId);
      return true;
    } catch (err: unknown) {
      const message = extractErrorMessage(err, 'Failed to delete snapshot');
      error.value = message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Suggests next semantic version based on existing snapshots.
   */
  function suggestNextVersion(existingSnapshots: IFlowSnapshot[]): string {
    if (!existingSnapshots || existingSnapshots.length === 0) {
      return 'v1.0.0';
    }

    const latest = existingSnapshots[0]?.version || 'v1.0.0';
    const clean = latest.replace(/^v/i, '');
    const parts = clean.split('.').map((p) => parseInt(p, 10));

    if (parts.length === 3 && !parts.some(isNaN)) {
      const [major, minor, patch] = parts as [number, number, number];
      return `v${major}.${minor}.${patch + 1}`;
    }

    return `v1.0.${existingSnapshots.length}`;
  }

  return {
    snapshots,
    loading,
    error,
    loadSnapshots,
    createSnapshot,
    rollbackToSnapshot,
    deleteSnapshot,
    suggestNextVersion,
    buildSnapshotData,
    fetchFlow,
    requestDirectus,
  };
}

import { ref, unref, type Ref } from 'vue';
import type { IFlow, ProcessingItem } from '../types';
import { sleep, generateUUID } from '../utils/common.util';

interface CanonicalFlowItem {
  $schema?: string;
  version?: string;
  flow?: {
    name?: string;
    icon?: string;
    color?: string;
    description?: string;
    status?: 'active' | 'inactive';
    trigger?: string;
    accountability?: string;
    options?: Record<string, unknown>;
    root_operation_key?: string | null;
    category?: string | null;
  };
  operations?: Array<{
    key: string;
    name?: string | null;
    type: string;
    position_x: number;
    position_y: number;
    options?: Record<string, unknown> | null;
    resolve?: string | null;
    reject?: string | null;
  }>;
}

function normalizeSingleFlow(item: unknown): IFlow {
  if (!item || typeof item !== 'object') return item as IFlow;

  const candidate = item as CanonicalFlowItem;

  // Check if item is a canonical .flow.json (contains item.flow object and item.operations array)
  if (candidate.flow && typeof candidate.flow === 'object' && Array.isArray(candidate.operations)) {
    const keyToTempId = new Map<string, string>();
    for (const op of candidate.operations) {
      if (op.key) {
        keyToTempId.set(op.key, generateUUID());
      }
    }

    const transformedOperations = candidate.operations.map((op) => ({
      id: keyToTempId.get(op.key) || generateUUID(),
      key: op.key,
      name: op.name ?? null,
      type: op.type,
      position_x: op.position_x,
      position_y: op.position_y,
      options: op.options || {},
      resolve: op.resolve ? keyToTempId.get(op.resolve) || op.resolve : null,
      reject: op.reject ? keyToTempId.get(op.reject) || op.reject : null,
    }));

    const rootId = candidate.flow.root_operation_key
      ? keyToTempId.get(candidate.flow.root_operation_key) || null
      : null;

    return {
      name: candidate.flow.name || 'Restored Flow',
      icon: candidate.flow.icon || 'bolt',
      color:
        candidate.flow.color &&
        candidate.flow.color !== 'var(--theme--primary)' &&
        candidate.flow.color !== 'var(--theme-primary)'
          ? candidate.flow.color
          : null,
      description: candidate.flow.description || '',
      status: candidate.flow.status || 'inactive',
      trigger: candidate.flow.trigger || 'manual',
      accountability: candidate.flow.accountability || 'all',
      options: candidate.flow.options || {},
      operation: rootId,
      operations: transformedOperations,
      flow_manager_metadata_id: {
        flow_manager_category: candidate.flow.category || '',
      },
    } as unknown as IFlow;
  }

  return item as IFlow;
}

function normalizeFlowInput(raw: unknown): IFlow | IFlow[] {
  if (!raw || typeof raw !== 'object') return raw as IFlow;
  if (Array.isArray(raw)) {
    return raw.map(normalizeSingleFlow);
  }
  return normalizeSingleFlow(raw);
}

export interface UseFlowRestoreOptions {
  collectionMap: Ref<Record<string, unknown>> | Record<string, unknown>;
  createFlow: (payload: Omit<IFlow, 'id'> & { id?: string }) => Promise<unknown>;
  reloadFlow: () => Promise<void>;
  reloadTabularFlow: () => Promise<void>;
  hydrateLocalFlow: () => Promise<void>;
  notificationsStore: {
    add: (notification: {
      type: string;
      title: string;
      closeable?: boolean;
      persist?: boolean;
    }) => void;
  };
  processingDialogState: {
    dialog: Ref<boolean>;
    title: Ref<string>;
    list: Ref<ProcessingItem[]>;
    progress: Ref<number>;
    indeterminate: Ref<boolean>;
  };
}

export function useFlowRestore(options: UseFlowRestoreOptions) {
  const {
    collectionMap,
    createFlow,
    reloadFlow,
    reloadTabularFlow,
    hydrateLocalFlow,
    notificationsStore,
    processingDialogState,
  } = options;

  const restoredFile = ref<HTMLInputElement | null>(null);
  const restoredFileObj: Ref<Partial<IFlow | IFlow[]>> = ref({});
  const restoreConfirmationDialog = ref(false);
  const flowDuplicatedName = ref('');
  const isPreviousIdPersisted = ref(false);
  const errors = ref<string[]>([]);

  function resetRestoredFile() {
    if (restoredFile.value) {
      restoredFile.value.value = '';
    }
  }

  function getCollectionDict(): Record<string, unknown> {
    return (unref(collectionMap) || {}) as Record<string, unknown>;
  }

  function onRestoredFileChanged($event: Event) {
    const file: File | undefined = ($event?.target as HTMLInputElement)?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = e.target?.result;
        const rawJson = JSON.parse(result as string);
        const parsedResult = normalizeFlowInput(rawJson) as IFlow | IFlow[];
        const colMap = getCollectionDict();

        errors.value = [];

        if (Array.isArray(parsedResult)) {
          for (const flow of parsedResult) {
            if (!flow?.trigger) {
              errors.value.push(`Trigger is required for ${flow.name}`);
            }

            if (!flow?.options) {
              errors.value.push(`Flow Options are required for ${flow.name}`);
            }

            if (flow?.operations) {
              for (const operation of flow.operations) {
                if (
                  ['item-read', 'item-create', 'item-update', 'item-delete'].includes(
                    operation.type,
                  )
                ) {
                  const collectionName = operation.options?.collection;
                  if (
                    collectionName &&
                    !colMap[collectionName] &&
                    collectionName !== '{{$trigger.collection}}'
                  ) {
                    errors.value.push(
                      `Collection "${collectionName}" does not exist on ${operation.name} operation`,
                    );
                  }
                }
              }
            }
          }

          flowDuplicatedName.value = `{{original_name}} - Copy`;
        } else {
          if (!parsedResult?.trigger) {
            errors.value.push('Trigger is required');
          }

          if (!parsedResult?.options) {
            errors.value.push('Flow Options are required');
          }

          if (parsedResult?.operations) {
            for (const operation of parsedResult.operations) {
              if (
                ['item-read', 'item-create', 'item-update', 'item-delete'].includes(operation.type)
              ) {
                const collectionName = operation.options?.collection;
                if (
                  collectionName &&
                  !colMap[collectionName] &&
                  collectionName !== '{{$trigger.collection}}'
                ) {
                  errors.value.push(
                    `Collection "${collectionName}" does not exist on ${operation.name} operation`,
                  );
                }
              }
            }
          }

          flowDuplicatedName.value = `${parsedResult.name} - Copy`;
          if (parsedResult.id) {
            isPreviousIdPersisted.value = true;
          } else {
            isPreviousIdPersisted.value = false;
          }
        }
        restoreConfirmationDialog.value = true;
        restoredFileObj.value = parsedResult;
      } catch (error) {
        console.error(error);
      }
    };
    reader.readAsText(file);
  }

  function onRestoreButtonClicked() {
    restoredFile.value?.click();
  }

  async function onConfirmRestore() {
    restoreConfirmationDialog.value = false;
    if (Array.isArray(restoredFileObj.value)) {
      processingDialogState.indeterminate.value = false;
      processingDialogState.title.value = 'Restoring Flows';
      processingDialogState.dialog.value = true;
      processingDialogState.list.value = [];
      processingDialogState.progress.value = 0;

      let totalSuccess = 0;
      let totalError = 0;

      for (let i = 0; i < restoredFileObj.value.length; i++) {
        const flow = restoredFileObj.value[i] as IFlow;
        try {
          const newName = flowDuplicatedName.value.replace(/{{original_name}}/g, flow.name);
          await createFlow({
            id: isPreviousIdPersisted.value ? flow.id : undefined,
            name: newName,
            status: 'inactive',
            icon: flow?.icon,
            color:
              flow?.color &&
              flow.color !== 'var(--theme--primary)' &&
              flow.color !== 'var(--theme-primary)'
                ? flow.color
                : null,
            description: flow?.description,
            trigger: flow?.trigger,
            options: flow?.options,
            operation: flow?.operation,
            operations: flow?.operations,
            flow_manager_metadata_id: {
              flow_manager_category: flow?.flow_manager_metadata_id?.flow_manager_category,
            },
            accountability: flow?.accountability,
          });
          processingDialogState.list.value.push({
            status: 'success',
            message: `Flow "${flow?.name}"`,
          });
          totalSuccess++;
        } catch {
          processingDialogState.list.value.push({
            status: 'error',
            message: `Flow "${flow?.name}"`,
          });
          totalError++;
        }
        processingDialogState.progress.value = Math.round(
          (processingDialogState.list.value.length / restoredFileObj.value.length) * 100,
        );
      }

      await reloadFlow();
      await reloadTabularFlow();
      await hydrateLocalFlow();
      isPreviousIdPersisted.value = false;
      notificationsStore.add({
        type: 'success',
        title: `${totalSuccess} Flows restored successfully. ${totalError} Flows restoration failed`,
        closeable: true,
        persist: true,
      });
      sleep(3000).then(() => {
        processingDialogState.dialog.value = false;
      });
    } else {
      const item = restoredFileObj.value as IFlow;
      try {
        const payload = {
          id: isPreviousIdPersisted.value ? item.id : undefined,
          name: flowDuplicatedName.value,
          status: 'inactive' as const,
          icon: item.icon,
          accountability: item.accountability,
          description: item.description,
          trigger: item.trigger,
          options: item.options,
          color:
            item?.color &&
            item.color !== 'var(--theme--primary)' &&
            item.color !== 'var(--theme-primary)'
              ? item.color
              : null,
          flow_manager_metadata_id: {
            flow_manager_category: item.flow_manager_metadata_id?.flow_manager_category,
          },
          operation: item.operation,
          operations: item.operations,
        };

        await createFlow(payload);
        await reloadFlow();
        await reloadTabularFlow();
        await hydrateLocalFlow();
        isPreviousIdPersisted.value = false;

        notificationsStore.add({
          type: 'success',
          title: `Flow "${item.name}" restored successfully`,
          closeable: true,
          persist: true,
        });
      } catch {
        notificationsStore.add({
          type: 'error',
          title: `Failed to restore Flow "${item.name}"`,
          closeable: true,
          persist: true,
        });
      } finally {
        resetRestoredFile();
      }
    }
  }

  return {
    restoredFile,
    restoredFileObj,
    restoreConfirmationDialog,
    flowDuplicatedName,
    isPreviousIdPersisted,
    errors,
    resetRestoredFile,
    onRestoredFileChanged,
    onRestoreButtonClicked,
    onConfirmRestore,
  };
}

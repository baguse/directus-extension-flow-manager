import { ref, unref, type Ref } from 'vue';
import type { IFlow, ProcessingItem } from '../types';
import { sleep } from '../utils/common.util';

export interface UseFlowRestoreOptions {
  collectionMap: Ref<Record<string, unknown>> | Record<string, unknown>;
  createFlow: (payload: Omit<IFlow, 'id'> & { id?: string }) => Promise<unknown>;
  reloadFlow: () => Promise<void>;
  reloadTabularFlow: () => Promise<void>;
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
        const parsedResult = JSON.parse(result as string) as IFlow | IFlow[];
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
            color: flow?.color,
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
          color: item.color,
          flow_manager_metadata_id: {
            flow_manager_category: item.flow_manager_metadata_id?.flow_manager_category,
          },
          operation: item.operation,
          operations: item.operations,
        };

        await createFlow(payload);
        await reloadFlow();
        await reloadTabularFlow();
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

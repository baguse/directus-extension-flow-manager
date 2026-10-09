import { ref, type Ref, type ComputedRef } from 'vue';
import type { useApi } from '@directus/extensions-sdk';
import type { ICredential, IFlow, IFolder, IOperation, ProcessingItem } from '../types';
import { ENDPOINT_EXTENSION_NAME } from '../constants';
import { getTimestamp } from '../utils/date.util';
import { sleep } from '../utils/common.util';
import { transformData } from '../utils/flow.util';

export interface UseFlowActionsOptions {
  api: ReturnType<typeof useApi>;
  credentials: Ref<ICredential[]>;
  selectedCredential: Ref<string>;
  selectedCredentialId: Ref<string>;
  selectedItem: Ref<IFlow | IFolder>;
  selectedItems: Ref<string[]>;
  selectedFlows: ComputedRef<IFlow[]>;
  isSelectAll: Ref<boolean>;
  deleteCategory: (category: IFolder) => Promise<void>;
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

export function useFlowActions(options: UseFlowActionsOptions) {
  const {
    api,
    credentials,
    selectedCredential,
    selectedCredentialId,
    selectedItem,
    selectedItems,
    selectedFlows,
    isSelectAll,
    deleteCategory,
    reloadFlow,
    reloadTabularFlow,
    notificationsStore,
    processingDialogState,
  } = options;

  const deleteItemDialog = ref(false);
  const runFlowDialog = ref(false);
  const pushToCloudDialog = ref(false);
  const runWebhookFlowDialog = ref(false);
  const loadingDeleteItem = ref(false);
  const loadingPushToCloud = ref(false);
  const isBatchAction = ref(false);

  async function createFlow(item: Omit<IFlow, 'id'> & { id?: string }) {
    if (selectedCredential.value === 'local') {
      const response = (await api.post('/flows', {
        id: item.id,
        name: item.name,
        status: 'inactive',
        icon: item.icon,
        accountability: item.accountability,
        description: item.description,
        trigger: item.trigger,
        options: item.options,
        color: item.color,
        flow_manager_metadata_id: {
          flow_manager_category: item.flow_manager_metadata_id?.flow_manager_category,
        },
      })) as { data: { data: { id: string } } };

      const payload = transformData(item.operations, response.data.data.id, item.operation);

      await api.patch(`/flows/${response.data.data.id}`, {
        operation: item.operation ? payload.operation : null,
        operations: {
          create: payload.operations,
        },
      });
    } else {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      const response = (await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
        url: `${credential?.url}/flows`,
        staticToken: credential?.staticToken,
        method: 'POST',
        payload: {
          id: item.id,
          name: item.name,
          status: 'inactive',
          icon: item.icon,
          accountability: item.accountability,
          description: item.description,
          trigger: item.trigger,
          options: item.options,
          color: item.color,
          flow_manager_metadata_id: {
            flow_manager_category: item.flow_manager_metadata_id?.flow_manager_category,
          },
        },
      })) as { data: { data: { id: string } } };

      const payload = transformData(item.operations, response.data.data.id, item.operation);

      await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
        url: `${credential?.url}/flows/${response.data.data.id}`,
        staticToken: credential?.staticToken,
        method: 'PATCH',
        payload: {
          operation: item.operation ? payload.operation : null,
          operations: {
            create: payload.operations,
          },
        },
      });
    }
  }

  async function duplicate(item: IFlow) {
    try {
      const payload: Omit<IFlow, 'id'> & { id?: string } = {
        name: `${item.name} - Duplicated`,
        status: 'inactive',
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

      notificationsStore.add({
        type: 'success',
        title: 'Flow Duplicated successfully',
        closeable: true,
        persist: true,
      });
    } catch {
      notificationsStore.add({
        type: 'error',
        title: 'Flow Duplication failed',
        closeable: true,
        persist: true,
      });
    }
  }

  async function pushToCloud(credential: ICredential | null) {
    if (selectedItems.value.length) {
      pushToCloudDialog.value = false;
      processingDialogState.indeterminate.value = false;
      processingDialogState.title.value = 'Pushing Flows to Cloud';
      processingDialogState.dialog.value = true;
      processingDialogState.list.value = [];
      processingDialogState.progress.value = 0;
      let totalSuccess = 0;
      let totalError = 0;

      for (const item of selectedFlows.value) {
        try {
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/push-to-cloud`, {
            config: {
              url: credential?.url,
              staticToken: credential?.staticToken,
            },
            flowId: item.id,
          });
          processingDialogState.list.value.push({
            status: 'success',
            message: `Flow "${item.name}"`,
          });
          totalSuccess++;
        } catch {
          processingDialogState.list.value.push({
            status: 'error',
            message: `Flow "${item.name}"`,
          });
          totalError++;
        }
        processingDialogState.progress.value = Math.round(
          (processingDialogState.list.value.length / selectedFlows.value.length) * 100,
        );
      }
      notificationsStore.add({
        type: 'success',
        title: `${totalSuccess} Flows pushed successfully. ${totalError} Flows failed`,
        closeable: true,
        persist: true,
      });
      selectedItems.value = [];
      isSelectAll.value = false;
      sleep(3000).then(() => {
        processingDialogState.dialog.value = false;
      });
      selectedCredentialId.value = '';
      return;
    }
    const item = selectedItem.value as IFlow;
    loadingPushToCloud.value = true;
    try {
      await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/push-to-cloud`, {
        config: {
          url: credential?.url,
          staticToken: credential?.staticToken,
        },
        flowId: item.id,
      });

      notificationsStore.add({
        type: 'success',
        title: `The flow has been sent to the "${credential?.name}" successfully`,
        closeable: true,
        persist: true,
      });
    } catch {
      notificationsStore.add({
        type: 'error',
        title: 'Send to cloud failed',
        closeable: true,
        persist: true,
      });
    } finally {
      pushToCloudDialog.value = false;
      selectedCredentialId.value = '';
      loadingPushToCloud.value = false;
    }
  }

  async function backup(item: IFlow | IFlow[]) {
    interface ISanitizedFlow extends Partial<Omit<IFlow, 'operations'>> {
      operations: Partial<IOperation>[];
    }

    let result: ISanitizedFlow | ISanitizedFlow[];
    let fileName = '';
    if (Array.isArray(item)) {
      result = item.map((flow) => ({
        id: flow.id,
        name: flow.name,
        icon: flow.icon,
        color: flow.color,
        description: flow.description,
        trigger: flow.trigger,
        options: flow.options,
        operation: flow.operation,
        operations: flow.operations.map((operation) => ({
          id: operation.id,
          name: operation.name,
          key: operation.key,
          type: operation.type,
          position_x: operation.position_x,
          position_y: operation.position_y,
          options: operation.options,
          resolve: operation.resolve,
          reject: operation.reject,
        })),
        flow_manager_metadata_id: {
          flow_manager_category: flow.flow_manager_metadata_id?.flow_manager_category,
        },
        accountability: flow.accountability,
      }));
      fileName = `flow-manager-${getTimestamp()}.json`;
      isSelectAll.value = false;
      selectedItems.value = [];
    } else {
      result = {
        id: item.id,
        name: item.name,
        icon: item.icon,
        color: item.color,
        description: item.description,
        trigger: item.trigger,
        options: item.options,
        operation: item.operation,
        operations: item.operations.map((operation) => ({
          id: operation.id,
          name: operation.name,
          key: operation.key,
          type: operation.type,
          position_x: operation.position_x,
          position_y: operation.position_y,
          options: operation.options,
          resolve: operation.resolve,
          reject: operation.reject,
        })),
        flow_manager_metadata_id: {
          flow_manager_category: item.flow_manager_metadata_id?.flow_manager_category,
        },
        accountability: item.accountability,
      };
      fileName = `flow-manager-${getTimestamp()}-${item.name}.json`;
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: 'application/json',
    });
    const fileObj = window.URL.createObjectURL(blob);

    const docUrl = document.createElement('a');
    docUrl.href = fileObj;
    docUrl.setAttribute('download', fileName);
    document.body.appendChild(docUrl);
    docUrl.click();
    document.body.removeChild(docUrl);
    window.URL.revokeObjectURL(fileObj);
  }

  async function duplicateSelectedItems() {
    if (!selectedItems.value.length) {
      return;
    }
    processingDialogState.indeterminate.value = false;
    processingDialogState.title.value = 'Duplicating Flows';
    processingDialogState.dialog.value = true;
    processingDialogState.list.value = [];
    processingDialogState.progress.value = 0;
    let totalSuccess = 0;
    let totalError = 0;
    try {
      for (const item of selectedFlows.value) {
        if (item) {
          try {
            await createFlow({
              name: `${item.name} - Duplicated`,
              status: 'inactive',
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
            });
            processingDialogState.list.value.push({
              status: 'success',
              message: `Flow "${item.name}"`,
            });
            totalSuccess++;
          } catch {
            processingDialogState.list.value.push({
              status: 'error',
              message: `Flow "${item.name}"`,
            });
            totalError++;
          }
          processingDialogState.progress.value = Math.round(
            (processingDialogState.list.value.length / selectedItems.value.length) * 100,
          );
        }
      }
      notificationsStore.add({
        type: 'success',
        title: `Successfully duplicated ${totalSuccess} Flows. Failed to duplicate ${totalError} Flows`,
        closeable: true,
        persist: true,
      });
    } catch {
    } finally {
      reloadFlow();
      reloadTabularFlow();
      selectedItems.value = [];
      isSelectAll.value = false;
      sleep(3000).then(() => {
        processingDialogState.dialog.value = false;
      });
    }
  }

  async function backupSelectedItems() {
    if (!selectedItems.value.length) {
      return;
    }
    try {
      if (selectedFlows.value.length) {
        await backup(selectedFlows.value);
      }
    } catch {}
  }

  async function deleteItem() {
    const deleteFunc =
      selectedCredential.value === 'local'
        ? async (id: string) => {
            await api.delete(`/flows/${id}`);
          }
        : async (id: string) => {
            const credential = credentials.value.find(
              (cred) => cred.id === selectedCredential.value,
            );
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/flows/${id}`,
              staticToken: credential?.staticToken,
              method: 'DELETE',
            });
          };
    if (isBatchAction.value) {
      if (!selectedItems.value.length) return;
      deleteItemDialog.value = false;
      processingDialogState.indeterminate.value = false;
      processingDialogState.title.value = 'Deleting Flows';
      processingDialogState.dialog.value = true;
      processingDialogState.list.value = [];
      processingDialogState.progress.value = 0;
      let totalSuccess = 0;
      let totalError = 0;

      for (const item of selectedFlows.value) {
        try {
          await deleteFunc(`${item.id}`);
          processingDialogState.list.value.push({
            status: 'success',
            message: `Flow "${item.name}"`,
          });
          totalSuccess++;
        } catch {
          processingDialogState.list.value.push({
            status: 'error',
            message: `Flow "${item.name}"`,
          });
          totalError++;
        }
        processingDialogState.progress.value = Math.round(
          (processingDialogState.list.value.length / selectedFlows.value.length) * 100,
        );
      }
      notificationsStore.add({
        type: 'success',
        title: `${totalSuccess} Flows deleted successfully. ${totalError} Flows deletion failed`,
        closeable: true,
        persist: true,
      });
      reloadFlow();
      reloadTabularFlow();
      selectedItems.value = [];
      isSelectAll.value = false;
      sleep(3000).then(() => {
        processingDialogState.dialog.value = false;
      });
    } else {
      if (!selectedItem.value) return;
      let type = 'Flow';
      try {
        loadingDeleteItem.value = true;
        if ((selectedItem.value as IFolder).type === 'category') {
          type = 'Folder';
          await deleteCategory(selectedItem.value as IFolder);
        } else {
          await deleteFunc((selectedItem.value as IFlow).id);

          await reloadFlow();
          await reloadTabularFlow();
        }

        notificationsStore.add({
          type: 'success',
          title: `${type} Deleted successfully`,
          closeable: true,
          persist: true,
        });
      } catch {
        notificationsStore.add({
          type: 'error',
          title: `${type} Deletion failed`,
          closeable: true,
          persist: true,
        });
      } finally {
        loadingDeleteItem.value = false;
        deleteItemDialog.value = false;
      }
    }
  }

  async function deleteSelectedItems() {
    isBatchAction.value = true;
    deleteItemDialog.value = true;
  }

  async function changeFlowStatus(status: 'active' | 'inactive') {
    if (!selectedItems.value.length) return;
    processingDialogState.indeterminate.value = false;
    processingDialogState.title.value =
      status === 'active' ? 'Activating Flows' : 'Deactivating Flows';
    processingDialogState.dialog.value = true;
    processingDialogState.list.value = [];
    processingDialogState.progress.value = 0;
    let totalSuccess = 0;
    let totalError = 0;
    const func =
      selectedCredential.value === 'local'
        ? async (id: string) => {
            await api.patch(`/flows/${id}`, {
              status,
            });
          }
        : async (id: string) => {
            const credential = credentials.value.find(
              (cred) => cred.id === selectedCredential.value,
            );
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/flows/${id}`,
              staticToken: credential?.staticToken,
              method: 'PATCH',
              payload: {
                status,
              },
            });
          };
    try {
      const filtered = selectedFlows.value.filter((flow) => flow.status !== status);
      for (const item of filtered) {
        if (item) {
          try {
            await func(item.id);
            processingDialogState.list.value.push({
              status: 'success',
              message: `Flow "${item.name}"`,
            });
            totalSuccess++;
          } catch {
            processingDialogState.list.value.push({
              status: 'error',
              message: `Flow "${item.name}"`,
            });
            totalError++;
          }
          processingDialogState.progress.value = Math.round(
            (processingDialogState.list.value.length / filtered.length) * 100,
          );
        }
      }
      notificationsStore.add({
        type: 'success',
        title:
          status === 'active'
            ? `Successfully activated ${totalSuccess} Flows. Failed to activate ${totalError} Flows`
            : `Successfully deactivated ${totalSuccess} Flows. Failed to deactivate ${totalError} Flows`,
        closeable: true,
        persist: true,
      });
    } catch {
    } finally {
      reloadFlow();
      reloadTabularFlow();
      selectedItems.value = [];
      isSelectAll.value = false;
      sleep(3000).then(() => {
        processingDialogState.dialog.value = false;
      });
    }
  }

  function showDeleteItemDialog(item: IFlow) {
    selectedItem.value = item;
    deleteItemDialog.value = true;
    isBatchAction.value = false;
  }

  function showPushToCloud(item: IFlow) {
    selectedItem.value = item;
    pushToCloudDialog.value = true;
  }

  function showRunDialog(item: IFlow) {
    selectedItem.value = item;
    runFlowDialog.value = true;
  }

  function showRunWebhookDialog(item: IFlow) {
    selectedItem.value = item;
    runWebhookFlowDialog.value = true;
  }

  return {
    deleteItemDialog,
    runFlowDialog,
    pushToCloudDialog,
    runWebhookFlowDialog,
    loadingDeleteItem,
    loadingPushToCloud,
    isBatchAction,
    createFlow,
    duplicate,
    duplicateSelectedItems,
    backup,
    backupSelectedItems,
    deleteItem,
    deleteSelectedItems,
    pushToCloud,
    changeFlowStatus,
    showDeleteItemDialog,
    showPushToCloud,
    showRunDialog,
    showRunWebhookDialog,
  };
}

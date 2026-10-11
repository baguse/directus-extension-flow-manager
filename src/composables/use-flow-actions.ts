import { onBeforeUnmount, ref, type Ref, type ComputedRef } from 'vue';
import type { useApi } from '@directus/extensions-sdk';
import type {
  ICredential,
  IFlow,
  IFolder,
  IOperation,
  PendingDelete,
  ProcessingItem,
} from '../types';
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
  saveCategories?: () => Promise<void>;
  reloadFlow: () => Promise<void>;
  reloadTabularFlow: () => Promise<void>;
  flows: Ref<IFlow[]>;
  flowCategories: Ref<IFolder[]>;
  tabularFlows?: Ref<IFlow[]>;
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
    saveCategories,
    reloadFlow,
    reloadTabularFlow,
    flows,
    flowCategories,
    tabularFlows,
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
    const rawColor = item.color ? String(item.color).trim() : '';
    const cleanColor =
      rawColor && rawColor !== 'var(--theme--primary)' && rawColor !== 'var(--theme-primary)'
        ? rawColor
        : null;

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
        color: cleanColor,
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
          color: cleanColor,
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
      const rawColor = item.color ? String(item.color).trim() : '';
      const cleanColor =
        rawColor && rawColor !== 'var(--theme--primary)' && rawColor !== 'var(--theme-primary)'
          ? rawColor
          : null;

      const payload: Omit<IFlow, 'id'> & { id?: string } = {
        name: `${item.name} - Duplicated`,
        status: 'inactive',
        icon: item.icon,
        accountability: item.accountability,
        description: item.description,
        trigger: item.trigger,
        options: item.options,
        color: cleanColor,
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
            const rawColor = item.color ? String(item.color).trim() : '';
            const cleanColor =
              rawColor &&
              rawColor !== 'var(--theme--primary)' &&
              rawColor !== 'var(--theme-primary)'
                ? rawColor
                : null;

            await createFlow({
              name: `${item.name} - Duplicated`,
              status: 'inactive',
              icon: item.icon,
              accountability: item.accountability,
              description: item.description,
              trigger: item.trigger,
              options: item.options,
              color: cleanColor,
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

  const pendingDelete = ref<PendingDelete | null>(null);
  let deleteTimeout: ReturnType<typeof setTimeout> | null = null;
  let timerStart = 0;
  let remainingTime = 5000;

  function clearDeleteTimer() {
    if (deleteTimeout) {
      clearTimeout(deleteTimeout);
      deleteTimeout = null;
    }
  }

  function startDeleteTimer(duration = 5000) {
    clearDeleteTimer();
    remainingTime = duration;
    timerStart = Date.now();
    deleteTimeout = setTimeout(() => {
      commitPermanentDelete();
    }, duration);
  }

  function pauseDeleteTimer() {
    if (!deleteTimeout) return;
    clearDeleteTimer();
    const elapsed = Date.now() - timerStart;
    remainingTime = Math.max(1000, remainingTime - elapsed);
  }

  function resumeDeleteTimer() {
    if (deleteTimeout || !pendingDelete.value) return;
    timerStart = Date.now();
    deleteTimeout = setTimeout(() => {
      commitPermanentDelete();
    }, remainingTime);
  }

  const getDeleteFunc = () =>
    selectedCredential.value === 'local'
      ? async (id: string) => {
          await api.delete(`/flows/${id}`);
        }
      : async (id: string) => {
          const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential?.url}/flows/${id}`,
            staticToken: credential?.staticToken,
            method: 'DELETE',
          });
        };

  async function commitPermanentDelete() {
    clearDeleteTimer();
    if (!pendingDelete.value) return;

    const current = pendingDelete.value;
    pendingDelete.value = null;
    const deleteFunc = getDeleteFunc();

    if (current.type === 'category' && current.category) {
      try {
        if (saveCategories) {
          await saveCategories();
        } else {
          await deleteCategory(current.category);
        }
      } catch {
        if (typeof current.categoryIndex === 'number' && current.categoryIndex >= 0) {
          flowCategories.value.splice(current.categoryIndex, 0, current.category);
        } else {
          flowCategories.value.push(current.category);
        }
        notificationsStore.add({
          type: 'error',
          title: `Folder "${current.category.name}" deletion failed`,
          closeable: true,
          persist: true,
        });
      }
    } else if (
      current.type === 'flow' &&
      current.flows &&
      current.flows.length > 0 &&
      current.flows[0]
    ) {
      const flow = current.flows[0];
      try {
        await deleteFunc(flow.id);
      } catch {
        flows.value.push(flow);
        if (tabularFlows?.value) tabularFlows.value.push(flow);
        notificationsStore.add({
          type: 'error',
          title: `Flow "${flow.name}" deletion failed`,
          closeable: true,
          persist: true,
        });
      }
    } else if (current.type === 'batch' && current.flows && current.flows.length > 0) {
      let totalSuccess = 0;
      let totalError = 0;
      const failedFlows: IFlow[] = [];

      for (const flow of current.flows) {
        try {
          await deleteFunc(`${flow.id}`);
          totalSuccess++;
        } catch {
          totalError++;
          failedFlows.push(flow);
        }
      }

      if (failedFlows.length > 0) {
        flows.value.push(...failedFlows);
        if (tabularFlows?.value) tabularFlows.value.push(...failedFlows);
        notificationsStore.add({
          type: 'error',
          title: `${totalError} Flows deletion failed and were restored`,
          closeable: true,
          persist: true,
        });
      } else {
        notificationsStore.add({
          type: 'success',
          title: `${totalSuccess} ${totalSuccess === 1 ? 'Flow' : 'Flows'} permanently deleted`,
          closeable: true,
        });
      }
    }
  }

  function undoDelete() {
    clearDeleteTimer();
    if (!pendingDelete.value) return;

    const current = pendingDelete.value;
    pendingDelete.value = null;

    if (current.type === 'category' && current.category) {
      if (typeof current.categoryIndex === 'number' && current.categoryIndex >= 0) {
        flowCategories.value.splice(current.categoryIndex, 0, current.category);
      } else {
        flowCategories.value.push(current.category);
      }
      if (!selectedItem.value?.id) {
        selectedItem.value = current.category;
      }
    } else if (
      current.type === 'flow' &&
      current.flows &&
      current.flows.length > 0 &&
      current.flows[0]
    ) {
      const flow = current.flows[0];
      flows.value.push(flow);
      if (tabularFlows?.value) tabularFlows.value.push(flow);
      if (!selectedItem.value?.id) {
        selectedItem.value = flow;
      }
    } else if (current.type === 'batch' && current.flows && current.flows.length > 0) {
      flows.value.push(...current.flows);
      if (tabularFlows?.value) tabularFlows.value.push(...current.flows);
    }

    notificationsStore.add({
      type: 'info',
      title: 'Deletion undone',
      closeable: true,
    });
  }

  async function deleteItem() {
    if (pendingDelete.value) {
      await commitPermanentDelete();
    }

    const duration = 5000;

    if (isBatchAction.value) {
      if (!selectedItems.value.length) return;
      deleteItemDialog.value = false;

      const flowsToDelete = [...selectedFlows.value];
      if (!flowsToDelete.length) return;

      const idsToDelete = new Set(flowsToDelete.map((f) => f.id));

      flows.value = flows.value.filter((f) => !idsToDelete.has(f.id));
      if (tabularFlows?.value) {
        tabularFlows.value = tabularFlows.value.filter((f) => !idsToDelete.has(f.id));
      }

      if (selectedItem.value?.id && idsToDelete.has(selectedItem.value.id)) {
        selectedItem.value = {
          id: '',
          name: '',
          icon: '',
          color: '',
          description: '',
          trigger: '',
          options: { collections: [] },
          operations: [],
          operation: '',
          status: '',
          accountability: '',
          flow_manager_metadata_id: {
            flow_manager_order: 0,
            flow_manager_category: '',
          },
        };
      }

      selectedItems.value = [];
      isSelectAll.value = false;
      isBatchAction.value = false;

      const count = flowsToDelete.length;
      pendingDelete.value = {
        id: `batch-${Date.now()}`,
        type: 'batch',
        flows: flowsToDelete,
        message: `${count} ${count === 1 ? 'Flow' : 'Flows'} deleted`,
        duration,
      };

      startDeleteTimer(duration);
    } else {
      if (!selectedItem.value?.id) return;
      deleteItemDialog.value = false;

      if ((selectedItem.value as IFolder).type === 'category') {
        const categoryToDelete = { ...selectedItem.value } as IFolder;
        const categoryIndex = flowCategories.value.findIndex(
          (c) => c.id === categoryToDelete.id || c.name === categoryToDelete.name,
        );

        if (categoryIndex !== -1) {
          flowCategories.value.splice(categoryIndex, 1);
        }

        selectedItem.value = {
          id: '',
          name: '',
          icon: '',
          color: '',
          description: '',
          trigger: '',
          options: { collections: [] },
          operations: [],
          operation: '',
          status: '',
          accountability: '',
          flow_manager_metadata_id: {
            flow_manager_order: 0,
            flow_manager_category: '',
          },
        };

        pendingDelete.value = {
          id: `category-${categoryToDelete.id || Date.now()}`,
          type: 'category',
          category: categoryToDelete,
          categoryIndex: categoryIndex !== -1 ? categoryIndex : undefined,
          message: `Folder "${categoryToDelete.name}" deleted`,
          duration,
        };

        startDeleteTimer(duration);
      } else {
        const flowToDelete = { ...selectedItem.value } as IFlow;

        flows.value = flows.value.filter((f) => f.id !== flowToDelete.id);
        if (tabularFlows?.value) {
          tabularFlows.value = tabularFlows.value.filter((f) => f.id !== flowToDelete.id);
        }

        if (selectedItem.value?.id === flowToDelete.id) {
          selectedItem.value = {
            id: '',
            name: '',
            icon: '',
            color: '',
            description: '',
            trigger: '',
            options: { collections: [] },
            operations: [],
            operation: '',
            status: '',
            accountability: '',
            flow_manager_metadata_id: {
              flow_manager_order: 0,
              flow_manager_category: '',
            },
          };
        }

        selectedItems.value = selectedItems.value.filter((id) => id !== flowToDelete.id);

        pendingDelete.value = {
          id: `flow-${flowToDelete.id}`,
          type: 'flow',
          flows: [flowToDelete],
          message: `Flow "${flowToDelete.name}" deleted`,
          duration,
        };

        startDeleteTimer(duration);
      }
    }
  }

  const handleBeforeUnload = () => {
    if (pendingDelete.value) {
      commitPermanentDelete();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', handleBeforeUnload);
  }

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
    if (pendingDelete.value) {
      commitPermanentDelete();
    }
  });

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
    pendingDelete,
    undoDelete,
    commitPermanentDelete,
    pauseDeleteTimer,
    resumeDeleteTimer,
    pushToCloud,
    changeFlowStatus,
    showDeleteItemDialog,
    showPushToCloud,
    showRunDialog,
    showRunWebhookDialog,
  };
}

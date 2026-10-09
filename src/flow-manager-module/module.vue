<template>
  <private-view :title="title">
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon :name="iconName" />
      </v-button>
    </template>

    <template #title-outer:append>
      <v-chip v-if="installedVersion" v-tooltip.bottom="'Current Version'" small class="ml-2">{{
        installedVersion
      }}</v-chip>
      <div v-if="latestVersion">
        <span class="ml-2">-></span>
        <v-chip v-tooltip.bottom="'Latest Version'" small class="ml-2 secondary-chip">
          {{ latestVersion }}
        </v-chip>
      </div>
    </template>

    <template v-if="isDatabaseUpdated">
      <FlowBatchActions
        v-model:show-select="showSelect"
        v-model:is-select-all="isSelectAll"
        :view-list-mode="viewListMode"
        :selected-items-count="selectedItems.length"
        :selected-flows-inactive-count="selectedFlowsInactive.length"
        :selected-flows-active-count="selectedFlowsActive.length"
        :selected-credential="selectedCredential"
        @select-all="selectAll()"
        @activate-selected="() => changeFlowStatus('active')"
        @deactivate-selected="() => changeFlowStatus('inactive')"
        @backup-selected="backupSelectedItems"
        @duplicate-selected="duplicateSelectedItems"
        @delete-selected="deleteSelectedItems"
        @push-to-cloud-selected="() => (pushToCloudDialog = true)"
      />
      <FlowListView
        v-if="viewListMode"
        :items="parentId ? currentFlows : rootFlows"
        :all-flows="allFlows"
        :show-select="showSelect"
        :selected-items="selectedItems"
        @sort="onSort"
      />
      <FlowTableView
        v-else
        v-model="selectedItems"
        v-model:headers="headers"
        v-model:page="tablePage"
        v-model:limit="tableLimit"
        :items="tabularFlows"
        :sort="tableSort"
        :loading="isTabularFlowLoading"
        :show-select="showSelect"
        :selected-credential="selectedCredential"
        :selected-shortcut-filter="selectedShortcutFilter"
        :used-category-list="usedCategoryList"
        :get-category-name="getCategoryName"
        :get-category-icon="getCategoryIcon"
        :format-date-long="formatDateLong"
        @click:row="goToFlow"
        @update:sort="onTableSortChange"
        @run="showRunDialog"
        @go-to-flow="goToFlow"
        @open-dashboard="openDashboardDetail"
        @duplicate="duplicate"
        @backup="backup"
        @push-to-cloud="showPushToCloud"
        @delete="showDeleteItemDialog"
        @set-status-filter="setStatusFilter"
        @set-trigger-filter="setTriggerFilter"
        @set-category-filter="setCategoryFilter"
      />
    </template>
    <div v-else class="flex justify-center h-full items-center">
      <div class="error not-configured-notes">
        <div>Flow Manager needs to be configured before you can use it.</div>
        <div>Please follow these steps:</div>
        <div>1. Click the <strong>Settings</strong> button (⚙️ gear icon).</div>
        <div>2. Click <strong>Configure</strong>.</div>
        <div>3. Flow Manager will automatically configure the required settings for you.</div>
        <div>4. Once the configuration is complete, you can start using Flow Manager.</div>
      </div>
    </div>

    <template #navigation>
      <content-navigation
        :view-mode="viewListMode ? 'LIST' : 'TABLE'"
        :root-flows="rootFlows"
        :flow-child-map="flowChildMap"
        :all-flows="allFlows"
        :server-info="serverInfo"
        :is-database-updated="isDatabaseUpdated"
      />
    </template>
    <template v-if="isDatabaseUpdated" #actions>
      <v-checkbox v-model="viewListMode" label="List View" />
      <search-input
        v-if="!viewListMode"
        v-model="tableFlowSearch"
        v-model:filter="tableFlowFilter"
        :collection="'directus_flows'"
      />
      <v-button v-tooltip.bottom="'Settings'" rounded icon @click="settingDialog = true">
        <v-icon name="settings" />
      </v-button>
      <v-button v-tooltip.bottom="'Credentials'" rounded icon @click="credentialDialog = true">
        <v-icon name="database" />
      </v-button>
      <v-button v-tooltip.bottom="'Restore'" rounded icon @click="onRestoreButtonClicked">
        <v-icon name="file_upload" />
      </v-button>
    </template>
    <template v-else #actions>
      <v-button v-tooltip.bottom="'Settings'" rounded icon @click="settingDialog = true">
        <v-icon name="settings" />
      </v-button>
    </template>

    <template #sidebar>
      <FlowSidebarDetail
        :selected-item="selectedItem"
        :format-date-long="formatDateLong"
        :get-operation-name-by-id="getOperationNameById"
      />
    </template>

    <input
      ref="restoredFile"
      type="file"
      accept="application/json"
      style="display: none"
      @change="onRestoredFileChanged"
    />
    <RestoreConfirmationDialog
      :value="restoreConfirmationDialog"
      :flow-duplicated-name="flowDuplicatedName"
      :is-previous-id-persisted="isPreviousIdPersisted"
      :restored-file-obj="restoredFileObj"
      :errors="errors"
      @update:model-value="restoreConfirmationDialog = $event"
      @update:flow-duplicated-name="flowDuplicatedName = $event"
      @update:is-previous-id-persisted="isPreviousIdPersisted = $event"
      @proceed="onConfirmRestore"
    />

    <SettingDialog
      :value="settingDialog"
      :is-database-updated="isDatabaseUpdated"
      :not-created-collections="notCreatedCollections"
      :not-created-fields="notCreatedFields"
      :different-fields="differentFields"
      :folder-headers="folderHeaders"
      :flow-categories="flowCategories"
      :selected-category="selectedCategory"
      :is-edit-category="isEditCategory"
      :is-configuration-loading="isConfigurationLoading"
      :is-syncing-flow-counters-loading="isSyncingFlowCountersLoading"
      @update:model-value="settingDialog = $event"
      @update:selected-category="selectedCategory = $event"
      @select-category-for-edit="selectCategoryForEdit"
      @delete-category="deleteCategory"
      @save-category="saveCategory"
      @cancel-edit-category="cancelEditCategory"
      @configure="configureFlowManagerDatabase"
      @sync-flow-counters="syncFlowCounters"
    />

    <CredentialDialog
      v-model:credentials="credentials"
      :value="credentialDialog"
      @update:model-value="credentialDialog = $event"
    />

    <PushToCloudDialog
      :value="pushToCloudDialog"
      :credentials="credentials"
      :loading="loadingPushToCloud"
      @update:model-value="pushToCloudDialog = $event"
      @proceed="pushToCloud"
    />

    <DeleteDialog
      :value="deleteItemDialog"
      :is-batch-action="isBatchAction"
      :selected-item="selectedItem"
      :selected-flows="selectedFlows"
      :loading="loadingDeleteItem"
      @update:model-value="deleteItemDialog = $event"
      @proceed="deleteItem"
    />

    <RunManualFlowForm
      :value="runFlowDialog"
      :selected-item="selectedItem"
      @update:model-value="runFlowDialog = $event"
      @reload:flow="reloadFlow"
      @reload:tabular-flow="reloadTabularFlow"
    />

    <RunWebhookFlowForm
      :value="runWebhookFlowDialog"
      :selected-item="selectedItem"
      @update:model-value="runWebhookFlowDialog = $event"
      @reload:flow="reloadFlow"
      @reload:tabular-flow="reloadTabularFlow"
    />

    <LoadingDialog
      :title="processingDialogTitle"
      :value="processingDialog"
      :progress-value="progressValue"
      :list-processing="listProcessing"
      :indeterminate="indeterminateProcess"
      @update:model-value="processingDialog = $event"
    />

    <v-overlay :value="true" />
  </private-view>
</template>

<script lang="ts">
import {
  type Ref,
  computed,
  defineComponent,
  nextTick,
  onMounted,
  provide,
  ref,
  toRefs,
} from 'vue';
import { useStores, useApi, useLayout } from '@directus/extensions-sdk';
import { useRouter } from 'vue-router';
import type { AppCollection, Field } from '@directus/types';

import type { IFlow, IFolder, ProcessingItem } from '../types';
import { ENDPOINT_EXTENSION_NAME, TRIGGER_TYPES } from '../constants';

import { formatDate, formatDateLong } from '../utils/date.util';
import { maskingText } from '../utils/string.util';
import { formatConnectionError } from '../utils/error.util';

import FlowListView from './components/flow-list-view.vue';
import ContentNavigation from './components/navigation.vue';
import RunManualFlowForm from './components/run-manual-flow-form.vue';
import SearchInput from './components/search-input.vue';
import LoadingDialog from './components/loading-dialog.vue';
import CredentialDialog from './components/credential-dialog.vue';
import DeleteDialog from './components/delete-dialog.vue';
import PushToCloudDialog from './components/push-to-cloud-dialog.vue';
import RunWebhookFlowForm from './components/run-webhook-flow-form.vue';
import RestoreConfirmationDialog from './components/restore-confirmation-dialog.vue';
import SettingDialog from './components/setting-dialog.vue';
import FlowBatchActions from './components/flow-batch-actions.vue';
import FlowTableView from './components/flow-table-view.vue';
import FlowSidebarDetail from './components/flow-sidebar-detail.vue';
import { useFlowRestore } from '../composables/use-flow-restore';
import { useFlowCategories } from '../composables/use-flow-categories';
import { useFlowDatabase } from '../composables/use-flow-database';
import { useFlowActions } from '../composables/use-flow-actions';
import { useFlowQuery } from '../composables/use-flow-query';
import { useFlowCredentials } from '../composables/use-flow-credentials';
import { useExtensionVersion } from '../composables/use-extension-version';

export default defineComponent({
  components: {
    FlowListView,
    ContentNavigation,
    SearchInput,
    RunManualFlowForm,
    LoadingDialog,
    CredentialDialog,
    DeleteDialog,
    PushToCloudDialog,
    RunWebhookFlowForm,
    RestoreConfirmationDialog,
    SettingDialog,
    FlowBatchActions,
    FlowTableView,
    FlowSidebarDetail,
  },

  props: {
    parentId: {
      type: String,
      default: null,
    },
  },

  setup(props) {
    const {
      useNotificationsStore,
      useCollectionsStore,
      useSettingsStore,
      useFieldsStore,
      usePresetsStore,
      useRelationsStore,
    } = useStores();
    const notificationsStore = useNotificationsStore();
    const collectionsStore = useCollectionsStore();
    const relationsStore = useRelationsStore();
    const api = useApi();
    const router = useRouter();
    const settingsStore = useSettingsStore();
    const fieldsStore = useFieldsStore();
    const presetsStore = usePresetsStore();
    const { layoutWrapper } = useLayout(ref('tabular'));

    const { parentId } = toRefs(props);
    const flows = ref<IFlow[]>([]);
    const { allCollections } = collectionsStore;
    const flowFields: Ref<Field[]> = ref(fieldsStore.getFieldsForCollection('directus_flows'));
    const settingFields: Ref<Field[]> = ref(
      fieldsStore.getFieldsForCollection('directus_settings'),
    );
    const folderHeaders = ref([
      {
        text: 'Name',
        value: 'name',
        width: 400,
      },
    ]);

    const {
      selectedCredential,
      currentUser,
      serverInfo,
      credentials,
      reloadFields,
      reloadFolders,
      getServerInfo,
      checkCredentialConnection,
    } = useFlowCredentials({
      api,
      settingsStore,
      fieldsStore,
    });

    const { installedVersion, latestVersion, getLatestVersion } = useExtensionVersion(api);

    const {
      flowCategories,
      selectedCategory,
      isEditCategory,
      patchCategory,
      saveCategories,
      saveCategory,
      deleteCategory,
      selectCategoryForEdit,
      cancelEditCategory,
      duplicateFolder,
      showEditFolderDialog,
    } = useFlowCategories({
      initialCategories: settingsStore.settings?.flow_manager_categories,
      settingsStore,
      api,
      credentials,
      selectedCredential,
      openSettingDialog: () => {
        settingDialog.value = true;
      },
    });

    const selectedItems = ref<string[]>([]);
    const progressValue = ref(0);
    const listProcessing = ref<ProcessingItem[]>([]);
    const processingDialogTitle = ref('');
    const selectedCredentialId = ref('');
    const selectedItem = ref<IFlow | IFolder>({
      id: '',
      name: '',
      icon: '',
      color: '',
      description: '',
      trigger: '',
      options: {
        collections: [],
      },
      operations: [],
      operation: '',
      status: '',
      accountability: '',
      flow_manager_metadata_id: {
        flow_manager_order: 0,
        flow_manager_category: '',
      },
    });

    /*
      Flags stuff
    */
    const processingDialog = ref(false);
    const settingDialog = ref(false);
    const credentialDialog = ref(false);
    const loadingRunFlow = ref(false);

    const showSelect = ref(false);
    const isSelectAll = ref(false);
    const indeterminateProcess = ref(false);

    const selectedFlows = computed<IFlow[]>(() => {
      return flows.value.filter((flow) => selectedItems.value.includes(flow.id));
    });

    const selectedFlowsActive = computed<IFlow[]>(() => {
      return selectedFlows.value.filter((flow) => flow.status === 'active');
    });

    const selectedFlowsInactive = computed<IFlow[]>(() => {
      return selectedFlows.value.filter((flow) => flow.status === 'inactive');
    });
    const title = computed(() => {
      if (!parentId.value) {
        return 'Flow Manager';
      }

      const currentParent =
        flows.value.find((flow) => flow.id === parentId.value) ||
        flowCategories.value.find((category) => category.id === parentId.value);

      if (!currentParent) {
        return `Flow Manager - ${parentId.value}`;
      }

      return `Flow Manager - ${currentParent.name}`;
    });
    const iconName = computed(() => {
      if (!parentId.value) {
        return 'bolt';
      }

      const currentParent: IFlow | IFolder | undefined =
        flows.value.find((flow) => flow.id === parentId.value) ||
        flowCategories.value.find((category) => category.id === parentId.value);

      if (currentParent) {
        if ((currentParent as IFolder)?.type === 'category') {
          return currentParent.icon || 'folder';
        }

        return currentParent.icon || 'bolt';
      }

      return 'bolt';
    });
    const flowFieldConfiguration = computed(() => {
      let isOrderFieldConfigured = false;
      let isCategoryFieldConfigured = false;
      let isLastRunFieldConfigured = false;
      let isRunCounterFieldConfigured = false;

      for (const field of flowFields.value) {
        if (field.field === 'flow_manager_order') {
          isOrderFieldConfigured = true;
        } else if (field.field === 'flow_manager_category') {
          isCategoryFieldConfigured = true;
        } else if (field.field === 'flow_manager_last_run_at') {
          isLastRunFieldConfigured = true;
        } else if (field.field === 'flow_manager_run_counter') {
          isRunCounterFieldConfigured = true;
        }
      }

      const isConfigured =
        isOrderFieldConfigured &&
        isCategoryFieldConfigured &&
        isLastRunFieldConfigured &&
        isRunCounterFieldConfigured;

      return {
        isConfigured,
        isOrderFieldConfigured,
        isCategoryFieldConfigured,
        isLastRunFieldConfigured,
        isRunCounterFieldConfigured,
      };
    });
    const isSettingFieldConfigured = computed(() => {
      let isFieldConfigured = false;
      for (const field of settingFields.value) {
        if (field.field === 'flow_manager_categories') {
          isFieldConfigured = true;
        }
      }

      return isFieldConfigured;
    });

    const collectionMap: Record<string, AppCollection> = allCollections.reduce(
      (acc: Record<string, AppCollection>, collection: AppCollection) => {
        acc[collection.collection] = collection;
        return acc;
      },
      {},
    );

    const {
      isTabularFlowLoading,
      tabularFlows,
      selectedShortcutFilter,
      flowIdMap,
      folderMap,
      flowChildMap,
      tableSort,
      tableFlowFilter,
      tableFlowSearch,
      viewListMode,
      processedFlows,
      headers,
      tablePage,
      tableLimit,
      reloadTabularFlow,
      reloadExternalPreset,
      onTableSortChange,
      setStatusFilter,
      setTriggerFilter,
      setCategoryFilter,
      getCategoryName,
      getCategoryIcon,
    } = useFlowQuery({
      api,
      presetsStore,
      flows,
      flowCategories,
      credentials,
      selectedCredential,
      currentUser,
      initialPreset: presetsStore.getPresetForCollection('flow-manager'),
    });

    const {
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
    } = useFlowActions({
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
      processingDialogState: {
        dialog: processingDialog,
        title: processingDialogTitle,
        list: listProcessing,
        progress: progressValue,
        indeterminate: indeterminateProcess,
      },
    });

    const {
      restoredFile,
      restoredFileObj,
      restoreConfirmationDialog,
      flowDuplicatedName,
      isPreviousIdPersisted,
      errors,
      onRestoredFileChanged,
      onRestoreButtonClicked,
      onConfirmRestore,
    } = useFlowRestore({
      collectionMap,
      createFlow,
      reloadFlow,
      reloadTabularFlow,
      notificationsStore,
      processingDialogState: {
        dialog: processingDialog,
        title: processingDialogTitle,
        list: listProcessing,
        progress: progressValue,
        indeterminate: indeterminateProcess,
      },
    });

    const usedCategoryList = computed(() => {
      const categories: Partial<IFolder>[] = [];

      const categoryKeys = Object.keys(flowChildMap.value);

      for (let i = 0; i < categoryKeys.length; i++) {
        const category = categoryKeys[i] || '';
        const isChildreensIsFlow = flowChildMap.value[category]?.some(
          (item) => (item as IFolder).type !== 'category',
        );
        if (isChildreensIsFlow) {
          const categoryData = folderMap.value[category] || flowIdMap.value[category];
          categories.push({
            id: category,
            name: categoryData?.name || category,
            icon: categoryData?.icon || 'folder',
            color: categoryData?.color || '',
          });
        }
      }

      return categories.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    });

    const rootFlows = computed<Partial<IFlow & IFolder>[]>(() => {
      if (!flowFieldConfiguration.value.isConfigured || !isSettingFieldConfigured.value) {
        return [...flows.value];
      }

      return [
        ...flowCategories.value.filter(
          (category: IFolder) =>
            !category.flow_manager_metadata_id?.flow_manager_category ||
            (!folderMap.value[category.flow_manager_metadata_id?.flow_manager_category] &&
              !flowIdMap.value[category.flow_manager_metadata_id?.flow_manager_category]),
        ),
        ...flows.value.filter(
          (flow: IFlow) =>
            !flow.flow_manager_metadata_id?.flow_manager_category ||
            (!folderMap.value[flow.flow_manager_metadata_id?.flow_manager_category] &&
              !flowIdMap.value[flow.flow_manager_metadata_id?.flow_manager_category]),
        ),
      ].sort(
        (a, b) =>
          (a.flow_manager_metadata_id?.flow_manager_order || 0) -
          (b.flow_manager_metadata_id?.flow_manager_order || 0),
      );
    });

    const currentFlows = computed<Partial<IFlow & IFolder>[]>(() => {
      if (parentId.value) {
        const childFlows = flowChildMap.value[parentId.value] || [];
        return childFlows.sort(
          (a, b) =>
            (a.flow_manager_metadata_id?.flow_manager_order as number) -
            (b.flow_manager_metadata_id?.flow_manager_order as number),
        );
      }

      return [];
    });

    const allFlows = computed(() => {
      if (!flowFieldConfiguration.value.isConfigured || !isSettingFieldConfigured.value) {
        return [...flows.value] as IFlow[];
      }

      return [...flowCategories.value, ...flows.value] as IFlow[] | IFolder[];
    });

    const {
      notCreatedFields,
      differentFields,
      notCreatedCollections,
      isConfigurationLoading,
      isSyncingFlowCountersLoading,
      isDatabaseUpdated,
      ensureDatabase,
      configureFlowManagerDatabase,
      syncFlowCounters,
    } = useFlowDatabase({
      api,
      fieldsStore,
      collectionsStore,
      relationsStore,
      settingsStore,
      notificationsStore,
      credentials,
      selectedCredential,
      flows,
      flowFields,
      settingFields,
      flowCategories,
      settingDialog,
      reloadFlow,
      reloadTabularFlow,
      reloadFields,
      reloadFolders,
    });

    function goToFlow({ item }: { item: IFlow }) {
      if (selectedCredential.value === 'local') {
        router.push(`/settings/flows/${item.id}`);
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (credential) {
          const a = document.createElement('a');
          a.href = `${credential.url}/admin/settings/flows/${item.id}`;
          a.target = '_blank';
          a.click();
          document.body.removeChild(a);
        }
      }
    }

    async function onSort(updates: (IFlow & IFolder)[], group: string | null = null) {
      const flowPayload: {
        id: string;
        flow_manager_metadata_id: {
          id?: string;
          flow_manager_category: string | null;
          flow_manager_order: number;
        };
      }[] = [];

      const destination = group || parentId.value;

      for (let i = 0; i < updates.length; i++) {
        const item = updates[i];
        if (item?.type !== 'category') {
          flowPayload.push({
            id: item?.id as string,
            flow_manager_metadata_id: {
              id: item?.flow_manager_metadata_id?.id,
              flow_manager_category: destination,
              flow_manager_order: i + 1,
            },
          });
        } else {
          patchCategory({
            id: item?.id as string,
            name: item?.name as string,
            type: 'category',
            icon: item?.icon || 'folder',
            color: item?.color as string,
            flow_manager_metadata_id: {
              flow_manager_order: i + 1,
              flow_manager_category: destination as unknown as string,
            },
          });
        }
      }

      saveCategories();

      if (flowPayload.length) {
        if (selectedCredential.value === 'local') {
          await api.patch(`/flows`, flowPayload);
        } else {
          const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential?.url}/flows`,
            staticToken: credential?.staticToken,
            method: 'PATCH',
            payload: flowPayload,
          });
        }
        await reloadFlow();
      }
    }

    function selectItem(item: IFlow | IFolder) {
      selectedItem.value = item;
    }

    async function reloadFlow() {
      flows.value = [];
      const fields = ['*', 'operations.*', 'flow_manager_metadata_id.*'];
      const queries = [`fields=${fields.join(',')}`, 'limit=-1'];
      if (selectedCredential.value === 'local') {
        const {
          data: { data: flowsResponse },
        } = await api.get(`/flows?${queries.join('&')}`);

        flows.value = flowsResponse;
      } else {
        try {
          const c = credentials.value.find((c) => c.id === selectedCredential.value);
          if (c) {
            const {
              data: { data: flowsResponse },
            } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${c.url}/flows?${queries.join('&')}`,
              staticToken: c.staticToken,
              method: 'GET',
            });

            flows.value = flowsResponse;
          }
        } catch (err: unknown) {
          const errorMsg = formatConnectionError(err, 'Please check your credentials.');
          notificationsStore.add({
            type: 'error',
            title: `Failed to fetch Flows: ${errorMsg}`,
            text: errorMsg,
            closeable: true,
            persist: true,
          });
        }
      }

      if (selectedItem.value?.id) {
        const updatedItem = flows.value.find((flow) => flow.id === selectedItem.value?.id);
        if (updatedItem) {
          selectedItem.value = updatedItem;
        } else {
          selectedItem.value = {
            id: '',
            name: '',
            icon: '',
            color: '',
            description: '',
            trigger: '',
            options: {
              collections: [],
            },
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
      }
    }

    function selectItemKey(itemKey: string, isSelected: boolean) {
      if (!isSelected) {
        selectedItems.value = selectedItems.value.filter((key) => key !== itemKey);
      } else {
        selectedItems.value.push(itemKey);
      }
    }

    function selectAll() {
      if (isSelectAll.value) {
        if (viewListMode.value) {
          if (parentId.value) {
            selectedItems.value = processedFlows.value
              .filter(
                (flow: IFlow) =>
                  flow.flow_manager_metadata_id?.flow_manager_category === parentId.value,
              )
              .map((flow: IFlow) => flow.id);
          } else {
            selectedItems.value = processedFlows.value.map((flow: IFlow) => flow.id);
          }
        } else {
          selectedItems.value = tabularFlows.value.map((flow: IFlow) => flow.id);
        }
      } else {
        selectedItems.value = [];
      }
    }

    async function setCredential(credential: string) {
      if (credential === selectedCredential.value) {
        return;
      }

      const oldCredential = selectedCredential.value;

      if (credential === 'local') {
        indeterminateProcess.value = true;
        processingDialogTitle.value = 'Switching to Local Directus...';
        processingDialog.value = true;
        selectedCredential.value = 'local';
        try {
          await getServerInfo();
          await ensureDatabase();
          router.push('/flow-manager');
          await reloadExternalPreset();
          await reloadFlow();
          await reloadTabularFlow();
          flowFields.value = (await reloadFields('directus_flows')) as Field[];
          settingFields.value = (await reloadFields('directus_settings')) as Field[];
          const folders = await reloadFolders();
          flowCategories.value = folders;
        } catch (err: unknown) {
          const errorMsg = formatConnectionError(err, 'Failed to switch to local instance.');
          notificationsStore.add({
            type: 'error',
            title: `Error switching to Local: ${errorMsg}`,
            text: errorMsg,
            closeable: true,
            persist: true,
          });
        } finally {
          processingDialog.value = false;
          indeterminateProcess.value = false;
          processingDialogTitle.value = '';
        }
        return;
      }

      const targetCred = credentials.value.find((c) => c.id === credential);
      if (!targetCred) {
        notificationsStore.add({
          type: 'error',
          title: 'Selected credential was not found',
          closeable: true,
          persist: true,
        });
        selectedCredential.value = '';
        await nextTick();
        selectedCredential.value = oldCredential;
        return;
      }

      indeterminateProcess.value = true;
      processingDialogTitle.value = `Connecting to ${targetCred.name}...`;
      processingDialog.value = true;

      // 1. Verify connection and admin permissions on target instance BEFORE changing active state
      const checkResult = await checkCredentialConnection(targetCred);
      if (!checkResult.success) {
        const errorDetails = checkResult.error || 'Failed to connect to the remote instance.';
        notificationsStore.add({
          type: 'error',
          title: `Failed to connect to "${targetCred.name}": ${errorDetails}`,
          text: errorDetails,
          closeable: true,
          persist: true,
        });

        // Revert selectedCredential and ensure Vue reactivity syncs the dropdown back to oldCredential
        selectedCredential.value = '';
        await nextTick();
        selectedCredential.value = oldCredential;

        processingDialog.value = false;
        indeterminateProcess.value = false;
        processingDialogTitle.value = '';
        return;
      }

      // 2. Connection verified and user has admin permissions! Safely switch active state
      selectedCredential.value = credential;
      currentUser.value = checkResult.user || null;
      serverInfo.value = checkResult.serverInfo;

      try {
        processingDialogTitle.value = `Loading flows from ${targetCred.name}...`;
        router.push('/flow-manager');
        await reloadExternalPreset();
        await reloadFlow();
        await reloadTabularFlow();
        flowFields.value = (await reloadFields('directus_flows')) as Field[];
        settingFields.value = (await reloadFields('directus_settings')) as Field[];
        const folders = await reloadFolders();
        flowCategories.value = folders;
        await ensureDatabase();
      } catch (err: unknown) {
        const errorMsg = formatConnectionError(
          err,
          'Failed to load flows from the remote instance.',
        );
        notificationsStore.add({
          type: 'error',
          title: `Error loading flows from "${targetCred.name}": ${errorMsg}`,
          text: errorMsg,
          closeable: true,
          persist: true,
        });

        // Restore old credential state
        selectedCredential.value = oldCredential;
        await getServerInfo();
        await reloadFlow();
        await reloadTabularFlow();
        await ensureDatabase();
      } finally {
        processingDialog.value = false;
        indeterminateProcess.value = false;
        processingDialogTitle.value = '';
      }
    }

    function getOperationNameById(id: string) {
      if (!id) return undefined;
      const { operations } = selectedItem.value as IFlow;
      return operations?.find((o) => o.id === id);
    }

    function openDashboardDetail(flowId: string) {
      router.push(`/flow-manager/dashboard/${flowId}`);
    }

    // call this method on loaded
    reloadFlow();
    reloadTabularFlow();
    getLatestVersion();

    provide('flowManagerUtils', {
      duplicate,
      backup,
      pushToCloud,
      showPushToCloud,
      onSort,
      showDeleteItemDialog,
      duplicateFolder,
      showEditFolderDialog,
      selectItem,
      selectItemKey,
      parentId,
      showRunDialog,
      createFlow,
      reloadFlow,
      reloadTabularFlow,
      showRunWebhookDialog,
      credentials,
      setCredential,
      selectedCredential,
    });

    onMounted(() => {
      if (!flowFieldConfiguration.value.isConfigured || !isSettingFieldConfigured.value) {
        settingDialog.value = true;
      }
      getServerInfo();
      ensureDatabase();
    });

    return {
      headers,
      flows,
      restoredFile,
      restoreConfirmationDialog,
      errors,
      duplicate,
      backup,
      onRestoredFileChanged,
      onRestoreButtonClicked,
      goToFlow,
      onConfirmRestore,
      flowDuplicatedName,
      isPreviousIdPersisted,
      restoredFileObj,
      currentFlows,
      rootFlows,
      onSort,
      settingDialog,
      isSettingFieldConfigured,
      flowFieldConfiguration,
      configureFlowManagerDatabase,
      isConfigurationLoading,
      folderHeaders,
      flowCategories,
      saveCategory,
      deleteCategory,
      credentialDialog,
      credentials,
      pushToCloudDialog,
      selectedCredentialId,
      maskingText,
      pushToCloud,
      loadingPushToCloud,
      flowChildMap,
      title,
      allFlows,
      deleteItemDialog,
      selectedItem,
      loadingDeleteItem,
      deleteItem,
      selectCategoryForEdit,
      isEditCategory,
      selectedCategory,
      cancelEditCategory,
      iconName,
      formatDate,
      formatDateLong,
      onTableSortChange,
      tableSort,
      processedFlows,
      getCategoryName,
      viewListMode,
      showDeleteItemDialog,
      showPushToCloud,
      runFlowDialog,
      loadingRunFlow,
      collectionMap,
      layoutWrapper,
      tabularFlows,
      isTabularFlowLoading,
      tableFlowFilter,
      tableFlowSearch,
      tablePage,
      tableLimit,
      getCategoryIcon,
      setStatusFilter,
      TRIGGER_TYPES,
      setTriggerFilter,
      selectedShortcutFilter,
      usedCategoryList,
      setCategoryFilter,
      installedVersion,
      latestVersion,
      reloadFlow,
      reloadTabularFlow,
      showSelect,
      selectedItems,
      isSelectAll,
      selectAll,
      processingDialog,
      duplicateSelectedItems,
      listProcessing,
      progressValue,
      backupSelectedItems,
      processingDialogTitle,
      deleteSelectedItems,
      isBatchAction,
      selectedFlows,
      showRunDialog,
      runWebhookFlowDialog,
      selectedCredential,
      indeterminateProcess,
      changeFlowStatus,
      selectedFlowsActive,
      selectedFlowsInactive,
      serverInfo,
      getOperationNameById,
      notCreatedFields,
      differentFields,
      syncFlowCounters,
      isSyncingFlowCountersLoading,
      openDashboardDetail,
      isDatabaseUpdated,
      notCreatedCollections,
    };
  },
});
</script>

<style lang="scss" scoped>
.input-form {
  margin-bottom: 7px;
  margin-top: 7px;
}

.ml-2 {
  margin-left: 10px;
}

.bold-text {
  font-weight: bold;
}

.mt-2 {
  margin-top: 10px;
}

.mb-2 {
  margin-bottom: 10px;
}

.header-icon {
  --v-button-color-disabled: var(--theme--foreground);
}

.layout-tabular {
  display: contents;
  margin: var(--content-padding);
  margin-bottom: var(--content-padding-bottom);
}

.v-table {
  --v-table-sticky-offset-top: var(--layout-offset-top);

  display: contents;

  & > :deep(table) {
    min-width: calc(100% - var(--content-padding)) !important;
    margin-left: var(--content-padding);

    tr {
      margin-right: var(--content-padding);
    }
  }
}

.item-name {
  flex-shrink: 0;
  margin-left: 10px;
}

.text-gray {
  color: var(--foreground-subdued, var(--theme--foreground-subdued, gray));
}

.trigger-chip {
  --v-chip-color: white;
  --v-chip-background-color: var(--theme--primary, var(--primary));
}

.secondary-chip {
  --v-chip-color: white;
  --v-chip-background-color: var(--theme--secondary, var(--secondary));
}

.trigger-chip-inactive {
  --v-chip-color: white;
  --v-chip-background-color: gray;
}

.flip {
  transform: scaleY(-1);
}

.overflow-x-scroll {
  overflow-x: scroll;
}

.flex-end {
  display: flex;
  justify-content: flex-end;
}

.flex-column {
  display: flex;
  flex-direction: column;
}

.flex-center {
  display: flex;
  justify-content: center;
  align-items: center;
}

.selectable {
  user-select: text;
  cursor: pointer;
}

.mr-1 {
  margin-right: 5px;
}

.top-bar-panel {
  display: flex;
  gap: 10px;
}

.table-mode {
  margin-left: 40px;
}

.list-view-mode {
  margin-left: 10px;
}

.align-content-center {
  align-content: center;
}
</style>

<style lang="scss" scoped>
.main-table > .v-table > table > .table-header > tr > .select.cell[scope='col'] > button {
  display: none;
}

.container.right {
  z-index: 600;
}

.small.v-select > .v-menu-activator > .v-input {
  height: 38px;
}

.sidebar-text {
  overflow-x: hidden;
  text-wrap: wrap;
}

.not-configured-notes {
  width: 700px;
  height: 261px;
  row-gap: 21px;
  display: flex;
  flex-direction: column;
}

.flex {
  display: flex;
}

.justify-center {
  justify-content: center;
}

.h-full {
  height: 100%;
}

.items-center {
  align-items: center;
}

.error {
  max-block-size: 50vh;
  padding: 6px 12px;
  overflow: auto;
  color: var(--theme--danger);
  font-family:
    var(--theme--fonts--monospace--font-family) 'Fira Mono',
    monospace;
  background-color: var(--danger-alt);
  border-radius: var(--theme--border-radius);
}

code {
  color: coral;
}
</style>

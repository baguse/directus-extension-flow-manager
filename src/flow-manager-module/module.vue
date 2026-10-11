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
        @export-git-selected="exportGitSelected"
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
        @open-version-dialog="openVersionDialog"
        @open-git-export-dialog="openGitExportDialog"
        @edit-flow="showEditFlowDialog"
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
      <div class="not-configured-notes">
        <v-notice type="warning" class="not-configured-notice">
          <div class="notice-title">Configuration Required</div>
          <div class="notice-desc">
            Flow Manager database collections and fields need to be configured before you can use
            it.
          </div>
          <div class="notice-steps">
            <div>Please follow these steps:</div>
            <ol>
              <li>
                Click the <strong>Open Settings</strong> button below (or select
                <strong>Settings</strong> from the <strong>Options</strong> menu
                <v-icon name="more_vert" class="inline-icon" /> in the header).
              </li>
              <li>Click <strong>Configure</strong>.</li>
              <li>
                Flow Manager will automatically configure the required collections and fields for
                you.
              </li>
              <li>Once the configuration is complete, you can start using Flow Manager.</li>
            </ol>
          </div>
          <div class="notice-action">
            <v-button @click="settingDialog = true">
              <v-icon name="settings" left />
              Open Settings
            </v-button>
          </div>
        </v-notice>
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
    <template #actions>
      <search-input
        v-if="isDatabaseUpdated && !viewListMode"
        v-model="tableFlowSearch"
        v-model:filter="tableFlowFilter"
        :collection="'directus_flows'"
      />

      <v-button
        v-if="isDatabaseUpdated"
        v-tooltip.bottom="viewListMode ? 'Switch to Table View' : 'Switch to List View'"
        rounded
        icon
        secondary
        @click="viewListMode = !viewListMode"
      >
        <v-icon :name="viewListMode ? 'table_rows' : 'view_list'" />
      </v-button>

      <v-menu placement="bottom-end" show-arrow :close-on-content-click="true">
        <template #activator="{ toggle, active }">
          <v-button
            v-tooltip.bottom="'Options'"
            rounded
            icon
            secondary
            :active="active"
            @click="toggle"
          >
            <v-icon name="more_vert" />
          </v-button>
        </template>

        <v-list>
          <v-list-item clickable :disabled="isReloading" @click="reload">
            <v-list-item-icon>
              <v-icon :name="isReloading ? 'sync' : 'refresh'" />
            </v-list-item-icon>
            <v-list-item-content>{{ isReloading ? 'Reloading...' : 'Reload' }}</v-list-item-content>
          </v-list-item>

          <v-list-item clickable @click="settingDialog = true">
            <v-list-item-icon>
              <v-icon name="settings" />
            </v-list-item-icon>
            <v-list-item-content>Settings</v-list-item-content>
          </v-list-item>

          <v-list-item clickable @click="credentialDialog = true">
            <v-list-item-icon>
              <v-icon name="database" />
            </v-list-item-icon>
            <v-list-item-content>Credentials</v-list-item-content>
          </v-list-item>

          <v-list-item v-if="isDatabaseUpdated" clickable @click="onRestoreButtonClicked">
            <v-list-item-icon>
              <v-icon name="file_upload" />
            </v-list-item-icon>
            <v-list-item-content>Restore</v-list-item-content>
          </v-list-item>

          <v-list-item v-if="isDatabaseUpdated" clickable @click="exportAllGit">
            <v-list-item-icon>
              <v-icon name="terminal" />
            </v-list-item-icon>
            <v-list-item-content>Export All for Git</v-list-item-content>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <template #sidebar>
      <FlowSidebarDetail
        :selected-item="selectedItem"
        :format-date-long="formatDateLong"
        :get-operation-name-by-id="getOperationNameById"
        @open-version-dialog="openVersionDialog"
        @open-git-export-dialog="openGitExportDialog"
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
      :vault-status="vaultStatus"
      :is-vault-loading="isVaultOperationLoading"
      :vault-error="vaultErrorMessage"
      :legacy-credentials="legacyCredentials"
      :on-unlock-vault="unlockVault"
      :on-setup-vault="setupVault"
      :on-change-vault-pin="changeVaultPin"
      :on-lock-vault="lockVault"
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

    <UndoToast
      :key="pendingDelete?.id"
      :active="!!pendingDelete"
      :message="pendingDelete?.message || ''"
      :duration="pendingDelete?.duration || 5000"
      @undo="undoDelete"
      @commit="commitPermanentDelete"
      @pause="pauseDeleteTimer"
      @resume="resumeDeleteTimer"
    />

    <FlowVersionDialog
      :value="versionDialog"
      :flow="selectedFlowForVersion"
      :all-flows="flows"
      :categories-map="categoriesMap"
      :selected-credential="selectedCredential"
      :credentials="credentials"
      @update:model-value="versionDialog = $event"
      @flow-restored="onFlowRestoredFromSnapshot"
    />

    <FlowGitExportModal
      :value="gitExportDialog"
      :flow="selectedFlowForVersion"
      :flows="flowsToExportForGit"
      :categories-map="categoriesMap"
      @update:model-value="gitExportDialog = $event"
    />

    <FlowEditDialog
      :value="editFlowDialog"
      :flow="flowToEdit"
      :loading="isSavingFlow"
      @update:model-value="editFlowDialog = $event"
      @save="onSaveFlow"
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
  watch,
} from 'vue';
import { useStores, useApi, useLayout } from '@directus/extensions-sdk';
import { useRoute, useRouter } from 'vue-router';
import type { AppCollection, Field } from '@directus/types';

import type { FlowsStore, IFlow, IFolder, ProcessingItem } from '../types';
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
import UndoToast from './components/undo-toast.vue';
import FlowVersionDialog from './components/flow-version-dialog.vue';
import FlowGitExportModal from './components/flow-git-export-modal.vue';
import FlowEditDialog from './components/flow-edit-dialog.vue';
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
    UndoToast,
    FlowVersionDialog,
    FlowGitExportModal,
    FlowEditDialog,
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
      useFlowsStore,
    } = useStores();
    const notificationsStore = useNotificationsStore();
    const collectionsStore = useCollectionsStore();
    const relationsStore = useRelationsStore();
    const flowsStore: FlowsStore = useFlowsStore();
    const api = useApi();
    const route = useRoute();
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
    const metadataFields: Ref<Field[]> = ref(
      fieldsStore.getFieldsForCollection('flow_manager_metadata'),
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
      vaultStatus,
      isVaultOperationLoading,
      vaultErrorMessage,
      legacyCredentials,
      unlockVault,
      setupVault,
      changeVaultPin,
      lockVault,
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

      for (const field of metadataFields.value) {
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

      const hasMetadataRelation = flowFields.value.some(
        (field) => field.field === 'flow_manager_metadata_id',
      );

      const isConfigured =
        isDatabaseUpdated.value ||
        (hasMetadataRelation &&
          isOrderFieldConfigured &&
          isCategoryFieldConfigured &&
          isLastRunFieldConfigured &&
          isRunCounterFieldConfigured);

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
      saveCategories,
      reloadFlow,
      reloadTabularFlow,
      flows,
      flowCategories,
      tabularFlows,
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
      hydrateLocalFlow,
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

    const rootFlows = computed<(IFlow | IFolder)[]>(() => {
      if (!flowFieldConfiguration.value.isConfigured || !isSettingFieldConfigured.value) {
        return [...flows.value];
      }

      return [
        ...flowCategories.value.filter((category: IFolder) => {
          const cat = category.flow_manager_metadata_id?.flow_manager_category;
          return !cat || (!folderMap.value[cat] && !flowIdMap.value[cat]);
        }),
        ...flows.value.filter((flow: IFlow) => {
          const cat = flow.flow_manager_metadata_id?.flow_manager_category;
          return !cat || (!folderMap.value[cat] && !flowIdMap.value[cat]);
        }),
      ].sort(
        (a, b) =>
          (a.flow_manager_metadata_id?.flow_manager_order || 0) -
          (b.flow_manager_metadata_id?.flow_manager_order || 0),
      );
    });

    const currentFlows = computed<(IFlow | IFolder)[]>(() => {
      if (parentId.value) {
        const childFlows = flowChildMap.value[parentId.value] || [];
        return [...childFlows].sort(
          (a, b) =>
            (a.flow_manager_metadata_id?.flow_manager_order || 0) -
            (b.flow_manager_metadata_id?.flow_manager_order || 0),
        );
      }

      return [];
    });

    const allFlows = computed<(IFlow | IFolder)[]>(() => {
      if (!flowFieldConfiguration.value.isConfigured || !isSettingFieldConfigured.value) {
        return [...flows.value];
      }

      return [...flowCategories.value, ...flows.value];
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
      metadataFields,
      flowCategories,
      settingDialog,
      reloadFlow,
      reloadTabularFlow,
      reloadFields,
      reloadFolders,
    });

    async function goToFlow({ item }: { item: IFlow }) {
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

      const destination = group || parentId.value ? String(group || parentId.value) : null;

      for (let i = 0; i < updates.length; i++) {
        const item = updates[i]!;
        if (item.type !== 'category') {
          const metadataId =
            typeof item?.flow_manager_metadata_id === 'object' &&
            item?.flow_manager_metadata_id !== null
              ? (item.flow_manager_metadata_id as { id?: string }).id
              : typeof item?.flow_manager_metadata_id === 'string'
                ? item.flow_manager_metadata_id
                : undefined;

          const metaPayload: {
            id?: string;
            flow_manager_category: string | null;
            flow_manager_order: number;
          } = {
            flow_manager_category: destination,
            flow_manager_order: i + 1,
          };

          if (metadataId) {
            metaPayload.id = metadataId;
          }

          const flowObj = {
            id: item?.id as string,
            flow_manager_metadata_id: metaPayload,
          };

          flowPayload.push(flowObj);

          // Optimistically update existing flow in local state
          const targetFlow = flows.value.find((f) => f.id === item.id);
          if (targetFlow) {
            if (
              !targetFlow.flow_manager_metadata_id ||
              typeof targetFlow.flow_manager_metadata_id !== 'object'
            ) {
              targetFlow.flow_manager_metadata_id = {
                id: metadataId,
                flow_manager_category: destination || undefined,
                flow_manager_order: i + 1,
              };
            } else {
              targetFlow.flow_manager_metadata_id.flow_manager_category = destination || undefined;
              targetFlow.flow_manager_metadata_id.flow_manager_order = i + 1;
            }
          }
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

      try {
        await saveCategories();

        if (flowPayload.length) {
          if (selectedCredential.value === 'local') {
            await api.patch(`/flows`, flowPayload);
          } else {
            const credential = credentials.value.find(
              (cred) => cred.id === selectedCredential.value,
            );
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/flows`,
              staticToken: credential?.staticToken,
              method: 'PATCH',
              payload: flowPayload,
            });
          }
          await reloadFlow();
        }
      } catch (err: unknown) {
        console.error('[FLOW MANAGER] Failed to update flow order:', err);
        const errorMsg = formatConnectionError(err, 'Failed to update flow order.');
        notificationsStore.add({
          type: 'error',
          title: 'Sort Failed',
          text: errorMsg,
          closeable: true,
        });
        await reloadFlow();
      }
    }

    function selectItem(item: IFlow | IFolder) {
      selectedItem.value = item;
    }

    async function reloadFlow() {
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
          metadataFields.value = (await reloadFields('flow_manager_metadata')) as Field[];
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

      // Verify connection and admin permissions on target instance BEFORE changing active state
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

      // Connection verified and user has admin permissions! Safely switch active state
      selectedCredential.value = credential;
      currentUser.value = checkResult.user || null;
      serverInfo.value = checkResult.serverInfo;

      try {
        processingDialogTitle.value = `Loading flows from ${targetCred.name}...`;
        if (credential !== 'local') {
          router.push({ path: '/flow-manager', query: { credential } });
        } else {
          router.push('/flow-manager');
        }
        await reloadExternalPreset();
        await reloadFlow();
        await reloadTabularFlow();
        flowFields.value = (await reloadFields('directus_flows')) as Field[];
        settingFields.value = (await reloadFields('directus_settings')) as Field[];
        metadataFields.value = (await reloadFields('flow_manager_metadata')) as Field[];
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
      if (selectedCredential.value && selectedCredential.value !== 'local') {
        router.push({
          path: `/flow-manager/dashboard/${flowId}`,
          query: { credential: selectedCredential.value },
        });
      } else {
        router.push(`/flow-manager/dashboard/${flowId}`);
      }
    }

    const versionDialog = ref(false);
    const gitExportDialog = ref(false);
    const selectedFlowForVersion = ref<IFlow | null>(null);
    const flowsToExportForGit = ref<IFlow[]>([]);

    const categoriesMap = computed(() => {
      const map = new Map<string, string>();
      for (const cat of flowCategories.value || []) {
        if (cat.id && cat.name) {
          map.set(cat.id, cat.name);
        }
      }
      return map;
    });

    function openVersionDialog(flow: IFlow) {
      selectedFlowForVersion.value = flow;
      versionDialog.value = true;
    }

    function openGitExportDialog(flow?: IFlow) {
      selectedFlowForVersion.value = flow || null;
      flowsToExportForGit.value = flows.value;
      gitExportDialog.value = true;
    }

    function exportGitSelected() {
      selectedFlowForVersion.value = null;
      flowsToExportForGit.value = flows.value.filter((f) => selectedItems.value.includes(f.id));
      gitExportDialog.value = true;
    }

    function exportAllGit() {
      selectedFlowForVersion.value = null;
      flowsToExportForGit.value = flows.value;
      gitExportDialog.value = true;
    }

    async function onFlowRestoredFromSnapshot(flowId?: string) {
      await reloadFlow();
      await reloadTabularFlow();
      if (flowId) {
        const fresh = flows.value.find((f) => f.id === flowId);
        if (fresh) {
          selectedFlowForVersion.value = fresh;
        }
      }
      notificationsStore.add({
        type: 'success',
        title: 'Flow Reverted',
        text: 'Successfully rolled back flow to snapshot state.',
      });
    }

    async function hydrateLocalFlow() {
      if (selectedCredential.value === 'local') {
        try {
          await flowsStore.hydrate();
        } catch {
          // ignore store hydration errors
        }
      }
    }

    const isReloading = ref(false);

    async function reload() {
      if (isReloading.value) return;
      isReloading.value = true;
      try {
        await reloadExternalPreset?.();
        await reloadFlow();
        await reloadTabularFlow();
        const folders = await reloadFolders?.();
        if (folders) {
          flowCategories.value = folders;
        }
        await hydrateLocalFlow();
        notificationsStore.add({
          type: 'success',
          title: 'Reloaded',
          text: 'Flows and categories reloaded successfully.',
        });
      } catch (err: unknown) {
        const errorMsg = formatConnectionError(err, 'Failed to reload flows.');
        notificationsStore.add({
          type: 'error',
          title: 'Reload Failed',
          text: errorMsg,
          closeable: true,
        });
      } finally {
        isReloading.value = false;
      }
    }

    watch(
      () => route.query.credential,
      (queryCred) => {
        const credId = (queryCred as string) || 'local';
        if (credId !== selectedCredential.value) {
          setCredential(credId);
        }
      },
    );

    watch([credentials, vaultStatus], () => {
      const queryCred = route.query.credential as string | undefined;
      if (queryCred && queryCred !== 'local' && selectedCredential.value !== queryCred) {
        const match = credentials.value.find((c) => c.id === queryCred);
        if (match) {
          setCredential(queryCred);
        }
      }
    });

    const editFlowDialog = ref(false);
    const flowToEdit = ref<IFlow | null>(null);
    const isSavingFlow = ref(false);

    function showEditFlowDialog(item: IFlow) {
      flowToEdit.value = item;
      editFlowDialog.value = true;
    }

    async function onSaveFlow(flowData: {
      id: string;
      name: string;
      status: string;
      description: string | null;
      icon: string | null;
      color: string | null;
    }) {
      isSavingFlow.value = true;
      try {
        const payload = {
          name: flowData.name,
          status: flowData.status,
          description: flowData.description,
          icon: flowData.icon,
          color:
            flowData.color &&
            flowData.color !== 'var(--theme--primary)' &&
            flowData.color !== 'var(--theme-primary)'
              ? flowData.color
              : null,
        };

        if (selectedCredential.value === 'local') {
          await api.patch(`/flows/${flowData.id}`, payload);
        } else {
          const cred = credentials.value.find((c) => c.id === selectedCredential.value);
          if (!cred) throw new Error('Remote credential not found');
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${cred.url}/flows/${flowData.id}`,
            staticToken: cred.staticToken,
            method: 'PATCH',
            payload,
          });
        }

        // Optimistically update existing flow in local state
        const targetFlow = flows.value.find((f) => f.id === flowData.id);
        if (targetFlow) {
          Object.assign(targetFlow, payload);
        }
        const targetTabular = tabularFlows.value.find((f) => f.id === flowData.id);
        if (targetTabular) {
          Object.assign(targetTabular, payload);
        }
        if (selectedItem.value && selectedItem.value.id === flowData.id) {
          Object.assign(selectedItem.value, payload);
        }

        await reloadFlow();
        await reloadTabularFlow();

        notificationsStore.add({
          type: 'success',
          title: 'Flow Updated',
          text: `Flow "${flowData.name}" has been updated successfully.`,
          closeable: true,
        });

        editFlowDialog.value = false;
        flowToEdit.value = null;
      } catch (err: unknown) {
        console.error('[FLOW MANAGER] Failed to update flow:', err);
        const errorMsg = formatConnectionError(err, 'Failed to update flow.');
        notificationsStore.add({
          type: 'error',
          title: 'Update Failed',
          text: errorMsg,
          closeable: true,
        });
      } finally {
        isSavingFlow.value = false;
      }
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
      showEditFlowDialog,
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
      openVersionDialog,
      openGitExportDialog,
      goToFlow,
      hydrateLocalFlow,
      reload,
    });

    onMounted(async () => {
      getServerInfo();
      await ensureDatabase();
      if (!flowFieldConfiguration.value.isConfigured || !isSettingFieldConfigured.value) {
        settingDialog.value = true;
      }
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
      vaultStatus,
      isVaultOperationLoading,
      vaultErrorMessage,
      legacyCredentials,
      unlockVault,
      setupVault,
      changeVaultPin,
      lockVault,
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
      pendingDelete,
      undoDelete,
      commitPermanentDelete,
      pauseDeleteTimer,
      resumeDeleteTimer,
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
      versionDialog,
      gitExportDialog,
      selectedFlowForVersion,
      flowsToExportForGit,
      categoriesMap,
      openVersionDialog,
      openGitExportDialog,
      exportGitSelected,
      exportAllGit,
      onFlowRestoredFromSnapshot,
      reload,
      isReloading,
      editFlowDialog,
      flowToEdit,
      isSavingFlow,
      showEditFlowDialog,
      onSaveFlow,
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
</style>

<style lang="scss" scoped>
:deep(.actions) {
  align-items: center;
}

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
  width: 100%;
  max-width: 680px;
  padding: 1rem;
}

.not-configured-notice {
  padding: 1.5rem;
}

.notice-title {
  font-size: 1.125rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.notice-desc {
  margin-bottom: 1rem;
  line-height: 1.5;
}

.notice-steps {
  margin-bottom: 1.25rem;
  line-height: 1.6;

  ol {
    margin-top: 0.5rem;
    padding-left: 1.25rem;

    li {
      margin-bottom: 0.375rem;
    }
  }
}

.inline-icon {
  vertical-align: middle;
  display: inline-flex;
}

.notice-action {
  margin-top: 1rem;
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

code {
  color: coral;
}
</style>

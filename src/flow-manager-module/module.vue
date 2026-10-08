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
      <div
        :class="{
          'top-bar-panel': true,
          'table-mode': !viewListMode,
          'list-view-mode': viewListMode,
        }"
      >
        <v-checkbox v-model="showSelect">Show Select</v-checkbox>
        <v-checkbox v-if="showSelect" v-model="isSelectAll" @update:model-value="selectAll()"
          >Select All</v-checkbox
        >
        <v-button
          v-if="showSelect"
          v-tooltip.bottom="'Activate Selected'"
          icon
          rounded
          small
          :disabled="!selectedFlowsInactive.length"
          @click="() => changeFlowStatus('active')"
        >
          <v-icon name="play_circle" />
        </v-button>
        <v-button
          v-if="showSelect"
          v-tooltip.bottom="'Deactivate Selected'"
          icon
          rounded
          small
          :disabled="!selectedFlowsActive.length"
          @click="() => changeFlowStatus('inactive')"
        >
          <v-icon name="pause_circle" />
        </v-button>
        <v-button
          v-if="showSelect"
          v-tooltip.bottom="'Backup Selected'"
          icon
          rounded
          small
          :disabled="!selectedItems.length"
          @click="backupSelectedItems"
        >
          <v-icon name="file_download" />
        </v-button>
        <v-button
          v-if="showSelect"
          v-tooltip.bottom="'Duplicate Selected'"
          icon
          rounded
          small
          :disabled="!selectedItems.length"
          @click="duplicateSelectedItems"
        >
          <v-icon name="content_copy" />
        </v-button>
        <v-button
          v-if="showSelect"
          v-tooltip.bottom="'Delete Selected'"
          icon
          rounded
          small
          :disabled="!selectedItems.length"
          @click="deleteSelectedItems"
        >
          <v-icon name="delete" />
        </v-button>
        <v-button
          v-if="showSelect && selectedCredential === 'local'"
          v-tooltip.bottom="'Push to Cloud Selected'"
          icon
          rounded
          small
          :disabled="!selectedItems.length"
          @click="() => (pushToCloudDialog = true)"
        >
          <v-icon name="cloud_upload" />
        </v-button>
        <div v-if="showSelect" class="align-content-center">
          {{ selectedItems.length }} Item{{ selectedItems.length > 1 ? 's' : '' }} Selected
        </div>
      </div>
      <v-list v-if="viewListMode" class="draggable-list">
        <draggable
          :force-fallback="true"
          :model-value="parentId ? currentFlows : rootFlows"
          item-key="id"
          handle=".drag-handle"
          :swap-threshold="0.3"
          class="root-drag-container"
          :group="{ name: 'flows' }"
          @update:model-value="onSort($event)"
        >
          <template #item="{ element }">
            <div class="list-group-item">
              <flow-item
                :item="element"
                :items="allFlows"
                :show-select="showSelect"
                :selected-items="selectedItems"
                @update:sort="onSort"
              />
            </div>
          </template>
        </draggable>
      </v-list>
      <div v-else>
        <v-menu ref="contextMenuTable" show-arrow placement="bottom-start">
          <v-list>
            <v-list-item clickable @click="copySelectedTextToClipboard()">
              <v-list-item-icon>
                <v-icon name="play_arrow" />
              </v-list-item-icon>
              <v-list-item-content>
                <v-text-overflow :text="'Copy Category Id'" />
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-menu>
        <div class="layout-tabular main-table">
          <v-table
            ref="table"
            v-model:headers="headers"
            v-model="selectedItems"
            class="table"
            :items="tabularFlows"
            :sort="tableSort"
            :loading="isTabularFlowLoading"
            show-resize
            must-sort
            allow-header-reorder
            :show-select="showSelect === true ? 'multiple' : 'none'"
            item-key="id"
            selection-use-keys
            @click:row="goToFlow"
            @update:sort="onTableSortChange"
          >
            <template #[`item.icon`]="{ item }">
              <v-icon v-if="item.icon" :name="item.icon || ''" :color="item.color" />
            </template>
            <template #[`item.status`]="{ item }">
              <v-chip
                v-if="item.status !== 'active'"
                x-small
                class="item-name trigger-chip-inactive"
                >{{ item.status.toUpperCase() }}</v-chip
              >
              <v-chip v-else x-small active class="item-name trigger-chip"
                >{{ item.status.toUpperCase() }}
              </v-chip>
            </template>
            <template #[`item.flow_manager_last_run_at`]="{ item }">
              {{ formatDateLong(item.flow_manager_metadata_id?.flow_manager_last_run_at) }}
            </template>
            <template #[`item.date_created`]="{ item }">
              {{ formatDateLong(item.date_created) }}
            </template>
            <template #[`item.flow_manager_run_counter`]="{ item }">
              {{ item.flow_manager_metadata_id?.flow_manager_run_counter || 0 }}
            </template>
            <template #[`item.trigger`]="{ item }">
              {{ item.trigger.toUpperCase() }}
            </template>
            <template #[`item.flow_manager_category`]="{ item }">
              <v-icon
                v-bind="getCategoryIcon(item.flow_manager_metadata_id?.flow_manager_category)"
                class="mr-1"
              />
              <div
                v-context-menu="'contextMenuTable'"
                @contextmenu="onContextMenuTable(item.flow_manager_category)"
              >
                {{ getCategoryName(item.flow_manager_metadata_id?.flow_manager_category) }}
              </div>
            </template>

            <template #item-append="{ item }">
              <v-menu placement="bottom-end" show-arrow :close-on-content-click="true">
                <template #activator="{ toggle }">
                  <v-icon name="more_vert" class="ctx-toggle" @click="toggle" />
                </template>

                <v-list>
                  <v-list-item
                    v-if="
                      item.trigger === 'manual' &&
                      item.status === 'active' &&
                      selectedCredential === 'local'
                    "
                    clickable
                    @click="showRunDialog(item)"
                  >
                    <v-list-item-icon>
                      <v-icon name="play_arrow" />
                    </v-list-item-icon>
                    <v-list-item-content> Run </v-list-item-content>
                  </v-list-item>
                  <v-list-item clickable @click="goToFlow(item)">
                    <v-list-item-icon>
                      <v-icon name="bolt" />
                    </v-list-item-icon>
                    <v-list-item-content> Go To Flow </v-list-item-content>
                  </v-list-item>
                  <v-list-item clickable @click="openDashboardDetail(item.id)">
                    <v-list-item-icon>
                      <v-icon name="insights" />
                    </v-list-item-icon>
                    <v-list-item-content> Open Dashboard </v-list-item-content>
                  </v-list-item>
                  <v-list-item clickable @click="duplicate(item)">
                    <v-list-item-icon>
                      <v-icon name="content_copy" />
                    </v-list-item-icon>
                    <v-list-item-content> Duplicate </v-list-item-content>
                  </v-list-item>
                  <v-list-item clickable @click="backup(item)">
                    <v-list-item-icon>
                      <v-icon name="file_download" />
                    </v-list-item-icon>
                    <v-list-item-content> Backup </v-list-item-content>
                  </v-list-item>
                  <v-list-item clickable @click="showPushToCloud(item)">
                    <v-list-item-icon>
                      <v-icon name="cloud_upload" />
                    </v-list-item-icon>
                    <v-list-item-content> Push to Cloud </v-list-item-content>
                  </v-list-item>
                  <v-list-item clickable @click="showDeleteItemDialog(item)">
                    <v-list-item-icon>
                      <v-icon name="delete" />
                    </v-list-item-icon>
                    <v-list-item-content> Delete </v-list-item-content>
                  </v-list-item>
                </v-list>
              </v-menu>
            </template>

            <template #header-context-menu="{ header }">
              <v-list>
                <v-list-item
                  :disabled="!header.sortable"
                  :active="tableSort?.by === header.value && tableSort?.desc === false"
                  clickable
                  @click="onTableSortChange({ by: header.value, desc: false })"
                >
                  <v-list-item-icon>
                    <v-icon name="sort" class="flip" />
                  </v-list-item-icon>
                  <v-list-item-content> Sort Ascending </v-list-item-content>
                </v-list-item>

                <v-list-item
                  :active="tableSort?.by === header.value && tableSort?.desc === true"
                  :disabled="!header.sortable"
                  clickable
                  @click="onTableSortChange({ by: header.value, desc: true })"
                >
                  <v-list-item-icon>
                    <v-icon name="sort" />
                  </v-list-item-icon>
                  <v-list-item-content> Sort Descending </v-list-item-content>
                </v-list-item>

                <v-divider />

                <template v-if="header.value === 'status'">
                  <v-list-item
                    :active="selectedShortcutFilter.status === 'active'"
                    clickable
                    @click="setStatusFilter('active')"
                  >
                    <v-list-item-icon>
                      <v-icon name="play_arrow" />
                    </v-list-item-icon>
                    <v-list-item-content> Show Active </v-list-item-content>
                  </v-list-item>
                  <v-list-item
                    :active="selectedShortcutFilter.status === 'inactive'"
                    clickable
                    @click="setStatusFilter('inactive')"
                  >
                    <v-list-item-icon>
                      <v-icon name="pause" class="flip" />
                    </v-list-item-icon>
                    <v-list-item-content> Show Inactive </v-list-item-content>
                  </v-list-item>
                  <v-list-item clickable @click="setStatusFilter('all')">
                    <v-list-item-icon>
                      <v-icon name="close" class="flip" />
                    </v-list-item-icon>
                    <v-list-item-content> Reset </v-list-item-content>
                  </v-list-item>
                </template>

                <template v-if="header.value === 'trigger'">
                  <v-list-item
                    v-for="trigger in TRIGGER_TYPES"
                    :key="trigger"
                    :active="selectedShortcutFilter.trigger === trigger"
                    clickable
                    @click="setTriggerFilter(trigger)"
                  >
                    <v-list-item-icon>
                      <v-icon name="bolt" />
                    </v-list-item-icon>
                    <v-list-item-content> Show {{ trigger.toUpperCase() }} </v-list-item-content>
                  </v-list-item>
                  <v-list-item clickable @click="setTriggerFilter('all')">
                    <v-list-item-icon>
                      <v-icon name="close" />
                    </v-list-item-icon>
                    <v-list-item-content> Reset </v-list-item-content>
                  </v-list-item>
                </template>

                <template v-if="header.value === 'flow_manager_category'">
                  <v-list-item
                    v-for="category in usedCategoryList"
                    :key="category.id"
                    :active="selectedShortcutFilter.flow_manager_category === category.id"
                    clickable
                    @click="setCategoryFilter(category.id as string)"
                  >
                    <v-list-item-icon>
                      <v-icon :name="category.icon || 'folder'" :color="category.color" />
                    </v-list-item-icon>
                    <v-list-item-content> Show {{ category.name }} </v-list-item-content>
                  </v-list-item>
                  <v-list-item clickable @click="setCategoryFilter('all')">
                    <v-list-item-icon>
                      <v-icon name="close" class="flip" />
                    </v-list-item-icon>
                    <v-list-item-content> Reset </v-list-item-content>
                  </v-list-item>
                </template>
              </v-list>
            </template>
          </v-table>
        </div>
      </div>
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
      <sidebar-detail icon="info" :title="'information'" close>
        <div
          v-if="selectedItem?.id && (selectedItem as IFolder).type !== 'category'"
          style="display: grid"
        >
          <div style="font-weight: bold">Flow ID</div>
          <div class="sidebar-text">{{ selectedItem.id }}</div>
          <div style="font-weight: bold" class="mt-2 sidebar-text">Flow Name</div>
          <div>{{ selectedItem.name }}</div>
          <div style="font-weight: bold" class="mt-2 sidebar-text">Status</div>
          <div>{{ (selectedItem as IFlow).status?.toUpperCase() || 'N/A' }}</div>
          <div style="font-weight: bold" class="mt-2 sidebar-text">Trigger Type</div>
          <div>{{ (selectedItem as IFlow).trigger?.toUpperCase() || 'N/A' }}</div>
          <div style="font-weight: bold" class="mt-2 sidebar-text">Description</div>
          <div>{{ (selectedItem as IFlow).description || 'N/A' }}</div>
          <div style="font-weight: bold" class="mt-2 sidebar-text">Total Runs</div>
          <div>
            {{ (selectedItem as IFlow).flow_manager_metadata_id?.flow_manager_run_counter || 0 }}
          </div>
          <div style="font-weight: bold" class="mt-2 sidebar-text">Last Run</div>
          <div>
            {{
              formatDateLong(
                (selectedItem as IFlow).flow_manager_metadata_id?.flow_manager_last_run_at,
              )
            }}
          </div>
          <div style="font-weight: bold" class="mt-2 sidebar-text">Last Error Message</div>
          <div>
            {{
              (selectedItem as IFlow).flow_manager_metadata_id?.flow_manager_last_run_message ||
              'N/A'
            }}
          </div>
          <div style="font-weight: bold" class="mt-2 sidebar-text">Failed Operation Name</div>
          <div>
            {{
              getOperationNameById(
                (selectedItem as IFlow).flow_manager_metadata_id?.flow_manager_last_run_operation ||
                  '',
              )?.name || 'N/A'
            }}
          </div>
        </div>
      </sidebar-detail>
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
      @proceed="(credential: ICredential) => pushToCloud(credential)"
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
import { type Ref, computed, defineComponent, onMounted, provide, ref, toRefs } from 'vue';
import { useStores, useApi, useLayout } from '@directus/extensions-sdk';
import { useRouter } from 'vue-router';
import Draggable from 'vuedraggable';
import SecureLS from 'secure-ls';
import debounce from 'lodash/debounce';
import type { AppCollection, Field, Filter, Preset } from '@directus/types';

import type {
  Header,
  ICredential,
  IFlow,
  IFolder,
  IOperation,
  IServerInfo,
  ISyncFlowCounter,
  ProcessingItem,
} from '../types';
import { ENDPOINT_EXTENSION_NAME, NPM_LINK, TRIGGER_TYPES } from '../constants';

import { formatDate, formatDateLong, getTimestamp } from '../utils/date.util';
import { generateRandomString, maskingText } from '../utils/string.util';
import { sleep } from '../utils/common.util';
import { transformData } from '../utils/flow.util';

import FlowItem from './components/flow-item.vue';
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
import useFields from '../utils/field.util';
import useCollections from '../utils/collection.util';
import type {
  DirectusExtensionInfo,
  DirectusFilter,
  ExtendedField,
  ExtendedPolicy,
  ExtendedUser,
} from '../types';

export default defineComponent({
  components: {
    Draggable,
    FlowItem,
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
    const preset = ref<Preset>(presetsStore.getPresetForCollection('flow-manager'));
    const folderHeaders = ref([
      {
        text: 'Name',
        value: 'name',
        width: 400,
      },
    ]);

    const flowCategories = ref<IFolder[]>(
      (settingsStore.settings.flow_manager_categories || []).map((category: string | IFolder) => {
        if (typeof category === 'string') {
          return {
            id: category,
            name: category,
            type: 'category',
            icon: 'folder',
            color: '',
            flow_manager_metadata_id: {
              flow_manager_order: 0,
            },
          };
        }

        return category;
      }),
    );
    const selectedItems = ref<string[]>([]);
    const progressValue = ref(0);
    const listProcessing = ref<ProcessingItem[]>([]);
    const processingDialogTitle = ref('');
    const restoredFile = ref<HTMLInputElement | null>(null);
    const restoredFileObj: Ref<Partial<IFlow | IFlow[]>> = ref({});
    const restoreConfirmationDialog = ref(false);
    const errors: Ref<string[]> = ref([]);
    const flowDuplicatedName = ref('');
    const newCategoryName = ref('');
    const newCategoryColor = ref('');
    const selectedCredentialId = ref('');
    const tabularFlows = ref<IFlow[]>([]);
    const selectedCategory = ref<IFolder>({
      id: '',
      name: '',
      type: 'category',
      icon: 'folder',
      color: '',
    });
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
    const selectedTextToCopy = ref('');
    const selectedShortcutFilter = ref({
      status: 'all',
      trigger: 'all',
      flow_manager_category: 'all',
    });
    const selectedShortcutFilterCategoryName = computed(() => {
      if (
        !selectedShortcutFilter.value.flow_manager_category ||
        selectedShortcutFilter.value.flow_manager_category === 'all'
      )
        return;
      const category = flowCategories.value.find(
        (c) => c.id === selectedShortcutFilter.value.flow_manager_category,
      );
      if (category) return category.name;
      const flow = flows.value.find(
        (f) => f.id === selectedShortcutFilter.value.flow_manager_category,
      );
      return flow?.name;
    });

    const installedVersion = ref('');
    const latestVersion = ref('');

    const selectedCredential = ref('local');
    const currentUser = ref<ExtendedUser | null>(null);
    const serverInfo = ref<IServerInfo>();
    const ls = new SecureLS({ encodingType: 'aes' });
    const storedCredentials = ref<ICredential[]>(ls.get('flow_manager_credentials') || []);
    const credentials = computed({
      get() {
        return storedCredentials.value;
      },
      set(value) {
        ls.set('flow_manager_credentials', value);
        storedCredentials.value = value;
      },
    });
    const notCreatedFields = ref<Partial<ExtendedField>[]>([]);
    const differentFields = ref<Partial<Field>[]>([]);
    const notCreatedCollections = ref<string[]>([]);

    const { ensureFields } = useFields({
      api,
      fieldsStore,
      credentials,
      selectedCredential,
    });

    const { ensureCollections } = useCollections({
      api,
      fieldsStore,
      collectionsStore,
      credentials,
      selectedCredential,
    });

    /*
      Flags stuff
    */
    const deleteItemDialog = ref(false);
    const runFlowDialog = ref(false);
    const processingDialog = ref(false);
    const settingDialog = ref(false);
    const credentialDialog = ref(false);
    const pushToCloudDialog = ref(false);
    const runWebhookFlowDialog = ref(false);

    const loadingDeleteItem = ref(false);
    const loadingRunFlow = ref(false);
    const loadingPushToCloud = ref(false);
    const isConfigurationLoading = ref(false);
    const isTabularFlowLoading = ref(false);
    const isSyncingFlowCountersLoading = ref(false);

    const showSelect = ref(false);
    const isSelectAll = ref(false);
    const isBatchAction = ref(false);
    const isPreviousIdPersisted = ref(false);
    const isEditCategory = ref(false);
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

    const tableSort = computed<{
      by: string;
      desc: boolean;
    }>({
      get: () => {
        const savedSort = preset.value?.layout_query?.sort;
        return savedSort || { by: 'status', desc: false };
      },
      set(value) {
        preset.value = {
          ...(preset.value || {}),
          layout_query: {
            ...(preset.value?.layout_query || {}),
            sort: value,
          },
        };
        updatePreset();
        return value;
      },
    });
    const tableFlowFilter = computed<Preset['filter']>({
      get: () => {
        return preset.value?.filter;
      },
      set(value) {
        preset.value = {
          ...(preset.value || {}),
          filter: value,
        };
        updatePreset();
        return value;
      },
    });
    const tableFlowSearch = computed<Preset['search']>({
      get: () => {
        return preset.value?.search;
      },
      set(value) {
        preset.value = {
          ...(preset.value || {}),
          search: value,
        };
        updatePreset();
        return value;
      },
    });
    // true for list view, false for table view
    const viewListMode = computed({
      get() {
        if (typeof preset.value?.layout_options?.viewListMode === 'undefined') {
          return true;
        }
        return preset.value?.layout_options?.viewListMode;
      },
      set(value) {
        preset.value = {
          ...(preset.value || {}),
          layout_options: {
            ...(preset.value?.layout_options || {}),
            viewListMode: value,
          },
        };
        updatePreset();
        return value;
      },
    });

    const processedFlows = computed(() => {
      const numberFields = ['flow_manager_run_counter'];
      return [...flows.value].sort((a, b) => {
        const sort = tableSort.value;

        if (numberFields.includes(sort.by)) {
          const aValue = (a as unknown as Record<string, number>)[sort.by] || 0;
          const bValue = (b as unknown as Record<string, number>)[sort.by] || 0;
          return sort.desc ? bValue - aValue : aValue - bValue;
        }

        let aValue: string = (a as unknown as Record<string, string>)[sort.by] || '';
        let bValue: string = (b as unknown as Record<string, string>)[sort.by] || '';

        if (sort.by === 'flow_manager_category') {
          const aCategory =
            folderMap.value[aValue]?.name || flowIdMap.value[aValue]?.name || aValue;
          const bCategory =
            folderMap.value[bValue]?.name || flowIdMap.value[bValue]?.name || bValue;

          aValue = aCategory;
          bValue = bCategory;
        }
        if (sort.desc) {
          return bValue.localeCompare(aValue);
        }

        return aValue.localeCompare(bValue);
      });
    });

    const updateExistingPreset = debounce(async () => {
      if (selectedCredential.value === 'local') {
        await presetsStore.update(preset.value.id, {
          layout_options: {
            sort: tableSort.value,
            headers: headers.value,
            viewListMode: viewListMode.value,
          },
          layout_query: {
            sort: tableSort.value,
          },
          filter: tableFlowFilter.value,
          search: tableFlowSearch.value,
        });
        presetsStore.hydrate();
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (credential) {
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential.url}/presets/${preset.value.id}`,
            staticToken: credential.staticToken,
            method: 'PATCH',
            payload: {
              layout_options: {
                sort: tableSort.value,
                headers: headers.value,
                viewListMode: viewListMode.value,
              },
              layout_query: {
                sort: tableSort.value,
              },
              filter: tableFlowFilter.value,
              search: tableFlowSearch.value,
            },
          });
        }
      }
      reloadTabularFlow();
    }, 500);

    const createNewPreset = debounce(async () => {
      if (selectedCredential.value === 'local') {
        await presetsStore.savePreset({
          bookmark: null,
          collection: 'flow-manager',
          layout_options: {
            sort: tableSort.value,
            headers: headers.value,
            viewListMode: viewListMode.value,
          },
          layout_query: {
            sort: tableSort.value,
          },
          filter: tableFlowFilter.value,
          search: tableFlowSearch.value,
        });
        presetsStore.hydrate();
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (credential) {
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential.url}/presets`,
            staticToken: credential.staticToken,
            method: 'POST',
            payload: {
              bookmark: null,
              collection: 'flow-manager',
              layout_options: {
                sort: tableSort.value,
                headers: headers.value,
                viewListMode: viewListMode.value,
              },
              layout_query: {
                sort: tableSort.value,
              },
              filter: tableFlowFilter.value,
              search: tableFlowSearch.value,
              user: currentUser.value?.id,
            },
          });
          reloadExternalPreset();
        }
      }
      reloadTabularFlow();
    }, 500);

    const headers = computed<Header[]>({
      get() {
        const savedHeaders = preset.value?.layout_options?.headers;
        const defaultWidth = 300;
        return (
          savedHeaders || [
            {
              text: '',
              value: 'icon',
              width: 50,
              sortable: false,
            },
            {
              text: 'Status',
              value: 'status',
              sortable: true,
              width: defaultWidth,
            },
            {
              text: 'Name',
              value: 'name',
              sortable: true,
              width: defaultWidth,
            },
            {
              text: 'Category',
              value: 'flow_manager_category',
              sortable: true,
              width: defaultWidth,
            },
            {
              text: 'Trigger Type',
              value: 'trigger',
              sortable: true,
              width: defaultWidth,
            },
            {
              text: 'Description',
              value: 'description',
              sortable: true,
              width: defaultWidth,
            },
            {
              text: 'Total Runs',
              value: 'flow_manager_run_counter',
              sortable: true,
              width: defaultWidth,
            },
            {
              text: 'Last Run',
              value: 'flow_manager_last_run_at',
              sortable: true,
              width: defaultWidth,
            },
            {
              text: 'Date Created',
              value: 'date_created',
              sortable: true,
              width: defaultWidth,
            },
          ]
        ).map((h: Header) => {
          const editedHeader = h;
          if (editedHeader.value === 'flow_manager_category') {
            editedHeader.text = selectedShortcutFilterCategoryName.value
              ? `Category (${selectedShortcutFilterCategoryName.value})`
              : 'Category';
          } else if (editedHeader.value === 'trigger') {
            editedHeader.text =
              selectedShortcutFilter.value.trigger && selectedShortcutFilter.value.trigger !== 'all'
                ? `Trigger Type (${selectedShortcutFilter.value.trigger.toUpperCase()})`
                : 'Trigger Type';
          }

          return editedHeader;
        });
      },
      set(value) {
        preset.value = {
          ...(preset.value || {}),
          layout_options: {
            ...(preset.value?.layout_options || {}),
            headers: value,
          },
        };
        updatePreset();

        return value;
      },
    });

    const flowIdMap = computed(() =>
      flows.value.reduce((existingMap: Record<string, IFlow>, flow: IFlow) => {
        const map = { ...existingMap };
        map[flow.id] = flow;
        return map;
      }, {}),
    );

    const folderMap = computed(() =>
      flowCategories.value.reduce((existingMap: Record<string, IFolder>, category: IFolder) => {
        const map = { ...existingMap };
        map[category.id] = category;
        return map;
      }, {}),
    );

    const flowChildMap = computed(() => {
      const result: Record<string, (IFlow | IFolder)[]> = {};

      for (let i = 0; i < flows.value.length; i++) {
        const flow = flows.value[i];

        const category = flow?.flow_manager_metadata_id?.flow_manager_category;
        if (category) {
          if (!result[category]) {
            result[category] = [];
          }
          result[category]?.push(flow);
        }
      }

      for (let i = 0; i < flowCategories.value.length; i++) {
        const category = flowCategories.value[i];

        const categoryName = category?.flow_manager_metadata_id?.flow_manager_category;
        if (categoryName) {
          if (!result[categoryName]) {
            result[categoryName] = [];
          }
          result[categoryName]?.push(category);
        }
      }

      return result;
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

    const credentialOptions = computed(() => {
      return credentials.value.map((credential) => ({
        text: credential.name,
        value: credential.id,
      }));
    });

    const isDatabaseUpdated = computed(() => {
      return !(
        notCreatedFields.value.length ||
        differentFields.value.length ||
        notCreatedCollections.value.length
      );
    });

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
      newCategoryName,
      newCategoryColor,
      saveCategory,
      deleteCategory,
      credentialDialog,
      credentials,
      pushToCloudDialog,
      selectedCredentialId,
      credentialOptions,
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
      getCategoryIcon,
      onContextMenuTable,
      selectedTextToCopy,
      copySelectedTextToClipboard,
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

    async function createFlow(item: Omit<IFlow, 'id'> & { id?: string }) {
      if (selectedCredential.value === 'local') {
        const response = await api.post('/flows', {
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
        });

        const payload = transformData(item.operations, response.data.data.id, item.operation);

        await api.patch(`/flows/${response.data.data.id}`, {
          operation: item.operation ? payload.operation : null,
          operations: {
            create: payload.operations,
          },
        });
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        const response = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
          url: `${credential?.url}/flows`,
          staticToken: credential?.staticToken,
          method: 'POST',
          payload: {
            name: item.name,
            status: 'inactive',
            icon: item.icon,
            accountability: item.accountability,
            description: item.description,
            trigger: item.trigger,
            options: item.options,
            color: item.color,
          },
        });

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

    async function duplicate(item: IFlow, isDuplicate = true) {
      try {
        const payload: Omit<IFlow, 'id'> & { id?: string } = {
          id: !isDuplicate && isPreviousIdPersisted.value ? item.id : undefined,
          name: isDuplicate ? `${item.name} - Duplicated` : flowDuplicatedName.value,
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
        isPreviousIdPersisted.value = false;

        notificationsStore.add({
          type: 'success',
          title: isDuplicate
            ? 'Flow Duplicated successfully'
            : `Flow "${item.name}" restored successfully`,
          closeable: true,
          persist: true,
        });
      } catch {
        notificationsStore.add({
          type: 'error',
          title: isDuplicate ? 'Flow Duplication failed' : `Failed to restore Flow "${item.name}"`,
          closeable: true,
          persist: true,
        });
      } finally {
        if (restoredFile.value) restoredFile.value.value = '';
      }
    }

    async function pushToCloud(credential: ICredential | null) {
      if (selectedItems.value.length) {
        pushToCloudDialog.value = false;
        indeterminateProcess.value = false;
        processingDialogTitle.value = 'Pushing Flows to Cloud';
        processingDialog.value = true;
        listProcessing.value = [];
        progressValue.value = 0;
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
            listProcessing.value.push({
              status: 'success',
              message: `Flow "${item.name}"`,
            });
            totalSuccess++;
          } catch {
            listProcessing.value.push({
              status: 'error',
              message: `Flow "${item.name}"`,
            });
            totalError++;
          }
          progressValue.value = Math.round(
            (listProcessing.value.length / selectedFlows.value.length) * 100,
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
          processingDialog.value = false;
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
      let fileName: string = '';
      if (Array.isArray(item)) {
        result = item.map((flow) => {
          return {
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
          };
        });
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
      var fileObj = window.URL.createObjectURL(blob);

      var docUrl = document.createElement('a');
      docUrl.href = fileObj;
      docUrl.setAttribute('download', fileName);
      document.body.appendChild(docUrl);
      docUrl.click();
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
        indeterminateProcess.value = false;
        processingDialogTitle.value = 'Deleting Flows';
        processingDialog.value = true;
        listProcessing.value = [];
        progressValue.value = 0;
        let totalSuccess = 0;
        let totalError = 0;

        for (const item of selectedFlows.value) {
          try {
            await deleteFunc(`${item.id}`);
            listProcessing.value.push({
              status: 'success',
              message: `Flow "${item.name}"`,
            });
            totalSuccess++;
          } catch {
            listProcessing.value.push({
              status: 'error',
              message: `Flow "${item.name}"`,
            });
            totalError++;
          }
          progressValue.value = Math.round(
            (listProcessing.value.length / selectedFlows.value.length) * 100,
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
          processingDialog.value = false;
        });
      } else {
        if (!selectedItem.value) return;
        let type = 'Flow';
        try {
          loadingDeleteItem.value = true;
          if ((selectedItem.value as IFolder).type === 'category') {
            type = 'Folder';
            deleteCategory(selectedItem.value as IFolder);
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

    function showDeleteItemDialog(item: IFlow) {
      selectedItem.value = item;
      deleteItemDialog.value = true;
      isBatchAction.value = false;
    }

    function onRestoredFileChanged($event: Event) {
      const file: File | undefined = ($event?.target as HTMLInputElement)?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const result = e.target?.result;
          const parsedResult = JSON.parse(result as string) as IFlow | IFlow[];

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
                      !collectionMap[collectionName] &&
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
                  ['item-read', 'item-create', 'item-update', 'item-delete'].includes(
                    operation.type,
                  )
                ) {
                  const collectionName = operation.options?.collection;
                  if (
                    collectionName &&
                    !collectionMap[collectionName] &&
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
          console.log(error);
        }
      };
      reader.readAsText(file);
    }

    function onRestoreButtonClicked() {
      restoredFile.value?.click();
    }

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

    async function onConfirmRestore() {
      restoreConfirmationDialog.value = false;
      if (Array.isArray(restoredFileObj.value)) {
        indeterminateProcess.value = false;
        processingDialogTitle.value = 'Restoring Flows';
        processingDialog.value = true;
        listProcessing.value = [];
        progressValue.value = 0;
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
            listProcessing.value.push({
              status: 'success',
              message: `Flow "${flow?.name}"`,
            });
            totalSuccess++;
          } catch {
            listProcessing.value.push({
              status: 'error',
              message: `Flow "${flow?.name}"`,
            });
            totalError++;
          }
          progressValue.value = Math.round(
            (listProcessing.value.length / restoredFileObj.value.length) * 100,
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
          processingDialog.value = false;
        });
      } else {
        duplicate(restoredFileObj.value as IFlow, false);
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

    async function configureFlowManagerDatabase() {
      isConfigurationLoading.value = true;

      if (selectedCredential.value === 'local') {
        for (const collectionName of notCreatedCollections.value) {
          await collectionsStore.upsertCollection(collectionName, {
            collection: collectionName,
            fields: [
              {
                field: 'id',
                type: 'uuid',
                meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
                schema: { is_primary_key: true, length: 36, has_auto_increment: false },
              },
              {
                field: 'date_created',
                type: 'timestamp',
                meta: {
                  special: ['date-created'],
                  interface: 'datetime',
                  readonly: true,
                  hidden: true,
                  width: 'half',
                  display: 'datetime',
                  display_options: { relative: true },
                },
                schema: {},
              },
              {
                field: 'date_updated',
                type: 'timestamp',
                meta: {
                  special: ['date-updated'],
                  interface: 'datetime',
                  readonly: true,
                  hidden: true,
                  width: 'half',
                  display: 'datetime',
                  display_options: { relative: true },
                },
                schema: {},
              },
            ],
            schema: {},
            meta: { singleton: false },
          });
        }
        for (const field of notCreatedFields.value) {
          await fieldsStore.createField(field.collection, field);
          if (field.meta?.special?.includes('m2o')) {
            await relationsStore.upsertRelation(field.collection, field.field, {
              collection: field.collection,
              field: field.field,
              related_collection: field.schema?.related_collection,
              meta: { sort_field: null },
              schema: { on_delete: 'SET NULL' },
            });
          }
        }
        for (const field of differentFields.value) {
          await fieldsStore.deleteField(field.collection, field.field);
          await fieldsStore.createField(field.collection, field);
        }
        await fieldsStore.hydrate();
        await collectionsStore.hydrate();
        await relationsStore.hydrate();
        flowFields.value = fieldsStore.getFieldsForCollection('directus_flows');
        settingFields.value = fieldsStore.getFieldsForCollection('directus_settings');
        if (notCreatedCollections.value.includes('flow_manager_metadata')) {
          await syncMetadata();
        }
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (credential) {
          for (const collectionName of notCreatedCollections.value) {
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/collections`,
              staticToken: credential?.staticToken,
              method: 'POST',
              payload: {
                collection: collectionName,
                fields: [
                  {
                    field: 'id',
                    type: 'uuid',
                    meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
                    schema: { is_primary_key: true, length: 36, has_auto_increment: false },
                  },
                  {
                    field: 'date_created',
                    type: 'timestamp',
                    meta: {
                      special: ['date-created'],
                      interface: 'datetime',
                      readonly: true,
                      hidden: true,
                      width: 'half',
                      display: 'datetime',
                      display_options: { relative: true },
                    },
                    schema: {},
                  },
                  {
                    field: 'date_updated',
                    type: 'timestamp',
                    meta: {
                      special: ['date-updated'],
                      interface: 'datetime',
                      readonly: true,
                      hidden: true,
                      width: 'half',
                      display: 'datetime',
                      display_options: { relative: true },
                    },
                    schema: {},
                  },
                ],
                schema: {},
                meta: { singleton: false },
              },
            });
          }
          for (const field of notCreatedFields.value) {
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/fields/${field.collection}`,
              staticToken: credential?.staticToken,
              method: 'POST',
              payload: field,
            });
            if (field.meta?.special?.includes('m2o')) {
              await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
                url: `${credential?.url}/relations`,
                staticToken: credential?.staticToken,
                method: 'POST',
                payload: {
                  collection: field.collection,
                  field: field.field,
                  related_collection: field.schema?.related_collection,
                  meta: { sort_field: null },
                  schema: { on_delete: 'SET NULL' },
                },
              });
            }
          }
          for (const field of differentFields.value) {
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/fields/${field.collection}/${field.field}`,
              staticToken: credential?.staticToken,
              method: 'DELETE',
            });
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/fields/${field.collection}`,
              staticToken: credential?.staticToken,
              method: 'POST',
              payload: field,
            });
          }

          flowFields.value = await reloadFields('directus_flows');
          settingFields.value = await reloadFields('directus_settings');
          if (notCreatedCollections.value.includes('flow_manager_metadata')) {
            await syncMetadata();
          }
        }
      }
      settingDialog.value = false;
      isConfigurationLoading.value = false;
      ensureDatabase();
    }

    function patchCategory(item: IFolder) {
      let categoryIndex = flowCategories.value.findIndex((category) => category.id === item.id);
      const payload: Partial<IFolder> = {};

      if (typeof item.name === 'string') {
        payload.name = item.name;
      }

      if (typeof item.icon === 'string') {
        payload.icon = item.icon;
      }

      if (typeof item.color === 'string') {
        payload.color = item.color;
      }

      if (typeof item.flow_manager_metadata_id?.flow_manager_order === 'number') {
        if (!payload.flow_manager_metadata_id) {
          payload.flow_manager_metadata_id = {};
        }
        payload.flow_manager_metadata_id.flow_manager_order =
          item.flow_manager_metadata_id.flow_manager_order;
      }

      if (typeof item.flow_manager_metadata_id?.flow_manager_category !== 'undefined') {
        if (!payload.flow_manager_metadata_id) {
          payload.flow_manager_metadata_id = {};
        }
        payload.flow_manager_metadata_id.flow_manager_category =
          item.flow_manager_metadata_id.flow_manager_category;
      }

      if (categoryIndex > -1) {
        flowCategories.value[categoryIndex] = {
          ...flowCategories.value[categoryIndex],
          ...(payload as IFolder),
        };
      } else {
        /**
         * TODO: Will be deprecated in the future
         */
        categoryIndex = flowCategories.value.findIndex((category) => category.name === item.name);
        if (
          categoryIndex !== -1 &&
          flowCategories.value[categoryIndex]?.id === flowCategories.value[categoryIndex]?.name
        ) {
          // the old category
          flowCategories.value[categoryIndex] = {
            ...flowCategories.value[categoryIndex],
            ...(payload as IFolder),
          };
        }
      }
    }

    async function saveCategory() {
      if (!selectedCategory.value.name) return;

      if (!isEditCategory.value) {
        flowCategories.value = [
          ...flowCategories.value,
          {
            id: generateRandomString(10),
            name: selectedCategory.value.name,
            type: 'category',
            icon: selectedCategory.value.icon || 'folder',
            color: selectedCategory.value.color,
            flow_manager_metadata_id: {
              flow_manager_category: '',
              flow_manager_order: 0,
            },
          },
        ];
      } else {
        patchCategory({
          id: selectedCategory.value.id,
          name: selectedCategory.value.name,
          type: 'category',
          icon: selectedCategory.value.icon || 'folder',
          color: selectedCategory.value.color,
          flow_manager_metadata_id: {
            flow_manager_category:
              selectedCategory.value.flow_manager_metadata_id?.flow_manager_category,
            flow_manager_order: selectedCategory.value.flow_manager_metadata_id?.flow_manager_order,
          },
        });

        isEditCategory.value = false;
      }

      selectedCategory.value = {
        id: '',
        name: '',
        type: 'category',
        icon: 'folder',
        color: '',
      };

      saveCategories();
    }

    async function deleteCategory(category: IFolder) {
      let isValidToDelete = false;
      let deletedIndex = flowCategories.value.findIndex(
        (flowCategory) => flowCategory.id === category.id,
      );

      if (deletedIndex !== -1) {
        isValidToDelete = true;
      } else {
        /**
         * TODO: Will be deprecated in the future
         */
        deletedIndex = flowCategories.value.findIndex(
          (flowCategory) => flowCategory.name === category.name,
        );
        if (
          deletedIndex !== -1 &&
          flowCategories.value[deletedIndex]?.id === flowCategories.value[deletedIndex]?.name
        ) {
          isValidToDelete = true;
        }
      }

      if (isValidToDelete) {
        if (selectedCategory.value.id === flowCategories.value[deletedIndex]?.id) {
          selectedCategory.value = {
            id: '',
            name: '',
            type: 'category',
            icon: 'folder',
            color: '',
          };
        }

        flowCategories.value.splice(deletedIndex, 1);

        saveCategories();
      }
    }

    function showPushToCloud(item: IFlow) {
      selectedItem.value = item;
      pushToCloudDialog.value = true;
    }

    function selectCategoryForEdit({ item }: { item: IFolder }) {
      isEditCategory.value = true;
      selectedCategory.value = {
        id: item.id,
        name: item.name,
        type: 'category',
        icon: item.icon,
        color: item.color,
        flow_manager_metadata_id: {
          flow_manager_category: item.flow_manager_metadata_id?.flow_manager_category,
          flow_manager_order: item.flow_manager_metadata_id?.flow_manager_order,
        },
      };
    }

    function cancelEditCategory() {
      isEditCategory.value = false;
      selectedCategory.value = {
        id: '',
        name: '',
        type: 'category',
        icon: 'folder',
        color: '',
      };
    }

    function duplicateFolder(item: IFolder) {
      flowCategories.value = [
        ...flowCategories.value,
        {
          id: generateRandomString(10),
          name: `${item.name} - Duplicated`,
          type: 'category',
          icon: item.icon,
          color: item.color,
          flow_manager_metadata_id: {
            flow_manager_category: item.flow_manager_metadata_id?.flow_manager_category,
          },
        },
      ];

      saveCategories();
    }

    function showEditFolderDialog(item: IFolder) {
      isEditCategory.value = true;
      selectedCategory.value = {
        id: item.id,
        name: item.name,
        type: 'category',
        icon: item.icon,
        color: item.color,
      };
      settingDialog.value = true;
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
        } catch {
          notificationsStore.add({
            type: 'error',
            title: 'Failed to fetch Flows. Please check your credentials',
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

    async function reloadTabularFlow() {
      try {
        let sort = 'id';
        const sortMap: Record<string, string> = {
          flow_manager_order: 'flow_manager_metadata_id.flow_manager_order',
          flow_manager_category: 'flow_manager_metadata_id.flow_manager_category',
          flow_manager_run_counter: 'flow_manager_metadata_id.flow_manager_run_counter',
          flow_manager_last_run_at: 'flow_manager_metadata_id.flow_manager_last_run_at',
          flow_manager_last_run_message: 'flow_manager_metadata_id.flow_manager_last_run_message',
          flow_manager_last_run_operation:
            'flow_manager_metadata_id.flow_manager_last_run_operation',
          flow_manager_error_counter: 'flow_manager_metadata_id.flow_manager_error_counter',
          flow_manager_success_counter: 'flow_manager_metadata_id.flow_manager_success_counter',
        };
        if (tableSort.value) {
          sort = sortMap[tableSort.value.by] || tableSort.value.by;
          if (tableSort.value.desc) {
            sort = `-${sort}`;
          }
        }
        const fields = ['*', 'operations.*', 'flow_manager_metadata_id.*'];

        let response: { data: { data: IFlow[] } } = { data: { data: [] } };
        if (selectedCredential.value === 'local') {
          response = await api.get('/flows', {
            params: {
              fields: fields.join(','),
              sort,
              filter: tableFlowFilter.value,
              search: tableFlowSearch.value,
            },
          });
        } else {
          const c = credentials.value.find((c) => c.id === selectedCredential.value);
          if (c) {
            const queries = [`fields=${fields.join(',')}`, `sort=${sort}`];
            if (tableFlowFilter.value) {
              queries.push(`filter=${JSON.stringify(tableFlowFilter.value)}`);
            }
            if (tableFlowSearch.value) {
              queries.push(`search=${tableFlowSearch.value}`);
            }
            response = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${c.url}/flows?${queries.join('&')}`,
              staticToken: c.staticToken,
              method: 'GET',
            });
          }
        }
        tabularFlows.value = response.data.data;
      } catch {
      } finally {
        isTabularFlowLoading.value = false;
      }
    }

    function onTableSortChange(sort: { by: string; desc: boolean }) {
      tableSort.value = sort;
      updatePreset();
    }

    function updatePreset() {
      isTabularFlowLoading.value = true;
      if (preset.value?.id) {
        updateExistingPreset();
      } else {
        createNewPreset();
      }
    }

    function getCategoryName(categoryId: string) {
      if (folderMap.value[categoryId || '']?.name) {
        return `${folderMap.value[categoryId || '']?.name}`;
      }
      if (flowIdMap.value[categoryId]?.name) {
        return `${flowIdMap.value[categoryId]?.name}`;
      }

      return categoryId;
    }

    function getCategoryIcon(categoryId: string) {
      if (!categoryId) {
        return {
          name: '',
        };
      }
      if (folderMap.value[categoryId || '']?.icon) {
        return {
          name: folderMap.value[categoryId || '']?.icon,
          color: folderMap.value[categoryId || '']?.color,
        };
      }
      if (flowIdMap.value[categoryId]?.icon) {
        return {
          name: flowIdMap.value[categoryId]?.icon,
          color: flowIdMap.value[categoryId]?.color,
        };
      }

      return {
        name: 'folder',
      };
    }

    function onContextMenuTable(text: string) {
      selectedTextToCopy.value = text;
    }

    async function copySelectedTextToClipboard() {
      await navigator.clipboard.writeText(selectedTextToCopy.value);
    }

    function setStatusFilter(status: string) {
      const currentFilter = tableFlowFilter.value as DirectusFilter | null;
      const filteredAnd =
        currentFilter?._and?.filter(
          (filter: Record<string, unknown>) => Object.keys(filter)[0] !== 'status',
        ) || [];
      if (status !== 'all') {
        filteredAnd.push({
          status: {
            _eq: status,
          },
        });
      }
      tableFlowFilter.value = {
        ...(currentFilter || {}),
        _and: filteredAnd,
      } as unknown as Filter;
      selectedShortcutFilter.value.status = status;
      updatePreset();
    }

    function setTriggerFilter(trigger: string) {
      const currentFilter = tableFlowFilter.value as DirectusFilter | null;
      const filteredAnd =
        currentFilter?._and?.filter(
          (filter: Record<string, unknown>) => Object.keys(filter)[0] !== 'trigger',
        ) || [];
      if (trigger !== 'all') {
        filteredAnd.push({
          trigger: {
            _eq: trigger,
          },
        });
      }
      tableFlowFilter.value = {
        ...(currentFilter || {}),
        _and: filteredAnd,
      } as unknown as Filter;
      selectedShortcutFilter.value.trigger = trigger;
      updatePreset();
    }

    function setCategoryFilter(category: string) {
      const currentFilter = tableFlowFilter.value as DirectusFilter | null;
      const filteredAnd =
        currentFilter?._and?.filter(
          (filter: Record<string, unknown>) =>
            Object.keys(filter)[0] !== 'flow_manager_metadata_id',
        ) || [];
      const metadataFilters =
        currentFilter?._and?.filter(
          (filter: Record<string, unknown>) =>
            Object.keys(filter)[0] === 'flow_manager_metadata_id',
        ) || [];
      const otherMetadataFilters = metadataFilters.filter(
        (filter: Record<string, unknown>) =>
          !(filter.flow_manager_metadata_id as Record<string, unknown> | undefined)
            ?.flow_manager_category,
      );

      if (category !== 'all') {
        filteredAnd.push({
          flow_manager_metadata_id: {
            flow_manager_category: {
              _eq: category,
            },
          },
        });
      }
      tableFlowFilter.value = {
        ...(currentFilter || {}),
        _and: [...filteredAnd, ...otherMetadataFilters],
      } as unknown as Filter;
      selectedShortcutFilter.value.flow_manager_category = category;
      updatePreset();
    }

    async function getLatestVersion() {
      try {
        const {
          data: { data: installedExtensions },
        } = await api.get<{ data: DirectusExtensionInfo[] }>('/extensions');

        const extension = installedExtensions.find(
          (extension: DirectusExtensionInfo) =>
            (extension.name === 'directus-extension-flow-manager' ||
              extension.schema?.name === 'directus-extension-flow-manager') &&
            extension.schema?.type === 'bundle',
        );

        installedVersion.value = extension?.schema?.version || '';

        if (installedVersion.value) {
          const { data } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: NPM_LINK,
          });

          const latestTag = data?.['dist-tags']?.latest;

          if (latestTag) {
            if (latestTag !== installedVersion.value) {
              latestVersion.value = latestTag;
            }
          }
        }
      } catch {}
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

    async function duplicateSelectedItems() {
      if (!selectedItems.value.length) {
        return;
      }
      indeterminateProcess.value = false;
      processingDialogTitle.value = 'Duplicating Flows';
      processingDialog.value = true;
      listProcessing.value = [];
      progressValue.value = 0;
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
              listProcessing.value.push({
                status: 'success',
                message: `Flow "${item.name}"`,
              });
              totalSuccess++;
            } catch {
              listProcessing.value.push({
                status: 'error',
                message: `Flow "${item.name}"`,
              });
              totalError++;
            }
            progressValue.value = Math.round(
              (listProcessing.value.length / selectedItems.value.length) * 100,
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
          processingDialog.value = false;
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

    async function deleteSelectedItems() {
      isBatchAction.value = true;
      deleteItemDialog.value = true;
    }

    function showRunDialog(item: IFlow) {
      selectedItem.value = item;
      runFlowDialog.value = true;
    }

    function showRunWebhookDialog(item: IFlow) {
      selectedItem.value = item;
      runWebhookFlowDialog.value = true;
    }

    async function reloadFields(collectionName: string) {
      if (selectedCredential.value === 'local') {
        return fieldsStore.getFieldsForCollection(collectionName);
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        const {
          data: { data },
        } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
          url: `${credential?.url}/fields/${collectionName}`,
          staticToken: credential?.staticToken,
          method: 'GET',
        });
        return data;
      }
    }

    async function reloadFolders() {
      if (selectedCredential.value === 'local') {
        return (settingsStore.settings?.flow_manager_categories || []).map(
          (category: string | IFolder) => {
            if (typeof category === 'string') {
              return {
                id: category,
                name: category,
                type: 'category',
                icon: 'folder',
                color: '',
                flow_manager_metadata_id: {
                  flow_manager_order: 0,
                },
              };
            }

            return category;
          },
        );
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        const {
          data: { data },
        } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
          url: `${credential?.url}/settings`,
          staticToken: credential?.staticToken,
          method: 'GET',
        });
        return (data?.flow_manager_categories || []).map((category: string | IFolder) => {
          if (typeof category === 'string') {
            return {
              id: category,
              name: category,
              type: 'category',
              icon: 'folder',
              color: '',
              flow_manager_metadata_id: {
                flow_manager_order: 0,
              },
            };
          }

          return category;
        });
      }
    }
    async function setCredential(credential: string) {
      const oldCredential = selectedCredential.value;
      indeterminateProcess.value = true;
      processingDialogTitle.value = 'Loading';
      selectedCredential.value = credential;

      ensureDatabase();

      try {
        getServerInfo();
        const isHaveAdminAccess = await getUserPermission();
        if (!isHaveAdminAccess) {
          notificationsStore.add({
            type: 'error',
            title: "You don't have permission to access this credential",
            closeable: true,
            persist: true,
          });
          selectedCredential.value = 'local';
          return;
        }
        router.push('/flow-manager');
        processingDialog.value = true;
        await reloadExternalPreset();
        reloadFlow();
        reloadTabularFlow();
        flowFields.value = await reloadFields('directus_flows');
        settingFields.value = await reloadFields('directus_settings');

        reloadFolders().then((folders) => {
          flowCategories.value = folders;
        });
      } catch {
        notificationsStore.add({
          type: 'error',
          title: 'Failed to fetch using the selected credential',
          closeable: true,
          persist: true,
        });
        selectedCredential.value = oldCredential;
        getServerInfo();
      }
      processingDialog.value = false;
      processingDialogTitle.value = '';
    }

    async function saveCategories() {
      if (selectedCredential.value === 'local') {
        settingsStore.updateSettings(
          {
            flow_manager_categories: flowCategories.value,
          },
          false,
        );
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
          url: `${credential?.url}/settings`,
          staticToken: credential?.staticToken,
          method: 'PATCH',
          payload: {
            flow_manager_categories: flowCategories.value,
          },
        });
      }
    }

    async function getUser(isHasPolicyField = false) {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      const queries: string[] = ['fields[]=*'];
      if (isHasPolicyField) {
        queries.push('fields[]=policies.policy.*');
        queries.push('fields[]=role.policies.policy.*');
      } else {
        queries.push('fields[]=role.*');
      }
      if (selectedCredential.value === 'local') {
        const {
          data: { data },
        } = await api.get(`/users/me?${queries.join('&')}`);
        currentUser.value = data;
      } else {
        if (credential) {
          const {
            data: { data },
          } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential.url}/users/me?${queries.join('&')}`,
            staticToken: credential.staticToken,
            method: 'GET',
          });
          currentUser.value = data;
        }
      }
    }

    async function getServerInfo() {
      try {
        if (selectedCredential.value === 'local') {
          const {
            data: { data },
          } = await api.get(`/server/info`);
          serverInfo.value = data;
        } else {
          const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
          if (credential) {
            const {
              data: { data },
            } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential.url}/server/info`,
              staticToken: credential.staticToken,
              method: 'GET',
            });
            serverInfo.value = data;
          }
        }
      } catch {
        serverInfo.value = undefined;
      }
    }

    async function reloadExternalPreset() {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      if (credential && currentUser.value) {
        const {
          data: { data },
        } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
          url: `${credential.url}/presets?filter[user][_eq]=${currentUser.value?.id}&limit=-1`,
          staticToken: credential.staticToken,
          method: 'GET',
        });
        const [selectedPreset] = data.filter(
          (preset: { collection: string }) => preset.collection === 'flow-manager',
        );
        preset.value = selectedPreset;
      }
    }

    async function changeFlowStatus(status: string) {
      if (!selectedItems.value.length) {
        return;
      }
      indeterminateProcess.value = false;
      processingDialogTitle.value = status === 'active' ? 'Activating Flows' : 'Deactivating Flows';
      processingDialog.value = true;
      listProcessing.value = [];
      progressValue.value = 0;
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
              listProcessing.value.push({
                status: 'success',
                message: `Flow "${item.name}"`,
              });
              totalSuccess++;
            } catch {
              listProcessing.value.push({
                status: 'error',
                message: `Flow "${item.name}"`,
              });
              totalError++;
            }
            progressValue.value = Math.round((listProcessing.value.length / filtered.length) * 100);
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
          processingDialog.value = false;
        });
      }
    }

    async function getUserPermission() {
      const permissionFields = await reloadFields('directus_permissions');
      const permissionHasPolicy = permissionFields.some((f: Field) => f.field === 'policy');
      await getUser(permissionHasPolicy);
      if (permissionHasPolicy) {
        const policies: ExtendedPolicy[] = [
          ...(currentUser.value?.policies || []),
          ...(currentUser.value?.role?.policies || []),
        ];

        return policies.some((policy) => policy.admin_access || policy.policy.admin_access);
      } else {
        return currentUser.value?.role?.admin_access;
      }
    }

    function getOperationNameById(id: string) {
      if (!id) return undefined;
      const { operations } = selectedItem.value as IFlow;
      return operations?.find((o) => o.id === id);
    }

    async function syncFlowCounters() {
      isSyncingFlowCountersLoading.value = true;
      let payload: ISyncFlowCounter = {
        type: 'local',
      };
      if (selectedCredential.value !== 'local') {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (credential) {
          payload = {
            type: 'remote',
            url: credential.url,
            staticToken: credential.staticToken,
          };
        }
      }
      try {
        await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/sync-counters`, payload);
        notificationsStore.add({
          type: 'success',
          title: 'Flow counters synced successfully',
          closeable: true,
          persist: true,
        });
        reloadFlow();
        reloadTabularFlow();
        settingDialog.value = false;
      } catch {
        notificationsStore.add({
          type: 'error',
          title: 'Failed to sync the Flow counters',
          closeable: true,
          persist: true,
        });
      } finally {
        isSyncingFlowCountersLoading.value = false;
      }
    }

    function openDashboardDetail(flowId: string) {
      router.push(`/flow-manager/dashboard/${flowId}`);
    }

    async function ensureDatabase() {
      const { notExistsFields, differentFields: differentFieldsResult } = await ensureFields();
      const { notExistsCollections } = await ensureCollections();
      notCreatedFields.value = notExistsFields;
      differentFields.value = differentFieldsResult;
      notCreatedCollections.value = notExistsCollections;
      if (notExistsFields.length || differentFields.value.length || notExistsCollections.length) {
        settingDialog.value = true;
      }
    }

    async function syncMetadata() {
      try {
        await reloadFlow();
        const currentCategories = await reloadFolders();
        const categories = (currentCategories || []).map((c: IFolder) => {
          return {
            ...c,
            flow_manager_metadata_id: {
              flow_manager_order: c.flow_manager_order,
              flow_manager_category: c.flow_manager_category,
            },
          };
        });
        if (selectedCredential.value === 'local') {
          for (const flow of flows.value) {
            const {
              flow_manager_category,
              flow_manager_order,
              flow_manager_last_run_at,
              flow_manager_run_counter,
              flow_manager_last_run_message,
              flow_manager_last_run_operation,
              flow_manager_success_counter,
              flow_manager_error_counter,
            } = flow;
            const payload = {
              flow_manager_category,
              flow_manager_order,
              flow_manager_last_run_at,
              flow_manager_run_counter,
              flow_manager_last_run_message,
              flow_manager_last_run_operation,
              flow_manager_success_counter,
              flow_manager_error_counter,
            };
            const {
              data: { data: metadataResult },
            } = await api.post('/items/flow_manager_metadata', payload);
            await api.patch(`/flows/${flow.id}`, { flow_manager_metadata_id: metadataResult.id });
          }
          settingsStore.updateSettings(
            {
              flow_manager_categories: categories,
            },
            false,
          );
        } else {
          for (const flow of flows.value) {
            const {
              flow_manager_category,
              flow_manager_order,
              flow_manager_last_run_at,
              flow_manager_run_counter,
              flow_manager_last_run_message,
              flow_manager_last_run_operation,
              flow_manager_success_counter,
              flow_manager_error_counter,
            } = flow;
            const payload = {
              flow_manager_category,
              flow_manager_order,
              flow_manager_last_run_at,
              flow_manager_run_counter,
              flow_manager_last_run_message,
              flow_manager_last_run_operation,
              flow_manager_success_counter,
              flow_manager_error_counter,
            };
            const credential = credentials.value.find(
              (cred) => cred.id === selectedCredential.value,
            );
            const {
              data: { data: metadataResult },
            } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/items/flow_manager_metadata`,
              staticToken: credential?.staticToken,
              method: 'POST',
              payload,
            });
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/flows/${flow.id}`,
              staticToken: credential?.staticToken,
              method: 'PATCH',
              payload: { flow_manager_metadata_id: metadataResult.id },
            });
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/settings`,
              staticToken: credential?.staticToken,
              method: 'PATCH',
              payload: {
                flow_manager_categories: categories,
              },
            });
          }
        }
        flowCategories.value = categories;
      } catch {
        notificationsStore.add({
          type: 'error',
          title: 'Failed to fetch Flows. Please check your credentials',
          closeable: true,
          persist: true,
        });
      }
    }
  },
});
</script>

<style lang="scss" scoped>
.handle {
  float: left;
  padding-top: 8px;
  padding-bottom: 8px;
}

.root-drag-container {
  padding: 8px 0;
  overflow: hidden;
}

.draggable-list :deep(.sortable-ghost) {
  .v-list-item {
    --v-list-item-background-color: var(--primary-alt);
    --v-list-item-border-color: var(--primary);
    --v-list-item-background-color-hover: var(--primary-alt);
    --v-list-item-border-color-hover: var(--primary);

    > * {
      opacity: 0;
    }
  }
}

.draggable-list {
  margin-left: 10px;
  margin-right: 10px;
}

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

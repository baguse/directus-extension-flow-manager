<template>
  <private-view :title="title">
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon :name="iconName" />
      </v-button>
    </template>

    <template #title-outer:append>
      <v-chip v-if="installedVersion" small class="ml-2" v-tooltip.bottom="'Current Version'">{{ installedVersion }}</v-chip>
      <div v-if="latestVersion">
        <span class="ml-2">-></span>
        <v-chip small class="ml-2 secondary-chip" v-tooltip.bottom="'Latest Version'">
          {{ latestVersion }}
        </v-chip>
      </div>
    </template>

    <div
      :class="{
        'top-bar-panel': true,
        'table-mode': !viewListMode,
        'list-view-mode': viewListMode,
      }"
    >
      <v-checkbox v-model="showSelect">Show Select</v-checkbox>
      <v-checkbox v-if="showSelect" v-model="isSelectAll" @update:model-value="selectAll()">Select All</v-checkbox>
      <v-button
        v-if="showSelect"
        icon
        rounded
        small
        :disabled="!selectedItems.length"
        v-tooltip.bottom="'Backup Selected'"
        @click="backupSelectedItems"
      >
        <v-icon name="file_download" />
      </v-button>
      <v-button
        v-if="showSelect"
        icon
        rounded
        small
        :disabled="!selectedItems.length"
        v-tooltip.bottom="'Duplicate Selected'"
        @click="duplicateSelectedItems"
      >
        <v-icon name="content_copy" />
      </v-button>
      <v-button
        v-if="showSelect"
        icon
        rounded
        small
        :disabled="!selectedItems.length"
        v-tooltip.bottom="'Delete Selected'"
        @click="deleteSelectedItems"
      >
        <v-icon name="delete" />
      </v-button>
      <div v-if="showSelect" class="align-content-center">
        {{ selectedItems.length }} Item{{ selectedItems.length > 1 ? "s" : "" }} Selected
      </div>
    </div>
    <div v-if="!viewListMode">
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
          class="table"
          v-model:headers="headers"
          :items="tabularFlows"
          :sort="tableSort"
          :loading="isTabularFlowLoading"
          show-resize
          must-sort
          allow-header-reorder
          @click:row="goToFlow"
          @update:sort="onTableSortChange"
          :show-select="showSelect === true ? 'multiple' : 'none'"
          v-model="selectedItems"
          item-key="id"
          selection-use-keys
        >
          <template #[`item.icon`]="{ item }">
            <v-icon v-if="item.icon" :name="item.icon || ''" :color="item.color" />
          </template>
          <template #[`item.status`]="{ item }">
            <v-chip v-if="item.status !== 'active'" x-small class="item-name trigger-chip-inactive">{{ item.status.toUpperCase() }}</v-chip>
            <v-chip v-else x-small active class="item-name trigger-chip">{{ item.status.toUpperCase() }} </v-chip>
          </template>
          <template #[`item.flow_manager_last_run_at`]="{ item }">
            {{ formatDateLong(item.flow_manager_last_run_at) }}
          </template>
          <template #[`item.date_created`]="{ item }">
            {{ formatDateLong(item.date_created) }}
          </template>
          <template #[`item.flow_manager_run_counter`]="{ item }">
            {{ item.flow_manager_run_counter || 0 }}
          </template>
          <template #[`item.trigger`]="{ item }">
            {{ item.trigger.toUpperCase() }}
          </template>
          <template #[`item.flow_manager_category`]="{ item }">
            <v-icon v-bind="getCategoryIcon(item.flow_manager_category)" class="mr-1" />
            <div v-context-menu="'contextMenuTable'" @contextmenu="onContextMenuTable(item.flow_manager_category)">
              {{ getCategoryName(item.flow_manager_category) }}
            </div>
          </template>

          <template #item-append="{ item }">
            <v-menu placement="bottom-end" show-arrow :close-on-content-click="true">
              <template #activator="{ toggle }">
                <v-icon name="more_vert" class="ctx-toggle" @click="toggle" />
              </template>

              <v-list>
                <v-list-item v-if="item.trigger === 'manual' && item.status === 'active'" clickable @click="showRunDialog(item)">
                  <v-list-item-icon>
                    <v-icon name="play_arrow" />
                  </v-list-item-icon>
                  <v-list-item-content> Run </v-list-item-content>
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
                <v-list-item :active="selectedShortcutFilter.status === 'active'" clickable @click="setStatusFilter('active')">
                  <v-list-item-icon>
                    <v-icon name="play_arrow" />
                  </v-list-item-icon>
                  <v-list-item-content> Show Active </v-list-item-content>
                </v-list-item>
                <v-list-item :active="selectedShortcutFilter.status === 'inactive'" clickable @click="setStatusFilter('inactive')">
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

    <v-list v-else class="draggable-list">
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
              @update:sort="($event: any) => onSort($event)"
            />
          </div>
        </template>
      </draggable>
    </v-list>

    <template #actions>
      <v-checkbox v-model="viewListMode" label="List View" />
      <search-input v-if="!viewListMode" :collection="'directus_flows'" v-model="tableFlowSearch" v-model:filter="tableFlowFilter" />
      <v-button v-tooltip.bottom="'Settings'" rounded icon @click="settingDialog = true">
        <v-icon name="settings" />
      </v-button>
      <v-button
        v-tooltip.bottom="'Credentials'"
        rounded
        icon
        @click="credentialDialog = true"
      >
        <v-icon name="database" />
      </v-button>
      <v-button v-tooltip.bottom="'Restore'" rounded icon @click="onRestoreButtonClicked">
        <v-icon name="file_upload" />
      </v-button>
    </template>

    <template v-if="viewListMode" #navigation>
      <content-navigation :root-flows="rootFlows" :flow-child-map="flowChildMap" :all-flows="allFlows" />
    </template>

    <template #sidebar>
      <sidebar-detail icon="info" :title="'information'" close>
        <div v-if="selectedItem?.id && (selectedItem as IFolder).type !== 'category'" style="display: grid">
          <div style="font-weight: bold">Flow ID</div>
          <div>{{ selectedItem.id }}</div>
          <div style="font-weight: bold" class="mt-2">Flow Name</div>
          <div>{{ selectedItem.name }}</div>
          <div style="font-weight: bold" class="mt-2">Status</div>
          <div>{{ (selectedItem as IFlow).status?.toUpperCase() || "N/A" }}</div>
          <div style="font-weight: bold" class="mt-2">Trigger Type</div>
          <div>{{ (selectedItem as IFlow).trigger?.toUpperCase() || "N/A" }}</div>
          <div style="font-weight: bold" class="mt-2">Description</div>
          <div>{{ (selectedItem as IFlow).description || "N/A" }}</div>
          <div style="font-weight: bold" class="mt-2">Total Runs</div>
          <div>{{ (selectedItem as IFlow).flow_manager_run_counter || 0 }}</div>
          <div style="font-weight: bold" class="mt-2">Last Run</div>
          <div>{{ formatDateLong((selectedItem as IFlow).flow_manager_last_run_at) }}</div>
        </div>
      </sidebar-detail>
    </template>

    <input ref="restoredFile" type="file" accept="application/json" @change="onRestoredFileChanged" style="display: none" />
    <v-dialog :model-value="restoreConfirmationDialog" :persistent="true" @update:model-value="restoreConfirmationDialog = false">
      <v-card>
        <v-card-title>Confirmation Dialog</v-card-title>
        <v-card-text>
          <v-input placeholder="Flow Name" v-model="flowDuplicatedName" v-tooltip.bottom="'Flow Name'" />
          <v-checkbox
            style="margin-top: 4px"
            label="Keep the same flow id as the original flow"
            :model-value="isPreviousIdPersisted"
            @update:model-value="isPreviousIdPersisted = $event"
          />
          <v-list v-if="Array.isArray(restoredFileObj)">
            <v-list-item v-for="item in restoredFileObj" :key="item?.id">
              <v-list-item-icon>
                <v-icon :color="item?.color || 'var(--theme--primary)'" :name="item?.icon" />
              </v-list-item-icon>
              <v-list-item-content>{{ item?.name }}</v-list-item-content>
            </v-list-item>
          </v-list>
          <v-list v-else>
            <v-list-item>
              <v-list-item-icon>
                <v-icon :color="restoredFileObj.color || 'var(--theme--primary)'" :name="restoredFileObj.icon" />
              </v-list-item-icon>
              <v-list-item-content>{{ restoredFileObj.name }}</v-list-item-content>
            </v-list-item>
          </v-list>
          <div v-if="errors.length">
            <v-error
              v-for="(error, indexError) in errors"
              :key="`errorIndex-${indexError}`"
              :error="{ extensions: { code: 'Error' }, message: error }"
            ></v-error>
            <div style="margin-top: 15px">There are some errors in the file you are trying to restore. Do you want to continue?</div>
          </div>
          <div v-else>
            <div style="margin-top: 15px">Do you want to continue?</div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="restoreConfirmationDialog = false"> Cancel </v-button>
          <v-button @click="onConfirmRestore"> Continue </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="settingDialog" :persistent="true" @update:model-value="settingDialog = false">
      <v-card>
        <v-card-title>Settings</v-card-title>
        <v-card-text>
          <v-error
            v-if="!flowFieldConfiguration.isConfigured || !isSettingFieldConfigured"
            :error="{ extensions: { code: 'Error' }, message: 'Flow Manager fields are not configured' }"
          ></v-error>
          <div v-else>
            <v-table :headers="folderHeaders" :items="flowCategories" @click:row="selectCategoryForEdit">
              <template #[`item.name`]="{ item }">
                <v-icon :name="item.icon || ''" :color="item.color || 'var(--theme--background-inverted, var(--background-inverted))'" />
                <span class="ml-2">
                  {{ item.name }}
                </span>
              </template>
              <template #item-append="{ item }">
                <v-icon
                  class="button-delete-category"
                  name="delete"
                  color="var(--theme-danger, var(--danger))"
                  @click="deleteCategory(item)"
                  v-tooltip.bottom="'Delete Category'"
                />
              </template>
            </v-table>
            <div class="input-form">
              <v-input placeholder="Category Name" v-model="selectedCategory.name" v-tooltip.bottom="'Category Name'"> </v-input>
            </div>
            <div class="input-form">
              <interface-select-color width="full" :value="selectedCategory.color" @input="selectedCategory.color = $event" />
            </div>
            <div class="input-form">
              <interface-select-icon :value="selectedCategory.icon" @input="selectedCategory.icon = $event" />
            </div>
            <v-button @click="saveCategory" class="input-form" :disabled="!selectedCategory.name">
              {{ isEditCategory ? "Save" : "Add" }}
            </v-button>
            <v-button v-if="isEditCategory" secondary @click="cancelEditCategory" class="input-form ml-2"> Cancel </v-button>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="settingDialog = false"> Close </v-button>
          <v-button
            :loading="isConfigurationLoading"
            :disabled="flowFieldConfiguration.isConfigured && isSettingFieldConfigured"
            @click="configureFlowManagerField"
          >
            Configure
          </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <CredentialDialog :value="credentialDialog" @update:model-value="credentialDialog = $event" v-model:credentials="credentials" />

    <PushToCloudDialog
      :value="pushToCloudDialog"
      :credentials="credentials"
      :loading="loadingPushToCloud"
      @update:model-value="pushToCloudDialog = $event"
      @proceed="(credential: ICredential) => pushToCloud(credential)"
    />

    <DeleteDialog
      :value="deleteItemDialog"
      :isBatchAction="isBatchAction"
      :selectedItem="selectedItem"
      :selectedFlows="selectedFlows"
      :loading="loadingDeleteItem"
      @update:model-value="deleteItemDialog = $event"
      @proceed="deleteItem"
    />

    <RunManualFlowForm
      :value="runFlowDialog"
      :selectedItem="selectedItem"
      @update:model-value="runFlowDialog = $event"
      @reload:flow="reloadFlow"
      @reload:tabular-flow="reloadTabularFlow"
    />

    <LoadingDialog
      :title="processingDialogTitle"
      :value="processingDialog"
      @update:model-value="processingDialog = $event"
      :progress-value="progressValue"
      :list-processing="listProcessing"
    />
  </private-view>
</template>

<script lang="ts">
import { defineComponent, ref, unref, Ref, computed, provide, toRefs } from "vue";
import { useStores, useApi, useLayout } from "@directus/extensions-sdk";
import { useRouter } from "vue-router";
import Draggable from "vuedraggable";
import SecureLS from "secure-ls";
import debounce from "lodash/debounce";
import { Collection, Field, Preset } from "@directus/types";

import { ICredential, IFlow, IFolder, IOperation, ProcessingItem } from "./types";
import { TRIGGER_TYPES } from "../constants";

import { formatDate, formatDateLong, getTimestamp } from "../utils/date.util";
import { generateRandomString, maskingText } from "../utils/string.util";
import { sleep } from "../utils/common.util";
import { transformData } from "../utils/flow.util";

import FlowItem from "./components/flow-item.vue";
import ContentNavigation from "./components/navigation.vue";
import RunManualFlowForm from "./components/run-manual-flow-form.vue";
import SearchInput from "./components/search-input.vue";
import LoadingDialog from "./components/loading-dialog.vue";
import CredentialDialog from "./components/credential-dialog.vue";
import DeleteDialog from "./components/delete-dialog.vue";
import PushToCloudDialog from "./components/push-to-cloud-dialog.vue";

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
  },

  props: {
    parentId: {
      type: String,
      default: null,
    },
  },

  setup(props) {
    const { useFlowsStore, useNotificationsStore, useCollectionsStore, useSettingsStore, useFieldsStore, usePresetsStore } = useStores();
    const flowsStore = useFlowsStore();
    const notificationsStore = useNotificationsStore();
    const collectionsStore = useCollectionsStore();
    const api = useApi();
    const router = useRouter();
    const settingsStore = useSettingsStore();
    const fieldsStore = useFieldsStore();
    const presetsStore = usePresetsStore();
    const { layoutWrapper } = useLayout(ref("tabular"));

    const { parentId } = toRefs(props);
    const flows = ref<IFlow[]>(flowsStore.flows);
    const { allCollections } = collectionsStore;
    const flowFields: Ref<Field[]> = ref(fieldsStore.getFieldsForCollection("directus_flows"));
    const settingFields: Ref<Field[]> = ref(fieldsStore.getFieldsForCollection("directus_settings"));
    const preset = ref<Preset>(presetsStore.getPresetForCollection("flow-manager"));
    const folderHeaders = ref([
      {
        text: "Name",
        value: "name",
        width: 400,
      },
    ]);

    const flowCategories = ref<IFolder[]>(
      (settingsStore.settings.flow_manager_categories || []).map((category: string | IFolder) => {
        if (typeof category === "string") {
          return {
            id: category,
            name: category,
            type: "category",
            icon: "folder",
            color: "",
            flow_manager_order: 0,
          };
        }

        return category;
      })
    );
    const selectedItems = ref<string[]>([]);
    const progressValue = ref(0);
    const listProcessing = ref<ProcessingItem[]>([]);
    const processingDialogTitle = ref("");
    const restoredFile = ref<HTMLInputElement | null>(null);
    const restoredFileObj: Ref<Partial<IFlow | IFlow[]>> = ref({});
    const restoreConfirmationDialog = ref(false);
    const errors: Ref<string[]> = ref([]);
    const flowDuplicatedName = ref("");
    const newCategoryName = ref("");
    const newCategoryColor = ref("");
    const selectedCredentialId = ref("");
    const tabularFlows = ref<IFlow[]>([]);
    const selectedCategory = ref<IFolder>({
      id: "",
      name: "",
      type: "category",
      icon: "folder",
      color: "",
    });
    const selectedItem = ref<IFlow | IFolder>({
      id: "",
      name: "",
      icon: "",
      color: "",
      description: "",
      trigger: "",
      options: {
        collections: [],
      },
      operations: [],
      operation: "",
      status: "",
      accountability: "",
      flow_manager_order: 0,
      flow_manager_category: "",
    });
    const selectedTextToCopy = ref("");
    const selectedShortcutFilter = ref({
      status: "all",
      trigger: "all",
      flow_manager_category: "all",
    });

    const installedVersion = ref("");
    const latestVersion = ref("");

    /*
      Flags stuff
    */
    const deleteItemDialog = ref(false);
    const runFlowDialog = ref(false);
    const processingDialog = ref(false);
    const settingDialog = ref(false);
    const credentialDialog = ref(false);
    const pushToCloudDialog = ref(false);

    const loadingDeleteItem = ref(false);
    const loadingRunFlow = ref(false);
    const loadingPushToCloud = ref(false);
    const isConfigurationLoading = ref(false);
    const isTabularFlowLoading = ref(false);

    const showSelect = ref(false);
    const isSelectAll = ref(false);
    const isBatchAction = ref(false);
    const isPreviousIdPersisted = ref(false);
    const isEditCategory = ref(false);

    const selectedFlows = computed<IFlow[]>(() => {
      return flows.value.filter((flow) => selectedItems.value.includes(flow.id));
    });
    const title = computed(() => {
      if (!parentId.value) {
        return "Flow Manager";
      }

      const currentParent =
        flows.value.find((flow) => flow.id === parentId.value) || flowCategories.value.find((category) => category.id === parentId.value);

      if (!currentParent) {
        return `Flow Manager - ${parentId.value}`;
      }

      return `Flow Manager - ${currentParent.name}`;
    });
    const iconName = computed(() => {
      if (!parentId.value) {
        return "bolt";
      }

      const currentParent: IFlow | IFolder | undefined =
        flows.value.find((flow) => flow.id === parentId.value) || flowCategories.value.find((category) => category.id === parentId.value);

      if (currentParent) {
        if ((currentParent as IFolder)?.type === "category") {
          return currentParent.icon || "folder";
        }

        return currentParent.icon || "bolt";
      }

      return "bolt";
    });
    const flowFieldConfiguration = computed(() => {
      let isOrderFieldConfigured = false;
      let isCategoryFieldConfigured = false;
      let isLastRunFieldConfigured = false;
      let isRunCounterFieldConfigured = false;

      for (const field of flowFields.value) {
        if (field.field === "flow_manager_order") {
          isOrderFieldConfigured = true;
        } else if (field.field === "flow_manager_category") {
          isCategoryFieldConfigured = true;
        } else if (field.field === "flow_manager_last_run_at") {
          isLastRunFieldConfigured = true;
        } else if (field.field === "flow_manager_run_counter") {
          isRunCounterFieldConfigured = true;
        }
      }

      const isConfigured = isOrderFieldConfigured && isCategoryFieldConfigured && isLastRunFieldConfigured && isRunCounterFieldConfigured;

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
        if (field.field === "flow_manager_categories") {
          isFieldConfigured = true;
        }
      }

      return isFieldConfigured;
    });

    const collectionMap: Record<string, Collection> = allCollections.reduce((acc: Record<string, Collection>, collection: Collection) => {
      acc[collection.collection] = collection;
      return acc;
    }, {});

    const tableSort = computed<{
      by: string;
      desc: boolean;
    }>({
      get: () => {
        const savedSort = preset.value?.layout_query?.sort;
        return savedSort || { by: "status", desc: false };
      },
      set(value) {
        preset.value = {
          ...(preset.value || {}),
          layout_query: {
            ...(preset.value.layout_query || {}),
            sort: value,
          },
        };
        updatePreset();
        return value;
      },
    });
    const tableFlowFilter = computed<Preset["filter"]>({
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
    const tableFlowSearch = computed<Preset["search"]>({
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
        if (typeof preset.value.layout_options?.viewListMode === "undefined") {
          return true;
        }
        return preset.value.layout_options?.viewListMode;
      },
      set(value) {
        preset.value = {
          ...(preset.value || {}),
          layout_options: {
            ...(preset.value.layout_options || {}),
            viewListMode: value,
          },
        };
        updatePreset();
        return value;
      },
    });

    const processedFlows = computed(() => {
      const numberFields = ["flow_manager_run_counter"];
      return flows.value.sort((a, b) => {
        const sort = tableSort.value;

        if (numberFields.includes(sort.by)) {
          const aValue = (a as unknown as Record<string, number>)[sort.by] || 0;
          const bValue = (b as unknown as Record<string, number>)[sort.by] || 0;
          return sort.desc ? bValue - aValue : aValue - bValue;
        }

        let aValue: string = (a as unknown as Record<string, string>)[sort.by] || "";
        let bValue: string = (b as unknown as Record<string, string>)[sort.by] || "";

        if (sort.by === "flow_manager_category") {
          const aCategory = folderMap.value[aValue]?.name || flowIdMap.value[aValue]?.name || aValue;
          const bCategory = folderMap.value[bValue]?.name || flowIdMap.value[bValue]?.name || bValue;

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
      reloadTabularFlow();
    }, 500);

    const createNewPreset = debounce(async () => {
      await presetsStore.savePreset({
        bookmark: null,
        collection: "flow-manager",
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
      reloadTabularFlow();
    }, 500);

    const headers = computed({
      get() {
        const savedHeaders = preset.value?.layout_options?.headers;
        const defaultWidth = 300;
        return (
          savedHeaders || [
            {
              text: "",
              value: "icon",
              width: 50,
              sortable: false,
            },
            {
              text: "Status",
              value: "status",
              sortable: true,
              width: defaultWidth,
            },
            {
              text: "Name",
              value: "name",
              sortable: true,
              width: defaultWidth,
            },
            {
              text: "Category",
              value: "flow_manager_category",
              sortable: true,
              width: defaultWidth,
            },
            {
              text: "Trigger Type",
              value: "trigger",
              sortable: true,
              width: defaultWidth,
            },
            {
              text: "Description",
              value: "description",
              sortable: true,
              width: defaultWidth,
            },
            {
              text: "Total Runs",
              value: "flow_manager_run_counter",
              sortable: true,
              width: defaultWidth,
            },
            {
              text: "Last Run",
              value: "flow_manager_last_run_at",
              sortable: true,
              width: defaultWidth,
            },
            {
              text: "Date Created",
              value: "date_created",
              sortable: true,
              width: defaultWidth,
            },
          ]
        );
      },
      set(value) {
        preset.value = {
          ...(preset.value || {}),
          layout_options: {
            ...(preset.value.layout_options || {}),
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
      }, {})
    );

    const folderMap = computed(() =>
      flowCategories.value.reduce((existingMap: Record<string, IFolder>, category: IFolder) => {
        const map = { ...existingMap };
        map[category.id] = category;
        return map;
      }, {})
    );

    const flowChildMap = computed(() => {
      const result: Record<string, (IFlow | IFolder)[]> = {};

      for (let i = 0; i < flows.value.length; i++) {
        const flow = flows.value[i];

        if (flow?.flow_manager_category) {
          if (!result[flow.flow_manager_category]) {
            result[flow.flow_manager_category] = [];
          }
          result[flow.flow_manager_category]?.push(flow);
        }
      }

      for (let i = 0; i < flowCategories.value.length; i++) {
        const category = flowCategories.value[i];

        if (category?.flow_manager_category) {
          if (!result[category.flow_manager_category]) {
            result[category.flow_manager_category] = [];
          }
          result[category.flow_manager_category]?.push(category);
        }
      }

      return result;
    });

    const usedCategoryList = computed(() => {
      const categories: Partial<IFolder>[] = [];

      const categoryKeys = Object.keys(flowChildMap.value);

      for (let i = 0; i < categoryKeys.length; i++) {
        const category = categoryKeys[i] || "";
        const isChildreensIsFlow = flowChildMap.value[category]?.some((item) => (item as IFolder).type !== "category");
        if (isChildreensIsFlow) {
          const categoryData = folderMap.value[category] || flowIdMap.value[category];
          categories.push({
            id: category,
            name: categoryData?.name || category,
            icon: categoryData?.icon || "folder",
            color: categoryData?.color || "",
          });
        }
      }

      return categories.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    });

    const rootFlows = computed<Partial<IFlow & IFolder>[]>(() => {
      if (!flowFieldConfiguration.value.isConfigured || !isSettingFieldConfigured.value) {
        return [...flows.value];
      }

      return [
        ...flowCategories.value.filter(
          (category: IFolder) =>
            !category.flow_manager_category ||
            (!folderMap.value[category.flow_manager_category] && !flowIdMap.value[category.flow_manager_category])
        ),
        ...flows.value.filter(
          (flow: IFlow) =>
            !flow.flow_manager_category || (!folderMap.value[flow.flow_manager_category] && !flowIdMap.value[flow.flow_manager_category])
        ),
      ].sort((a, b) => (a.flow_manager_order || 0) - (b.flow_manager_order || 0));
    });

    const currentFlows = computed<Partial<IFlow & IFolder>[]>(() => {
      if (parentId.value) {
        const childFlows = flowChildMap.value[parentId.value] || [];
        return childFlows.sort((a, b) => (a.flow_manager_order as number) - (b.flow_manager_order as number));
      }

      return [];
    });

    const allFlows = computed(() => {
      if (!flowFieldConfiguration.value.isConfigured || !isSettingFieldConfigured.value) {
        return [...flows.value] as IFlow[];
      }

      return [...flowCategories.value, ...flows.value] as IFlow[] | IFolder[];
    });

    const ls = new SecureLS({ encodingType: "aes" });
    const storedCredentials = ref<ICredential[]>(ls.get("flow_manager_credentials") || []);
    const credentials = computed({
      get() {
        return storedCredentials.value;
      },
      set(value) {
        ls.set("flow_manager_credentials", value);
        storedCredentials.value = value;
      },
    });
    const credentialOptions = computed(() => {
      return credentials.value.map((credential) => ({
        text: credential.name,
        value: credential.id,
      }));
    });

    // call this method on loaded
    reloadFlow();
    reloadTabularFlow();
    getLatestVersion();

    provide("flowManagerUtils", {
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
      configureFlowManagerField,
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
      parentId,
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
    };

    async function createFlow(item: Omit<IFlow, "id"> & { id?: string }) {
      try {
        const response = await api.post("/flows", {
          id: item.id,
          name: item.name,
          status: "inactive",
          icon: item.icon,
          accountability: item.accountability,
          description: item.description,
          trigger: item.trigger,
          options: item.options,
          color: item.color,
          flow_manager_category: item.flow_manager_category,
        });

        const payload = transformData(item.operations, response.data.data.id, item.operation);

        await api.patch(`/flows/${response.data.data.id}`, {
          operation: item.operation ? payload : null,
        });
      } catch (error) {
        throw error;
      }
    }

    async function duplicate(item: IFlow, isDuplicate = true) {
      try {
        const payload: Omit<IFlow, "id"> & { id?: string } = {
          id: !isDuplicate && isPreviousIdPersisted.value ? item.id : undefined,
          name: isDuplicate ? `${item.name} - Duplicated` : flowDuplicatedName.value,
          status: "inactive",
          icon: item.icon,
          accountability: item.accountability,
          description: item.description,
          trigger: item.trigger,
          options: item.options,
          color: item.color,
          flow_manager_category: item.flow_manager_category,
          operation: item.operation,
          operations: item.operations,
        };

        await createFlow(payload);

        await reloadFlow();
        await reloadTabularFlow();
        isPreviousIdPersisted.value = false;

        notificationsStore.add({
          type: "success",
          title: isDuplicate ? "Flow Duplicated successfully" : `Flow "${item.name}" restored successfully`,
          closeable: true,
          persist: true,
        });
      } catch (error) {
        notificationsStore.add({
          type: "error",
          title: isDuplicate ? "Flow Duplication failed" : `Failed to restore Flow "${item.name}"`,
          closeable: true,
          persist: true,
        });
      } finally {
        if (restoredFile.value) restoredFile.value.value = "";
      }
    }

    async function pushToCloud(credential: ICredential | null) {
      const item = selectedItem.value as IFlow;
      loadingPushToCloud.value = true;
      try {
        const response = await api.post("/flow-manager-endpoint/flow-manager/process", {
          url: `${credential?.url}/flows`,
          staticToken: credential?.staticToken,
          method: "POST",
          payload: {
            name: item.name,
            status: "inactive",
            icon: item.icon,
            accountability: item.accountability,
            description: item.description,
            trigger: item.trigger,
            options: item.options,
            color: item.color,
          },
        });

        const payload = transformData(item.operations, response.data.data.id, item.operation);

        await api.post("/flow-manager-endpoint/flow-manager/process", {
          url: `${credential?.url}/flows/${response.data.data.id}`,
          staticToken: credential?.staticToken,
          method: "PATCH",
          payload: {
            operation: item.operation ? payload : null,
          },
        });

        notificationsStore.add({
          type: "success",
          title: `The flow has been sent to the "${credential?.name}" successfully`,
          closeable: true,
          persist: true,
        });
      } catch (error) {
        notificationsStore.add({
          type: "error",
          title: "Send to cloud failed",
          closeable: true,
          persist: true,
        });
      } finally {
        pushToCloudDialog.value = false;
        selectedCredentialId.value = "";
        loadingPushToCloud.value = false;
      }
    }

    async function backup(item: IFlow | IFlow[]) {
      interface ISanitizedFlow extends Partial<Omit<IFlow, "operations">> {
        operations: Partial<IOperation>[];
      }

      let result: ISanitizedFlow | ISanitizedFlow[];
      let fileName: string = "";
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
            flow_manager_category: flow.flow_manager_category,
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
          flow_manager_category: item.flow_manager_category,
          accountability: item.accountability,
        };
        fileName = `flow-manager-${getTimestamp()}-${item.name}.json`;
      }
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      var fileObj = window.URL.createObjectURL(blob);

      var docUrl = document.createElement("a");
      docUrl.href = fileObj;
      docUrl.setAttribute("download", fileName);
      document.body.appendChild(docUrl);
      docUrl.click();
    }

    async function deleteItem() {
      if (isBatchAction.value) {
        if (!selectedItems.value.length) return;
        deleteItemDialog.value = false;
        processingDialogTitle.value = "Deleting Flows";
        processingDialog.value = true;
        listProcessing.value = [];
        progressValue.value = 0;
        let totalSuccess = 0;
        let totalError = 0;
        for (const item of selectedFlows.value) {
          try {
            await api.delete(`/flows/${item.id}`);
            listProcessing.value.push({
              status: "success",
              message: `Flow "${item.name}"`,
            });
            totalSuccess++;
          } catch (error) {
            listProcessing.value.push({
              status: "error",
              message: `Flow "${item.name}"`,
            });
            totalError++;
          }
          progressValue.value = Math.round((listProcessing.value.length / selectedFlows.value.length) * 100);
        }
        notificationsStore.add({
          type: "success",
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
        let type = "Flow";
        try {
          loadingDeleteItem.value = true;
          if ((selectedItem.value as IFolder).type === "category") {
            type = "Folder";
            deleteCategory(selectedItem.value as IFolder);
          } else {
            await api.delete(`/flows/${selectedItem.value.id}`);

            await flowsStore.hydrate();
            flows.value = unref(flowsStore.flows);
          }

          notificationsStore.add({
            type: "success",
            title: `${type} Deleted successfully`,
            closeable: true,
            persist: true,
          });
        } catch (error) {
          notificationsStore.add({
            type: "error",
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
                  if (["item-read", "item-create", "item-update", "item-delete"].includes(operation.type)) {
                    if (!collectionMap[operation.options.collection] && operation.options.collection !== "{{$trigger.collection}}") {
                      errors.value.push(`Collection "${operation.options.collection}"" does not exist on ${operation.name} operation`);
                    }
                  }
                }
              }
            }

            flowDuplicatedName.value = `{{original_name}} - Copy`;
          } else {
            if (!parsedResult?.trigger) {
              errors.value.push("Trigger is required");
            }

            if (!parsedResult?.options) {
              errors.value.push("Flow Options are required");
            }

            if (parsedResult?.operations) {
              for (const operation of parsedResult.operations) {
                if (["item-read", "item-create", "item-update", "item-delete"].includes(operation.type)) {
                  if (!collectionMap[operation.options.collection] && operation.options.collection !== "{{$trigger.collection}}") {
                    errors.value.push(`Collection "${operation.options.collection}"" does not exist on ${operation.name} operation`);
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
      router.push(`/settings/flows/${item.id}`);
    }

    async function onConfirmRestore() {
      restoreConfirmationDialog.value = false;
      if (Array.isArray(restoredFileObj.value)) {
        processingDialogTitle.value = "Restoring Flows";
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
              status: "inactive",
              icon: flow?.icon,
              color: flow?.color,
              description: flow?.description,
              trigger: flow?.trigger,
              options: flow?.options,
              operation: flow?.operation,
              operations: flow?.operations,
              flow_manager_category: flow?.flow_manager_category,
              accountability: flow?.accountability,
            });
            listProcessing.value.push({
              status: "success",
              message: `Flow "${flow?.name}"`,
            });
            totalSuccess++;
          } catch (error) {
            listProcessing.value.push({
              status: "error",
              message: `Flow "${flow?.name}"`,
            });
            totalError++;
          }
          progressValue.value = Math.round((listProcessing.value.length / restoredFileObj.value.length) * 100);
        }
        await reloadFlow();
        await reloadTabularFlow();
        isPreviousIdPersisted.value = false;
        notificationsStore.add({
          type: "success",
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
        flow_manager_category: string | null;
        flow_manager_order: number;
      }[] = [];

      const destination = group || parentId.value;

      for (let i = 0; i < updates.length; i++) {
        const item = updates[i];
        if (item?.type !== "category") {
          flowPayload.push({
            id: item?.id as string,
            flow_manager_category: destination,
            flow_manager_order: i + 1,
          });
        } else {
          patchCategory({
            id: item?.id as string,
            name: item?.name as string,
            type: "category",
            icon: item?.icon || "folder",
            color: item?.color as string,
            flow_manager_order: i + 1,
            flow_manager_category: destination as unknown as string,
          });
        }
      }

      settingsStore.updateSettings(
        {
          flow_manager_categories: flowCategories.value,
        },
        false
      );

      if (flowPayload.length) {
        await api.patch(`/flows`, flowPayload);
        await reloadFlow();
      }
    }

    async function configureFlowManagerField() {
      isConfigurationLoading.value = true;
      if (!flowFieldConfiguration.value.isCategoryFieldConfigured) {
        const payload = {
          field: "flow_manager_category",
          type: "string",
          schema: { default_value: null },
          meta: { interface: "input", special: null, hidden: true },
          collection: "directus_flows",
        };
        await fieldsStore.createField("directus_flows", payload);
      }

      if (!flowFieldConfiguration.value.isOrderFieldConfigured) {
        const payload = {
          field: "flow_manager_order",
          type: "integer",
          schema: { default_value: "0" },
          meta: { interface: "input", special: null, hidden: true },
          collection: "directus_flows",
        };
        await fieldsStore.createField("directus_flows", payload);
      }

      if (!isSettingFieldConfigured.value) {
        const payload = {
          field: "flow_manager_categories",
          type: "json",
          meta: { interface: "input-code", special: ["cast-json"], hidden: true },
          collection: "directus_settings",
        };
        await fieldsStore.createField("directus_settings", payload);
      }

      if (!flowFieldConfiguration.value.isLastRunFieldConfigured) {
        const payload = {
          field: "flow_manager_last_run_at",
          type: "dateTime",
          schema: { default_value: null },
          meta: { interface: "input-datetime", special: null, hidden: true },
          collection: "directus_flows",
        };
        await fieldsStore.createField("directus_flows", payload);
      }

      if (!flowFieldConfiguration.value.isRunCounterFieldConfigured) {
        const payload = {
          field: "flow_manager_run_counter",
          type: "integer",
          schema: { default_value: "0" },
          meta: { interface: "input", special: null, hidden: true },
          collection: "directus_flows",
        };
        await fieldsStore.createField("directus_flows", payload);
      }

      await fieldsStore.hydrate();
      flowFields.value = fieldsStore.getFieldsForCollection("directus_flows");
      settingFields.value = fieldsStore.getFieldsForCollection("directus_settings");
      isConfigurationLoading.value = false;
    }

    function patchCategory(item: IFolder) {
      let categoryIndex = flowCategories.value.findIndex((category) => category.id === item.id);
      const payload: Partial<IFolder> = {};

      if (typeof item.name === "string") {
        payload.name = item.name;
      }

      if (typeof item.icon === "string") {
        payload.icon = item.icon;
      }

      if (typeof item.color === "string") {
        payload.color = item.color;
      }

      if (typeof item.flow_manager_order === "number") {
        payload.flow_manager_order = item.flow_manager_order;
      }

      if (typeof item.flow_manager_category !== "undefined") {
        payload.flow_manager_category = item.flow_manager_category;
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
        if (categoryIndex !== -1 && flowCategories.value[categoryIndex]?.id === flowCategories.value[categoryIndex]?.name) {
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
            type: "category",
            icon: selectedCategory.value.icon || "folder",
            color: selectedCategory.value.color,
            flow_manager_category: "",
            flow_manager_order: 0,
          },
        ];
      } else {
        patchCategory({
          id: selectedCategory.value.id,
          name: selectedCategory.value.name,
          type: "category",
          icon: selectedCategory.value.icon || "folder",
          color: selectedCategory.value.color,
          flow_manager_category: selectedCategory.value.flow_manager_category,
          flow_manager_order: selectedCategory.value.flow_manager_order,
        });

        isEditCategory.value = false;
      }

      selectedCategory.value = {
        id: "",
        name: "",
        type: "category",
        icon: "folder",
        color: "",
      };

      settingsStore.updateSettings(
        {
          flow_manager_categories: flowCategories.value,
        },
        false
      );
    }

    async function deleteCategory(category: IFolder) {
      let isValidToDelete = false;
      let deletedIndex = flowCategories.value.findIndex((flowCategory) => flowCategory.id === category.id);

      if (deletedIndex !== -1) {
        isValidToDelete = true;
      } else {
        /**
         * TODO: Will be deprecated in the future
         */
        deletedIndex = flowCategories.value.findIndex((flowCategory) => flowCategory.name === category.name);
        if (deletedIndex !== -1 && flowCategories.value[deletedIndex]?.id === flowCategories.value[deletedIndex]?.name) {
          isValidToDelete = true;
        }
      }

      if (isValidToDelete) {
        if (selectedCategory.value.id === flowCategories.value[deletedIndex]?.id) {
          selectedCategory.value = {
            id: "",
            name: "",
            type: "category",
            icon: "folder",
            color: "",
          };
        }

        flowCategories.value.splice(deletedIndex, 1);

        settingsStore.updateSettings(
          {
            flow_manager_categories: flowCategories.value,
          },
          false
        );
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
        type: "category",
        icon: item.icon,
        color: item.color,
        flow_manager_category: item.flow_manager_category,
        flow_manager_order: item.flow_manager_order,
      };
    }

    function cancelEditCategory() {
      isEditCategory.value = false;
      selectedCategory.value = {
        id: "",
        name: "",
        type: "category",
        icon: "folder",
        color: "",
      };
    }

    function duplicateFolder(item: IFolder) {
      flowCategories.value = [
        ...flowCategories.value,
        {
          id: generateRandomString(10),
          name: `${item.name} - Duplicated`,
          type: "category",
          icon: item.icon,
          color: item.color,
          flow_manager_category: item.flow_manager_category,
        },
      ];

      settingsStore.updateSettings(
        {
          flow_manager_categories: flowCategories.value,
        },
        false
      );
    }

    function showEditFolderDialog(item: IFolder) {
      isEditCategory.value = true;
      selectedCategory.value = {
        id: item.id,
        name: item.name,
        type: "category",
        icon: item.icon,
        color: item.color,
      };
      settingDialog.value = true;
    }

    function selectItem(item: IFlow | IFolder) {
      selectedItem.value = item;
    }

    async function reloadFlow() {
      await flowsStore.hydrate();
      flows.value = unref(flowsStore.flows);
    }

    async function reloadTabularFlow() {
      try {
        let sort = "id";
        if (tableSort.value) {
          sort = tableSort.value.by;
          if (tableSort.value.desc) {
            sort = `-${sort}`;
          }
        }
        const fields = ["*", "operations.*"];

        const response = await api.get("/flows", {
          params: {
            fields: fields.join(","),
            sort,
            filter: tableFlowFilter.value,
            search: tableFlowSearch.value,
          },
        });

        tabularFlows.value = response.data.data;
      } catch (error) {
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
      if (folderMap.value[categoryId || ""]?.name) {
        return `${folderMap.value[categoryId || ""]?.name} (${categoryId})`;
      }
      if (flowIdMap.value[categoryId]?.name) {
        return `${flowIdMap.value[categoryId]?.name} (${categoryId})`;
      }

      return categoryId;
    }

    function getCategoryIcon(categoryId: string) {
      if (!categoryId) {
        return {
          name: "",
        };
      }
      if (folderMap.value[categoryId || ""]?.icon) {
        return {
          name: folderMap.value[categoryId || ""]?.icon,
          color: folderMap.value[categoryId || ""]?.color,
        };
      }
      if (flowIdMap.value[categoryId]?.icon) {
        return {
          name: flowIdMap.value[categoryId]?.icon,
          color: flowIdMap.value[categoryId]?.color,
        };
      }

      return {
        name: "folder",
      };
    }

    function onContextMenuTable(text: string) {
      selectedTextToCopy.value = text;
    }

    async function copySelectedTextToClipboard() {
      await navigator.clipboard.writeText(selectedTextToCopy.value);
    }

    function setStatusFilter(status: string) {
      const filteredAnd = (tableFlowFilter.value as any)?._and?.filter((filter: any) => Object.keys(filter)[0] !== "status") || [];
      if (status !== "all") {
        filteredAnd.push({
          status: {
            _eq: status,
          },
        });
      }
      tableFlowFilter.value = {
        ...tableFlowFilter.value,
        _and: filteredAnd,
      };
      selectedShortcutFilter.value.status = status;
      updatePreset();
    }

    function setTriggerFilter(trigger: string) {
      const filteredAnd = (tableFlowFilter.value as any)?._and?.filter((filter: any) => Object.keys(filter)[0] !== "trigger") || [];
      if (trigger !== "all") {
        filteredAnd.push({
          trigger: {
            _eq: trigger,
          },
        });
      }
      tableFlowFilter.value = {
        ...tableFlowFilter.value,
        _and: filteredAnd,
      };
      selectedShortcutFilter.value.trigger = trigger;
      updatePreset();
    }

    function setCategoryFilter(category: string) {
      const filteredAnd =
        (tableFlowFilter.value as any)?._and?.filter((filter: any) => Object.keys(filter)[0] !== "flow_manager_category") || [];
      if (category !== "all") {
        filteredAnd.push({
          flow_manager_category: {
            _eq: category,
          },
        });
      }
      tableFlowFilter.value = {
        ...tableFlowFilter.value,
        _and: filteredAnd,
      };
      selectedShortcutFilter.value.flow_manager_category = category;
      updatePreset();
    }

    async function getLatestVersion() {
      try {
        const {
          data: { data: installedExtensions },
        } = await api.get("/extensions");

        const extension = installedExtensions.find(
          (extension: any) =>
            (extension.name === "directus-extension-flow-manager" || extension.schema?.name === "directus-extension-flow-manager") &&
            extension.schema?.type === "bundle"
        );

        installedVersion.value = extension?.schema.version;

        if (installedVersion.value) {
          const { data } = await api.post("/flow-manager-endpoint/flow-manager/process", {
            url: "https://registry.npmjs.org/directus-extension-flow-manager",
          });

          const latestTag = data?.["dist-tags"]?.latest;

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
              .filter((flow: IFlow) => flow.flow_manager_category === parentId.value)
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
      processingDialogTitle.value = "Duplicating Flows";
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
                status: "inactive",
                icon: item.icon,
                accountability: item.accountability,
                description: item.description,
                trigger: item.trigger,
                options: item.options,
                color: item.color,
                flow_manager_category: item.flow_manager_category,
                operation: item.operation,
                operations: item.operations,
              });
              listProcessing.value.push({
                status: "success",
                message: `Flow "${item.name}"`,
              });
              totalSuccess++;
            } catch {
              listProcessing.value.push({
                status: "error",
                message: `Flow "${item.name}"`,
              });
              totalError++;
            }
            progressValue.value = Math.round((listProcessing.value.length / selectedItems.value.length) * 100);
          }
        }
        notificationsStore.add({
          type: "success",
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

<style lang="scss">
.main-table > .v-table > table > .table-header > tr > .select.cell[scope="col"] > button {
  display: none;
}

.container.right {
  z-index: 600;
}
</style>

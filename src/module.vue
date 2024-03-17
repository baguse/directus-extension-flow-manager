<template>
  <private-view :title="title">
    <v-table v-if="false" :items="flows" v-model:headers="headers" @click:row="goToFlow">
      <template #[`item.icon`]="{ item }">
        <v-icon v-if="item.icon" :name="item.icon" />
      </template>
      <template #[`item.status`]="{ item }">
        <v-chip rounded :class="item.status === 'active' ? 'active-chip' : 'inactive-chip'">{{ item.status }}</v-chip>
      </template>

      <template #item-append="{ item }">
        <v-menu placement="bottom-end" show-arrow :close-on-content-click="true">
          <template #activator="{ toggle }">
            <v-icon name="more_vert" class="ctx-toggle" @click="toggle" />
          </template>

          <v-list>
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
          </v-list>
        </v-menu>
      </template>
    </v-table>

    <template #actions>
      <v-button v-tooltip.bottom="'Settings'" rounded icon @click="settingDialog = true">
        <v-icon name="settings" />
      </v-button>
      <v-button
        v-tooltip.bottom="'Credentials'"
        rounded
        icon
        @click="
          credentialDialog = true;
          isEdit = false;
        "
      >
        <v-icon name="database" />
      </v-button>
      <v-button v-tooltip.bottom="'Restore'" rounded icon @click="onRestoreButtonClicked">
        <v-icon name="file_upload" />
      </v-button>
    </template>

    <template #navigation>
      <content-navigation :root-flows="rootFlows" :flow-child-map="flowChildMap" :all-flows="allFlows" />
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
            :disabled="restoredFileObj.id ? false : true"
            @update:model-value="isPreviousIdPersisted = $event"
          />
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
            <v-table :headers="folderHeaders" :items="flowCategories">
              <template #[`item.name`]="{ item }">
                {{ item }}
              </template>
              <template #item-append="{ item }">
                <v-icon
                  class="button-delete-category"
                  name="delete"
                  color="var(--danger)"
                  @click="deleteCategory(item)"
                  v-tooltip.bottom="'Delete Category'"
                />
              </template>
            </v-table>
            <v-input placeholder="Category Name" v-model="newCategoryName" v-tooltip.bottom="'Category Name'">
              <template #append>
                <v-button small icon rounded @click="addCategory">
                  <v-icon name="add" />
                </v-button>
              </template>
            </v-input>
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

    <v-dialog :model-value="credentialDialog" :persistent="true" @update:model-value="credentialDialog = false">
      <v-card>
        <v-card-title>Credentials</v-card-title>
        <v-card-text>
          <v-table :headers="credentialHeaders" :items="credentials">
            <!-- <template #[`item.name`]="{ item }">
              {{ item }}
            </template> -->
            <template #item-append="{ item }">
              <v-icon
                class="button-delete-category"
                name="edit"
                color="var(--warning)"
                @click="selectCredential(item)"
                v-tooltip.bottom="'Edit Credential'"
              />
              <v-icon
                class="button-delete-category"
                name="delete"
                color="var(--danger)"
                @click="deleteCredential(item)"
                v-tooltip.bottom="'Delete Credential'"
              />
            </template>
          </v-table>
          <v-input placeholder="Name" v-model="credentialName" v-tooltip.bottom="'Credential Name'" class="input-form">
            <!-- <template #append>
              <v-button small icon rounded @click="addCategory">
                <v-icon name="add" />
              </v-button>
            </template> -->
          </v-input>
          <v-input placeholder="URL" v-model="credentialUrl" v-tooltip.bottom="'Credential URL'" class="input-form"></v-input>
          <v-input
            :placeholder="isEdit ? '(Unchanged)' : 'Static Token'"
            v-model="credentialStaticToken"
            v-tooltip.bottom="'Credential Static Token'"
            class="input-form"
          ></v-input>
          <v-button @click="saveCredential">
            {{ isEdit ? "Save" : "Add" }}
          </v-button>
          <v-button secondary v-if="isEdit" class="ml-2" @click="cancelEditCredential"> Cancel </v-button>
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="credentialDialog = false"> Close </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="pushToCloudDialog" :persistent="true" @update:model-value="pushToCloudDialog = false">
      <v-card>
        <v-card-title>Push to Cloud</v-card-title>
        <v-card-text>
          <v-select v-model="selectedCredentialId" :items="credentialOptions"></v-select>
          <div>URL: {{ selectedCredentialForPushToCloud?.url || "-" }}</div>
          <div>Static Token: {{ maskingText(selectedCredentialForPushToCloud?.staticToken) || "-" }}</div>
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="pushToCloudDialog = false"> Close </v-button>
          <v-button :disabled="!selectedCredentialForPushToCloud" @click="pushToCloud" :loading="loadingPushToCloud"> Proceed </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="deleteFlowDialog" :persistent="true" @update:model-value="deleteFlowDialog = false">
      <v-card>
        <v-card-title>Delete Flow</v-card-title>
        <v-card-text>
          Are you sure you want to delete [<span class="bold-text">{{ selectedFlow.name }}</span
          >] flow?
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="deleteFlowDialog = false"> Close </v-button>
          <v-button :disabled="!selectedFlow" @click="deleteFlow" :loading="loadingDeleteFlow"> Proceed </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-list class="draggable-list">
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
            <flow-item :item="element" :items="flows" @update:sort="($event: any) => onSort($event)" />
          </div>
        </template>
      </draggable>
    </v-list>
  </private-view>
</template>

<script lang="ts">
import { defineComponent, ref, unref, Ref, computed, provide } from "vue";
import { useStores, useApi } from "@directus/extensions-sdk";
import { useRouter } from "vue-router";
import Draggable from "vuedraggable";
import { ICredential, IFlow, IFolder, IOperation, IPayload } from "./types";
import FlowItem from "./components/flow-item.vue";
import { Field } from "@directus/types";
import SecureLS from "secure-ls";
import ContentNavigation from "./components/navigation.vue";
import { toRefs } from "vue";

export default defineComponent({
  components: {
    Draggable,
    FlowItem,
    ContentNavigation,
  },

  props: {
    parentId: {
      type: String,
      default: null,
    },
  },

  setup(props) {
    const { useFlowsStore, useNotificationsStore, useCollectionsStore, useSettingsStore, useFieldsStore } = useStores();
    const { parentId } = toRefs(props);
    const flowsStore = useFlowsStore();
    const notificationsStore = useNotificationsStore();
    const collectionsStore = useCollectionsStore();
    const api = useApi();
    const router = useRouter();
    const settingsStore = useSettingsStore();
    const fieldsStore = useFieldsStore();

    const flowCategories = ref<string[]>(settingsStore.settings.flow_manager_categories || []);
    const flows = ref<IFlow[]>(flowsStore.flows);
    const { allCollections } = collectionsStore;
    const flowFields: Ref<Field[]> = ref(fieldsStore.getFieldsForCollection("directus_flows"));
    const settingFields: Ref<Field[]> = ref(fieldsStore.getFieldsForCollection("directus_settings"));
    const deleteFlowDialog = ref(false);
    const loadingDeleteFlow = ref(false);

    const title = computed(() => {
      if (!parentId.value) {
        return "Flow Manager";
      }

      const currentParent = flows.value.find((flow) => flow.id === parentId.value);

      if (!currentParent) {
        return `Flow Manager - ${parentId.value}`;
      }

      return `Flow Manager - ${currentParent.name}`;
    });

    const flowFieldConfiguration = computed(() => {
      let isOrderFieldConfigured = false;
      let isCategoryFieldConfigured = false;
      for (const field of flowFields.value) {
        if (field.field === "flow_manager_order") {
          isOrderFieldConfigured = true;
        } else if (field.field === "flow_manager_category") {
          isCategoryFieldConfigured = true;
        }
      }

      return {
        isConfigured: isOrderFieldConfigured && isCategoryFieldConfigured,
        isOrderFieldConfigured,
        isCategoryFieldConfigured,
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

    const collectionMap: Record<string, boolean> = allCollections.reduce(
      (acc: Record<string, boolean>, collection: { collection: string }) => {
        acc[collection.collection] = true;
        return acc;
      },
      {}
    );

    const restoredFile = ref<HTMLInputElement | null>(null);
    const restoredFileObj: Ref<Partial<IFlow>> = ref({});
    const restoreConfirmationDialog = ref(false);
    const errors: Ref<string[]> = ref([]);

    const headers = ref([
      {
        text: "",
        value: "icon",
        width: 50,
        sortable: false,
      },
      {
        text: "Status",
        value: "status",
      },
      {
        text: "Name",
        value: "name",
        width: 400,
      },
    ]);

    const folderHeaders = ref([
      {
        text: "Name",
        value: "name",
      },
    ]);

    const credentialHeaders = ref([
      {
        text: "Name",
        value: "name",
      },
      {
        text: "URL",
        value: "url",
      },
    ]);

    const flowDuplicatedName = ref("");
    const isPreviousIdPersisted = ref(false);
    const settingDialog = ref(false);
    const credentialDialog = ref(false);
    const isConfigurationLoading = ref(false);
    const newCategoryName = ref("");
    const credentialName = ref("");
    const credentialUrl = ref("");
    const credentialStaticToken = ref("");
    const isEdit = ref(false);
    const selectedCredential = ref<ICredential>({
      id: "",
      name: "",
      url: "",
      staticToken: "",
    });
    const loadingPushToCloud = ref(false);
    const selectedCredentialId = ref("");
    const selectedCredentialForPushToCloud = computed(() => {
      return credentials.value.find((credential) => credential.id === selectedCredentialId.value);
    });
    const pushToCloudDialog = ref(false);
    const selectedFlow = ref<IFlow>({
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

    const ls = new SecureLS({ encodingType: "aes" });
    const credentials = ref<ICredential[]>([]);
    const storedCredentials = ls.get("flow_manager_credentials") as ICredential[];
    if (Array.isArray(storedCredentials)) {
      credentials.value.push(...storedCredentials);
    }
    const credentialOptions = computed(() => {
      return credentials.value.map((credential) => ({
        text: credential.name,
        value: credential.id,
      }));
    });

    const flowIdMap = computed(() =>
      flows.value.reduce((existingMap: Record<string, boolean>, flow: IFlow) => {
        const map = { ...existingMap };
        map[flow.id] = true;
        return map;
      }, {})
    );

    const folderMap = computed(() =>
      flowCategories.value.reduce((existingMap: Record<string, boolean>, categoryName: string) => {
        const map = { ...existingMap };
        map[categoryName] = true;
        return map;
      }, {})
    );

    const flowChildMap = computed(() => {
      const result: Record<string, IFlow[]> = {};

      for (let i = 0; i < flows.value.length; i++) {
        const flow = flows.value[i];

        if (flow?.flow_manager_category) {
          if (!result[flow.flow_manager_category]) {
            result[flow.flow_manager_category] = [];
          }
          result[flow.flow_manager_category]?.push(flow);
        }
      }

      return result;
    });

    const rootFlows = computed<Partial<IFlow & IFolder>[]>(() => {
      if (!flowFieldConfiguration.value.isConfigured || !isSettingFieldConfigured.value) {
        return [...flows.value];
      }

      return [
        ...flowCategories.value
          .sort((a, b) => a.localeCompare(b))
          .map(
            (category: string) =>
              ({
                id: category,
                name: category,
                type: "category",
                icon: "folder",
                flow_manager_order: 0,
                color: "",
              } as IFolder)
          ),
        ...flows.value
          .filter(
            (flow: IFlow) =>
              !flow.flow_manager_category || (!folderMap.value[flow.flow_manager_category] && !flowIdMap.value[flow.flow_manager_category])
          )
          .sort((a, b) => (a.flow_manager_order as number) - (b.flow_manager_order as number)),
      ];
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

      return [
        ...flowCategories.value.map(
          (category: string) =>
            ({
              id: category,
              name: category,
              type: "category",
              icon: "folder",
              flow_manager_order: 0,
              color: "",
            } as IFolder)
        ),
        ...flows.value,
      ] as IFlow[] | IFolder[];
    });
    provide("flowManagerUtils", {
      duplicate,
      backup,
      pushToCloud,
      showPushToCloud,
      onSort,
      showDeleteFlowDialog,
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
      addCategory,
      deleteCategory,
      credentialDialog,
      credentials,
      credentialHeaders,
      credentialName,
      credentialUrl,
      credentialStaticToken,
      isEdit,
      saveCredential,
      selectCredential,
      deleteCredential,
      cancelEditCredential,
      pushToCloudDialog,
      selectedCredentialId,
      credentialOptions,
      selectedCredentialForPushToCloud,
      maskingText,
      pushToCloud,
      loadingPushToCloud,
      flowChildMap,
      title,
      parentId,
      allFlows,
      deleteFlowDialog,
      selectedFlow,
      loadingDeleteFlow,
      deleteFlow,
    };

    function transformData(list: IOperation[], flowId: string, flowTriggerId: string) {
      const result: Partial<IPayload> = {};

      function findItemById(id: string | null) {
        return list.find((item) => item.id === id);
      }

      function buildNestedObject(item?: IOperation) {
        if (!item) {
          return null;
        }

        const nestedObject: IPayload = {
          name: item.name,
          position_x: item.position_x,
          position_y: item.position_y,
          key: item.key,
          type: item.type,
          options: item.options,
          flow: flowId,
          resolve: buildNestedObject(findItemById(item.resolve)),
          reject: buildNestedObject(findItemById(item.reject)),
        };

        return nestedObject;
      }

      const firstItem = findItemById(flowTriggerId);
      result.name = firstItem?.name;
      result.position_x = firstItem?.position_x;
      result.position_y = firstItem?.position_y;
      result.key = firstItem?.key;
      result.type = firstItem?.type;
      result.options = firstItem?.options;
      result.flow = flowId;
      result.resolve = buildNestedObject(findItemById(firstItem?.resolve || null));
      result.reject = buildNestedObject(findItemById(firstItem?.reject || null));

      return result;
    }

    async function duplicate(item: IFlow, isDuplicate = true) {
      try {
        const response = await api.post("/flows", {
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
        });

        const payload = transformData(item.operations, response.data.data.id, item.operation);

        await api.patch(`/flows/${response.data.data.id}`, {
          operation: item.operation ? payload : null,
        });

        await flowsStore.hydrate();
        flows.value = unref(flowsStore.flows);
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

    async function pushToCloud() {
      const item = selectedFlow.value;
      loadingPushToCloud.value = true;
      try {
        const response = await api.post("/directus-extension-flow-manager-endpoint/flow-manager/process", {
          url: `${selectedCredentialForPushToCloud?.value?.url}/flows`,
          staticToken: selectedCredentialForPushToCloud?.value?.staticToken,
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

        await api.post("directus-extension-flow-manager-endpoint/flow-manager/process", {
          url: `${selectedCredentialForPushToCloud?.value?.url}/flows/${response.data.data.id}`,
          staticToken: selectedCredentialForPushToCloud?.value?.staticToken,
          method: "PATCH",
          payload: {
            operation: item.operation ? payload : null,
          },
        });

        notificationsStore.add({
          type: "success",
          title: `The flow has been sent to the "${selectedCredentialForPushToCloud?.value?.name}" successfully`,
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

    function getTimestamp() {
      const date = new Date();
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const hour = date.getHours().toString().padStart(2, "0");
      const minute = date.getMinutes().toString().padStart(2, "0");
      const second = date.getSeconds().toString().padStart(2, "0");

      return `${year}${month}${day}${hour}${minute}${second}`;
    }

    async function backup(item: IFlow) {
      interface ISanitizedFlow extends Partial<Omit<IFlow, "operations">> {
        operations: Partial<IOperation>[];
      }
      const sanitizedFlow: ISanitizedFlow = {
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
      };
      const blob = new Blob([JSON.stringify(sanitizedFlow, null, 2)], { type: "application/json" });
      var fileObj = window.URL.createObjectURL(blob);

      var docUrl = document.createElement("a");
      docUrl.href = fileObj;
      docUrl.setAttribute("download", `${getTimestamp()}-${item.name}.json`);
      document.body.appendChild(docUrl);
      docUrl.click();
    }

    async function deleteFlow() {
      if (!selectedFlow.value) return;
      try {
        loadingDeleteFlow.value = true;
        await api.delete(`/flows/${selectedFlow.value.id}`);

        await flowsStore.hydrate();
        flows.value = unref(flowsStore.flows);

        notificationsStore.add({
          type: "success",
          title: "Flow Deleted successfully",
          closeable: true,
          persist: true,
        });
      } catch (error) {
        notificationsStore.add({
          type: "error",
          title: "Flow Deletion failed",
          closeable: true,
          persist: true,
        });
      } finally {
        loadingDeleteFlow.value = false;
        deleteFlowDialog.value = false;
      }
    }

    function showDeleteFlowDialog(item: IFlow) {
      selectedFlow.value = item;
      deleteFlowDialog.value = true;
    }

    function onRestoredFileChanged($event: Event) {
      const file: File | undefined = ($event?.target as HTMLInputElement)?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const result = e.target?.result;
          const parsedResult = JSON.parse(result as string) as IFlow;

          errors.value = [];

          if (!parsedResult?.trigger) {
            errors.value.push("Trigger is required");
          }

          if (!parsedResult?.options) {
            errors.value.push("Flow Options are required");
          }

          if (parsedResult?.operations) {
            for (const operation of parsedResult.operations) {
              if (["item-read", "item-create", "item-update", "item-delete"].includes(operation.type)) {
                if (!collectionMap[operation.options.collection]) {
                  errors.value.push(`Collection "${operation.options.collection}"" does not exist on ${operation.name} operation`);
                }
              }
            }
          }

          restoreConfirmationDialog.value = true;
          restoredFileObj.value = parsedResult;

          flowDuplicatedName.value = `${parsedResult.name} - Copy`;
          if (parsedResult.id) {
            isPreviousIdPersisted.value = true;
          } else {
            isPreviousIdPersisted.value = false;
          }
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

    function onConfirmRestore() {
      duplicate(restoredFileObj.value as IFlow, false);
      restoreConfirmationDialog.value = false;
    }

    async function onSort(updates: (IFlow & IFolder)[], group: string | null = null) {
      const payloads = updates
        .filter((row) => row.type !== "category")
        .map((row, index) => ({
          id: row.id,
          flow_manager_category: group,
          flow_manager_order: index + 1,
        }));

      await api.patch(`/flows`, payloads);
      await flowsStore.hydrate();
      flows.value = unref(flowsStore.flows);
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
          schema: { default_value: "[]" },
          meta: { interface: "input-code", special: ["cast-json"], hidden: true },
          collection: "directus_settings",
        };
        await fieldsStore.createField("directus_settings", payload);
      }

      await fieldsStore.hydrate();
      flowFields.value = fieldsStore.getFieldsForCollection("directus_flows");
      settingFields.value = fieldsStore.getFieldsForCollection("directus_settings");
      isConfigurationLoading.value = false;
    }

    async function addCategory() {
      if (!newCategoryName.value) return;

      if (flowCategories.value.includes(newCategoryName.value)) {
        notificationsStore.add({
          type: "error",
          title: `Category "${newCategoryName.value}" already exists`,
          closeable: true,
          persist: true,
        });
        return;
      }
      flowCategories.value.push(newCategoryName.value);
      newCategoryName.value = "";

      settingsStore.updateSettings(
        {
          flow_manager_categories: flowCategories.value,
        },
        false
      );
    }

    async function deleteCategory(categoryName: string) {
      const deletedIndex = flowCategories.value.findIndex((category) => category === categoryName);

      if (deletedIndex !== -1) {
        flowCategories.value.splice(deletedIndex, 1);
      }

      settingsStore.updateSettings(
        {
          flow_manager_categories: flowCategories.value,
        },
        false
      );
    }

    function generateRandomString(length: number) {
      let result = "";
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const charactersLength = characters.length;
      for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
      }
      return result;
    }

    function saveCredential() {
      if (isEdit.value) {
        const credentialIndex = credentials.value.findIndex((credential) => credential.id === selectedCredential.value.id);
        if (credentialIndex !== -1) {
          (credentials.value[credentialIndex] as ICredential).name = credentialName.value;
          (credentials.value[credentialIndex] as ICredential).url = credentialUrl.value;
          if (credentialStaticToken.value) {
            (credentials.value[credentialIndex] as ICredential).staticToken = credentialStaticToken.value;
          } else {
            (credentials.value[credentialIndex] as ICredential).staticToken = selectedCredential.value.staticToken;
          }
        }

        ls.set("flow_manager_credentials", credentials.value);
        credentialName.value = "";
        credentialUrl.value = "";
        credentialStaticToken.value = "";
        isEdit.value = false;
        selectedCredential.value = {
          id: "",
          name: "",
          url: "",
          staticToken: "",
        };
      } else {
        credentials.value.push({
          id: generateRandomString(10),
          name: credentialName.value,
          url: credentialUrl.value,
          staticToken: credentialStaticToken.value,
        });

        ls.set("flow_manager_credentials", credentials.value);
        credentialName.value = "";
        credentialUrl.value = "";
        credentialStaticToken.value = "";
      }
    }

    function selectCredential(item: ICredential) {
      isEdit.value = true;
      selectedCredential.value = item;
      credentialName.value = item.name;
      credentialUrl.value = item.url;
    }

    function deleteCredential(item: ICredential) {
      const credentialIndex = credentials.value.findIndex((credential) => credential.id === item.id);
      if (credentialIndex !== -1) {
        const credential = credentials.value[credentialIndex];
        if (credential?.id === selectedCredential.value.id) {
          isEdit.value = false;
          selectedCredential.value = {
            id: "",
            name: "",
            url: "",
            staticToken: "",
          };
          credentialName.value = "";
          credentialUrl.value = "";
          credentialStaticToken.value = "";
        }
        credentials.value.splice(credentialIndex, 1);
      }

      ls.set("flow_manager_credentials", credentials.value);
    }

    function cancelEditCredential() {
      isEdit.value = false;
      selectedCredential.value = {
        id: "",
        name: "",
        url: "",
        staticToken: "",
      };
      credentialName.value = "";
      credentialUrl.value = "";
      credentialStaticToken.value = "";
    }

    function showPushToCloud(item: IFlow) {
      selectedFlow.value = item;
      pushToCloudDialog.value = true;
    }

    function maskingText(text?: string) {
      if (!text) {
        return text;
      }
      if (text.length <= 4) {
        return text;
      }
      const maskedText = text.slice(0, 2) + "*".repeat(text.length - 4) + text.slice(text.length - 2);
      return maskedText;
    }
  },
});
</script>

<style lang="scss" scoped>
.active-chip {
  background-color: var(--primary);
}

.inactive-chip {
  background-color: var(--foreground-subdued);
}

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

.button-delete-category {
  cursor: pointer;
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
</style>

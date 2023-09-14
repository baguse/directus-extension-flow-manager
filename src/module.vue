<template>
  <private-view title="Flow Manager">
    <v-table :items="flows" v-model:headers="headers" @click:row="goToFlow">
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
      <v-button v-tooltip.bottom="'Restore'" rounded icon @click="onRestoreButtonClicked">
        <v-icon name="file_upload" />
      </v-button>
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
  </private-view>
</template>

<script lang="ts">
import { defineComponent, ref, unref, Ref } from "vue";
import { useStores, useApi } from "@directus/extensions-sdk";
import { useRouter } from "vue-router";

interface IOperation {
  id: string;
  name: string;
  key: string;
  type: string;
  position_x: number;
  position_y: number;
  options: any;
  resolve: string | null;
  reject: string | null;
  flow: string;
}

interface IPayload {
  name: string;
  key: string;
  type: string;
  position_x: number;
  position_y: number;
  options: any;
  resolve: IPayload | null;
  reject: IPayload | null;
  flow: string;
}

interface IFlow {
  id: string;
  name: string;
  icon: string;
  color: null;
  description: null;
  status: string;
  trigger: string;
  accountability: string;
  options: { type: string; scope: string[]; collections: string[] };
  operation: string;
  date_created: "2023-06-26T17:09:53.274Z";
  user_created: "8c4a648e-110d-493f-830a-48054a1d9109";
  operations: IOperation[];
}
export default defineComponent({
  setup() {
    const { useFlowsStore, useNotificationsStore, useCollectionsStore } = useStores();
    const flowsStore = useFlowsStore();
    const notificationsStore = useNotificationsStore();
    const collectionsStore = useCollectionsStore();
    const api = useApi();
    const router = useRouter();

    const flows = ref(flowsStore.flows);
    const { allCollections } = collectionsStore;

    const collectionMap: Record<string, boolean> = allCollections.reduce(
      (acc: Record<string, boolean>, collection: { collection: string }) => {
        acc[collection.collection] = true;
        return acc;
      },
      {}
    );

    const restoredFile = ref(null);
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

    const flowDuplicatedName = ref("");
    const isPreviousIdPersisted = ref(false);

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
    };

    async function duplicate(item: IFlow, isDuplicate = true) {
      try {
        const response = await api.post("/flows", {
          id: !isDuplicate && isPreviousIdPersisted.value ? item.id : undefined,
          name: isDuplicate ? item.name : flowDuplicatedName.value,
          status: "inactive",
          icon: item.icon,
          accountability: item.accountability,
          description: item.description,
          trigger: item.trigger,
          options: item.options,
        });

        function transformData(list: IOperation[]) {
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
              flow: response.data.data.id,
              resolve: buildNestedObject(findItemById(item.resolve)),
              reject: buildNestedObject(findItemById(item.reject)),
            };

            return nestedObject;
          }

          const firstItem = findItemById(item.operation);
          result.name = firstItem?.name;
          result.position_x = firstItem?.position_x;
          result.position_y = firstItem?.position_y;
          result.key = firstItem?.key;
          result.type = firstItem?.type;
          result.options = firstItem?.options;
          result.flow = response.data.data.id;
          result.resolve = buildNestedObject(findItemById(firstItem?.resolve || null));
          result.reject = buildNestedObject(findItemById(firstItem?.reject || null));

          return result;
        }

        const payload = transformData(item.operations);

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
        if (restoredFile.value)
          restoredFile.value.value = null;
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

    function onRestoredFileChanged($event: Event) {
      const file: File = $event?.target?.files[0];
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
</style>

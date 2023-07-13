<template>
  <private-view title="Flow Manager">
    <v-table :items="flows" v-model:headers="headers">
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
          </v-list>
        </v-menu>
      </template>
    </v-table>
  </private-view>
</template>

<script lang="ts">
import { defineComponent, ref, unref } from "vue";
import { useStores, useApi } from "@directus/extensions-sdk";

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
    const { useFlowsStore, useNotificationsStore } = useStores();
    const flowsStore = useFlowsStore();
    const notificationsStore = useNotificationsStore();
    const api = useApi();

    const flows = ref(flowsStore.flows);

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

    return {
      headers,
      flows,
      duplicate,
    };

    async function duplicate(item: IFlow) {
      try {
        const response = await api.post("/flows", {
          name: `${item.name} - Copy`,
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

        notificationsStore.add({
          type: "success",
          text: "Flow duplicated successfully",
          closeable: true,
        });
      } catch (error) {
        console.log(error);
      }
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

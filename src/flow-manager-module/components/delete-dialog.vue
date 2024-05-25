<script setup lang="ts">
import { toRefs } from "vue";
import { IFlow, IFolder } from "../types";

const props = withDefaults(
  defineProps<{
    value: boolean;
    isBatchAction: boolean;
    selectedItem?: IFlow | IFolder;
    selectedFlows?: IFlow[];
    loading: boolean;
  }>(),
  {
    isBatchAction: false,
    selectedItem: undefined,
    selectedFlows: () => [],
    loading: false,
  }
);

const emit = defineEmits(["update:modelValue", "proceed"]);

const { value, selectedItem, selectedFlows, isBatchAction } = toRefs(props);
</script>

<template>
  <v-dialog :model-value="value" @update:model-value="emit('update:model-value', false)" :persistent="true">
    <v-card>
      <v-card-title>
        <span v-if="isBatchAction">Delete Flows</span>
        <span v-else>
          <span v-if="selectedItem?.type === 'category'">Delete Folder</span>
          <span v-else>Delete Flow</span>
        </span>
      </v-card-title>
      <v-card-text>
        <span v-if="isBatchAction">
          Are you sure you want to delete selected Flows?
          <v-list class="list-process">
            <v-list-item v-for="item in selectedFlows" :key="item.id">
              <v-list-item-icon>
                <v-icon :color="item.color || 'var(--theme--primary)'" :name="item.icon || 'bolt'" />
              </v-list-item-icon>
              <v-list-item-content>{{ item.name }}</v-list-item-content>
            </v-list-item>
          </v-list>
        </span>
        <span v-else>
          <span v-if="selectedItem?.type === 'category'">
            Are you sure you want to delete folder [<span class="bold-text">{{ selectedItem.name }}</span
            >]?
          </span>
          <span v-else>
            Are you sure you want to delete [<span class="bold-text">{{ selectedItem.name }}</span
            >] {{ selectedItem?.type === "category" ? "Folder" : "Flow" }}?
          </span>
        </span>
      </v-card-text>
      <v-card-actions>
        <v-button secondary @click="emit('update:model-value', false)"> Close </v-button>
        <v-button :disabled="!selectedItem" @click="emit('proceed')" :loading="loading"> Proceed </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.bold-text {
  font-weight: bold;
}

.list-process {
  max-height: 400px;
  overflow-y: scroll;
  margin-top: 20px;
}
</style>

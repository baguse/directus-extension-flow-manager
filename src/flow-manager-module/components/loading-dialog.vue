<script setup lang="ts">
import { ref, toRefs, watch } from "vue";
import { ProcessingItem } from "../types";

const props = withDefaults(
  defineProps<{
    value: boolean;
    progressValue: number;
    listProcessing: ProcessingItem[];
    title: string;
  }>(),
  {
    title: "Processing",
  }
);

const emit = defineEmits(["update:modelValue"]);

const { value, progressValue, listProcessing, title } = toRefs(props);
const bottomList = ref<HTMLElement | null>(null);

watch([progressValue], () => {
  bottomList.value?.scrollIntoView({ behavior: "smooth" });
});
</script>

<template>
  <v-dialog :model-value="value" @update:model-value="emit('update:model-value', false)">
    <v-card>
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>
        <v-progress-linear :value="progressValue"></v-progress-linear>
        <v-list class="list-process">
          <v-list-item v-for="item in listProcessing" :key="item.id">
            <v-list-item-icon>
              <v-icon v-if="item.status === 'success'" color="green" name="check_circle" v-tooltip.bottom="'Success'" />
              <v-icon v-if="item.status === 'skipped'" name="block" v-tooltip.bottom="'Skipped'" />
              <v-icon v-if="item.status === 'error'" color="red" name="error" v-tooltip.bottom="'Error'" />
            </v-list-item-icon>
            <v-list-item-content>{{ item.message }}</v-list-item-content>
          </v-list-item>
          <span ref="bottomList"></span>
        </v-list>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.list-process {
  max-height: 400px;
  overflow-y: scroll;
  margin-top: 20px;
}
</style>

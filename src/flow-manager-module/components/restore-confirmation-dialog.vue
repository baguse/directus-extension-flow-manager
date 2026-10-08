<script setup lang="ts">
import { computed, toRefs } from 'vue';
import type { IFlow } from '../../types';

const props = withDefaults(
  defineProps<{
    value: boolean;
    flowDuplicatedName: string;
    isPreviousIdPersisted: boolean;
    restoredFileObj: Partial<IFlow | IFlow[]>;
    errors?: string[];
  }>(),
  {
    flowDuplicatedName: '',
    isPreviousIdPersisted: false,
    restoredFileObj: () => ({}),
    errors: () => [],
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:flowDuplicatedName', value: string): void;
  (e: 'update:isPreviousIdPersisted', value: boolean): void;
  (e: 'proceed'): void;
}>();

const { value, flowDuplicatedName, isPreviousIdPersisted, restoredFileObj, errors } = toRefs(props);

const singleRestoredItem = computed(() => {
  if (Array.isArray(restoredFileObj.value)) {
    return null;
  }
  return restoredFileObj.value as Partial<IFlow>;
});
</script>

<template>
  <v-dialog
    :model-value="value"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card>
      <v-card-title>Confirmation Dialog</v-card-title>
      <v-card-text>
        <v-input
          v-tooltip.bottom="'Flow Name'"
          :model-value="flowDuplicatedName"
          placeholder="Flow Name"
          @update:model-value="emit('update:flowDuplicatedName', $event)"
        />
        <v-checkbox
          class="checkbox-persist-id"
          label="Keep the same flow id as the original flow"
          :model-value="isPreviousIdPersisted"
          @update:model-value="emit('update:isPreviousIdPersisted', $event)"
        />
        <v-list v-if="Array.isArray(restoredFileObj)">
          <v-list-item v-for="item in restoredFileObj" :key="item?.id">
            <v-list-item-icon>
              <v-icon :color="item?.color || 'var(--theme--primary)'" :name="item?.icon" />
            </v-list-item-icon>
            <v-list-item-content>{{ item?.name }}</v-list-item-content>
          </v-list-item>
        </v-list>
        <v-list v-else-if="singleRestoredItem">
          <v-list-item>
            <v-list-item-icon>
              <v-icon
                :color="singleRestoredItem.color || 'var(--theme--primary)'"
                :name="singleRestoredItem.icon"
              />
            </v-list-item-icon>
            <v-list-item-content>{{ singleRestoredItem.name }}</v-list-item-content>
          </v-list-item>
        </v-list>
        <div v-if="errors && errors.length">
          <v-error
            v-for="(error, indexError) in errors"
            :key="`errorIndex-${indexError}`"
            :error="{ extensions: { code: 'Error' }, message: error }"
          ></v-error>
          <div class="message-prompt">
            There are some errors in the file you are trying to restore. Do you want to continue?
          </div>
        </div>
        <div v-else>
          <div class="message-prompt">Do you want to continue?</div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-button secondary @click="emit('update:modelValue', false)"> Cancel </v-button>
        <v-button @click="emit('proceed')"> Continue </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.checkbox-persist-id {
  margin-top: 4px;
}

.message-prompt {
  margin-top: 15px;
}
</style>

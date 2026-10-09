<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { FlowWithMetadata } from './types';

const props = defineProps<{
  modelValue: boolean;
  flow: FlowWithMetadata | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'submit', values: Record<string, unknown>): void;
  (e: 'cancel'): void;
}>();

const formValues = ref<Record<string, unknown>>({});

const fields = computed(() => {
  return props.flow?.options?.fields || [];
});

const hasFields = computed(() => {
  return fields.value.length > 0;
});

const confirmationDescription = computed(() => {
  return (
    props.flow?.options?.confirmationDescription ||
    `Are you sure you want to execute "${props.flow?.name}"?`
  );
});

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      formValues.value = {};
    }
  },
);

function onSubmit() {
  emit('submit', formValues.value);
}

function onCancel() {
  emit('update:modelValue', false);
  emit('cancel');
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :persistent="loading"
    max-width="500px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>
        <v-icon :name="flow?.icon || 'bolt'" class="mr-2" :color="flow?.color" />
        {{ flow?.name || 'Trigger Flow' }}
      </v-card-title>

      <v-card-text>
        <p class="description-text mb-4">
          {{ confirmationDescription }}
        </p>

        <div v-if="hasFields" class="form-container">
          <v-form v-model="formValues" :fields="fields" :initial-values="{}" :autofocus="true" />
        </div>
      </v-card-text>

      <v-card-actions>
        <v-button secondary :disabled="loading" @click="onCancel"> Cancel </v-button>
        <v-button :loading="loading" @click="onSubmit">
          <v-icon name="play_arrow" left />
          Run Flow
        </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.description-text {
  color: var(--theme--foreground-subdued);
  line-height: 1.5;
  margin-bottom: 1rem;
}

.form-container {
  margin-top: 0.5rem;
}

.mr-2 {
  margin-right: 0.5rem;
}
</style>

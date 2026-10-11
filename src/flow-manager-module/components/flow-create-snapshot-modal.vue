<script setup lang="ts">
import { ref, watch } from 'vue';
import type { IFlow, IFlowSnapshot } from '../../types';

const props = withDefaults(
  defineProps<{
    value: boolean;
    flow: IFlow | null;
    existingSnapshots?: IFlowSnapshot[];
    loading?: boolean;
    suggestedVersion?: string;
  }>(),
  {
    existingSnapshots: () => [],
    loading: false,
    suggestedVersion: 'v1.0.0',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (
    e: 'create',
    payload: {
      version: string;
      name: string;
      description: string;
      tag: 'manual' | 'release';
    },
  ): void;
}>();

const version = ref('v1.0.0');
const name = ref('');
const description = ref('');
const tag = ref<'manual' | 'release'>('manual');

const tagItems = [
  { text: 'Manual Snapshot', value: 'manual' },
  { text: 'Release (Production Version)', value: 'release' },
];

watch(
  () => props.value,
  (isOpen) => {
    if (isOpen) {
      version.value = props.suggestedVersion || 'v1.0.0';
      name.value = props.flow ? `${props.flow.name} Snapshot` : '';
      description.value = '';
      tag.value = 'manual';
    }
  },
);

function onSubmit() {
  if (!version.value.trim() || !name.value.trim()) return;
  emit('create', {
    version: version.value.trim(),
    name: name.value.trim(),
    description: description.value.trim(),
    tag: tag.value,
  });
}
</script>

<template>
  <v-dialog
    :model-value="value"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card class="snapshot-card">
      <v-card-title>
        <div class="title-with-icon">
          <v-icon name="history" class="mr-2" />
          <span>Create Flow Snapshot</span>
        </div>
      </v-card-title>

      <v-card-text>
        <div v-if="flow" class="flow-preview-banner">
          <div class="flow-pill">
            <v-icon
              :name="flow.icon || 'bolt'"
              :color="
                flow.color &&
                flow.color !== 'var(--theme--primary)' &&
                flow.color !== 'var(--theme-primary)'
                  ? flow.color
                  : undefined
              "
            />
            <span class="flow-name">{{ flow.name }}</span>
          </div>
          <span class="flow-meta">
            {{ flow.operations?.length || 0 }} operations • {{ flow.trigger }}
          </span>
        </div>

        <div class="form-grid">
          <div class="field-group">
            <label class="field-label">Version Tag *</label>
            <v-input v-model="version" placeholder="e.g. v1.0.0" autofocus />
            <span class="field-hint">Semantic version identifier for this snapshot.</span>
          </div>

          <div class="field-group">
            <label class="field-label">Snapshot Name *</label>
            <v-input v-model="name" placeholder="e.g. Added Slack notification error handler" />
            <span class="field-hint">Human-readable description of what changed.</span>
          </div>

          <div class="field-group">
            <label class="field-label">Snapshot Type</label>
            <v-select v-model="tag" :items="tagItems" />
          </div>

          <div class="field-group">
            <label class="field-label">Release Notes / Description (Optional)</label>
            <v-textarea
              v-model="description"
              placeholder="Detailed explanation of modifications, reasons, or test verification notes..."
              rows="3"
            />
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-button secondary :disabled="loading" @click="emit('update:modelValue', false)">
          Cancel
        </v-button>
        <v-button :loading="loading" :disabled="!version.trim() || !name.trim()" @click="onSubmit">
          <v-icon name="save" class="mr-1" />
          Save Snapshot
        </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.snapshot-card {
  max-width: 580px;
  width: 100%;
}

.title-with-icon {
  display: flex;
  align-items: center;
}

.mr-1 {
  margin-right: 4px;
}

.mr-2 {
  margin-right: 8px;
}

.flow-preview-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background-color: var(--theme--background-subdued, #f0f2f5);
  border-radius: var(--theme--border-radius, 6px);
  margin-bottom: 20px;
}

.flow-pill {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flow-name {
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
}

.flow-meta {
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
  text-transform: capitalize;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme--foreground, #334155);
}

.field-hint {
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
}
</style>

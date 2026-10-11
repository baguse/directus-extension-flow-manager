<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { IFlow } from '../../types';

const props = withDefaults(
  defineProps<{
    value?: boolean;
    modelValue?: boolean;
    flow: IFlow | null;
    loading?: boolean;
  }>(),
  {
    value: false,
    modelValue: false,
    flow: null,
    loading: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (
    e: 'save',
    payload: {
      id: string;
      name: string;
      status: string;
      description: string | null;
      icon: string | null;
      color: string | null;
    },
  ): void;
}>();

const isOpen = computed(() => props.modelValue || props.value);

const statusOptions = [
  { text: 'Active', value: 'active' },
  { text: 'Inactive', value: 'inactive' },
];

const form = ref({
  name: '',
  status: 'active',
  description: '',
  icon: 'bolt',
  color: '',
});

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function copyId(id?: string) {
  if (!id) return;
  try {
    await navigator.clipboard.writeText(id);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    // Ignore clipboard failure
  }
}

watch(
  () => props.flow,
  (newFlow) => {
    if (newFlow) {
      const rawColor = newFlow.color ? String(newFlow.color).trim() : '';
      const cleanColor =
        rawColor && rawColor !== 'var(--theme--primary)' && rawColor !== 'var(--theme-primary)'
          ? rawColor
          : '';

      form.value = {
        name: newFlow.name || '',
        status: newFlow.status || 'active',
        description: newFlow.description || '',
        icon: newFlow.icon || 'bolt',
        color: cleanColor,
      };
    }
  },
  { immediate: true },
);

const resolvedColor = computed(() => {
  const c = form.value.color.trim();
  if (c && c !== 'var(--theme--primary)' && c !== 'var(--theme-primary)') {
    return c;
  }
  return '';
});

const previewAvatarStyle = computed(() => {
  if (resolvedColor.value) {
    return {
      color: resolvedColor.value,
      backgroundColor: `${resolvedColor.value}18`,
    };
  }
  return {
    color: 'var(--theme--foreground, #1e293b)',
    backgroundColor: 'var(--theme--background-subdued, rgba(128, 128, 128, 0.1))',
  };
});

function clearColor() {
  form.value.color = '';
}

function handleSave() {
  if (!props.flow?.id || !form.value.name.trim() || props.loading) return;

  emit('save', {
    id: props.flow.id,
    name: form.value.name.trim(),
    status: form.value.status,
    description: form.value.description.trim() || null,
    icon: form.value.icon ? form.value.icon.trim() : null,
    color: resolvedColor.value || null,
  });
}
</script>

<template>
  <v-dialog
    :model-value="isOpen"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card class="flow-edit-card">
      <v-card-title class="dialog-title-row">
        <div class="title-left">
          <v-icon name="edit" class="mr-2" />
          <span>Edit Flow Options</span>
        </div>
        <button
          v-if="flow?.id"
          type="button"
          class="flow-id-badge"
          :title="copied ? 'Copied!' : 'Click to copy Flow ID'"
          @click="copyId(flow.id)"
        >
          <span class="id-label">ID:</span>
          <span class="id-value">{{ flow.id }}</span>
          <v-icon :name="copied ? 'check' : 'content_copy'" x-small class="ml-1" />
        </button>
      </v-card-title>

      <v-card-text>
        <!-- 1. Live Preview Banner -->
        <div class="flow-preview-banner">
          <div class="preview-avatar" :style="previewAvatarStyle">
            <v-icon :name="form.icon || 'bolt'" />
          </div>
          <div class="preview-info">
            <div class="preview-name-row">
              <span class="preview-name">{{ form.name || 'Untitled Flow' }}</span>
              <span :class="['status-chip', form.status]">
                <span class="status-dot" />
                {{ form.status === 'active' ? 'Active' : 'Inactive' }}
              </span>
              <span v-if="flow?.trigger" class="trigger-chip">
                {{ flow.trigger.toUpperCase() }}
              </span>
            </div>
            <div v-if="form.description" class="preview-desc">
              {{ form.description }}
            </div>
          </div>
        </div>

        <!-- 2. Form Fields -->
        <div class="form-grid">
          <!-- Flow Name -->
          <div class="field-group">
            <label class="field-label">Flow Name <span class="required-star">*</span></label>
            <v-input v-model="form.name" placeholder="Enter flow name..." autofocus />
          </div>

          <!-- Status -->
          <div class="field-group">
            <label class="field-label">Status</label>
            <v-select v-model="form.status" :items="statusOptions" />
          </div>

          <!-- Description -->
          <div class="field-group">
            <label class="field-label">Description (Optional)</label>
            <v-textarea
              v-model="form.description"
              placeholder="Provide a clear description of what this flow does..."
              rows="3"
            />
          </div>

          <!-- Icon & Color Row -->
          <div class="field-row">
            <div class="field-group flex-1">
              <label class="field-label">Icon</label>
              <interface-select-icon :value="form.icon" @input="form.icon = $event || 'bolt'" />
            </div>

            <div class="field-group flex-1">
              <div class="label-with-action">
                <label class="field-label">Color (Optional)</label>
                <button
                  v-if="form.color"
                  type="button"
                  class="clear-color-btn"
                  title="Reset to default theme color"
                  @click="clearColor"
                >
                  <v-icon name="close" x-small class="mr-1" />
                  Clear color
                </button>
              </div>
              <interface-select-color
                width="full"
                :value="form.color"
                @input="form.color = $event || ''"
              />
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-button secondary :disabled="loading" @click="emit('update:modelValue', false)">
          Cancel
        </v-button>
        <v-button :loading="loading" :disabled="!form.name.trim() || loading" @click="handleSave">
          <v-icon name="check" class="mr-1" />
          Save Changes
        </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.flow-edit-card {
  max-width: 620px;
  width: 90vw;
}

.dialog-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title-left {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: 600;
}

.flow-id-badge {
  display: inline-flex;
  align-items: center;
  background: var(--theme--background-subdued, rgba(128, 128, 128, 0.08));
  border: 1px solid var(--theme--border-color-subdued, rgba(128, 128, 128, 0.15));
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11px;
  font-family: monospace;
  color: var(--theme--foreground-subdued, #64748b);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: var(--theme--foreground, #1e293b);
    border-color: var(--theme--primary, #6366f1);
  }

  .id-label {
    margin-right: 4px;
    font-weight: 600;
    opacity: 0.7;
  }

  .id-value {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.flow-preview-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background-color: var(--theme--background-subdued, rgba(128, 128, 128, 0.06));
  border: 1px solid var(--theme--border-color-subdued, rgba(128, 128, 128, 0.12));
  border-radius: 8px;
  margin-bottom: 20px;
}

.preview-avatar {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;

  .v-icon {
    font-size: 24px;
  }
}

.preview-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.preview-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.preview-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 12px;

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  &.active {
    background-color: rgba(16, 185, 129, 0.12);
    color: #059669;

    .status-dot {
      background-color: #10b981;
    }
  }

  &.inactive {
    background-color: rgba(100, 116, 139, 0.12);
    color: #64748b;

    .status-dot {
      background-color: #94a3b8;
    }
  }
}

.trigger-chip {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--theme--primary-subdued, rgba(99, 102, 241, 0.12));
  color: var(--theme--primary, #6366f1);
  letter-spacing: 0.5px;
}

.preview-desc {
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
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

.field-row {
  display: flex;
  gap: 16px;

  @media (max-width: 600px) {
    flex-direction: column;
  }
}

.flex-1 {
  flex: 1;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme--foreground, #334155);
}

.required-star {
  color: var(--theme--danger, #dc2626);
}

.label-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.clear-color-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  transition: color 0.15s ease;

  &:hover {
    color: var(--theme--danger, #dc2626);
  }
}

.mr-1 {
  margin-right: 4px;
}

.mr-2 {
  margin-right: 8px;
}

.ml-1 {
  margin-left: 4px;
}
</style>

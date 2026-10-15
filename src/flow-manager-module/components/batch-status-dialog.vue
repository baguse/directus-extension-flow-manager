<script setup lang="ts">
import { computed } from 'vue';
import type { IFlow } from '../../types';

const props = withDefaults(
  defineProps<{
    value: boolean;
    action: 'active' | 'inactive' | 'unarchive';
    selectedFlows?: IFlow[];
    loading?: boolean;
  }>(),
  {
    value: false,
    action: 'active',
    selectedFlows: () => [],
    loading: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'proceed'): void;
}>();

const lockedBatchFlows = computed(() => {
  return (props.selectedFlows || []).filter((f) => f.options?.locked === true);
});

const eligibleBatchFlows = computed(() => {
  const flows = props.selectedFlows || [];
  if (props.action === 'active') {
    return flows.filter(
      (f) => f.options?.locked !== true && f.status !== 'active' && !f.options?.archived,
    );
  }
  if (props.action === 'inactive') {
    return flows.filter(
      (f) => f.options?.locked !== true && f.status !== 'inactive' && !f.options?.archived,
    );
  }
  if (props.action === 'unarchive') {
    return flows.filter((f) => f.options?.locked !== true && f.options?.archived === true);
  }
  return flows.filter((f) => f.options?.locked !== true);
});

const actionVerb = computed(() => {
  if (props.action === 'active') return 'activate';
  if (props.action === 'inactive') return 'deactivate';
  if (props.action === 'unarchive') return 'unarchive';
  return 'update';
});

const actionLabel = computed(() => {
  if (props.action === 'active') return 'Activate';
  if (props.action === 'inactive') return 'Deactivate';
  if (props.action === 'unarchive') return 'Unarchive';
  return 'Proceed';
});

const dialogTitle = computed(() => {
  if (props.action === 'active') return 'Activate Flows';
  if (props.action === 'inactive') return 'Deactivate Flows';
  if (props.action === 'unarchive') return 'Unarchive Flows';
  return 'Update Flows';
});

const dialogIcon = computed(() => {
  if (props.action === 'active') return 'play_circle';
  if (props.action === 'inactive') return 'pause_circle';
  if (props.action === 'unarchive') return 'unarchive';
  return 'edit';
});

const isProceedDisabled = computed(() => {
  if (props.loading) return true;
  return eligibleBatchFlows.value.length === 0;
});

const proceedButtonText = computed(() => {
  const count = eligibleBatchFlows.value.length;
  if (count === 0) {
    return `${actionLabel.value} Flows`;
  }
  return `${actionLabel.value} ${count} Flow${count > 1 ? 's' : ''}`;
});
</script>

<template>
  <v-dialog
    :model-value="value"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card class="batch-status-dialog-card">
      <v-card-title class="dialog-title">
        <v-icon :name="dialogIcon" class="title-icon" left />
        <span>{{ dialogTitle }}</span>
      </v-card-title>

      <v-card-text>
        <v-notice v-if="lockedBatchFlows.length" type="warning" class="mb-3">
          {{ lockedBatchFlows.length }} of {{ selectedFlows?.length }} flow(s) are protected by
          Safety Lock and will be skipped.
        </v-notice>

        <template v-if="eligibleBatchFlows.length === 0">
          <p class="sub-text mt-2">
            All selected flows are protected by Safety Lock or already in the desired state. No
            changes will be made.
          </p>
        </template>
        <template v-else>
          <p class="flow-confirm-text">
            Are you sure you want to {{ actionVerb }}
            <strong>{{ eligibleBatchFlows.length }}</strong> selected flow{{
              eligibleBatchFlows.length > 1 ? 's' : ''
            }}?
          </p>
        </template>

        <v-list class="list-process">
          <v-list-item
            v-for="item in selectedFlows"
            :key="item.id"
            :class="{ 'locked-item': item.options?.locked }"
          >
            <v-list-item-icon>
              <v-icon
                :color="
                  item.color &&
                  item.color !== 'var(--theme--primary)' &&
                  item.color !== 'var(--theme-primary)'
                    ? item.color
                    : undefined
                "
                :name="item.options?.locked ? 'lock' : item.icon || 'bolt'"
              />
            </v-list-item-icon>
            <v-list-item-content>
              {{ item.name }}
              <span v-if="item.options?.locked" class="locked-tag">(Locked - skipped)</span>
              <span v-else-if="action === 'active' && item.status === 'active'" class="status-tag"
                >(Already active)</span
              >
              <span
                v-else-if="action === 'inactive' && item.status === 'inactive'"
                class="status-tag"
                >(Already inactive)</span
              >
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions>
        <v-button secondary :disabled="loading" @click="emit('update:modelValue', false)">
          Cancel
        </v-button>
        <v-button :disabled="isProceedDisabled" :loading="loading" @click="emit('proceed')">
          <v-icon :name="dialogIcon" left />
          {{ proceedButtonText }}
        </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.batch-status-dialog-card {
  --v-card-min-width: 480px;
  max-width: 580px;
}

.dialog-title {
  display: flex;
  align-items: center;
  font-weight: 700;
}

.title-icon {
  color: var(--theme--primary, #6366f1);
}

.flow-confirm-text {
  font-size: 15px;
  line-height: 1.4;
  margin-bottom: 8px;
}

.sub-text {
  color: var(--theme--foreground-subdued, #64748b);
  font-size: 13px;
  margin-bottom: 8px;
}

.list-process {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  margin-top: 12px;
}

.locked-item {
  opacity: 0.6;
}

.locked-tag {
  font-size: 11px;
  color: var(--theme--warning, #f59e0b);
  margin-left: 6px;
  font-weight: 600;
}

.status-tag {
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
  margin-left: 6px;
}

.mt-2 {
  margin-top: 8px;
}
.mb-3 {
  margin-bottom: 12px;
}
</style>

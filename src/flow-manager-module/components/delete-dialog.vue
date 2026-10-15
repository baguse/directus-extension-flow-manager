<script setup lang="ts">
import { ref, computed, watch, toRefs } from 'vue';
import type { IFlow, IFolder } from '../../types';

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
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'proceed', payload?: { isPermanent: boolean }): void;
}>();

const { value, selectedItem, selectedFlows, isBatchAction } = toRefs(props);

const isPermanent = ref(false);

const isCategory = computed(() => (selectedItem.value as IFolder)?.type === 'category');

const singleFlow = computed<IFlow | null>(() => {
  if (isBatchAction.value || isCategory.value) return null;
  return (selectedItem.value as IFlow) || null;
});

const isAlreadyArchived = computed(() => {
  if (singleFlow.value) {
    return singleFlow.value.options?.archived === true;
  }
  if (isBatchAction.value && selectedFlows.value.length > 0) {
    return selectedFlows.value.every((f) => f.options?.archived === true);
  }
  return false;
});

const isSingleLocked = computed(() => {
  return singleFlow.value?.options?.locked === true;
});

const lockedBatchFlows = computed(() => {
  if (!isBatchAction.value) return [];
  return (selectedFlows.value || []).filter((f) => f.options?.locked === true);
});

const eligibleBatchFlows = computed(() => {
  if (!isBatchAction.value) return [];
  return (selectedFlows.value || []).filter((f) => f.options?.locked !== true);
});

watch(
  () => props.value,
  (open) => {
    if (open) {
      // If already archived or deleting a category, default to permanent
      isPermanent.value = isAlreadyArchived.value || isCategory.value;
    }
  },
);

const dialogTitle = computed(() => {
  if (isCategory.value) return 'Delete Folder';
  if (isBatchAction.value) {
    return isPermanent.value ? 'Delete Flows Permanently' : 'Archive Flows';
  }
  if (isAlreadyArchived.value || isPermanent.value) {
    return 'Delete Flow Permanently';
  }
  return 'Archive Flow';
});

const isProceedDisabled = computed(() => {
  if (props.loading) return true;
  if (isCategory.value) return !selectedItem.value?.id;
  if (isBatchAction.value) {
    return eligibleBatchFlows.value.length === 0;
  }
  if (isSingleLocked.value) return true;
  return !singleFlow.value?.id;
});

function handleProceed() {
  emit('proceed', { isPermanent: isPermanent.value || isCategory.value });
}
</script>

<template>
  <v-dialog
    :model-value="value"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card class="delete-dialog-card">
      <v-card-title class="dialog-title">
        <v-icon
          :name="isCategory ? 'folder' : isPermanent ? 'delete_forever' : 'archive'"
          :class="['title-icon', { 'danger-icon': isPermanent && !isCategory }]"
          left
        />
        <span>{{ dialogTitle }}</span>
      </v-card-title>

      <v-card-text>
        <!-- Category Delete -->
        <template v-if="isCategory">
          <span>
            Are you sure you want to delete folder [<span class="bold-text">{{
              selectedItem?.name
            }}</span
            >]?
          </span>
          <p class="sub-text mt-2">
            Flows inside this folder will not be deleted; they will be moved to the root level.
          </p>
        </template>

        <!-- Single Flow Locked Notice -->
        <template v-else-if="!isBatchAction && isSingleLocked">
          <v-notice type="warning" class="mb-3">
            <span class="bold-text">Protected by Safety Lock</span><br />
            Flow <strong>{{ singleFlow?.name }}</strong> is frozen with Safety Lock. You must unlock
            it before it can be archived or deleted.
          </v-notice>
          <p class="help-text">
            To unlock this flow, close this dialog, click the <strong>🔒 Locked</strong> toggle in
            the right sidebar detail, and confirm.
          </p>
        </template>

        <!-- Single Flow (Unlocked) -->
        <template v-else-if="!isBatchAction && singleFlow">
          <p class="flow-confirm-text">
            <template v-if="isPermanent">
              Are you sure you want to
              <strong class="danger-text">permanently delete</strong> [<strong>{{
                singleFlow.name
              }}</strong
              >]?
            </template>
            <template v-else>
              Move [<strong>{{ singleFlow.name }}</strong
              >] to the <strong>Archive</strong>?
            </template>
          </p>

          <v-notice :type="isPermanent ? 'danger' : 'info'" class="mt-3 mb-3">
            <template v-if="isPermanent">
              This will permanently erase the flow, all its operation steps, and run history from
              the database. <strong>This action cannot be undone.</strong>
            </template>
            <template v-else>
              The flow will be deactivated and moved to the <strong>Archive</strong> category. All
              nodes, history, and triggers are safely preserved and can be restored at any time.
            </template>
          </v-notice>

          <!-- Checkbox for permanent delete (only if not already archived) -->
          <div v-if="!isAlreadyArchived" class="permanent-checkbox-wrapper">
            <v-checkbox v-model="isPermanent" label="Delete permanently from database" />
          </div>
        </template>

        <!-- Batch Action -->
        <template v-else-if="isBatchAction">
          <v-notice v-if="lockedBatchFlows.length" type="warning" class="mb-3">
            {{ lockedBatchFlows.length }} of {{ selectedFlows?.length }} flow(s) are protected by
            Safety Lock and will be skipped.
          </v-notice>

          <p class="flow-confirm-text">
            <template v-if="isPermanent">
              Are you sure you want to <strong class="danger-text">permanently delete</strong>
              {{ eligibleBatchFlows.length }} selected flow(s)?
            </template>
            <template v-else> Archive {{ eligibleBatchFlows.length }} selected flow(s)? </template>
          </p>

          <v-notice :type="isPermanent ? 'danger' : 'info'" class="mt-3 mb-3">
            <template v-if="isPermanent">
              Selected flows and their operations will be completely erased from the database.
            </template>
            <template v-else>
              Selected flows will be deactivated and moved to the Archive category. You can restore
              them anytime.
            </template>
          </v-notice>

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
              </v-list-item-content>
            </v-list-item>
          </v-list>

          <div class="permanent-checkbox-wrapper mt-3">
            <v-checkbox v-model="isPermanent" label="Delete permanently from database" />
          </div>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-button secondary :disabled="loading" @click="emit('update:modelValue', false)">
          Cancel
        </v-button>
        <v-button
          :disabled="isProceedDisabled"
          :loading="loading"
          :kind="isPermanent ? 'danger' : 'normal'"
          @click="handleProceed"
        >
          <v-icon :name="isCategory ? 'delete' : isPermanent ? 'delete_forever' : 'archive'" left />
          <template v-if="isCategory">Delete Folder</template>
          <template v-else-if="isPermanent">Delete Permanently</template>
          <template v-else
            >Archive Flow{{ isBatchAction && eligibleBatchFlows.length > 1 ? 's' : '' }}</template
          >
        </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.delete-dialog-card {
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
  &.danger-icon {
    color: var(--theme--danger, #ef4444);
  }
}

.danger-text {
  color: var(--theme--danger, #ef4444);
}

.bold-text {
  font-weight: bold;
}

.sub-text,
.help-text {
  color: var(--theme--foreground-subdued, #64748b);
  font-size: 13px;
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

.permanent-checkbox-wrapper {
  margin-top: 14px;
  padding: 8px 12px;
  background-color: var(--theme--background-subdued, #f8fafc);
  border-radius: 6px;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
}

.mt-2 {
  margin-top: 8px;
}
.mt-3 {
  margin-top: 12px;
}
.mb-3 {
  margin-bottom: 12px;
}
</style>

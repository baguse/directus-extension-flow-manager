<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import type { FlowManagerUtilsContext, IFlow, IFolder, IOperation } from '../../types';

const props = defineProps<{
  selectedItem?: IFlow | IFolder | null;
  formatDateLong: (date?: string | null) => string;
  getOperationNameById: (operationId: string) => IOperation | undefined;
}>();

const emit = defineEmits<{
  (e: 'openVersionDialog', flow: IFlow): void;
  (e: 'openGitExportDialog', flow: IFlow): void;
}>();

const flowManagerUtils = inject<FlowManagerUtilsContext>('flowManagerUtils');

const copied = ref(false);
let copyTimeout: ReturnType<typeof setTimeout> | null = null;

async function copyId(id?: string) {
  if (!id) return;
  try {
    await navigator.clipboard.writeText(id);
    copied.value = true;
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    // ignore clipboard write failure
  }
}

function handleGoToFlow() {
  if (selectedFlow.value) {
    flowManagerUtils?.goToFlow?.({ item: selectedFlow.value });
  }
}

const isCategory = computed(() => {
  return (props.selectedItem as IFolder)?.type === 'category';
});

const selectedCategory = computed<IFolder | null>(() => {
  if (isCategory.value) {
    return props.selectedItem as IFolder;
  }
  return null;
});

const selectedFlow = computed<IFlow | null>(() => {
  if (!props.selectedItem?.id || isCategory.value) {
    return null;
  }
  return props.selectedItem as IFlow;
});

const runCounter = computed(() => {
  return selectedFlow.value?.flow_manager_metadata_id?.flow_manager_run_counter || 0;
});

const successCounter = computed(() => {
  return selectedFlow.value?.flow_manager_metadata_id?.flow_manager_success_counter || 0;
});

const errorCounter = computed(() => {
  return selectedFlow.value?.flow_manager_metadata_id?.flow_manager_error_counter || 0;
});

const lastRunAt = computed(() => {
  const date = selectedFlow.value?.flow_manager_metadata_id?.flow_manager_last_run_at;
  if (!date) return null;
  return props.formatDateLong(String(date));
});

const lastErrorMessage = computed(() => {
  return selectedFlow.value?.flow_manager_metadata_id?.flow_manager_last_run_message || null;
});

const failedOperationName = computed(() => {
  const opId = selectedFlow.value?.flow_manager_metadata_id?.flow_manager_last_run_operation;
  if (!opId) return null;
  return props.getOperationNameById(opId)?.name || opId;
});
</script>

<template>
  <sidebar-detail id="flow-information" icon="info" :title="'Information'">
    <!-- 1. Flow Details Selected -->
    <div v-if="selectedFlow" class="flow-sidebar">
      <!-- Flow Header Card -->
      <div class="flow-header-card">
        <div
          class="flow-icon-box"
          :style="{
            backgroundColor: selectedFlow.color
              ? `${selectedFlow.color}18`
              : 'rgba(99, 102, 241, 0.12)',
            color: selectedFlow.color || 'var(--theme--primary, #6366f1)',
          }"
        >
          <v-icon :name="selectedFlow.icon || 'bolt'" />
        </div>
        <div class="flow-header-info">
          <div class="flow-name" :title="selectedFlow.name">
            {{ selectedFlow.name }}
          </div>
          <div class="flow-badges">
            <span :class="['status-chip', selectedFlow.status]">
              <span class="status-dot" />
              {{ selectedFlow.status === 'active' ? 'Active' : 'Inactive' }}
            </span>
            <span v-if="selectedFlow.trigger" class="trigger-chip">
              {{ selectedFlow.trigger }}
            </span>
          </div>
        </div>
      </div>

      <!-- Flow ID with Copy -->
      <div class="meta-row id-row">
        <span class="meta-label">ID</span>
        <button
          type="button"
          class="id-copy-btn"
          :title="copied ? 'Copied!' : 'Click to copy ID'"
          @click="copyId(selectedFlow.id)"
        >
          <span class="id-text">{{ selectedFlow.id }}</span>
          <v-icon :name="copied ? 'check' : 'content_copy'" small class="copy-icon" />
        </button>
      </div>

      <!-- Description (if any) -->
      <div v-if="selectedFlow.description" class="flow-description">
        {{ selectedFlow.description }}
      </div>

      <!-- Metrics / Run Stats -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">{{ runCounter }}</div>
          <div class="metric-label">Runs</div>
        </div>
        <div class="metric-card success">
          <div class="metric-value">{{ successCounter }}</div>
          <div class="metric-label">Success</div>
        </div>
        <div :class="['metric-card', { danger: errorCounter > 0 }]">
          <div class="metric-value">{{ errorCounter }}</div>
          <div class="metric-label">Errors</div>
        </div>
      </div>

      <!-- Run Details & Health -->
      <div class="details-section">
        <div v-if="lastRunAt" class="detail-item">
          <v-icon name="schedule" small class="detail-icon" />
          <div class="detail-content">
            <span class="detail-title">Last Executed</span>
            <span class="detail-val">{{ lastRunAt }}</span>
          </div>
        </div>
        <div v-else class="detail-item muted">
          <v-icon name="history_toggle_off" small class="detail-icon" />
          <div class="detail-content">
            <span class="detail-val">Never executed</span>
          </div>
        </div>

        <div v-if="selectedFlow.operations?.length" class="detail-item">
          <v-icon name="account_tree" small class="detail-icon" />
          <div class="detail-content">
            <span class="detail-title">Pipeline</span>
            <span class="detail-val">{{ selectedFlow.operations.length }} operations</span>
          </div>
        </div>

        <!-- Failure callout only if error exists -->
        <div v-if="lastErrorMessage" class="error-callout">
          <div class="error-header">
            <v-icon name="error_outline" small class="error-icon" />
            <span class="error-title">Last Failure</span>
          </div>
          <div v-if="failedOperationName" class="error-op">
            Failed at: <strong>{{ failedOperationName }}</strong>
          </div>
          <div class="error-msg">{{ lastErrorMessage }}</div>
        </div>
      </div>

      <!-- Actions -->
      <div class="action-buttons">
        <v-button
          small
          secondary
          class="sidebar-btn"
          @click="emit('openVersionDialog', selectedFlow)"
        >
          <v-icon name="history" class="mr-1" />
          Version History
        </v-button>

        <v-button
          v-if="flowManagerUtils?.showEditFlowDialog"
          small
          secondary
          class="sidebar-btn"
          @click="flowManagerUtils.showEditFlowDialog(selectedFlow)"
        >
          <v-icon name="edit" class="mr-1" />
          Edit Flow Options
        </v-button>

        <v-button
          small
          secondary
          class="sidebar-btn"
          @click="emit('openGitExportDialog', selectedFlow)"
        >
          <v-icon name="terminal" class="mr-1" />
          Export for Git
        </v-button>

        <v-button
          v-if="flowManagerUtils?.goToFlow"
          small
          secondary
          class="sidebar-btn open-btn"
          @click="handleGoToFlow"
        >
          <v-icon name="open_in_new" class="mr-1" />
          Open Flow in Settings
        </v-button>
      </div>
    </div>

    <!-- 2. Category Selected -->
    <div v-else-if="selectedCategory" class="flow-sidebar">
      <div class="flow-header-card">
        <div
          class="flow-icon-box folder-theme"
          :style="{
            color: selectedCategory.color || 'var(--theme--primary, #6366f1)',
          }"
        >
          <v-icon :name="selectedCategory.icon || 'folder'" />
        </div>
        <div class="flow-header-info">
          <div class="flow-name">{{ selectedCategory.name }}</div>
          <div class="flow-badges">
            <span class="trigger-chip">Category</span>
            <span
              v-if="selectedCategory.flow_manager_metadata_id?.flow_manager_order"
              class="trigger-chip"
            >
              Order #{{ selectedCategory.flow_manager_metadata_id?.flow_manager_order }}
            </span>
          </div>
        </div>
      </div>
      <div class="meta-row id-row">
        <span class="meta-label">ID</span>
        <button
          type="button"
          class="id-copy-btn"
          :title="copied ? 'Copied!' : 'Click to copy ID'"
          @click="copyId(selectedCategory.id)"
        >
          <span class="id-text">{{ selectedCategory.id }}</span>
          <v-icon :name="copied ? 'check' : 'content_copy'" small class="copy-icon" />
        </button>
      </div>
    </div>

    <!-- 3. Empty State -->
    <div v-else class="empty-state">
      <v-icon name="touch_app" class="empty-icon" />
      <div class="empty-title">No Flow Selected</div>
      <div class="empty-sub">Click a flow or category from the list to view details here.</div>
    </div>
  </sidebar-detail>
</template>

<style scoped lang="scss">
.flow-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.flow-header-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--theme--border-color-subdued, #e2e8f0);
}

.flow-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  flex-shrink: 0;

  &.folder-theme {
    background-color: rgba(99, 102, 241, 0.08);
  }
}

.flow-header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.flow-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--theme--foreground, #1e293b);
  word-break: break-word;
}

.flow-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--theme--background-subdued, #f1f5f9);
  color: var(--theme--foreground-subdued, #64748b);

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #94a3b8;
  }

  &.active {
    background-color: rgba(16, 185, 129, 0.1);
    color: #059669;

    .status-dot {
      background-color: #10b981;
    }
  }

  &.inactive {
    background-color: rgba(100, 116, 139, 0.1);
    color: #64748b;

    .status-dot {
      background-color: #94a3b8;
    }
  }
}

.trigger-chip {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--theme--background-subdued, #f1f5f9);
  color: var(--theme--foreground-subdued, #64748b);
}

.id-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.meta-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--theme--foreground-subdued, #94a3b8);
}

.id-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  background: var(--theme--background, #ffffff);
  cursor: pointer;
  max-width: 80%;
  transition: all 0.15s ease;

  &:hover {
    background-color: var(--theme--background-subdued, #f8fafc);
    border-color: var(--theme--primary, #6366f1);
  }

  .id-text {
    font-size: 11px;
    font-family: ui-monospace, monospace;
    color: var(--theme--foreground-subdued, #475569);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-icon {
    color: var(--theme--foreground-subdued, #94a3b8);
    font-size: 13px;
    flex-shrink: 0;
  }
}

.flow-description {
  font-size: 12px;
  line-height: 1.4;
  color: var(--theme--foreground-subdued, #64748b);
  background-color: var(--theme--background-subdued, #f8fafc);
  padding: 8px 10px;
  border-radius: 6px;
  border-left: 2px solid var(--theme--primary, #6366f1);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
  border-radius: 6px;
  background-color: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #f1f5f9);

  .metric-value {
    font-size: 15px;
    font-weight: 700;
    color: var(--theme--foreground, #1e293b);
    line-height: 1.2;
  }

  .metric-label {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--theme--foreground-subdued, #94a3b8);
    margin-top: 2px;
  }

  &.success .metric-value {
    color: #059669;
  }

  &.danger {
    background-color: rgba(239, 68, 68, 0.06);
    border-color: rgba(239, 68, 68, 0.15);

    .metric-value {
      color: #dc2626;
    }
  }
}

.details-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}

.detail-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11px;

  .detail-icon {
    color: var(--theme--foreground-subdued, #94a3b8);
    font-size: 14px;
    margin-top: 1px;
    flex-shrink: 0;
  }

  .detail-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .detail-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--theme--foreground-subdued, #94a3b8);
  }

  .detail-val {
    color: var(--theme--foreground, #334155);
    font-weight: 500;
  }

  &.muted .detail-val {
    color: var(--theme--foreground-subdued, #94a3b8);
    font-style: italic;
  }
}

.error-callout {
  padding: 8px 10px;
  border-radius: 6px;
  background-color: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  display: flex;
  flex-direction: column;
  gap: 4px;

  .error-header {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .error-icon {
    color: #dc2626;
  }

  .error-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #dc2626;
  }

  .error-op {
    font-size: 11px;
    color: #991b1b;
  }

  .error-msg {
    font-size: 11px;
    font-family: ui-monospace, monospace;
    color: #7f1d1d;
    word-break: break-word;
    background: rgba(255, 255, 255, 0.5);
    padding: 4px 6px;
    border-radius: 4px;
  }
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--theme--border-color-subdued, #e2e8f0);
}

.sidebar-btn {
  width: 100%;
  justify-content: flex-start;

  &.open-btn {
    border-color: var(--theme--primary, #6366f1);
    color: var(--theme--primary, #6366f1);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 16px;
  color: var(--theme--foreground-subdued, #94a3b8);

  .empty-icon {
    font-size: 32px;
    margin-bottom: 8px;
    opacity: 0.6;
  }

  .empty-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--theme--foreground, #475569);
  }

  .empty-sub {
    font-size: 11px;
    margin-top: 4px;
    line-height: 1.4;
  }
}

.mr-1 {
  margin-right: 4px;
}
</style>

<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import { Cron } from 'croner';
import type { FlowManagerUtilsContext, IFlow, IFolder, IOperation } from '../../types';
import {
  buildFlowDependencyGraph,
  getFlowImpact,
  type FlowImpactSummary,
} from '../../utils/flow-dependency.util';
import { formatCronToHuman } from '../../utils/cron-schedule.util';

const props = withDefaults(
  defineProps<{
    selectedItem?: IFlow | IFolder | null;
    allFlows?: IFlow[];
    formatDateLong: (date?: string | null) => string;
    getOperationNameById: (operationId: string) => IOperation | undefined;
  }>(),
  {
    allFlows: () => [],
  },
);

const emit = defineEmits<{
  (e: 'openVersionDialog', flow: IFlow): void;
  (e: 'openGitExportDialog', flow: IFlow): void;
  (e: 'viewInGraph', flow: IFlow): void;
  (e: 'viewInTimeline', flow: IFlow): void;
  (e: 'simulateFlow', flow: IFlow): void;
  (e: 'toggleSafetyLock', flow: IFlow, targetState?: boolean): void;
  (e: 'archiveFlow', flow: IFlow): void;
  (e: 'restoreFlow', flow: IFlow): void;
}>();

const flowManagerUtils = inject<FlowManagerUtilsContext>('flowManagerUtils');

const showUnlockModal = ref(false);

function openUnlockModal() {
  showUnlockModal.value = true;
}

function handleConfirmUnlock() {
  if (selectedFlow.value) {
    emit('toggleSafetyLock', selectedFlow.value, false);
    showUnlockModal.value = false;
  }
}

function handleLockFlow() {
  if (selectedFlow.value) {
    emit('toggleSafetyLock', selectedFlow.value, true);
  }
}

function handleArchiveFlow() {
  if (selectedFlow.value) {
    emit('archiveFlow', selectedFlow.value);
  }
}

function handleRestoreFlow() {
  if (selectedFlow.value) {
    emit('restoreFlow', selectedFlow.value);
  }
}

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

const flowImpact = computed<FlowImpactSummary | null>(() => {
  if (!selectedFlow.value || !props.allFlows || props.allFlows.length === 0) {
    return null;
  }
  const graph = buildFlowDependencyGraph(props.allFlows, { includeCollections: true });
  return getFlowImpact(selectedFlow.value.id, graph, props.allFlows);
});

const scheduleInfo = computed(() => {
  if (selectedFlow.value?.trigger !== 'schedule') {
    return null;
  }
  const rawCron =
    typeof selectedFlow.value.options?.cron === 'string'
      ? selectedFlow.value.options.cron.trim()
      : '';

  if (!rawCron) {
    return {
      cron: '',
      humanText: 'No schedule configured',
      nextRun: null,
      isValid: false,
    };
  }

  const human = formatCronToHuman(rawCron);
  let nextRun: string | null = null;
  let isValid = false;

  try {
    const job = new Cron(rawCron);
    isValid = true;
    const next = job.nextRun();
    if (next) {
      nextRun = props.formatDateLong(next.toISOString());
    }
  } catch {
    isValid = false;
  }

  return {
    cron: rawCron,
    humanText: human,
    nextRun,
    isValid,
  };
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
            <span v-if="selectedFlow.options?.locked" class="status-chip locked-chip">
              <v-icon name="lock" x-small class="mr-1" />
              Locked
            </span>
            <span v-if="selectedFlow.options?.archived" class="status-chip archived-chip">
              <v-icon name="archive" x-small class="mr-1" />
              Archived
            </span>
          </div>
        </div>
      </div>

      <!-- Safety Lock & Archive Status Banners -->
      <div v-if="selectedFlow.options?.locked" class="safety-lock-banner">
        <div class="safety-lock-content">
          <v-icon name="lock" class="lock-banner-icon" />
          <div class="lock-banner-text">
            <strong>Safety Lock Active</strong>
            <p>Direct edits, status changes, and deletion are disabled.</p>
          </div>
        </div>
        <v-button x-small secondary class="unlock-btn" @click="openUnlockModal">
          <v-icon name="lock_open" left />
          Unlock
        </v-button>
      </div>

      <div v-else-if="selectedFlow.options?.archived" class="archived-banner">
        <div class="archived-content">
          <v-icon name="archive" class="archive-banner-icon" />
          <div class="archive-banner-text">
            <strong>Archived Flow</strong>
            <p>Inactive and stored safely in the Archive folder.</p>
          </div>
        </div>
        <v-button x-small secondary class="restore-btn" @click="handleRestoreFlow">
          <v-icon name="unarchive" left />
          Restore
        </v-button>
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

      <!-- Schedule Card (if trigger === 'schedule') -->
      <div
        v-if="scheduleInfo"
        class="schedule-card"
        title="Click to view in Cron Timeline"
        @click="emit('viewInTimeline', selectedFlow)"
      >
        <div class="schedule-card-header">
          <div class="schedule-title-row">
            <v-icon name="schedule" small class="schedule-icon" />
            <span class="schedule-label">Schedule Trigger</span>
          </div>
          <span v-if="scheduleInfo.cron" class="schedule-cron-badge">{{ scheduleInfo.cron }}</span>
        </div>
        <div class="schedule-human-text">
          {{ scheduleInfo.humanText }}
        </div>
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
        <div v-if="scheduleInfo?.nextRun" class="detail-item">
          <v-icon name="event" small class="detail-icon text-primary" />
          <div class="detail-content">
            <span class="detail-title">Next Scheduled Run</span>
            <span class="detail-val">{{ scheduleInfo.nextRun }}</span>
          </div>
        </div>

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

      <!-- Dependencies & Domino Impact Section -->
      <div v-if="flowImpact" class="dependency-impact-section">
        <div class="impact-header">
          <div class="impact-title-group">
            <v-icon name="account_tree" small class="impact-icon" />
            <span class="impact-title">Dependencies & Impact</span>
          </div>
          <span
            v-if="flowImpact.isCycleParticipant"
            v-tooltip.bottom="'Warning: This flow is part of a circular loop!'"
            class="cycle-warning-badge"
          >
            <v-icon name="warning" x-small />
            Loop
          </span>
        </div>

        <div v-if="flowImpact.isCycleParticipant" class="cycle-warning-box">
          <v-icon name="warning" small class="cycle-box-icon" />
          <span
            >Circular loop detected. Modifying this flow can cause infinite cascading
            executions.</span
          >
        </div>

        <!-- Upstream Triggers -->
        <div class="impact-group">
          <div class="group-label">
            <span>TRIGGERED BY</span>
            <span class="group-count">{{
              flowImpact.upstreamFlows.length + flowImpact.upstreamCollections.length
            }}</span>
          </div>
          <div
            v-if="flowImpact.upstreamFlows.length || flowImpact.upstreamCollections.length"
            class="relation-tags"
          >
            <div
              v-for="uFlow in flowImpact.upstreamFlows"
              :key="uFlow.id"
              class="relation-pill flow-pill"
              :title="`${uFlow.name}: ${uFlow.via}`"
            >
              <v-icon name="bolt" x-small />
              <span class="pill-text">{{ uFlow.name }}</span>
            </div>
            <div
              v-for="uColl in flowImpact.upstreamCollections"
              :key="uColl"
              class="relation-pill coll-pill"
              :title="`Events on collection: ${uColl}`"
            >
              <v-icon name="storage" x-small />
              <span class="pill-text">{{ uColl }}</span>
            </div>
          </div>
          <div v-else class="empty-relation-text">Root trigger (direct/manual/webhook)</div>
        </div>

        <!-- Downstream Impact (Blast Radius) -->
        <div class="impact-group">
          <div class="group-label">
            <span>BLAST RADIUS (TRIGGERS)</span>
            <span class="group-count">{{
              flowImpact.downstreamFlows.length + flowImpact.downstreamCollections.length
            }}</span>
          </div>
          <div
            v-if="flowImpact.downstreamFlows.length || flowImpact.downstreamCollections.length"
            class="relation-tags"
          >
            <div
              v-for="dFlow in flowImpact.downstreamFlows"
              :key="dFlow.id"
              class="relation-pill flow-pill downstream"
              :title="`${dFlow.name}: ${dFlow.via}`"
            >
              <v-icon name="bolt" x-small />
              <span class="pill-text">{{ dFlow.name }}</span>
            </div>
            <div
              v-for="dColl in flowImpact.downstreamCollections"
              :key="dColl"
              class="relation-pill coll-pill"
              :title="`Writes to collection: ${dColl}`"
            >
              <v-icon name="storage" x-small />
              <span class="pill-text">{{ dColl }}</span>
            </div>
          </div>
          <div v-else class="empty-relation-text">No downstream cascades</div>
        </div>

        <!-- Quick View in Graph Button -->
        <button type="button" class="view-graph-cta-btn" @click="emit('viewInGraph', selectedFlow)">
          <v-icon name="account_tree" small />
          <span>View in Dependency Graph</span>
        </button>
      </div>

      <!-- Actions -->
      <div class="action-buttons">
        <v-button
          small
          secondary
          class="sidebar-btn simulation-btn"
          @click="emit('simulateFlow', selectedFlow)"
        >
          <v-icon name="shield" class="mr-1 text-green" />
          Sandbox Simulation (Dry Run)
        </v-button>
        <v-button
          v-if="selectedFlow.trigger === 'schedule'"
          small
          secondary
          class="sidebar-btn"
          @click="emit('viewInTimeline', selectedFlow)"
        >
          <v-icon name="schedule" class="mr-1" />
          View in Cron Timeline
        </v-button>
        <v-button small secondary class="sidebar-btn" @click="emit('viewInGraph', selectedFlow)">
          <v-icon name="account_tree" class="mr-1" />
          View in Dependency Graph
        </v-button>
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
          :disabled="selectedFlow.options?.locked"
          @click="flowManagerUtils.showEditFlowDialog(selectedFlow)"
        >
          <v-icon name="edit" class="mr-1" />
          Edit Flow Options
        </v-button>

        <!-- Safety Lock Action Button -->
        <v-button
          v-if="!selectedFlow.options?.locked"
          small
          secondary
          class="sidebar-btn lock-action-btn"
          @click="handleLockFlow"
        >
          <v-icon name="lock" class="mr-1" />
          Enable Safety Lock
        </v-button>
        <v-button
          v-else
          small
          secondary
          class="sidebar-btn unlock-action-btn"
          @click="openUnlockModal"
        >
          <v-icon name="lock_open" class="mr-1" />
          Unlock Flow
        </v-button>

        <!-- Soft Archive / Restore Action Button -->
        <v-button
          v-if="!selectedFlow.options?.archived"
          small
          secondary
          class="sidebar-btn archive-action-btn"
          :disabled="selectedFlow.options?.locked"
          @click="handleArchiveFlow"
        >
          <v-icon name="archive" class="mr-1" />
          Archive Flow
        </v-button>
        <v-button
          v-else
          small
          secondary
          class="sidebar-btn restore-action-btn"
          @click="handleRestoreFlow"
        >
          <v-icon name="unarchive" class="mr-1" />
          Restore to Workspace
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

      <!-- Unlock Confirmation Modal -->
      <v-dialog :model-value="showUnlockModal" @update:model-value="showUnlockModal = $event">
        <v-card class="unlock-dialog-card">
          <v-card-title class="dialog-title">
            <v-icon name="lock_open" left />
            <span>Unlock Flow</span>
          </v-card-title>
          <v-card-text>
            <p>
              Are you sure you want to disable Safety Lock for
              <strong>{{ selectedFlow.name }}</strong
              >?
            </p>
            <p class="unlock-subtext">
              Unlocking will allow changes, status updates, and deletions on this flow.
            </p>
          </v-card-text>
          <v-card-actions class="dialog-actions">
            <v-button secondary @click="showUnlockModal = false"> Cancel </v-button>
            <v-button kind="warning" @click="handleConfirmUnlock">
              <v-icon name="lock_open" left />
              Unlock Flow
            </v-button>
          </v-card-actions>
        </v-card>
      </v-dialog>
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

  &.locked-chip {
    background-color: rgba(239, 68, 68, 0.12);
    color: #dc2626;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  &.archived-chip {
    background-color: rgba(100, 116, 139, 0.15);
    color: #475569;
    border: 1px solid rgba(100, 116, 139, 0.25);
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

.schedule-card {
  padding: 10px 12px;
  border-radius: 6px;
  background-color: var(--theme--primary-subdued, rgba(99, 102, 241, 0.08));
  border: 1px solid var(--theme--border-color-subdued, rgba(99, 102, 241, 0.2));
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--theme--primary, #6366f1);
    background-color: var(--theme--primary-subdued, rgba(99, 102, 241, 0.12));
  }
}

.schedule-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.schedule-title-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.schedule-icon {
  color: var(--theme--primary, #6366f1);
}

.schedule-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--theme--primary, #6366f1);
}

.schedule-cron-badge {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  background: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, rgba(99, 102, 241, 0.25));
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--theme--foreground, #1e293b);
}

.schedule-human-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
  line-height: 1.35;
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

.dependency-impact-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: var(--theme--background-subdued, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);

  .impact-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .impact-title-group {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme--foreground, #334155);

    .impact-icon {
      color: var(--theme--primary, #6366f1);
    }
  }

  .cycle-warning-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 700;
    color: #b91c1c;
    background: #fee2e2;
    padding: 2px 6px;
    border-radius: 9999px;
  }

  .cycle-warning-box {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 8px 10px;
    background: #fef2f2;
    border-left: 3px solid #ef4444;
    border-radius: 4px;
    font-size: 11px;
    line-height: 1.4;
    color: #991b1b;

    .cycle-box-icon {
      color: #ef4444;
      flex-shrink: 0;
      margin-top: 1px;
    }
  }

  .impact-group {
    display: flex;
    flex-direction: column;
    gap: 5px;

    .group-label {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 600;
      color: var(--theme--foreground-subdued, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.04em;

      .group-count {
        background: rgba(0, 0, 0, 0.06);
        padding: 0 4px;
        border-radius: 10px;
      }
    }

    .relation-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .relation-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
      max-width: 100%;
      background: var(--theme--background, #ffffff);
      border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
      color: var(--theme--foreground, #1e293b);

      .pill-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      &.flow-pill {
        color: #4f46e5;
        border-color: #c7d2fe;
        background: #eef2ff;

        &.downstream {
          color: #d97706;
          border-color: #fde68a;
          background: #fffbeb;
        }
      }

      &.coll-pill {
        color: #059669;
        border-color: #a7f3d0;
        background: #ecfdf5;
      }
    }

    .empty-relation-text {
      font-size: 11px;
      color: var(--theme--foreground-subdued, #94a3b8);
      font-style: italic;
    }
  }

  .view-graph-cta-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    margin-top: 4px;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--theme--primary, #6366f1);
    color: white;
    font-size: 11px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 0.9;
    }
  }
}

.mr-1 {
  margin-right: 4px;
}

.safety-lock-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background-color: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 6px;

  .safety-lock-content {
    display: flex;
    align-items: flex-start;
    gap: 8px;

    .lock-banner-icon {
      color: #dc2626;
      font-size: 16px;
      margin-top: 2px;
      flex-shrink: 0;
    }

    .lock-banner-text {
      strong {
        font-size: 12px;
        color: #991b1b;
      }

      p {
        font-size: 11px;
        color: #b91c1c;
        margin: 2px 0 0 0;
        line-height: 1.3;
      }
    }
  }

  .unlock-btn {
    flex-shrink: 0;
  }
}

.archived-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background-color: rgba(100, 116, 139, 0.08);
  border: 1px solid rgba(100, 116, 139, 0.25);
  border-radius: 6px;

  .archived-content {
    display: flex;
    align-items: flex-start;
    gap: 8px;

    .archive-banner-icon {
      color: #64748b;
      font-size: 16px;
      margin-top: 2px;
      flex-shrink: 0;
    }

    .archive-banner-text {
      strong {
        font-size: 12px;
        color: #334155;
      }

      p {
        font-size: 11px;
        color: #64748b;
        margin: 2px 0 0 0;
        line-height: 1.3;
      }
    }
  }

  .restore-btn {
    flex-shrink: 0;
  }
}

.unlock-dialog-card {
  max-width: 480px;

  .dialog-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .unlock-subtext {
    font-size: 12px;
    color: var(--theme--foreground-subdued, #64748b);
    margin-top: 6px;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 24px;
  }
}
</style>

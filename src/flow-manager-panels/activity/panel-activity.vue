<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { PanelActivityProps } from '../shared/types';
import { usePanelFlows } from '../shared/use-panel-flows';
import { formatRelativeTime } from '../shared/time.util';

const props = withDefaults(defineProps<PanelActivityProps>(), {
  showHeader: false,
  limit: 5,
  statusFilter: 'all',
  flowId: null,
});

const router = useRouter();
const { activities, loading, error, loadRecentActivity } = usePanelFlows();
const expandedErrors = ref<Set<string | number>>(new Set());

function toggleError(id: string | number) {
  if (expandedErrors.value.has(id)) {
    expandedErrors.value.delete(id);
  } else {
    expandedErrors.value.add(id);
  }
}

function navigateToFlow(flowId: string) {
  router.push(`/flow-manager/dashboard/${flowId}`);
}

onMounted(() => {
  loadRecentActivity({
    limit: props.limit,
    statusFilter: props.statusFilter,
    flowId: props.flowId,
  });
});

watch([() => props.limit, () => props.statusFilter, () => props.flowId, () => props.now], () => {
  loadRecentActivity({
    limit: props.limit,
    statusFilter: props.statusFilter,
    flowId: props.flowId,
  });
});
</script>

<template>
  <div class="panel-activity-container" :class="{ 'has-header': showHeader }">
    <div v-if="loading && activities.length === 0" class="loading-state">
      <v-progress-circular indeterminate />
    </div>

    <div v-else-if="error" class="error-state">
      <v-notice type="danger">{{ error }}</v-notice>
    </div>

    <div v-else-if="activities.length === 0" class="empty-state">
      <v-icon name="history" large class="mb-2" />
      <div class="empty-text">No Recent Executions</div>
      <div class="empty-sub">Runs will appear here once flows are executed.</div>
    </div>

    <div v-else class="activity-list">
      <div
        v-for="run in activities"
        :key="run.id"
        class="activity-item"
        :class="{ 'has-error': run.status === 'error' }"
      >
        <div class="item-header">
          <div class="flow-identity" @click="navigateToFlow(run.flowId)">
            <v-icon
              :name="run.flowIcon || 'bolt'"
              :color="run.flowColor"
              small
              class="mr-2 flow-icon"
            />
            <span class="flow-name" :title="run.flowName">{{ run.flowName }}</span>
          </div>

          <div class="item-meta">
            <span class="run-time">{{ formatRelativeTime(run.timestamp) }}</span>
            <v-chip x-small :class="run.status === 'success' ? 'status-success' : 'status-error'">
              <v-icon :name="run.status === 'success' ? 'check' : 'close'" x-small class="mr-1" />
              {{ run.status === 'success' ? 'Success' : 'Failed' }}
            </v-chip>
          </div>
        </div>

        <!-- Error expansion toggle & message -->
        <div v-if="run.status === 'error' && run.errorMessage" class="error-section">
          <div class="error-toggle" @click="toggleError(run.id)">
            <v-icon
              :name="expandedErrors.has(run.id) ? 'expand_more' : 'chevron_right'"
              x-small
              class="mr-1"
            />
            <span class="error-preview">
              {{ expandedErrors.has(run.id) ? 'Hide Error Details' : run.errorMessage }}
            </span>
          </div>

          <transition name="expand">
            <div v-if="expandedErrors.has(run.id)" class="error-full">
              {{ run.errorMessage }}
            </div>
          </transition>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.panel-activity-container {
  height: 100%;
  width: 100%;
  padding: 0.75rem 1rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.has-header {
  padding-top: 0.25rem;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--theme--foreground-subdued);
}

.empty-text {
  font-weight: 700;
  font-size: 0.9375rem;
  color: var(--theme--foreground);
}

.empty-sub {
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.activity-item {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.65rem;
  background: var(--theme--background-subdued);
  border-radius: var(--theme--border-radius);
  transition: background 0.15s ease;

  &:hover {
    background: var(--theme--background-normal);
  }

  &.has-error {
    border-left: 3px solid var(--theme--danger);
  }
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.flow-identity {
  display: flex;
  align-items: center;
  cursor: pointer;
  max-width: 60%;

  &:hover .flow-name {
    color: var(--theme--primary);
    text-decoration: underline;
  }
}

.flow-name {
  font-weight: 600;
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;

  .run-time {
    font-size: 0.75rem;
    color: var(--theme--foreground-subdued);
  }

  .status-success {
    --v-chip-color: var(--theme--success);
    --v-chip-background-color: var(--theme--success-alt, rgba(46, 196, 182, 0.15));
    font-weight: 700;
  }

  .status-error {
    --v-chip-color: var(--theme--danger);
    --v-chip-background-color: var(--theme--danger-alt, rgba(231, 29, 54, 0.15));
    font-weight: 700;
  }
}

.error-section {
  margin-top: 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px solid var(--theme--border-color-subdued);
  font-size: 0.75rem;

  .error-toggle {
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--theme--danger);
    font-weight: 600;

    .error-preview {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .error-full {
    margin-top: 0.35rem;
    padding: 0.4rem;
    background: var(--theme--background);
    border-radius: 4px;
    color: var(--theme--danger);
    font-family: var(--theme--fonts--monospace--font-family), monospace;
    font-size: 0.6875rem;
    word-break: break-all;
    white-space: pre-wrap;
    max-height: 120px;
    overflow-y: auto;
  }
}

.mb-2 {
  margin-bottom: 0.5rem;
}

.mr-1 {
  margin-right: 0.25rem;
}

.mr-2 {
  margin-right: 0.5rem;
}
</style>

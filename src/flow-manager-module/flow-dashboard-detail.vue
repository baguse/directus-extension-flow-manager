<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useApi } from '@directus/extensions-sdk';
import { ENDPOINT_EXTENSION_NAME } from '../constants';
import type { ActivityHistory, IFlow, IOperation } from '../types';
import { parseDirectusDate } from '../utils/date.util';

interface ApiErrorResponse {
  response?: {
    status?: number;
    data?: {
      error?: string;
      errors?: { message?: string }[];
    };
  };
  message?: string;
}

function isApiError(e: unknown): e is ApiErrorResponse {
  return typeof e === 'object' && e !== null && 'response' in e;
}

const api = useApi();
const route = useRoute();
const router = useRouter();

const flowId = computed(() => route.params.flowId as string);
const flow = ref<IFlow | null>(null);
const flowName = ref<string>('');
const activityHistories = ref<ActivityHistory[]>([]);
const loading = ref(true);
const refreshLoading = ref(false);
const error = ref<string | null>(null);

const page = ref(1);
const totalPages = ref(1);
const totalCount = ref(0);
const successCount = ref(0);
const errorCount = ref(0);
const LIMIT = 10;

const activeFilter = ref<'all' | 'success' | 'error'>('all');
const searchQuery = ref('');
const selectedLog = ref<ActivityHistory | null>(null);
const copiedId = ref(false);
const copySuccessKey = ref<string | null>(null);

const expandedSections = ref({
  options: false,
  payload: false,
  accountability: false,
});
const expandedStepSections = ref<Record<string, { options: boolean; payload: boolean }>>({});

const tableHeaders = [
  { text: 'Status', value: 'type', width: 120 },
  { text: 'Execution Time', value: 'date', width: 220 },
  { text: 'Failed Operation', value: 'operation', width: 200 },
  { text: 'Message / Output', value: 'message' },
  { text: '', value: 'actions', width: 100, align: 'right' },
];

const successRate = computed(() => {
  const total = successCount.value + errorCount.value;
  if (total === 0) return 100;
  return Number(((successCount.value / total) * 100).toFixed(1));
});

const operationMap = computed(() => {
  const map: Record<string, IOperation> = {};
  if (flow.value?.operations) {
    for (const op of flow.value.operations) {
      map[op.id] = op;
    }
  }
  return map;
});

const filteredActivities = computed(() => {
  let list = activityHistories.value;

  if (activeFilter.value === 'success') {
    list = list.filter((a) => a.type === 'success');
  } else if (activeFilter.value === 'error') {
    list = list.filter((a) => a.type === 'error');
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(
      (a) =>
        (a.message && a.message.toLowerCase().includes(q)) ||
        (a.operation && a.operation.toLowerCase().includes(q)),
    );
  }

  return list;
});

const paginationLabel = computed(() => {
  if (totalCount.value === 0) return '0 items';
  const start = (page.value - 1) * LIMIT + 1;
  const end = Math.min(page.value * LIMIT, totalCount.value);
  return `${start}–${end} of ${totalCount.value}`;
});

const logDetail = computed(() => {
  if (!selectedLog.value || !flow.value) return null;

  const data = selectedLog.value.data as {
    data?: {
      $trigger?: unknown;
      $accountability?: unknown;
      [key: string]: unknown;
    };
    steps?: {
      key: string;
      status: string;
      operation: string;
      options?: unknown;
    }[];
  };

  const triggerInfo = {
    type: flow.value.trigger || 'manual',
    options: flow.value.options || {},
    payload: data?.data?.$trigger,
    accountability: data?.data?.$accountability,
  };

  const steps = (data?.steps || []).map((step) => {
    const operation = operationMap.value?.[step.operation];
    const operationKey = step.key;
    const payload = data?.data?.[operationKey] ?? {};
    return {
      ...step,
      operation,
      payload,
    };
  });

  return {
    trigger: triggerInfo,
    steps,
  };
});

function timeAgo(dateInput?: string | Date | null): string {
  if (!dateInput) return '—';
  const date = parseDirectusDate(dateInput);
  if (!date || isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatFullDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '—';
  const d = parseDirectusDate(dateInput);
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

function formatTriggerType(type: string): string {
  if (!type) return 'Manual';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatStepType(type: string): string {
  if (!type) return 'Step';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getStepKey(index: number, step?: { key?: string } | null): string {
  return step?.key || `step-${index}`;
}

function isStepSectionExpanded(index: number, section: 'options' | 'payload'): boolean {
  const step = logDetail.value?.steps[index];
  if (!step) return false;
  const key = getStepKey(index, step);
  return expandedStepSections.value[key]?.[section] ?? false;
}

function toggleStepSection(index: number, section: 'options' | 'payload'): void {
  const step = logDetail.value?.steps[index];
  if (!step) return;
  const key = getStepKey(index, step);
  if (!expandedStepSections.value[key]) {
    expandedStepSections.value[key] = { options: false, payload: false };
  }
  expandedStepSections.value[key][section] = !expandedStepSections.value[key][section];
}

function formatJSON(obj: unknown): string {
  if (!obj) return '{}';
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function copyText(text: string, keyName?: string) {
  try {
    await navigator.clipboard.writeText(text);
    if (keyName) {
      copySuccessKey.value = keyName;
      setTimeout(() => {
        copySuccessKey.value = null;
      }, 1500);
    }
  } catch {
    // ignore
  }
}

async function copyFlowId(id: string) {
  await copyText(id);
  copiedId.value = true;
  setTimeout(() => {
    copiedId.value = false;
  }, 1500);
}

function navigateToSettings() {
  router.push(`/settings/flows/${flowId.value}`);
}

async function loadFlow() {
  try {
    const { data } = await api.get<{ data: IFlow }>(`/flows/${flowId.value}`, {
      params: { fields: '*,operations.*,flow_manager_metadata_id.*' },
    });
    flowName.value = data?.data?.name ?? '';
    flow.value = data?.data ?? null;
  } catch {
    flowName.value = '';
    flow.value = null;
  }
}

async function loadActivityHistories() {
  loading.value = true;
  error.value = null;
  try {
    await loadFlow();
    const queries = [`page=${page.value}`, `limit=${LIMIT}`];
    const { data } = await api.get<{
      activityHistories: ActivityHistory[];
      successCount: number;
      errorCount: number;
    }>(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/dashboard/${flowId.value}?${queries.join('&')}`);
    activityHistories.value = data?.activityHistories ?? [];
    const successVal =
      data?.successCount ??
      flow.value?.flow_manager_metadata_id?.flow_manager_success_counter ??
      0;
    const errorVal =
      data?.errorCount ?? flow.value?.flow_manager_metadata_id?.flow_manager_error_counter ?? 0;
    const count = successVal + errorVal;
    totalCount.value = count;
    successCount.value = successVal;
    errorCount.value = errorVal;
    totalPages.value = Math.max(1, Math.ceil(count / LIMIT));
  } catch (e: unknown) {
    activityHistories.value = [];
    totalPages.value = 1;
    totalCount.value = 0;
    let errorMessage = 'Failed to load activity.';
    if (isApiError(e)) {
      const resData = e.response?.data;
      errorMessage =
        e.response?.status === 404
          ? (resData?.error ?? 'Flow not found')
          : (resData?.errors?.[0]?.message ??
            resData?.error ??
            e.message ??
            'Failed to load activity.');
    } else if (e instanceof Error) {
      errorMessage = e.message;
    }
    error.value = errorMessage;
  } finally {
    loading.value = false;
  }
}

async function onRefresh() {
  refreshLoading.value = true;
  try {
    await loadActivityHistories();
  } finally {
    refreshLoading.value = false;
  }
}

watch(page, () => {
  loadActivityHistories();
});

watch(
  () => route.params.flowId,
  (newId) => {
    if (newId) {
      page.value = 1;
      loadActivityHistories();
    }
  },
);

onMounted(() => {
  loadActivityHistories();
});
</script>

<template>
  <private-view :title="flowName ? `Flow Activity: ${flowName}` : 'Flow Activity'">
    <template #title-outer:prepend>
      <v-button
        v-tooltip.bottom="'Back to Dashboard'"
        to="/flow-manager/dashboard"
        class="mr-3"
        icon
        rounded
      >
        <v-icon name="arrow_back" />
      </v-button>
    </template>

    <template #actions>
      <v-button
        v-tooltip.bottom="'Refresh Activity'"
        icon
        rounded
        secondary
        :loading="refreshLoading"
        @click="onRefresh"
      >
        <v-icon name="refresh" />
      </v-button>
      <v-button secondary class="action-nav-btn" @click="navigateToSettings">
        <v-icon name="open_in_new" class="mr-1" />
        Open in Editor
      </v-button>
      <v-button secondary to="/flow-manager" class="action-nav-btn">
        <v-icon name="list" class="mr-1" />
        All Flows
      </v-button>
    </template>

    <div class="detail-container">
      <div v-if="loading" class="detail-loading">
        <v-progress-circular indeterminate />
        <span>Loading execution history...</span>
      </div>

      <div v-else-if="error" class="error-state">
        <v-notice type="danger" :title="error">
          Could not retrieve activity history for this flow.
        </v-notice>
        <v-button class="mt-4" to="/flow-manager/dashboard"> Back to Dashboard </v-button>
      </div>

      <div v-else class="detail-body">
        <!-- 1. Flow Profile Banner -->
        <div v-if="flow" class="flow-banner">
          <div class="flow-banner-main">
            <div
              class="flow-banner-avatar"
              :style="{
                backgroundColor: `${flow.color || 'var(--theme--primary)'}18`,
                color: flow.color || 'var(--theme--primary)',
              }"
            >
              <v-icon :name="flow.icon || 'bolt'" />
            </div>
            <div class="flow-banner-text">
              <div class="flow-title-row">
                <h2 class="flow-title">{{ flow.name }}</h2>
                <span :class="['banner-badge status', flow.status]">
                  <span class="dot" />
                  {{ flow.status }}
                </span>
                <span class="banner-badge trigger">
                  {{ formatTriggerType(flow.trigger || 'manual') }}
                </span>
              </div>
              <div class="flow-sub-row">
                <button
                  type="button"
                  class="id-pill"
                  :title="copiedId ? 'Copied!' : 'Click to copy ID'"
                  @click="copyFlowId(flow.id)"
                >
                  <span class="id-text">ID: {{ flow.id }}</span>
                  <v-icon :name="copiedId ? 'check' : 'content_copy'" x-small class="id-icon" />
                </button>
                <span v-if="flow.description" class="flow-desc" :title="flow.description">
                  {{ flow.description }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. KPI Metrics Summary Cards -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <span class="kpi-title">Total Runs</span>
            <div class="kpi-val">{{ totalCount.toLocaleString() }}</div>
            <div class="kpi-sub">Logged execution records</div>
          </div>

          <div class="kpi-card success">
            <span class="kpi-title">Passed Runs</span>
            <div class="kpi-val success">{{ successCount.toLocaleString() }}</div>
            <div class="kpi-sub success">
              <v-icon name="check_circle" x-small class="mr-1" />
              Completed successfully
            </div>
          </div>

          <div :class="['kpi-card', { danger: errorCount > 0 }]">
            <span class="kpi-title">Failed Runs</span>
            <div :class="['kpi-val', { danger: errorCount > 0 }]">
              {{ errorCount.toLocaleString() }}
            </div>
            <div class="kpi-sub danger">
              <v-icon name="error" x-small class="mr-1" />
              Runtime exceptions
            </div>
          </div>

          <div class="kpi-card health-kpi">
            <span class="kpi-title">Success Rate</span>
            <div
              :class="[
                'kpi-val',
                successRate >= 90 ? 'success' : successRate >= 70 ? 'warning' : 'danger',
              ]"
            >
              {{ successRate }}%
            </div>
            <div class="kpi-progress">
              <div
                class="kpi-progress-fill"
                :style="{
                  width: `${successRate}%`,
                  backgroundColor:
                    successRate >= 90 ? '#10b981' : successRate >= 70 ? '#f59e0b' : '#ef4444',
                }"
              />
            </div>
          </div>
        </div>

        <!-- 3. Activity History Section -->
        <div class="activity-section">
          <div class="section-toolbar">
            <div class="toolbar-left">
              <h3 class="section-heading">Execution Log History</h3>
              <div class="filter-pills">
                <button
                  type="button"
                  :class="['filter-btn', { active: activeFilter === 'all' }]"
                  @click="activeFilter = 'all'"
                >
                  All Runs ({{ totalCount }})
                </button>
                <button
                  type="button"
                  :class="['filter-btn success-btn', { active: activeFilter === 'success' }]"
                  @click="activeFilter = 'success'"
                >
                  Passed ({{ successCount }})
                </button>
                <button
                  type="button"
                  :class="['filter-btn danger-btn', { active: activeFilter === 'error' }]"
                  @click="activeFilter = 'error'"
                >
                  Failed ({{ errorCount }})
                </button>
              </div>
            </div>

            <div class="search-box">
              <v-icon name="search" small class="search-icon" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search error or step name..."
                class="search-input"
              />
              <button
                v-if="searchQuery"
                type="button"
                class="clear-search"
                @click="searchQuery = ''"
              >
                <v-icon name="close" x-small />
              </button>
            </div>
          </div>

          <div class="table-container">
            <v-table
              :items="filteredActivities"
              :headers="tableHeaders"
              class="history-table"
              :active="selectedLog ? [selectedLog.id] : []"
              @click:row="({ item }: { item: ActivityHistory }) => (selectedLog = item)"
            >
              <template #[`item.type`]="{ item }">
                <span :class="['status-badge', item.type]">
                  <v-icon
                    :name="item.type === 'success' ? 'check_circle' : 'error'"
                    small
                    class="badge-icon"
                  />
                  <span>{{ item.type === 'success' ? 'PASSED' : 'FAILED' }}</span>
                </span>
              </template>

              <template #[`item.date`]="{ item }">
                <div class="date-cell">
                  <span class="relative-date">{{ timeAgo(item.date) }}</span>
                  <span class="exact-date">{{ formatFullDate(item.date) }}</span>
                </div>
              </template>

              <template #[`item.operation`]="{ item }">
                <span v-if="item.operation" class="step-pill">
                  <v-icon name="account_tree" x-small class="mr-1" />
                  {{ item.operation }}
                </span>
                <span v-else class="text-muted">—</span>
              </template>

              <template #[`item.message`]="{ item }">
                <div
                  :class="['msg-cell', { 'has-error': item.type === 'error' }]"
                  :title="item.message || ''"
                >
                  {{ item.message || (item.type === 'success' ? 'All steps succeeded' : '—') }}
                </div>
              </template>

              <template #[`item.actions`]="{ item }">
                <v-button
                  v-tooltip.bottom="'Inspect Execution Trace'"
                  x-small
                  secondary
                  class="inspect-btn"
                  @click.stop="selectedLog = item"
                >
                  <v-icon name="visibility" x-small class="mr-1" />
                  Trace
                </v-button>
              </template>
            </v-table>

            <div v-if="!filteredActivities.length" class="empty-table">
              <v-icon name="history" class="empty-table-icon" />
              <div class="empty-table-title">No execution logs found</div>
              <div class="empty-table-sub">
                Try clearing your search or switching filter categories.
              </div>
            </div>
          </div>

          <!-- Pagination -->
          <div v-if="activityHistories.length" class="pagination-bar">
            <span class="pagination-info">{{ paginationLabel }}</span>
            <v-pagination
              v-model="page"
              :length="totalPages"
              :total-visible="5"
              show-first-last
              class="pagination"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 4. Execution Trace Drawer -->
    <v-drawer
      :title="selectedLog ? `Execution Trace (${formatFullDate(selectedLog.date)})` : 'Execution'"
      :model-value="!!selectedLog"
      icon="insights"
      @update:model-value="selectedLog = null"
      @cancel="selectedLog = null"
    >
      <div v-if="logDetail && selectedLog" class="drawer-body">
        <!-- Status Alert Banner -->
        <div :class="['execution-banner', selectedLog.type]">
          <v-icon
            :name="selectedLog.type === 'success' ? 'check_circle' : 'error'"
            class="banner-status-icon"
          />
          <div class="banner-status-text">
            <div class="banner-title">
              {{
                selectedLog.type === 'success' ? 'Flow Execution Passed' : 'Flow Execution Failed'
              }}
            </div>
            <div v-if="selectedLog.message" class="banner-msg">
              {{ selectedLog.message }}
            </div>
            <div v-if="selectedLog.operation" class="banner-op">
              Failed at step: <strong>{{ selectedLog.operation }}</strong>
            </div>
          </div>
        </div>

        <!-- Pipeline Timeline -->
        <div class="timeline-container">
          <div class="timeline-title">
            <v-icon name="alt_route" small class="mr-1" />
            Execution Pipeline Steps
          </div>

          <!-- Step 0: Trigger -->
          <div class="timeline-step trigger-step">
            <div class="step-marker passed">
              <v-icon name="bolt" small />
            </div>
            <div class="step-card">
              <div class="step-card-header">
                <span class="step-badge trigger">TRIGGER</span>
                <span class="step-name">{{ formatTriggerType(logDetail.trigger.type) }}</span>
              </div>

              <!-- Trigger Collapsible Sections -->
              <div class="collapsible-group">
                <div class="collapsible-box">
                  <div
                    class="collapsible-bar"
                    @click="expandedSections.payload = !expandedSections.payload"
                  >
                    <v-icon :name="expandedSections.payload ? 'expand_more' : 'chevron_right'" />
                    <span>Trigger Payload ($trigger)</span>
                  </div>
                  <div v-if="expandedSections.payload" class="code-view">
                    <button
                      type="button"
                      class="code-copy-btn"
                      :title="copySuccessKey === 'trigger_payload' ? 'Copied!' : 'Copy JSON'"
                      @click.stop="
                        copyText(formatJSON(logDetail.trigger.payload), 'trigger_payload')
                      "
                    >
                      <v-icon
                        :name="copySuccessKey === 'trigger_payload' ? 'check' : 'content_copy'"
                        x-small
                      />
                    </button>
                    <pre class="code-content"><code>{{ formatJSON(logDetail.trigger.payload) }}</code></pre>
                  </div>
                </div>

                <div class="collapsible-box">
                  <div
                    class="collapsible-bar"
                    @click="expandedSections.accountability = !expandedSections.accountability"
                  >
                    <v-icon
                      :name="expandedSections.accountability ? 'expand_more' : 'chevron_right'"
                    />
                    <span>Accountability ($accountability)</span>
                  </div>
                  <div v-if="expandedSections.accountability" class="code-view">
                    <button
                      type="button"
                      class="code-copy-btn"
                      :title="copySuccessKey === 'trigger_accountability' ? 'Copied!' : 'Copy JSON'"
                      @click.stop="
                        copyText(
                          formatJSON(logDetail.trigger.accountability),
                          'trigger_accountability',
                        )
                      "
                    >
                      <v-icon
                        :name="
                          copySuccessKey === 'trigger_accountability' ? 'check' : 'content_copy'
                        "
                        x-small
                      />
                    </button>
                    <pre class="code-content"><code>{{ formatJSON(logDetail.trigger.accountability) }}</code></pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Pipeline Execution Steps -->
          <div
            v-for="(step, sIdx) in logDetail.steps"
            :key="step.key || sIdx"
            :class="['timeline-step', step.status === 'reject' ? 'failed-step' : 'passed-step']"
          >
            <div :class="['step-marker', step.status === 'reject' ? 'failed' : 'passed']">
              <v-icon :name="step.status === 'reject' ? 'close' : 'check'" small />
            </div>

            <div class="step-card">
              <div class="step-card-header">
                <span :class="['step-badge', step.status === 'reject' ? 'rejected' : 'resolved']">
                  {{ step.status === 'reject' ? 'FAILED' : 'PASSED' }}
                </span>
                <span class="step-name">{{ step.operation?.name || step.key }}</span>
                <code class="step-key">[{{ step.key }}]</code>
                <span v-if="step.operation?.type" class="step-kind">
                  {{ formatStepType(step.operation.type) }}
                </span>
              </div>

              <!-- Step Collapsible Details -->
              <div class="collapsible-group">
                <div class="collapsible-box">
                  <div
                    class="collapsible-bar"
                    @click="toggleStepSection(sIdx, 'options')"
                  >
                    <v-icon
                      :name="isStepSectionExpanded(sIdx, 'options') ? 'expand_more' : 'chevron_right'"
                    />
                    <span>Operation Options</span>
                  </div>
                  <div v-if="isStepSectionExpanded(sIdx, 'options')" class="code-view">
                    <button
                      type="button"
                      class="code-copy-btn"
                      :title="copySuccessKey === `step_${sIdx}_opt` ? 'Copied!' : 'Copy JSON'"
                      @click.stop="copyText(formatJSON(step.options), `step_${sIdx}_opt`)"
                    >
                      <v-icon
                        :name="copySuccessKey === `step_${sIdx}_opt` ? 'check' : 'content_copy'"
                        x-small
                      />
                    </button>
                    <pre class="code-content"><code>{{ formatJSON(step.options) }}</code></pre>
                  </div>
                </div>

                <div class="collapsible-box">
                  <div
                    class="collapsible-bar"
                    @click="toggleStepSection(sIdx, 'payload')"
                  >
                    <v-icon
                      :name="isStepSectionExpanded(sIdx, 'payload') ? 'expand_more' : 'chevron_right'"
                    />
                    <span>Step Output / Payload</span>
                  </div>
                  <div v-if="isStepSectionExpanded(sIdx, 'payload')" class="code-view">
                    <button
                      type="button"
                      class="code-copy-btn"
                      :title="copySuccessKey === `step_${sIdx}_pay` ? 'Copied!' : 'Copy JSON'"
                      @click.stop="copyText(formatJSON(step.payload), `step_${sIdx}_pay`)"
                    >
                      <v-icon
                        :name="copySuccessKey === `step_${sIdx}_pay` ? 'check' : 'content_copy'"
                        x-small
                      />
                    </button>
                    <pre class="code-content"><code>{{ formatJSON(step.payload) }}</code></pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </v-drawer>
  </private-view>
</template>

<style scoped lang="scss">
.detail-container {
  padding: 24px;
  max-width: 1360px;
  margin: 0 auto;
}

.detail-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 32px;
  font-size: 14px;
  color: var(--theme--foreground-subdued, #64748b);
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 1. Profile Banner */
.flow-banner {
  padding: 16px 20px;
  background-color: var(--theme--background-subdued, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
}

.flow-banner-main {
  display: flex;
  align-items: center;
  gap: 14px;
}

.flow-banner-avatar {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 20px;
}

.flow-banner-text {
  min-width: 0;
  flex: 1;
}

.flow-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.flow-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--theme--foreground, #1e293b);
  margin: 0;
}

.banner-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &.status.active {
    background: rgba(16, 185, 129, 0.1);
    color: #059669;
    .dot {
      background: #10b981;
    }
  }

  &.status.inactive {
    background: rgba(100, 116, 139, 0.1);
    color: #64748b;
    .dot {
      background: #94a3b8;
    }
  }

  &.trigger {
    background: var(--theme--background-subdued, #f1f5f9);
    color: var(--theme--foreground-subdued, #64748b);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
}

.flow-sub-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.id-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  background: var(--theme--background, #ffffff);
  cursor: pointer;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);

  &:hover {
    border-color: var(--theme--primary, #6366f1);
  }
}

.flow-desc {
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 500px;
}

/* 2. KPI Cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
}

.kpi-card {
  padding: 14px 18px;
  background-color: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;

  &.success {
    border-color: rgba(16, 185, 129, 0.2);
    background: rgba(16, 185, 129, 0.03);
  }

  &.danger {
    border-color: rgba(239, 68, 68, 0.2);
    background: rgba(239, 68, 68, 0.03);
  }
}

.kpi-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--theme--foreground-subdued, #64748b);
}

.kpi-val {
  font-size: 24px;
  font-weight: 700;
  color: var(--theme--foreground, #1e293b);
  margin: 4px 0;

  &.success {
    color: #059669;
  }
  &.warning {
    color: #d97706;
  }
  &.danger {
    color: #dc2626;
  }
}

.kpi-sub {
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
  display: flex;
  align-items: center;

  &.success {
    color: #059669;
  }
  &.danger {
    color: #dc2626;
  }
}

.kpi-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--theme--border-color-subdued, #e2e8f0);
  overflow: hidden;
  margin-top: 6px;
}

.kpi-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* 3. Activity Section */
.activity-section {
  background-color: var(--theme--background-subdued, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  padding: 16px 20px;
}

.section-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.section-heading {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--theme--foreground, #1e293b);
}

.filter-pills {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
  background: var(--theme--background, #ffffff);
  color: var(--theme--foreground-subdued, #64748b);
  cursor: pointer;
  transition: all 0.15s ease;

  &.active {
    background: var(--theme--primary, #6366f1);
    border-color: var(--theme--primary, #6366f1);
    color: #ffffff;
    font-weight: 600;
  }

  &.success-btn.active {
    background: #10b981;
    border-color: #10b981;
    color: #ffffff;
  }

  &.danger-btn.active {
    background: #ef4444;
    border-color: #ef4444;
    color: #ffffff;
  }
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 250px;
}

.search-icon {
  position: absolute;
  left: 8px;
  color: var(--theme--foreground-subdued, #94a3b8);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 6px 28px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
  background: var(--theme--background, #ffffff);
  color: var(--theme--foreground, #1e293b);

  &:focus {
    outline: none;
    border-color: var(--theme--primary, #6366f1);
  }
}

.clear-search {
  position: absolute;
  right: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--theme--foreground-subdued, #94a3b8);
}

.table-container {
  overflow-x: auto;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;

  &.success {
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
  }

  &.error {
    background: rgba(239, 68, 68, 0.12);
    color: #dc2626;
  }
}

.date-cell {
  display: flex;
  flex-direction: column;
}

.relative-date {
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
}

.exact-date {
  font-size: 10px;
  color: var(--theme--foreground-subdued, #94a3b8);
}

.step-pill {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
}

.msg-cell {
  font-size: 11px;
  color: var(--theme--foreground, #334155);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380px;

  &.has-error {
    color: #dc2626;
    font-family: ui-monospace, monospace;
  }
}

.inspect-btn {
  font-size: 11px;
}

.text-muted {
  color: var(--theme--foreground-subdued, #94a3b8);
}

.empty-table {
  padding: 40px 16px;
  text-align: center;
  color: var(--theme--foreground-subdued, #94a3b8);
}

.empty-table-icon {
  font-size: 32px;
  margin-bottom: 8px;
  opacity: 0.6;
}

.empty-table-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme--foreground, #475569);
}

.empty-table-sub {
  font-size: 11px;
  margin-top: 4px;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--theme--border-color-subdued, #f1f5f9);
}

.pagination-info {
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
}

/* 4. Drawer & Execution Trace */
.drawer-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.execution-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 6px;

  &.success {
    background-color: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.25);
    .banner-status-icon {
      color: #10b981;
    }
  }

  &.error {
    background-color: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    .banner-status-icon {
      color: #ef4444;
    }
  }
}

.banner-status-icon {
  font-size: 22px;
  margin-top: 2px;
  flex-shrink: 0;
}

.banner-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--theme--foreground, #1e293b);
}

.banner-msg {
  font-size: 12px;
  font-family: ui-monospace, monospace;
  color: #dc2626;
  margin-top: 4px;
  word-break: break-word;
}

.banner-op {
  font-size: 11px;
  color: #b91c1c;
  margin-top: 2px;
}

.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.timeline-title {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--theme--foreground-subdued, #64748b);
}

.timeline-step {
  position: relative;
  display: flex;
  gap: 12px;
  padding-left: 4px;

  &:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 17px;
    top: 28px;
    bottom: -14px;
    width: 2px;
    background-color: var(--theme--border-color-subdued, #e2e8f0);
  }
}

.step-marker {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  z-index: 1;

  &.passed {
    background-color: rgba(16, 185, 129, 0.15);
    color: #059669;
  }

  &.failed {
    background-color: rgba(239, 68, 68, 0.15);
    color: #dc2626;
  }
}

.step-card {
  flex: 1;
  background-color: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  padding: 10px 14px;
  min-width: 0;
}

.step-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.step-badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;

  &.trigger {
    background-color: rgba(99, 102, 241, 0.12);
    color: #4f46e5;
  }

  &.resolved {
    background-color: rgba(16, 185, 129, 0.12);
    color: #059669;
  }

  &.rejected {
    background-color: rgba(239, 68, 68, 0.12);
    color: #dc2626;
  }
}

.step-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
}

.step-key {
  font-size: 10px;
  color: var(--theme--foreground-subdued, #94a3b8);
}

.step-kind {
  font-size: 10px;
  color: var(--theme--foreground-subdued, #64748b);
  margin-left: auto;
}

.collapsible-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.collapsible-box {
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 4px;
  background: var(--theme--background, #ffffff);
  overflow: hidden;
}

.collapsible-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--theme--foreground, #334155);
  cursor: pointer;
  user-select: none;
  background: var(--theme--background-subdued, #f8fafc);

  &:hover {
    background: #f1f5f9;
  }
}

.code-view {
  position: relative;
  border-top: 1px solid var(--theme--border-color-subdued, #e2e8f0);
}

.code-copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #cbd5e1;
  border-radius: 4px;
  padding: 3px 6px;
  cursor: pointer;
  z-index: 2;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }
}

.code-content {
  margin: 0;
  padding: 10px 12px;
  background: #0f172a;
  color: #f8fafc;
  font-size: 11px;
  line-height: 1.5;
  font-family: ui-monospace, monospace;
  max-height: 220px;
  overflow: auto;
}

.mr-1 {
  margin-right: 4px;
}

.mr-3 {
  margin-right: 12px;
}

.action-nav-btn {
  margin-left: 6px;
}
</style>

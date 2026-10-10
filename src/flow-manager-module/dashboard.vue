<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useApi } from '@directus/extensions-sdk';
import { Chart, type ChartConfiguration } from 'chart.js/auto';

interface FlowStatItem {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  status: string;
  trigger?: string;
  flow_manager_run_counter: number;
  flow_manager_success_counter: number;
  flow_manager_error_counter: number;
  flow_manager_last_run_at: string | null;
  flow_manager_last_run_message: string | null;
  flow_manager_last_run_operation: string | null;
}

const api = useApi();
const router = useRouter();

const flows = ref<FlowStatItem[]>([]);
const loading = ref(true);
const chartCanvas = ref<HTMLCanvasElement | null>(null);
const chartType = ref<'bar' | 'line'>('bar');
const searchQuery = ref('');
const activeFilter = ref<'all' | 'active' | 'inactive' | 'errors'>('all');
const copiedId = ref<string | null>(null);
let copyTimer: ReturnType<typeof setTimeout> | null = null;
let chartInstance: Chart | null = null;
let themeObserver: MutationObserver | null = null;

const chartTypeOptions = [
  { text: 'Bar chart', value: 'bar' },
  { text: 'Line chart', value: 'line' },
];

const totalFlows = computed(() => flows.value.length);
const activeFlowsCount = computed(() => flows.value.filter((f) => f.status === 'active').length);
const inactiveFlowsCount = computed(() => flows.value.filter((f) => f.status !== 'active').length);

const totalRuns = computed(() =>
  flows.value.reduce((sum, f) => sum + (f.flow_manager_run_counter || 0), 0),
);
const totalSuccess = computed(() =>
  flows.value.reduce((sum, f) => sum + (f.flow_manager_success_counter || 0), 0),
);
const totalError = computed(() =>
  flows.value.reduce((sum, f) => sum + (f.flow_manager_error_counter || 0), 0),
);

const overallSuccessRate = computed(() => {
  const total = totalSuccess.value + totalError.value;
  if (total === 0) return 100;
  return Number(((totalSuccess.value / total) * 100).toFixed(1));
});

const flowsWithErrors = computed(() =>
  flows.value
    .filter((f) => f.flow_manager_error_counter > 0)
    .sort((a, b) => b.flow_manager_error_counter - a.flow_manager_error_counter),
);

const topActiveFlows = computed(() =>
  [...flows.value]
    .filter((f) => f.flow_manager_run_counter > 0)
    .sort((a, b) => b.flow_manager_run_counter - a.flow_manager_run_counter)
    .slice(0, 10),
);

const filteredFlows = computed(() => {
  let list = flows.value;

  if (activeFilter.value === 'active') {
    list = list.filter((f) => f.status === 'active');
  } else if (activeFilter.value === 'inactive') {
    list = list.filter((f) => f.status !== 'active');
  } else if (activeFilter.value === 'errors') {
    list = list.filter((f) => f.flow_manager_error_counter > 0);
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter((f) => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
  }

  return list;
});

function timeAgo(dateInput?: string | null): string {
  if (!dateInput) return 'Never';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Never';
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

function calculateFlowRate(flow: FlowStatItem): number {
  const total = flow.flow_manager_success_counter + flow.flow_manager_error_counter;
  if (total === 0) return 100;
  return Number(((flow.flow_manager_success_counter / total) * 100).toFixed(1));
}

async function copyId(id: string) {
  try {
    await navigator.clipboard.writeText(id);
    copiedId.value = id;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copiedId.value = null;
    }, 1500);
  } catch {
    // ignore clipboard errors
  }
}

function navigateToFlowDashboard(flowId: string) {
  router.push(`/flow-manager/dashboard/${flowId}`);
}

function navigateToSettings(flowId: string) {
  router.push(`/settings/flows/${flowId}`);
}

function getChartColors() {
  const el = document.body || document.documentElement;
  const style = getComputedStyle(el);
  const success = style.getPropertyValue('--theme--success').trim() || '#10b981';
  const danger = style.getPropertyValue('--theme--danger').trim() || '#ef4444';
  const foreground = style.getPropertyValue('--theme--foreground-subdued').trim() || '#64748b';
  return { success, danger, foreground };
}

function buildChartConfig(type: 'bar' | 'line'): ChartConfiguration {
  const { success, danger, foreground } = getChartColors();
  const dataList = topActiveFlows.value;
  const labels = dataList.map((f) => (f.name.length > 18 ? `${f.name.slice(0, 16)}…` : f.name));
  const successData = dataList.map((f) => f.flow_manager_success_counter);
  const errorData = dataList.map((f) => f.flow_manager_error_counter);

  return {
    type,
    data: {
      labels,
      datasets: [
        {
          label: 'Success',
          data: successData,
          borderColor: success,
          backgroundColor: type === 'bar' ? success : 'rgba(16, 185, 129, 0.2)',
          fill: type === 'line',
          tension: 0.3,
          borderRadius: type === 'bar' ? 4 : 0,
        },
        {
          label: 'Errors',
          data: errorData,
          borderColor: danger,
          backgroundColor: type === 'bar' ? danger : 'rgba(239, 68, 68, 0.2)',
          fill: type === 'line',
          tension: 0.3,
          borderRadius: type === 'bar' ? 4 : 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      onClick(_event, elements) {
        const first = elements?.[0];
        if (first?.index !== undefined) {
          const flow = dataList[first.index];
          if (flow?.id) {
            navigateToFlowDashboard(flow.id);
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: foreground,
            font: { size: 12, weight: 600 },
            padding: 12,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: foreground,
            font: { size: 11 },
          },
          grid: { color: 'rgba(128, 128, 128, 0.12)' },
        },
        x: {
          ticks: {
            color: foreground,
            font: { size: 11 },
            maxRotation: 35,
          },
          grid: { display: type === 'bar' },
        },
      },
    },
  };
}

function renderChart() {
  if (!chartCanvas.value || !topActiveFlows.value.length) return;
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  const config = buildChartConfig(chartType.value);
  chartInstance = new Chart(chartCanvas.value, config);
}

function scheduleRenderChart() {
  nextTick().then(() => {
    requestAnimationFrame(() => {
      if (chartCanvas.value && topActiveFlows.value.length) {
        renderChart();
      }
    });
  });
}

watch(
  [topActiveFlows, chartType],
  () => {
    scheduleRenderChart();
  },
  { deep: true },
);

async function loadFlows() {
  loading.value = true;
  try {
    const { data } = await api.get<{ data: Record<string, unknown>[] }>('/flows', {
      params: {
        fields:
          'id,name,icon,color,status,trigger,flow_manager_metadata_id.flow_manager_run_counter,flow_manager_metadata_id.flow_manager_success_counter,flow_manager_metadata_id.flow_manager_error_counter,flow_manager_metadata_id.flow_manager_last_run_at,flow_manager_metadata_id.flow_manager_last_run_message,flow_manager_metadata_id.flow_manager_last_run_operation',
        limit: -1,
      },
    });
    flows.value = (data.data ?? []).map((f) => {
      const meta = (f.flow_manager_metadata_id as Record<string, unknown>) || {};
      return {
        id: String(f.id),
        name: String(f.name || 'Untitled Flow'),
        icon: f.icon ? String(f.icon) : 'bolt',
        color: f.color ? String(f.color) : 'var(--theme--primary)',
        status: String(f.status || 'inactive'),
        trigger: f.trigger ? String(f.trigger) : 'manual',
        flow_manager_run_counter: Number(meta.flow_manager_run_counter || 0),
        flow_manager_success_counter: Number(meta.flow_manager_success_counter || 0),
        flow_manager_error_counter: Number(meta.flow_manager_error_counter || 0),
        flow_manager_last_run_at: meta.flow_manager_last_run_at
          ? String(meta.flow_manager_last_run_at)
          : null,
        flow_manager_last_run_message: meta.flow_manager_last_run_message
          ? String(meta.flow_manager_last_run_message)
          : null,
        flow_manager_last_run_operation: meta.flow_manager_last_run_operation
          ? String(meta.flow_manager_last_run_operation)
          : null,
      };
    });
  } catch {
    flows.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadFlows();
  themeObserver = new MutationObserver(() => {
    scheduleRenderChart();
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  themeObserver = null;
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
});
</script>

<template>
  <private-view title="Flow Analytics & Monitoring">
    <template #title-outer:prepend>
      <v-button v-tooltip.bottom="'Back to Flows'" to="/flow-manager" class="mr-3" icon rounded>
        <v-icon name="arrow_back" />
      </v-button>
    </template>

    <template #actions>
      <v-button
        v-tooltip.bottom="'Refresh Analytics'"
        icon
        rounded
        secondary
        :loading="loading"
        @click="loadFlows"
      >
        <v-icon name="refresh" />
      </v-button>
      <v-button secondary to="/flow-manager">
        <v-icon name="list" class="mr-1" />
        Flows Directory
      </v-button>
    </template>

    <div class="dashboard-container">
      <div v-if="loading" class="dashboard-loading">
        <v-progress-circular indeterminate />
        <span>Loading flow analytics...</span>
      </div>

      <div v-else class="dashboard-body">
        <!-- 1. Executive Metric KPI Cards -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-title">Total Flows</span>
              <v-icon name="account_tree" class="kpi-icon" />
            </div>
            <div class="kpi-value">{{ totalFlows }}</div>
            <div class="kpi-sub">
              <span class="badge active">{{ activeFlowsCount }} Active</span>
              <span class="badge inactive">{{ inactiveFlowsCount }} Inactive</span>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-header">
              <span class="kpi-title">Total Executions</span>
              <v-icon name="play_arrow" class="kpi-icon" />
            </div>
            <div class="kpi-value">{{ totalRuns.toLocaleString() }}</div>
            <div class="kpi-sub muted">Lifetime execution counter</div>
          </div>

          <div class="kpi-card success">
            <div class="kpi-header">
              <span class="kpi-title">Success Rate</span>
              <v-icon name="check_circle" class="kpi-icon success" />
            </div>
            <div class="kpi-value success">{{ overallSuccessRate }}%</div>
            <div class="kpi-sub">
              <span class="stat-count success">{{ totalSuccess.toLocaleString() }}</span>
              <span>successful runs</span>
            </div>
          </div>

          <div :class="['kpi-card', { danger: totalError > 0 }]">
            <div class="kpi-header">
              <span class="kpi-title">Failures & Errors</span>
              <v-icon name="error" class="kpi-icon danger" />
            </div>
            <div :class="['kpi-value', { danger: totalError > 0 }]">
              {{ totalError.toLocaleString() }}
            </div>
            <div class="kpi-sub">
              <span v-if="totalError > 0" class="badge danger">
                {{ flowsWithErrors.length }} flow(s) affected
              </span>
              <span v-else class="badge success">Zero errors</span>
            </div>
          </div>
        </div>

        <!-- 2. Charts & Attention Grid -->
        <div class="analytics-grid">
          <!-- Left: Activity Chart -->
          <div class="dashboard-card chart-card">
            <div class="card-header">
              <div>
                <h3 class="card-title">Top Flows Activity</h3>
                <p class="card-sub">Comparison of executions across the most active flows</p>
              </div>
              <v-select
                v-model="chartType"
                :items="chartTypeOptions"
                class="chart-select"
                small
                inline
              />
            </div>
            <div v-if="topActiveFlows.length" class="chart-wrapper">
              <canvas ref="chartCanvas"></canvas>
            </div>
            <div v-else class="empty-chart">
              <v-icon name="bar_chart" class="empty-icon" />
              <span>No execution data available yet</span>
            </div>
          </div>

          <!-- Right: Issues & Attention Widget -->
          <div class="dashboard-card issues-card">
            <div class="card-header">
              <h3 class="card-title">Issues & Attention Needed</h3>
              <span v-if="flowsWithErrors.length" class="pill danger">
                {{ flowsWithErrors.length }} Failing
              </span>
            </div>

            <div v-if="flowsWithErrors.length" class="issues-list">
              <div
                v-for="errFlow in flowsWithErrors.slice(0, 4)"
                :key="errFlow.id"
                class="issue-item"
                @click="navigateToFlowDashboard(errFlow.id)"
              >
                <div class="issue-main">
                  <div
                    class="issue-icon"
                    :style="{
                      backgroundColor: `${errFlow.color}15`,
                      color: errFlow.color,
                    }"
                  >
                    <v-icon :name="errFlow.icon || 'bolt'" small />
                  </div>
                  <div class="issue-details">
                    <div class="issue-name">{{ errFlow.name }}</div>
                    <div class="issue-msg" :title="errFlow.flow_manager_last_run_message || ''">
                      {{ errFlow.flow_manager_last_run_message || 'Last execution failed' }}
                    </div>
                  </div>
                </div>
                <div class="issue-action">
                  <span class="error-badge">{{ errFlow.flow_manager_error_counter }} errs</span>
                  <v-icon name="chevron_right" small class="arrow" />
                </div>
              </div>
            </div>

            <div v-else class="healthy-state">
              <v-icon name="verified_user" class="healthy-icon" />
              <div class="healthy-title">All Systems Operational</div>
              <div class="healthy-sub">No flows have recorded runtime errors.</div>
            </div>
          </div>
        </div>

        <!-- 3. Flow Health & Performance Directory -->
        <div class="dashboard-card table-card">
          <div class="table-toolbar">
            <div class="toolbar-left">
              <h3 class="card-title">Flows Performance Directory</h3>
              <div class="filter-pills">
                <button
                  type="button"
                  :class="['filter-btn', { active: activeFilter === 'all' }]"
                  @click="activeFilter = 'all'"
                >
                  All ({{ flows.length }})
                </button>
                <button
                  type="button"
                  :class="['filter-btn', { active: activeFilter === 'active' }]"
                  @click="activeFilter = 'active'"
                >
                  Active ({{ activeFlowsCount }})
                </button>
                <button
                  type="button"
                  :class="['filter-btn', { active: activeFilter === 'inactive' }]"
                  @click="activeFilter = 'inactive'"
                >
                  Inactive ({{ inactiveFlowsCount }})
                </button>
                <button
                  type="button"
                  :class="['filter-btn danger-filter', { active: activeFilter === 'errors' }]"
                  @click="activeFilter = 'errors'"
                >
                  Has Errors ({{ flowsWithErrors.length }})
                </button>
              </div>
            </div>

            <div class="search-box">
              <v-icon name="search" small class="search-icon" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search flow by name or ID..."
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

          <div class="table-wrapper">
            <table class="flow-table">
              <thead>
                <tr>
                  <th class="th-flow">Flow Name</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th class="text-right">Total Runs</th>
                  <th class="text-right">Success / Error</th>
                  <th class="th-health">Health Rate</th>
                  <th>Last Run</th>
                  <th class="text-right th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="flow in filteredFlows" :key="flow.id" class="flow-row">
                  <td class="td-flow">
                    <div class="flow-cell">
                      <div
                        class="cell-icon"
                        :style="{
                          backgroundColor: `${flow.color}15`,
                          color: flow.color,
                        }"
                      >
                        <v-icon :name="flow.icon || 'bolt'" small />
                      </div>
                      <div class="cell-info">
                        <span class="flow-cell-name" :title="flow.name">{{ flow.name }}</span>
                        <div class="flow-cell-id">
                          <code class="id-code">{{ flow.id.slice(0, 8) }}…</code>
                          <button
                            type="button"
                            class="cell-copy-btn"
                            :title="copiedId === flow.id ? 'Copied!' : 'Copy ID'"
                            @click="copyId(flow.id)"
                          >
                            <v-icon
                              :name="copiedId === flow.id ? 'check' : 'content_copy'"
                              x-small
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="tag-chip trigger">{{ flow.trigger || 'manual' }}</span>
                  </td>
                  <td>
                    <span :class="['tag-chip status', flow.status]">
                      <span class="dot" />
                      {{ flow.status }}
                    </span>
                  </td>
                  <td class="text-right font-mono">
                    {{ flow.flow_manager_run_counter.toLocaleString() }}
                  </td>
                  <td class="text-right font-mono">
                    <span class="success-text">{{
                      flow.flow_manager_success_counter.toLocaleString()
                    }}</span>
                    <span class="slash">/</span>
                    <span :class="{ 'error-text': flow.flow_manager_error_counter > 0 }">{{
                      flow.flow_manager_error_counter.toLocaleString()
                    }}</span>
                  </td>
                  <td>
                    <div class="health-bar-container">
                      <div class="health-bar">
                        <div
                          class="health-fill"
                          :style="{
                            width: `${calculateFlowRate(flow)}%`,
                            backgroundColor:
                              calculateFlowRate(flow) >= 90
                                ? '#10b981'
                                : calculateFlowRate(flow) >= 70
                                  ? '#f59e0b'
                                  : '#ef4444',
                          }"
                        />
                      </div>
                      <span class="health-pct">{{ calculateFlowRate(flow) }}%</span>
                    </div>
                  </td>
                  <td class="cell-date">
                    {{ timeAgo(flow.flow_manager_last_run_at) }}
                  </td>
                  <td class="text-right td-actions">
                    <v-button
                      v-tooltip.bottom="'View Detailed Activity'"
                      x-small
                      icon
                      secondary
                      @click="navigateToFlowDashboard(flow.id)"
                    >
                      <v-icon name="insights" />
                    </v-button>
                    <v-button
                      v-tooltip.bottom="'Edit Flow in Settings'"
                      x-small
                      icon
                      secondary
                      class="ml-1"
                      @click="navigateToSettings(flow.id)"
                    >
                      <v-icon name="open_in_new" />
                    </v-button>
                  </td>
                </tr>

                <tr v-if="!filteredFlows.length">
                  <td colspan="8" class="empty-table-cell">
                    <v-icon name="search_off" class="empty-search-icon" />
                    <div>No flows match your search or filter criteria</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </private-view>
</template>

<style scoped lang="scss">
.dashboard-container {
  padding: 24px;
  max-width: 1360px;
  margin: 0 auto;
}

.dashboard-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 32px;
  font-size: 14px;
  color: var(--theme--foreground-subdued, #64748b);
}

.dashboard-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 1. KPI Cards */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.kpi-card {
  padding: 16px 20px;
  background-color: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  &.success {
    border-color: rgba(16, 185, 129, 0.25);
    background-color: rgba(16, 185, 129, 0.04);
  }

  &.danger {
    border-color: rgba(239, 68, 68, 0.25);
    background-color: rgba(239, 68, 68, 0.04);
  }
}

.kpi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.kpi-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--theme--foreground-subdued, #64748b);
}

.kpi-icon {
  font-size: 18px;
  color: var(--theme--foreground-subdued, #94a3b8);

  &.success {
    color: #10b981;
  }
  &.danger {
    color: #ef4444;
  }
}

.kpi-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--theme--foreground, #1e293b);
  margin-bottom: 8px;

  &.success {
    color: #059669;
  }
  &.danger {
    color: #dc2626;
  }
}

.kpi-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);

  &.muted {
    font-size: 11px;
  }

  .badge {
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 10px;

    &.active {
      background: rgba(16, 185, 129, 0.12);
      color: #059669;
    }
    &.inactive {
      background: var(--theme--background, #e2e8f0);
      color: var(--theme--foreground-subdued, #64748b);
    }
    &.danger {
      background: rgba(239, 68, 68, 0.12);
      color: #dc2626;
    }
    &.success {
      background: rgba(16, 185, 129, 0.12);
      color: #059669;
    }
  }

  .stat-count {
    font-weight: 600;
    &.success {
      color: #059669;
    }
  }
}

/* 2. Analytics 2-Column Grid */
.analytics-grid {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
}

.dashboard-card {
  background-color: var(--theme--background-subdued, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  padding: 16px 20px;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--theme--foreground, #1e293b);
}

.card-sub {
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
  margin: 2px 0 0 0;
}

.chart-select {
  width: 130px;
}

.chart-wrapper {
  position: relative;
  height: 280px;
  width: 100%;
}

.empty-chart {
  height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--theme--foreground-subdued, #94a3b8);
  font-size: 13px;

  .empty-icon {
    font-size: 32px;
    opacity: 0.6;
  }
}

.pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;

  &.danger {
    background-color: rgba(239, 68, 68, 0.12);
    color: #dc2626;
  }
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.issue-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background-color: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: #ef4444;
    background-color: rgba(239, 68, 68, 0.02);
  }
}

.issue-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.issue-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.issue-details {
  min-width: 0;
  flex: 1;
}

.issue-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.issue-msg {
  font-size: 10px;
  color: #dc2626;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.issue-action {
  display: flex;
  align-items: center;
  gap: 6px;
}

.error-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.arrow {
  color: var(--theme--foreground-subdued, #94a3b8);
}

.healthy-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
  color: var(--theme--foreground-subdued, #64748b);

  .healthy-icon {
    font-size: 40px;
    color: #10b981;
    margin-bottom: 8px;
  }

  .healthy-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--theme--foreground, #1e293b);
  }

  .healthy-sub {
    font-size: 11px;
    margin-top: 4px;
  }
}

/* 3. Table Directory */
.table-card {
  padding: 16px;
}

.table-toolbar {
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

  &.danger-filter.active {
    background: #ef4444;
    border-color: #ef4444;
    color: #ffffff;
  }
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 260px;
}

.search-icon {
  position: absolute;
  left: 8px;
  color: var(--theme--foreground-subdued, #94a3b8);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 6px 28px 6px 28px;
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

.table-wrapper {
  overflow-x: auto;
}

.flow-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th {
    text-align: left;
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--theme--foreground-subdued, #64748b);
    border-bottom: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--theme--border-color-subdued, #f1f5f9);
    vertical-align: middle;
  }

  .flow-row:hover td {
    background-color: var(--theme--background-subdued, #f8fafc);
  }
}

.th-flow {
  width: 28%;
}

.th-health {
  width: 140px;
}

.th-actions {
  width: 100px;
}

.text-right {
  text-align: right !important;
}

.font-mono {
  font-family: ui-monospace, monospace;
}

.flow-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cell-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cell-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.flow-cell-name {
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-cell-id {
  display: flex;
  align-items: center;
  gap: 4px;
}

.id-code {
  font-size: 10px;
  color: var(--theme--foreground-subdued, #94a3b8);
}

.cell-copy-btn {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--theme--foreground-subdued, #94a3b8);
  display: flex;
  align-items: center;

  &:hover {
    color: var(--theme--primary, #6366f1);
  }
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;

  &.trigger {
    background-color: var(--theme--background-subdued, #f1f5f9);
    color: var(--theme--foreground-subdued, #64748b);
  }

  &.status.active {
    background-color: rgba(16, 185, 129, 0.1);
    color: #059669;
    .dot {
      background-color: #10b981;
    }
  }

  &.status.inactive {
    background-color: rgba(100, 116, 139, 0.1);
    color: #64748b;
    .dot {
      background-color: #94a3b8;
    }
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
}

.success-text {
  color: #059669;
}

.slash {
  color: var(--theme--foreground-subdued, #cbd5e1);
  margin: 0 3px;
}

.error-text {
  color: #dc2626;
  font-weight: 700;
}

.health-bar-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.health-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background-color: var(--theme--border-color-subdued, #e2e8f0);
  overflow: hidden;
}

.health-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.health-pct {
  font-size: 11px;
  font-weight: 600;
  color: var(--theme--foreground-subdued, #64748b);
  min-width: 36px;
  text-align: right;
}

.cell-date {
  color: var(--theme--foreground-subdued, #64748b);
  white-space: nowrap;
}

.empty-table-cell {
  text-align: center;
  padding: 40px !important;
  color: var(--theme--foreground-subdued, #94a3b8);

  .empty-search-icon {
    font-size: 32px;
    margin-bottom: 8px;
    opacity: 0.6;
  }
}

.mr-1 {
  margin-right: 4px;
}

.mr-3 {
  margin-right: 12px;
}

.ml-1 {
  margin-left: 4px;
}
</style>

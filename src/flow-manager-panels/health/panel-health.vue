<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import type { PanelHealthProps } from '../shared/types';
import { usePanelFlows } from '../shared/use-panel-flows';
import { formatRelativeTime } from '../shared/time.util';

const props = withDefaults(defineProps<PanelHealthProps>(), {
  showHeader: false,
  scope: 'all',
  flowId: null,
  viewType: 'full',
  failureThreshold: 5,
});

const { flows, loading, error, loadFlows, getHealthStats } = usePanelFlows();

const stats = computed(() => {
  return getHealthStats({
    scope: props.scope,
    flowId: props.flowId,
    failureThreshold: props.failureThreshold,
  });
});

const selectedFlow = computed(() => {
  if (props.scope !== 'single' || !props.flowId) return null;
  return flows.value.find((f) => f.id === props.flowId) || null;
});

const donutSegments = computed(() => {
  const total = stats.value.totalRuns;
  if (total === 0) {
    return {
      successOffset: 0,
      successLength: 0,
      errorOffset: 0,
      errorLength: 0,
    };
  }

  const circumference = 2 * Math.PI * 40; // r = 40 => ~251.32
  const successRatio = stats.value.successRuns / total;
  const errorRatio = stats.value.errorRuns / total;

  const successLength = successRatio * circumference;
  const errorLength = errorRatio * circumference;

  return {
    circumference,
    successLength,
    errorLength,
    errorOffset: -successLength,
  };
});

const healthBadgeColor = computed(() => {
  switch (stats.value.healthStatus) {
    case 'healthy':
      return 'var(--theme--success, #2ec4b6)';
    case 'degraded':
      return 'var(--theme--warning, #ff9f1c)';
    case 'failing':
      return 'var(--theme--danger, #e71d36)';
    default:
      return 'var(--theme--foreground-subdued, #888)';
  }
});

onMounted(() => {
  loadFlows();
});

watch(
  () => props.now,
  () => {
    loadFlows();
  },
);
</script>

<template>
  <div class="panel-health-container" :class="{ 'has-header': showHeader }">
    <div v-if="loading && flows.length === 0" class="loading-state">
      <v-progress-circular indeterminate />
    </div>

    <div v-else-if="error" class="error-state">
      <v-notice type="danger">
        {{ error }}
      </v-notice>
    </div>

    <div v-else class="health-content">
      <!-- Target flow header in single mode -->
      <div v-if="scope === 'single' && selectedFlow" class="single-flow-banner">
        <v-icon :name="selectedFlow.icon || 'bolt'" :color="selectedFlow.color" class="mr-2" />
        <span class="flow-name">{{ selectedFlow.name }}</span>
        <v-chip
          x-small
          class="ml-auto"
          :class="selectedFlow.status === 'active' ? 'active-chip' : 'inactive-chip'"
        >
          {{ selectedFlow.status }}
        </v-chip>
      </div>

      <!-- Top KPI Row -->
      <div class="kpi-row">
        <div class="kpi-item primary-rate">
          <div class="kpi-label">Success Rate</div>
          <div
            class="kpi-value"
            :style="{
              color:
                stats.totalRuns === 0
                  ? 'var(--theme--foreground-subdued)'
                  : stats.successRate >= 95
                    ? 'var(--theme--success)'
                    : stats.successRate >= 80
                      ? 'var(--theme--warning)'
                      : 'var(--theme--danger)',
            }"
          >
            {{ stats.totalRuns === 0 ? 'N/A' : `${stats.successRate}%` }}
          </div>
        </div>

        <div class="kpi-item">
          <div class="kpi-label">Total Runs</div>
          <div class="kpi-value">{{ stats.totalRuns.toLocaleString() }}</div>
        </div>

        <div class="kpi-item">
          <div class="kpi-label">Health</div>
          <div class="kpi-status-badge">
            <span class="status-dot" :style="{ backgroundColor: healthBadgeColor }" />
            <span class="status-text">{{ stats.healthStatus.toUpperCase() }}</span>
          </div>
        </div>
      </div>

      <!-- Middle visual: Donut Chart or Full Breakdown -->
      <div v-if="viewType === 'donut' || viewType === 'full'" class="chart-section">
        <div class="donut-wrapper">
          <svg viewBox="0 0 100 100" class="donut-svg">
            <!-- Background Track -->
            <circle
              cx="50"
              cy="50"
              r="40"
              class="donut-track"
              fill="transparent"
              stroke-width="12"
            />
            <!-- Success Segment -->
            <circle
              v-if="stats.successRuns > 0"
              cx="50"
              cy="50"
              r="40"
              class="donut-success"
              fill="transparent"
              stroke-width="12"
              :stroke-dasharray="`${donutSegments.successLength} ${donutSegments.circumference}`"
              stroke-dashoffset="0"
            />
            <!-- Error Segment -->
            <circle
              v-if="stats.errorRuns > 0"
              cx="50"
              cy="50"
              r="40"
              class="donut-error"
              fill="transparent"
              stroke-width="12"
              :stroke-dasharray="`${donutSegments.errorLength} ${donutSegments.circumference}`"
              :stroke-dashoffset="donutSegments.errorOffset"
            />
          </svg>
          <div class="donut-center-text">
            <span class="donut-pct">{{ stats.totalRuns === 0 ? '0' : stats.successRate }}%</span>
            <span class="donut-sub">Pass</span>
          </div>
        </div>

        <!-- Legend -->
        <div class="legend-list">
          <div class="legend-item">
            <span class="legend-box success" />
            <span class="legend-label">Success</span>
            <span class="legend-count">{{ stats.successRuns.toLocaleString() }}</span>
          </div>
          <div class="legend-item">
            <span class="legend-box error" />
            <span class="legend-label">Errors</span>
            <span class="legend-count">{{ stats.errorRuns.toLocaleString() }}</span>
          </div>
          <div class="legend-item subtle">
            <v-icon name="schedule" small class="mr-1" />
            <span class="legend-label">Last Run</span>
            <span class="legend-count">{{ formatRelativeTime(stats.lastRunAt) }}</span>
          </div>
        </div>
      </div>

      <!-- Failing Flows Alert / Message -->
      <div
        v-if="scope === 'single' && stats.lastRunMessage && stats.lastRunStatus === 'error'"
        class="error-banner"
      >
        <v-icon name="error" small class="mr-1" color="var(--theme--danger)" />
        <span class="error-msg" :title="stats.lastRunMessage">{{ stats.lastRunMessage }}</span>
      </div>

      <div
        v-else-if="scope === 'all' && stats.failingFlows.length > 0"
        class="failing-flows-summary"
      >
        <div class="failing-title">
          <v-icon name="warning" small class="mr-1" color="var(--theme--warning)" />
          Attention Needed ({{ stats.failingFlows.length }} flows with errors):
        </div>
        <div class="failing-chips">
          <span v-for="item in stats.failingFlows.slice(0, 3)" :key="item.id" class="failing-chip">
            {{ item.name }} ({{ item.errorCount }})
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.panel-health-container {
  height: 100%;
  width: 100%;
  padding: 1rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.has-header {
  padding-top: 0.5rem;
}

.loading-state,
.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.health-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
}

.single-flow-banner {
  display: flex;
  align-items: center;
  padding: 0.4rem 0.6rem;
  background: var(--theme--background-subdued);
  border-radius: var(--theme--border-radius);
  font-weight: 600;
  font-size: 0.875rem;

  .flow-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 70%;
  }

  .active-chip {
    --v-chip-color: var(--theme--success);
    --v-chip-background-color: var(--theme--success-alt, rgba(46, 196, 182, 0.15));
  }

  .inactive-chip {
    --v-chip-color: var(--theme--foreground-subdued);
  }
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.kpi-item {
  display: flex;
  flex-direction: column;
  background: var(--theme--background-subdued);
  padding: 0.6rem;
  border-radius: var(--theme--border-radius);

  .kpi-label {
    font-size: 0.75rem;
    color: var(--theme--foreground-subdued);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .kpi-value {
    font-size: 1.25rem;
    font-weight: 800;
    margin-top: 0.2rem;
    line-height: 1.2;
  }

  .kpi-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.35rem;

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-text {
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
  }
}

.chart-section {
  display: flex;
  align-items: center;
  justify-content: space-around;
  flex-grow: 1;
  padding: 0.5rem 0;
}

.donut-wrapper {
  position: relative;
  width: 100px;
  height: 100px;
  flex-shrink: 0;

  .donut-svg {
    transform: rotate(-90deg);
    width: 100%;
    height: 100%;
  }

  .donut-track {
    stroke: var(--theme--border-color-subdued, #e2e8f0);
  }

  .donut-success {
    stroke: var(--theme--success, #2ec4b6);
    transition: stroke-dasharray 0.5s ease;
  }

  .donut-error {
    stroke: var(--theme--danger, #e71d36);
    transition: stroke-dasharray 0.5s ease;
  }

  .donut-center-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    display: flex;
    flex-direction: column;

    .donut-pct {
      font-size: 0.875rem;
      font-weight: 800;
      line-height: 1;
    }

    .donut-sub {
      font-size: 0.625rem;
      color: var(--theme--foreground-subdued);
      text-transform: uppercase;
    }
  }
}

.legend-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.8125rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;

  .legend-box {
    width: 10px;
    height: 10px;
    border-radius: 2px;

    &.success {
      background: var(--theme--success, #2ec4b6);
    }

    &.error {
      background: var(--theme--danger, #e71d36);
    }
  }

  .legend-label {
    color: var(--theme--foreground-subdued);
  }

  .legend-count {
    margin-left: auto;
    font-weight: 700;
  }

  &.subtle {
    font-size: 0.75rem;
    margin-top: 0.2rem;
  }
}

.error-banner {
  display: flex;
  align-items: center;
  padding: 0.4rem 0.6rem;
  background: var(--theme--danger-alt, rgba(231, 29, 54, 0.1));
  border-radius: var(--theme--border-radius);
  font-size: 0.75rem;
  color: var(--theme--danger);

  .error-msg {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.failing-flows-summary {
  font-size: 0.75rem;

  .failing-title {
    display: flex;
    align-items: center;
    font-weight: 600;
    color: var(--theme--foreground-subdued);
    margin-bottom: 0.25rem;
  }

  .failing-chips {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;

    .failing-chip {
      background: var(--theme--danger-alt, rgba(231, 29, 54, 0.1));
      color: var(--theme--danger);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-weight: 600;
    }
  }
}

.mr-1 {
  margin-right: 0.25rem;
}

.mr-2 {
  margin-right: 0.5rem;
}

.ml-auto {
  margin-left: auto;
}
</style>

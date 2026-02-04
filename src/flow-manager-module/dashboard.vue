<template>
  <private-view :title="'Flow Dashboard'">
    <template #title-outer:prepend>
      <v-button to="/flow-manager" class="mr-4" icon rounded v-tooltip.bottom="'Back to Flows'">
        <v-icon name="arrow_back" />
      </v-button>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="insights" />
      </v-button>
    </template>

    <div class="dashboard-content">
      <div v-if="loading" class="dashboard-loading">
        <v-progress-circular indeterminate />
        <span>Loading flow statistics...</span>
      </div>

      <template v-else>
        <!-- Summary: Total success vs error -->
        <div class="dashboard-section">
          <h2 class="section-title">Overview</h2>
          <div class="chart-summary">
            <div class="summary-card success">
              <div class="summary-label">
                <v-icon name="check_circle" />
                <span>Total success count</span>
              </div>
              <div class="summary-value">{{ totalSuccess }}</div>
            </div>
            <div class="summary-card error">
              <div class="summary-label">
                <v-icon name="error" />
                <span>Total error count</span>
              </div>
              <div class="summary-value">{{ totalError }}</div>
            </div>
          </div>
        </div>

        <!-- Per-flow: Success and error count chart -->
        <div class="dashboard-section">
          <div class="section-header">
            <h2 class="section-title">Success & error count by flow</h2>
            <v-select
              v-if="flowStats.length"
              v-model="chartType"
              :items="chartTypeOptions"
              class="chart-type-select"
            />
          </div>
          <p v-if="!flowStats.length" class="empty-message">No flows with run data yet.</p>
          <template v-else>
            <div class="chart-container">
              <canvas ref="chartCanvas"></canvas>
            </div>
          </template>
        </div>
      </template>
    </div>
  </private-view>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, watch, onBeforeUnmount, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useApi } from "@directus/extensions-sdk";
import { Chart, type ChartConfiguration } from "chart.js/auto";

interface FlowStat {
  id: string;
  name: string;
  flow_manager_success_counter?: number;
  flow_manager_error_counter?: number;
}

const CHART_TYPES = ["line", "bar"] as const;
type ChartTypeValue = (typeof CHART_TYPES)[number];

export default defineComponent({
  name: "FlowManagerDashboard",
  setup() {
    const api = useApi();
    const router = useRouter();
    const flows = ref<FlowStat[]>([]);
    const loading = ref(true);
    const chartCanvas = ref<HTMLCanvasElement | null>(null);
    const chartType = ref<ChartTypeValue>("line");
    let chartInstance: Chart | null = null;

    const chartTypeOptions = [
      { text: "Line chart", value: "line" },
      { text: "Bar chart", value: "bar" },
    ];

    const totalSuccess = computed(() =>
      flows.value.reduce((sum, f) => sum + (f.flow_manager_success_counter ?? 0), 0)
    );
    const totalError = computed(() =>
      flows.value.reduce((sum, f) => sum + (f.flow_manager_error_counter ?? 0), 0)
    );

    const flowStats = computed(() =>
      [...flows.value].sort((a, b) => {
        const totalA = (a.flow_manager_success_counter ?? 0) + (a.flow_manager_error_counter ?? 0);
        const totalB = (b.flow_manager_success_counter ?? 0) + (b.flow_manager_error_counter ?? 0);
        return totalB - totalA;
      })
    );

    function getChartColors() {
      const el = document.body || document.documentElement;
      const style = getComputedStyle(el);
      const success = style.getPropertyValue("--theme--success").trim() || style.getPropertyValue("--success").trim() || "#6644ff";
      const danger = style.getPropertyValue("--theme--danger").trim() || style.getPropertyValue("--danger").trim() || "#e54d42";
      const foreground = style.getPropertyValue("--theme--foreground").trim() || style.getPropertyValue("--foreground").trim();
      const isLight = document.body.classList.contains("light");
      const foregroundFallback = isLight ? "#1a1a1a" : "#e6e6e6";
      return { success, danger, foreground: foreground || foregroundFallback };
    }

    /** Convert CSS color to rgba with given alpha (0–1) for chart fills */
    function colorWithAlpha(cssColor: string, alpha: number): string {
      const hex = cssColor.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
      }
      const rgbMatch = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgbMatch) {
        return `rgba(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]},${alpha})`;
      }
      return cssColor;
    }

    function buildChartConfig(type: ChartTypeValue): ChartConfiguration {
      const { success, danger, foreground } = getChartColors();
      const isBar = type === "bar";
      const successFill = isBar ? success : colorWithAlpha(success, 0.25);
      const dangerFill = isBar ? danger : colorWithAlpha(danger, 0.25);
      const labels = flowStats.value.map((f) => (f.name.length > 20 ? f.name.slice(0, 17) + "…" : f.name));
      const successData = flowStats.value.map((f) => f.flow_manager_success_counter ?? 0);
      const errorData = flowStats.value.map((f) => f.flow_manager_error_counter ?? 0);

      return {
        type,
        data: {
          labels,
          datasets: [
            {
              label: "Success",
              data: successData,
              borderColor: success,
              backgroundColor: successFill,
              fill: type === "line",
              tension: type === "line" ? 0.3 : 0,
            },
            {
              label: "Error",
              data: errorData,
              borderColor: danger,
              backgroundColor: dangerFill,
              fill: type === "line",
              tension: type === "line" ? 0.3 : 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: "index",
            intersect: false,
          },
          onClick(_event, elements) {
            const first = elements?.[0];
            if (first?.index !== undefined) {
              const flow = flowStats.value[first.index];
              if (flow?.id) {
                router.push(`/flow-manager/dashboard/${flow.id}`);
              }
            }
          },
          plugins: {
            legend: {
              position: "top",
              labels: {
                color: foreground,
                font: { size: 14, weight: 500 },
                padding: 16,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1,
                color: foreground,
                font: { size: 13 },
              },
              grid: { color: "rgba(128,128,128,0.2)" },
            },
            x: {
              ticks: {
                color: foreground,
                font: { size: 13 },
                maxRotation: 45,
                minRotation: 0,
              },
              grid: { display: type === "bar" },
            },
          },
        },
      };
    }

    function renderChart() {
      if (!chartCanvas.value || !flowStats.value.length) return;
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
          if (chartCanvas.value && flowStats.value.length) {
            renderChart();
          }
        });
      });
    }

    watch(
      [flowStats, chartType],
      async () => {
        if (flowStats.value.length) {
          if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
          }
          scheduleRenderChart();
        }
      },
      { deep: true }
    );

    async function loadFlows() {
      loading.value = true;
      try {
        const { data } = await api.get<{ data: FlowStat[] }>("/flows", {
          params: {
            fields: "id,name,flow_manager_success_counter,flow_manager_error_counter",
            limit: -1,
          },
        });
        flows.value = data.data ?? [];
      } catch {
        flows.value = [];
      } finally {
        loading.value = false;
      }
    }

    let themeObserver: MutationObserver | null = null;

    onMounted(() => {
      loadFlows();
      themeObserver = new MutationObserver(() => {
        if (flowStats.value.length && chartCanvas.value) {
          if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
          }
          scheduleRenderChart();
        }
      });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    });

    onBeforeUnmount(() => {
      themeObserver?.disconnect();
      themeObserver = null;
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
    });

    return {
      loading,
      flows,
      totalSuccess,
      totalError,
      flowStats,
      chartCanvas,
      chartType,
      chartTypeOptions,
    };
  },
});
</script>

<style lang="scss" scoped>
.dashboard-content {
  padding: 24px;
  max-width: 100%;
}

.dashboard-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px;
  font-size: 15px;
  color: var(--theme--foreground-subdued, var(--foreground-subdued));
}

.dashboard-section {
  margin-bottom: 32px;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: var(--theme--foreground, var(--foreground));
  letter-spacing: 0.01em;
}

.chart-type-select {
  max-width: 160px;
}

.chart-container {
  position: relative;
  height: 320px;
  width: 100%;
  cursor: pointer;
}

.empty-message {
  font-size: 15px;
  color: var(--theme--foreground-subdued, var(--foreground-subdued));
  margin: 0;
}

.chart-summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.summary-card {
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--theme--border-normal, var(--border-normal));

  &.success {
    background: color-mix(in srgb, var(--theme--success, var(--success)) 12%, transparent);
    .summary-label { color: var(--theme--success, var(--success)); }
  }

  &.error {
    background: color-mix(in srgb, var(--theme--danger, var(--danger)) 12%, transparent);
    .summary-label { color: var(--theme--danger, var(--danger)); }
  }
}

.summary-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

.summary-value {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--theme--foreground, var(--foreground));
}

.mr-4 {
  margin-right: 8px;
}
</style>

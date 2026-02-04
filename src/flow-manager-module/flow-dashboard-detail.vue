<template>
  <private-view :title="pageTitle">
    <template #title-outer:prepend>
      <v-button to="/flow-manager/dashboard" class="mr-4" icon rounded v-tooltip.bottom="'Back to Dashboard'">
        <v-icon name="arrow_back" />
      </v-button>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="insights" />
      </v-button>
    </template>

    <template #actions>
      <v-button icon rounded :loading="refreshLoading" v-tooltip.bottom="'Refresh'" @click="onRefresh">
        <v-icon name="refresh" />
      </v-button>
    </template>

    <div class="detail-content">
      <div v-if="loading" class="detail-loading">
        <v-progress-circular indeterminate />
        <span>Loading flow activity...</span>
      </div>

      <template v-else-if="error">
        <v-notice type="danger" :title="error" />
      </template>

      <template v-else>
        <!-- Summary -->
        <div class="detail-section">
          <h2 class="section-title">Overview</h2>
          <div class="chart-summary">
            <div class="summary-card success">
              <div class="summary-label">
                <v-icon name="check_circle" />
                <span>Success count</span>
              </div>
              <div class="summary-value">{{ successCount }}</div>
            </div>
            <div class="summary-card error">
              <div class="summary-label">
                <v-icon name="error" />
                <span>Error count</span>
              </div>
              <div class="summary-value">{{ errorCount }}</div>
            </div>
          </div>
        </div>

        <!-- Activity history table -->
        <div class="detail-section">
          <h2 class="section-title">Activity history</h2>
          <p v-if="!activityHistories.length" class="empty-message">No activity yet.</p>
          <v-table v-else :items="activityHistories" :headers="tableHeaders" class="activity-table"
            :active="selectedLog ? [selectedLog.id] : []" @click:row="onRowClick">
            <template #[`item.type`]="{ item }">
              <v-icon :name="item.type === 'success' ? 'check_circle' : 'error'"
                :color="item.type === 'success' ? 'var(--theme--success)' : 'var(--theme--danger)'" />
              <span class="type-label" :class="item.type">{{ item.type }}</span>
            </template>
            <template #[`item.date`]="{ item }">
              {{ formatDate(item.date) }}
            </template>
            <template #[`item.operation`]="{ item }">
              <span class="cell-text">{{ item.operation || "—" }}</span>
            </template>
            <template #[`item.message`]="{ item }">
              <span class="cell-text message-cell" :title="item.message">{{ item.message || "—" }}</span>
            </template>
          </v-table>
          <div v-if="activityHistories.length" class="pagination-section">
            <span class="pagination-info">
              {{ paginationLabel }}
            </span>
            <v-pagination v-model="page" :length="totalPages" :total-visible="5" show-first-last class="pagination" />
          </div>
        </div>
      </template>
    </div>

    <v-drawer :title="formatDate(selectedLog?.date ?? '')" :model-value="!!selectedLog" icon="link"
      @update:model-value="selectedLog = null" @cancel="selectedLog = null">
      <div v-if="logDetail" class="drawer-content">
        <div class="log-detail-trigger">
          <div class="trigger-header">
            <v-chip
              :style="{
                '--v-chip-color': '#ffffff',
                '--v-chip-background-color': 'var(--theme--success)',
              }"
              small
              disabled
              label
            >
              PASSED
            </v-chip>
            <span class="trigger-title">Trigger</span>
            <span class="trigger-type">{{ formatTriggerType(logDetail.trigger.type) }}</span>
          </div>

          <div class="collapsible-section">
            <div class="collapsible-header" @click="expandedSections.options = !expandedSections.options">
              <v-icon :name="expandedSections.options ? 'expand_more' : 'chevron_right'" />
              <span>Options</span>
            </div>
            <div v-if="expandedSections.options" class="collapsible-content">
              <pre class="json-content">{{ formatJSON(logDetail.trigger.options) }}</pre>
            </div>
          </div>

          <div class="collapsible-section">
            <div class="collapsible-header" @click="expandedSections.payload = !expandedSections.payload">
              <v-icon :name="expandedSections.payload ? 'expand_more' : 'chevron_right'" />
              <span>Payload</span>
            </div>
            <div v-if="expandedSections.payload" class="collapsible-content">
              <pre class="json-content">{{ formatJSON(logDetail.trigger.payload) }}</pre>
            </div>
          </div>

          <div class="collapsible-section">
            <div class="collapsible-header"
              @click="expandedSections.accountability = !expandedSections.accountability">
              <v-icon :name="expandedSections.accountability ? 'expand_more' : 'chevron_right'" />
              <span>Accountability</span>
            </div>
            <div v-if="expandedSections.accountability" class="collapsible-content">
              <pre class="json-content">{{ formatJSON(logDetail.trigger.accountability) }}</pre>
            </div>
          </div>
        </div>
        <div v-for="(step, index) in logDetail.steps" :key="step.key || index" class="log-detail-step">
          <div class="trigger-header">
            <v-chip
              v-if="step.status === 'reject'"
              :style="{
                '--v-chip-color': '#ffffff',
                '--v-chip-background-color': 'var(--theme--danger)',
              }"
              small
              disabled
              label
            >
              FAILED
            </v-chip>
            <v-chip
              v-else
              :style="{
                '--v-chip-color': '#ffffff',
                '--v-chip-background-color': 'var(--theme--success)',
              }"
              small
              disabled
              label
            >
              PASSED
            </v-chip>
            <span class="trigger-title">{{ step.operation?.name || "Step" }}</span>
            <span class="trigger-type">{{ formatStepType(step.operation?.type as string) }}</span>
          </div>

          <div class="collapsible-section">
            <div class="collapsible-header" @click="toggleStepSection(index, 'options')">
              <v-icon :name="isStepSectionExpanded(index, 'options') ? 'expand_more' : 'chevron_right'" />
              <span>Options</span>
            </div>
            <div v-if="isStepSectionExpanded(index, 'options')" class="collapsible-content">
              <pre class="json-content">{{ formatJSON(step.options) }}</pre>
            </div>
          </div>

          <div class="collapsible-section">
            <div class="collapsible-header" @click="toggleStepSection(index, 'payload')">
              <v-icon :name="isStepSectionExpanded(index, 'payload') ? 'expand_more' : 'chevron_right'" />
              <span>Payload</span>
            </div>
            <div v-if="isStepSectionExpanded(index, 'payload')" class="collapsible-content">
              <pre class="json-content">{{ formatJSON(step.payload) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </v-drawer>
  </private-view>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, watch } from "vue";
import { useApi } from "@directus/extensions-sdk";
import { useRoute } from "vue-router";
import { ENDPOINT_EXTENSION_NAME } from "../constants";

interface ActivityHistory {
  id: number;
  type: "success" | "error";
  date: string;
  operation?: string;
  message?: string;
  data: {
    data: {
      $env: any;
      $last: any;
      $trigger: {
        body: any;
        path: string;
        query: any;
        method: string;
        headers: any;
      };
      $accountability: {
        ip: string;
        app: boolean;
        role: string;
        user: string;
        admin: boolean;
        roles: string[];
        origin: string;
        session: string;
        userAgent: string;
      } | null;
    };
    steps: {
      key: string;
      status: string;
      operation: string;
      options: any;
    }[];
  };
}

interface IOperation {
  id: string;
  name: string;
  key: string;
  type: string;
  position_x: number;
  position_y: number;
  options: any;
  resolve: string | null;
  reject: string | null;
}

export default defineComponent({
  name: "FlowDashboardDetail",
  setup() {
    const api = useApi();
    const route = useRoute();
    const flowId = computed(() => route.params.flowId as string);
    const flowName = ref<string>("");
    const activityHistories = ref<ActivityHistory[]>([]);
    const loading = ref(true);
    const error = ref<string | null>(null);
    const page = ref(1);
    const totalPages = ref(1);
    const totalCount = ref(0);
    const refreshLoading = ref(false);
    const successCount = ref(0);
    const errorCount = ref(0);
    const selectedLog = ref<ActivityHistory | null>(null);
    const expandedSections = ref({
      options: false,
      payload: false,
      accountability: false,
    });
    const expandedStepSections = ref<Record<string, { options: boolean; payload: boolean; }>>({});
    const LIMIT = 5;
    const flow = ref<{
      id: string;
      name: string;
      trigger: string;
      operation: string;
      icon: string;
      color: string;
      description: string;
      status: string;
      operations: IOperation[];
      options: any;
    } | null>(null);

    function onRowClick({ item }: { item: ActivityHistory; }) {
      selectedLog.value = item;
    }

    function formatTriggerType(type: string): string {
      if (!type) return "";
      return type.charAt(0).toUpperCase() + type.slice(1);
    }

    function formatStepType(type: string): string {
      if (!type) return "";
      return type.charAt(0).toUpperCase() + type.slice(1);
    }

    function getStepKey(index: number, step: any): string {
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

    function formatJSON(obj: any): string {
      if (!obj) return "{}";
      try {
        return JSON.stringify(obj, null, 2);
      } catch {
        return String(obj);
      }
    }

    const paginationLabel = computed(() => {
      const start = totalCount.value === 0 ? 0 : (page.value - 1) * LIMIT + 1;
      const end = Math.min(page.value * LIMIT, totalCount.value);
      return `Showing ${start}–${end} of ${totalCount.value}`;
    });

    const tableHeaders = [
      { text: "ID", value: "id", sortable: false },
      { text: "Type", value: "type", sortable: false },
      { text: "Date", value: "date", sortable: true, width: 200 },
      { text: "Operation", value: "operation", sortable: false },
      { text: "Message", value: "message", sortable: false, width: 500 },
    ];

    const pageTitle = computed(() => (flowName.value ? `Flow: ${flowName.value}` : "Flow Dashboard Detail"));
    const operationMap = computed(() => {
      return flow.value?.operations.reduce((acc, operation) => {
        acc[operation.id] = operation;
        return acc;
      }, {} as Record<string, IOperation>);
    });

    const logDetail = computed(() => {
      if (!flow.value) return null;
      if (!selectedLog.value) return null;

      const data = selectedLog.value.data;
      const triggerInfo = {
        type: flow.value.trigger,
        options: flow.value.options,
        payload: data.data.$trigger,
        accountability: data.data.$accountability,
      };

      const steps = data.steps.map((step) => {
        const operation = operationMap.value?.[step.operation];
        const operationKey = step.key;
        const payload = (data.data as any)[operationKey] ?? {};
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

    watch(page, () => {
      loadActivityHistories();
    });

    function formatDate(dateStr: string): string {
      if (!dateStr) return "—";
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    }

    async function loadFlow() {
      try {
        const { data } = await api.get<{ data: { name?: string; }; }>(`/flows/${flowId.value}`, {
          params: { fields: "*,operations.*" },
        });
        flowName.value = data?.data?.name ?? "";
        flow.value = data?.data as any;
      } catch {
        flowName.value = "";
        flow.value = null;
      }
    }

    async function loadActivityHistories() {
      loading.value = true;
      error.value = null;
      try {
        await loadFlow();
        const queries = [
          `page=${page.value}`,
          `limit=${LIMIT}`,
        ];
        const { data } = await api.get<{ activityHistories: ActivityHistory[]; successCount: number; errorCount: number; }>(
          `/${ENDPOINT_EXTENSION_NAME}/flow-manager/dashboard/${flowId.value}?${queries.join("&")}`
        );
        activityHistories.value = data?.activityHistories ?? [];
        const count = (data?.successCount ?? 0) + (data?.errorCount ?? 0);
        totalCount.value = count;
        successCount.value = data?.successCount ?? 0;
        errorCount.value = data?.errorCount ?? 0;
        totalPages.value = Math.max(1, Math.ceil(count / LIMIT));
      } catch (e: any) {
        activityHistories.value = [];
        totalPages.value = 1;
        totalCount.value = 0;
        const data = e?.response?.data;
        error.value =
          e?.response?.status === 404
            ? (data?.error ?? "Flow not found")
            : (data?.errors?.[0]?.message ?? data?.error ?? e?.message ?? "Failed to load activity.");
      } finally {
        loading.value = false;
      }
    }

    watch(
      () => route.params.flowId,
      (newId) => {
        if (newId) {
          page.value = 1;
          loadActivityHistories();
        }
      }
    );

    async function onRefresh() {
      refreshLoading.value = true;
      try {
        await loadActivityHistories();
        await loadFlow();
      } finally {
        refreshLoading.value = false;
      }
    }

    onMounted(() => {
      loadActivityHistories();
    });

    return {
      loading,
      error,
      flowName,
      activityHistories,
      successCount,
      errorCount,
      pageTitle,
      tableHeaders,
      formatDate,
      page,
      totalPages,
      paginationLabel,
      refreshLoading,
      onRefresh,
      selectedLog,
      onRowClick,
      flow,
      logDetail,
      expandedSections,
      formatTriggerType,
      formatStepType,
      formatJSON,
      isStepSectionExpanded,
      toggleStepSection,
    };
  },
});
</script>

<style lang="scss" scoped>
.detail-content {
  padding: 24px;
  max-width: 100%;
}

.detail-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px;
  font-size: 15px;
  color: var(--theme--foreground-subdued, var(--foreground-subdued));
}

.detail-section {
  margin-bottom: 32px;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: var(--theme--foreground, var(--foreground));
  letter-spacing: 0.01em;
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

    .summary-label {
      color: var(--theme--success, var(--success));
    }
  }

  &.error {
    background: color-mix(in srgb, var(--theme--danger, var(--danger)) 12%, transparent);

    .summary-label {
      color: var(--theme--danger, var(--danger));
    }
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

.activity-table {
  border: 1px solid var(--theme--border-subdued, var(--border-subdued));
  border-radius: 8px;
  overflow: hidden;
}

.pagination-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--theme--background-normal-alt, var(--background-normal-alt));
  border: 1px solid var(--theme--border-subdued, var(--border-subdued));
  border-radius: 8px;
}

.pagination-info {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme--foreground-subdued, var(--foreground-subdued));
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pagination-controls :deep(.v-pagination) {
  margin: 0;
}

.refresh-button {
  flex-shrink: 0;
}

.type-label {
  margin-left: 8px;
  font-weight: 500;

  &.success {
    color: var(--theme--success, var(--success));
  }

  &.error {
    color: var(--theme--danger, var(--danger));
  }
}

.cell-text {
  font-size: 13px;
  color: var(--theme--foreground, var(--foreground));
}

.message-cell {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}

.log-detail-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-detail-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px;
  align-items: start;

  &.log-detail-message {
    flex-direction: column;
    grid-template-columns: 1fr;

    .log-detail-value {
      word-break: break-word;
      white-space: pre-wrap;
    }
  }
}

.log-detail-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--theme--foreground-subdued, var(--foreground-subdued));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.log-detail-value {
  font-size: 14px;
  color: var(--theme--foreground, var(--foreground));

  &.success {
    color: var(--theme--success, var(--success));
  }

  &.error {
    color: var(--theme--danger, var(--danger));
  }
}

.log-detail-trigger {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--theme--border-subdued, var(--border-subdued));
}

.log-detail-step {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--theme--border-subdued, var(--border-subdued));
}

.trigger-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--theme--foreground, var(--foreground));
}

.trigger-icon {
  color: var(--theme--primary, var(--primary));
}

.trigger-title {
  font-weight: 600;
}

.trigger-type {
  font-weight: 400;
  color: var(--theme--foreground-subdued, var(--foreground-subdued));
}

.collapsible-section {
  margin-bottom: 8px;
  border: 1px solid var(--theme--border-subdued, var(--border-subdued));
  border-radius: 4px;
  overflow: hidden;
}

.collapsible-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--theme--background-normal-alt, var(--background-normal-alt));
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--theme--foreground, var(--foreground));
  transition: background-color 0.2s;

  &:hover {
    background: var(--theme--background-subdued, var(--background-subdued));
  }

  .v-icon {
    font-size: 18px;
    transition: transform 0.2s;
  }
}

.collapsible-content {
  padding: 12px;
  background: var(--theme--background-normal, var(--background-normal));
  border-top: 1px solid var(--theme--border-subdued, var(--border-subdued));
}

.json-content {
  margin: 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", "Consolas", "source-code-pro", monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--theme--foreground, var(--foreground));
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.drawer-content {
  padding: 20px;
}

.drawer-content :deep(.log-detail-trigger),
.drawer-content :deep(.log-detail-step) {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.drawer-content :deep(.log-detail-step) {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--theme--border-subdued, var(--border-subdued));
}

.drawer-content :deep(.log-detail-trigger) {
  margin-top: 0;
  padding-top: 0;
}

.mr-4 {
  margin-right: 8px;
}
</style>

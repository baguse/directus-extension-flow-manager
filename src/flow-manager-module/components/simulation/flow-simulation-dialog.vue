<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import type { IFlow, ICredential } from '../../../types';
import { ENDPOINT_EXTENSION_NAME } from '../../../constants';
import {
  generateSampleTriggerPayload,
  simulateFlow,
  type SimulationResult,
  type SimulationStepResult,
} from '../../../utils/flow-simulator.util';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    flow: IFlow | null;
    selectedCredential?: string;
    credentials?: ICredential[];
  }>(),
  {
    flow: null,
    selectedCredential: 'local',
    credentials: () => [],
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const api = useApi();

const isSimulating = ref(false);
const simulationResult = ref<SimulationResult | null>(null);
const triggerPayloadJson = ref('');
const payloadError = ref<string | null>(null);
const selectedStepIndex = ref<number>(1);
const activeTab = ref<'transit' | 'summary' | 'payload'>('transit');

const activeCredential = computed<ICredential | null>(() => {
  if (!props.selectedCredential || props.selectedCredential === 'local') return null;
  return props.credentials?.find((c) => c.id === props.selectedCredential) || null;
});

function initSamplePayload() {
  if (props.flow) {
    const sample = generateSampleTriggerPayload(props.flow);
    triggerPayloadJson.value = JSON.stringify(sample, null, 2);
    payloadError.value = null;
    simulationResult.value = null;
    selectedStepIndex.value = 1;
  }
}

watch(
  () => props.flow,
  () => {
    initSamplePayload();
  },
  { immediate: true },
);

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen && !simulationResult.value) {
      initSamplePayload();
    }
  },
);

const selectedStep = computed<SimulationStepResult | null>(() => {
  if (!simulationResult.value) return null;
  return (
    simulationResult.value.steps.find((s) => s.stepIndex === selectedStepIndex.value) ||
    simulationResult.value.steps[0] ||
    null
  );
});

async function runSimulation() {
  if (!props.flow) return;
  payloadError.value = null;

  let parsedPayload: Record<string, unknown> = {};
  try {
    parsedPayload = JSON.parse(triggerPayloadJson.value);
  } catch (err) {
    payloadError.value = err instanceof Error ? err.message : 'Invalid JSON input';
    return;
  }

  isSimulating.value = true;
  try {
    // Attempt backend execution for database read services
    const endpointPayload: Record<string, unknown> = {
      flow: props.flow,
      triggerPayload: parsedPayload,
    };

    if (activeCredential.value) {
      endpointPayload.url = activeCredential.value.url;
      endpointPayload.staticToken = activeCredential.value.staticToken;
    }

    const { data } = await api.post<SimulationResult>(
      `/${ENDPOINT_EXTENSION_NAME}/flow-manager/simulate`,
      endpointPayload,
    );

    simulationResult.value = data;
    selectedStepIndex.value = data.steps[0]?.stepIndex || 1;
    activeTab.value = 'transit';
  } catch (backendErr) {
    console.warn(
      '[FLOW MANAGER] Backend simulation failed, falling back to local runner:',
      backendErr,
    );
    // Client-side fallback simulation
    const localResult = await simulateFlow(props.flow, {
      triggerPayload: parsedPayload,
    });
    simulationResult.value = localResult;
    selectedStepIndex.value = localResult.steps[0]?.stepIndex || 1;
    activeTab.value = 'transit';
  } finally {
    isSimulating.value = false;
  }
}

function formatJson(val: unknown): string {
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'read':
      return '#10b981';
    case 'mutation':
      return '#f59e0b';
    case 'network':
      return '#3b82f6';
    case 'logic':
      return '#8b5cf6';
    case 'transform':
      return '#06b6d4';
    default:
      return '#64748b';
  }
}

function getCategoryIcon(category: string): string {
  switch (category) {
    case 'read':
      return 'storage';
    case 'mutation':
      return 'shield';
    case 'network':
      return 'cloud_upload';
    case 'logic':
      return 'alt_route';
    case 'transform':
      return 'code';
    case 'control':
      return 'timelapse';
    default:
      return 'bolt';
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="simulation-card">
      <!-- Dialog Header -->
      <v-card-title class="simulation-title-bar">
        <div class="title-left">
          <div class="shield-badge">
            <v-icon name="shield" />
          </div>
          <div class="title-text-group">
            <div class="dialog-main-title">Sandbox Simulation Mode (Dry-Run)</div>
            <div class="dialog-sub-title">
              Safe execution test for <strong>{{ flow?.name || 'Flow' }}</strong> •
              <span class="safe-note">Writes, webhooks, and emails are intercepted</span>
            </div>
          </div>
        </div>

        <div class="title-right">
          <span v-if="activeCredential" class="target-badge">
            <v-icon name="cloud" x-small />
            {{ activeCredential.name }}
          </span>
          <span v-else class="target-badge local">
            <v-icon name="dns" x-small />
            Local Database
          </span>
          <v-button icon secondary rounded x-small @click="emit('update:modelValue', false)">
            <v-icon name="close" />
          </v-button>
        </div>
      </v-card-title>

      <v-card-text class="simulation-body">
        <!-- Top Toolbar / Action Bar -->
        <div class="simulation-toolbar">
          <div class="toolbar-nav">
            <button
              type="button"
              :class="['nav-pill', { active: activeTab === 'transit' }]"
              @click="activeTab = 'transit'"
            >
              <v-icon name="timeline" small class="mr-1" />
              Step Transit
              <span v-if="simulationResult" class="count-pill">{{
                simulationResult.steps.length
              }}</span>
            </button>
            <button
              type="button"
              :class="['nav-pill', { active: activeTab === 'summary' }]"
              @click="activeTab = 'summary'"
            >
              <v-icon name="assessment" small class="mr-1" />
              Impact Report
            </button>
            <button
              type="button"
              :class="['nav-pill', { active: activeTab === 'payload' }]"
              @click="activeTab = 'payload'"
            >
              <v-icon name="data_object" small class="mr-1" />
              Mock $trigger Input
            </button>
          </div>

          <div class="toolbar-actions">
            <v-button x-small secondary :disabled="isSimulating" @click="initSamplePayload">
              <v-icon name="restart_alt" x-small left />
              Reset Input
            </v-button>
            <v-button
              small
              :loading="isSimulating"
              class="run-simulation-btn"
              @click="runSimulation"
            >
              <v-icon name="play_arrow" small left />
              Execute Simulation
            </v-button>
          </div>
        </div>

        <!-- Banner KPI Stats (When Simulation Run) -->
        <div v-if="simulationResult" class="kpi-banner">
          <div class="kpi-card">
            <div class="kpi-icon-wrap green">
              <v-icon name="check_circle" small />
            </div>
            <div class="kpi-info">
              <div class="kpi-val">{{ simulationResult.summary.totalStepsExecuted }}</div>
              <div class="kpi-lbl">Steps Run</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon-wrap amber">
              <v-icon name="shield" small />
            </div>
            <div class="kpi-info">
              <div class="kpi-val">{{ simulationResult.summary.writesInterceptedCount }}</div>
              <div class="kpi-lbl">Writes Intercepted</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon-wrap blue">
              <v-icon name="cloud_off" small />
            </div>
            <div class="kpi-info">
              <div class="kpi-val">
                {{
                  simulationResult.summary.networkCallsSuppressedCount +
                  simulationResult.summary.emailsSuppressedCount
                }}
              </div>
              <div class="kpi-lbl">Calls Suppressed</div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-icon-wrap purple">
              <v-icon name="speed" small />
            </div>
            <div class="kpi-info">
              <div class="kpi-val">{{ simulationResult.durationMs }}ms</div>
              <div class="kpi-lbl">Execution Time</div>
            </div>
          </div>
        </div>

        <!-- TAB 1: STEP TRANSIT EXPLORER -->
        <div v-if="activeTab === 'transit'" class="transit-tab-content">
          <div v-if="!simulationResult" class="pre-run-placeholder">
            <v-icon name="play_circle" class="placeholder-icon" />
            <div class="placeholder-title">Ready for Simulation</div>
            <div class="placeholder-desc">
              Review your mock <code>$trigger</code> payload and click
              <strong>"Execute Simulation"</strong> to trace data flow through every operation.
            </div>
            <v-button small class="mt-3" @click="runSimulation">
              <v-icon name="play_arrow" left />
              Execute Simulation Now
            </v-button>
          </div>

          <div v-else class="transit-split-view">
            <!-- Left: Vertical Step Stepper -->
            <div class="transit-stepper-col">
              <div class="stepper-header">
                <span>Execution Steps</span>
                <span class="stepper-badge">{{ simulationResult.steps.length }} Nodes</span>
              </div>

              <div class="stepper-list">
                <div
                  v-for="step in simulationResult.steps"
                  :key="step.stepIndex"
                  :class="[
                    'step-item',
                    {
                      selected: selectedStepIndex === step.stepIndex,
                      failed: step.status === 'failed',
                      intercepted: step.status === 'intercepted',
                    },
                  ]"
                  @click="selectedStepIndex = step.stepIndex"
                >
                  <div class="step-num">{{ step.stepIndex }}</div>
                  <div
                    class="step-icon-wrap"
                    :style="{
                      backgroundColor: `${getCategoryColor(step.category)}18`,
                      color: getCategoryColor(step.category),
                    }"
                  >
                    <v-icon :name="getCategoryIcon(step.category)" small />
                  </div>
                  <div class="step-text">
                    <div class="step-name">{{ step.operationName }}</div>
                    <div class="step-sub">
                      <code class="mini-key">{{ step.operationKey }}</code>
                      <span class="step-type-pill">{{ step.operationType }}</span>
                    </div>
                  </div>
                  <div class="step-status-chip">
                    <span v-if="step.status === 'intercepted'" class="chip-intercepted">
                      🛡️ Intercepted
                    </span>
                    <span v-else-if="step.status === 'executed'" class="chip-executed">
                      🟢 Safe Read
                    </span>
                    <span v-else-if="step.status === 'failed'" class="chip-failed">
                      ❌ Failed
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Step Inspector Detail -->
            <div v-if="selectedStep" class="transit-inspector-col">
              <div class="inspector-card">
                <div class="inspector-header">
                  <div class="i-head-left">
                    <div
                      class="step-badge-icon"
                      :style="{
                        backgroundColor: `${getCategoryColor(selectedStep.category)}20`,
                        color: getCategoryColor(selectedStep.category),
                      }"
                    >
                      <v-icon :name="getCategoryIcon(selectedStep.category)" />
                    </div>
                    <div>
                      <div class="i-title">{{ selectedStep.operationName }}</div>
                      <div class="i-sub">
                        Key: <code>{{ selectedStep.operationKey }}</code> • Type:
                        <strong>{{ selectedStep.operationType }}</strong> • Duration:
                        <span>{{ selectedStep.durationMs }}ms</span>
                      </div>
                    </div>
                  </div>

                  <div class="i-head-right">
                    <span
                      v-if="selectedStep.branchTaken"
                      class="branch-pill"
                      :class="selectedStep.branchTaken"
                    >
                      Branch: {{ selectedStep.branchTaken }}
                    </span>
                  </div>
                </div>

                <!-- Interception Highlights -->
                <div v-if="selectedStep.mutationPreview" class="interception-banner mutation">
                  <div class="banner-title">
                    <v-icon name="shield" small />
                    <span>Database Mutation Intercepted (Write Prevented)</span>
                  </div>
                  <div class="banner-desc">
                    Action:
                    <strong>{{ selectedStep.mutationPreview.action.toUpperCase() }}</strong> on
                    collection
                    <code>{{ selectedStep.mutationPreview.collection }}</code>
                    <span v-if="selectedStep.mutationPreview.key">
                      (ID: <code>{{ selectedStep.mutationPreview.key }}</code
                      >)
                    </span>
                  </div>

                  <!-- Diff preview for updates -->
                  <div
                    v-if="
                      selectedStep.mutationPreview.diff &&
                      selectedStep.mutationPreview.diff.length > 0
                    "
                    class="diff-table-wrapper"
                  >
                    <div class="diff-header">Fields Changed (Before vs After Diff):</div>
                    <table class="diff-table">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Before (Current DB)</th>
                          <th>After (Predicted)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="d in selectedStep.mutationPreview.diff" :key="d.field">
                          <td class="diff-field">
                            <code>{{ d.field }}</code>
                          </td>
                          <td class="diff-from">{{ formatJson(d.from) }}</td>
                          <td class="diff-to">{{ formatJson(d.to) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <!-- Payload preview for creates -->
                  <div v-else-if="selectedStep.mutationPreview.after" class="code-box">
                    <div class="code-box-header">Simulated Insert Record:</div>
                    <pre class="json-code">{{
                      formatJson(selectedStep.mutationPreview.after)
                    }}</pre>
                  </div>
                </div>

                <!-- Network call suppression highlight -->
                <div v-if="selectedStep.networkCallPreview" class="interception-banner network">
                  <div class="banner-title">
                    <v-icon name="cloud_off" small />
                    <span>Outgoing HTTP Request Suppressed (No Live Traffic)</span>
                  </div>
                  <div class="banner-desc">
                    Target:
                    <code
                      >{{ selectedStep.networkCallPreview.method }}
                      {{ selectedStep.networkCallPreview.url }}</code
                    >
                  </div>
                  <div v-if="selectedStep.networkCallPreview.body" class="code-box">
                    <div class="code-box-header">Outgoing Body Payload:</div>
                    <pre class="json-code">{{
                      formatJson(selectedStep.networkCallPreview.body)
                    }}</pre>
                  </div>
                </div>

                <!-- Email suppression highlight -->
                <div v-if="selectedStep.emailPreview" class="interception-banner email">
                  <div class="banner-title">
                    <v-icon name="mark_email_read" small />
                    <span>Outbound Email Suppressed</span>
                  </div>
                  <div class="banner-desc">
                    To: <strong>{{ selectedStep.emailPreview.to }}</strong> • Subject:
                    <em>"{{ selectedStep.emailPreview.subject }}"</em>
                  </div>
                </div>

                <!-- Interpolated Options -->
                <div class="detail-section">
                  <div class="section-title">Resolved Options (Templates Interpolated)</div>
                  <pre class="json-code">{{ formatJson(selectedStep.interpolatedOptions) }}</pre>
                </div>

                <!-- Step Output Data -->
                <div class="detail-section">
                  <div class="section-title">Step Output (Emitted into $last)</div>
                  <pre class="json-code">{{ formatJson(selectedStep.outputState) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: IMPACT & MUTATION SUMMARY REPORT -->
        <div v-else-if="activeTab === 'summary'" class="summary-tab-content">
          <div v-if="!simulationResult" class="pre-run-placeholder">
            <v-icon name="assessment" class="placeholder-icon" />
            <div class="placeholder-title">No Simulation Executed Yet</div>
            <div class="placeholder-desc">
              Execute a simulation to generate the predicted outcome report.
            </div>
          </div>

          <div v-else class="summary-report-wrapper">
            <!-- Creates -->
            <div class="report-card">
              <div class="report-header">
                <v-icon name="add_circle" class="mr-1 text-green" />
                <span>Predicted Creates ({{ simulationResult.summary.creates.length }})</span>
              </div>
              <div v-if="simulationResult.summary.creates.length === 0" class="report-empty">
                No database records would be created.
              </div>
              <div v-else class="report-items">
                <div
                  v-for="(c, i) in simulationResult.summary.creates"
                  :key="i"
                  class="report-item"
                >
                  <div class="item-head">
                    Collection: <code>{{ c.collection }}</code>
                  </div>
                  <pre class="json-code">{{ formatJson(c.payload) }}</pre>
                </div>
              </div>
            </div>

            <!-- Updates -->
            <div class="report-card">
              <div class="report-header">
                <v-icon name="edit" class="mr-1 text-amber" />
                <span>Predicted Updates ({{ simulationResult.summary.updates.length }})</span>
              </div>
              <div v-if="simulationResult.summary.updates.length === 0" class="report-empty">
                No existing records would be modified.
              </div>
              <div v-else class="report-items">
                <div
                  v-for="(u, i) in simulationResult.summary.updates"
                  :key="i"
                  class="report-item"
                >
                  <div class="item-head">
                    Collection: <code>{{ u.collection }}</code> • Key: <code>{{ u.key }}</code>
                  </div>
                  <table class="diff-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Before</th>
                        <th>After</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="d in u.diff" :key="d.field">
                        <td>
                          <code>{{ d.field }}</code>
                        </td>
                        <td>{{ formatJson(d.from) }}</td>
                        <td>{{ formatJson(d.to) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Deletes -->
            <div class="report-card">
              <div class="report-header">
                <v-icon name="delete" class="mr-1 text-red" />
                <span>Predicted Deletions ({{ simulationResult.summary.deletes.length }})</span>
              </div>
              <div v-if="simulationResult.summary.deletes.length === 0" class="report-empty">
                Zero records would be deleted.
              </div>
              <div v-else class="report-items">
                <div
                  v-for="(del, i) in simulationResult.summary.deletes"
                  :key="i"
                  class="report-item"
                >
                  <div class="item-head">
                    Collection: <code>{{ del.collection }}</code> • Key: <code>{{ del.key }}</code>
                  </div>
                </div>
              </div>
            </div>

            <!-- Suppressed Webhooks -->
            <div class="report-card">
              <div class="report-header">
                <v-icon name="public_off" class="mr-1 text-blue" />
                <span
                  >Suppressed Webhook & Network Calls ({{
                    simulationResult.summary.networkCalls.length
                  }})</span
                >
              </div>
              <div v-if="simulationResult.summary.networkCalls.length === 0" class="report-empty">
                No external HTTP requests were called.
              </div>
              <div v-else class="report-items">
                <div
                  v-for="(net, i) in simulationResult.summary.networkCalls"
                  :key="i"
                  class="report-item"
                >
                  <div class="item-head">
                    <code>{{ net.method }}</code> {{ net.url }}
                  </div>
                  <pre v-if="net.body" class="json-code">{{ formatJson(net.body) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: MOCK TRIGGER PAYLOAD EDITOR -->
        <div v-else-if="activeTab === 'payload'" class="payload-tab-content">
          <div class="payload-editor-header">
            <div>
              <span class="editor-title">Mock <code>$trigger</code> Context</span>
              <span class="editor-desc"
                >Custom mock payload fed into the flow when simulation starts.</span
              >
            </div>
            <v-button x-small secondary @click="initSamplePayload">
              Generate Default Mock
            </v-button>
          </div>

          <v-notice v-if="payloadError" type="danger" class="mb-2">
            {{ payloadError }}
          </v-notice>

          <textarea
            v-model="triggerPayloadJson"
            rows="16"
            class="payload-textarea"
            placeholder="Paste or write mock JSON trigger payload..."
          />
        </div>
      </v-card-text>

      <v-card-actions class="simulation-actions">
        <v-button secondary @click="emit('update:modelValue', false)">Close</v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.simulation-card {
  --v-card-min-width: 950px;
  max-width: 1100px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.simulation-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  padding: 16px 20px;

  .title-left {
    display: flex;
    align-items: center;
    gap: 12px;

    .shield-badge {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }

    .dialog-main-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--theme--foreground, #0f172a);
    }

    .dialog-sub-title {
      font-size: 12px;
      color: var(--theme--foreground-subdued, #64748b);
      margin-top: 2px;

      .safe-note {
        color: #10b981;
        font-weight: 600;
      }
    }
  }

  .title-right {
    display: flex;
    align-items: center;
    gap: 10px;

    .target-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(99, 102, 241, 0.1);
      color: var(--theme--primary, #6366f1);

      &.local {
        background: #f1f5f9;
        color: #475569;
      }
    }
  }
}

.simulation-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  max-height: calc(90vh - 140px);
}

.simulation-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  background: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  padding: 8px 12px;

  .toolbar-nav {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nav-pill {
    display: inline-flex;
    align-items: center;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--theme--foreground-subdued, #64748b);
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      color: var(--theme--foreground, #0f172a);
    }

    &.active {
      background: var(--theme--background, #ffffff);
      color: var(--theme--primary, #6366f1);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }

    .count-pill {
      margin-left: 6px;
      font-size: 10px;
      background: rgba(99, 102, 241, 0.15);
      color: var(--theme--primary, #6366f1);
      padding: 1px 6px;
      border-radius: 10px;
    }
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.kpi-banner {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;

  .kpi-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 8px;
    background: var(--theme--background-subdued, #f8fafc);
    border: 1px solid var(--theme--border-color-subdued, #e2e8f0);

    .kpi-icon-wrap {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;

      &.green {
        background: #ecfdf5;
        color: #10b981;
      }
      &.amber {
        background: #fffbeb;
        color: #f59e0b;
      }
      &.blue {
        background: #eff6ff;
        color: #3b82f6;
      }
      &.purple {
        background: #f5f3ff;
        color: #8b5cf6;
      }
    }

    .kpi-val {
      font-size: 16px;
      font-weight: 700;
      color: var(--theme--foreground, #0f172a);
    }

    .kpi-lbl {
      font-size: 11px;
      color: var(--theme--foreground-subdued, #64748b);
    }
  }
}

.pre-run-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--theme--foreground-subdued, #64748b);

  .placeholder-icon {
    font-size: 48px;
    color: var(--theme--primary, #6366f1);
    opacity: 0.6;
    margin-bottom: 12px;
  }

  .placeholder-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--theme--foreground, #0f172a);
    margin-bottom: 6px;
  }

  .placeholder-desc {
    font-size: 13px;
    max-width: 440px;
    line-height: 1.5;

    code {
      background: var(--theme--background-subdued, #f1f5f9);
      padding: 1px 4px;
      border-radius: 4px;
    }
  }
}

.transit-split-view {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 16px;
  min-height: 440px;
}

.transit-stepper-col {
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--theme--background, #ffffff);
  display: flex;
  flex-direction: column;

  .stepper-header {
    padding: 10px 14px;
    background: var(--theme--background-subdued, #f8fafc);
    border-bottom: 1px solid var(--theme--border-color-subdued, #e2e8f0);
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 700;
    color: var(--theme--foreground, #0f172a);

    .stepper-badge {
      font-size: 10px;
      font-weight: 600;
      background: #e2e8f0;
      padding: 2px 6px;
      border-radius: 10px;
    }
  }

  .stepper-list {
    overflow-y: auto;
    max-height: 480px;
  }

  .step-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--theme--border-color-subdued, #f1f5f9);
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: var(--theme--background-subdued, #f8fafc);
    }

    &.selected {
      background: rgba(99, 102, 241, 0.08);
      border-left: 3px solid var(--theme--primary, #6366f1);
    }

    .step-num {
      font-size: 11px;
      font-weight: 700;
      color: var(--theme--foreground-subdued, #94a3b8);
      width: 18px;
    }

    .step-icon-wrap {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .step-text {
      flex: 1;
      min-width: 0;

      .step-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--theme--foreground, #0f172a);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .step-sub {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 2px;

        .mini-key {
          font-size: 10px;
          color: var(--theme--foreground-subdued, #64748b);
        }

        .step-type-pill {
          font-size: 9px;
          text-transform: uppercase;
          background: #f1f5f9;
          padding: 1px 4px;
          border-radius: 3px;
        }
      }
    }

    .step-status-chip {
      font-size: 10px;
      font-weight: 600;

      .chip-intercepted {
        color: #d97706;
      }
      .chip-executed {
        color: #10b981;
      }
      .chip-failed {
        color: #ef4444;
      }
    }
  }
}

.transit-inspector-col {
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  background: var(--theme--background, #ffffff);
  padding: 16px;
  overflow-y: auto;
  max-height: 520px;

  .inspector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--theme--border-color-subdued, #f1f5f9);

    .i-head-left {
      display: flex;
      align-items: center;
      gap: 12px;

      .step-badge-icon {
        width: 38px;
        height: 38px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .i-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--theme--foreground, #0f172a);
      }

      .i-sub {
        font-size: 11px;
        color: var(--theme--foreground-subdued, #64748b);
        margin-top: 2px;
      }
    }

    .branch-pill {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;

      &.resolve {
        background: #ecfdf5;
        color: #10b981;
      }
      &.reject {
        background: #fef2f2;
        color: #ef4444;
      }
      &.end {
        background: #f1f5f9;
        color: #64748b;
      }
    }
  }

  .interception-banner {
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 14px;

    &.mutation {
      background: #fffbeb;
      border: 1px solid #fde68a;
      .banner-title {
        color: #b45309;
      }
    }

    &.network {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      .banner-title {
        color: #1d4ed8;
      }
    }

    &.email {
      background: #f5f3ff;
      border: 1px solid #ddd6fe;
      .banner-title {
        color: #6d28d9;
      }
    }

    .banner-title {
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }

    .banner-desc {
      font-size: 12px;
      color: #374151;
    }
  }

  .diff-table-wrapper {
    margin-top: 10px;

    .diff-header {
      font-size: 11px;
      font-weight: 700;
      color: #92400e;
      margin-bottom: 6px;
    }
  }

  .diff-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    background: #ffffff;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #fef3c7;

    th {
      background: #fef3c7;
      text-align: left;
      padding: 6px 10px;
      font-weight: 600;
    }

    td {
      padding: 6px 10px;
      border-top: 1px solid #fef3c7;
      vertical-align: top;

      &.diff-field {
        font-weight: 600;
        color: #1e293b;
      }
      &.diff-from {
        color: #b91c1c;
        background: #fef2f2;
      }
      &.diff-to {
        color: #15803d;
        background: #f0fdf4;
      }
    }
  }

  .detail-section {
    margin-top: 14px;

    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--theme--foreground-subdued, #64748b);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
  }

  .json-code {
    background: var(--theme--background-subdued, #f8fafc);
    border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 11px;
    font-family: monospace;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 200px;
    overflow-y: auto;
  }
}

.summary-tab-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.summary-report-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .report-card {
    border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
    border-radius: 8px;
    background: var(--theme--background, #ffffff);
    padding: 14px;

    .report-header {
      font-size: 13px;
      font-weight: 700;
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }

    .report-empty {
      font-size: 12px;
      color: var(--theme--foreground-subdued, #94a3b8);
      font-style: italic;
    }

    .report-items {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .report-item {
      background: var(--theme--background-subdued, #f8fafc);
      border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
      border-radius: 6px;
      padding: 10px;

      .item-head {
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 6px;
      }
    }
  }
}

.payload-tab-content {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .payload-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .editor-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--theme--foreground, #0f172a);
      display: block;
    }

    .editor-desc {
      font-size: 11px;
      color: var(--theme--foreground-subdued, #64748b);
    }
  }

  .payload-textarea {
    width: 100%;
    font-family: monospace;
    font-size: 12px;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
    background: var(--theme--background, #ffffff);
    color: var(--theme--foreground, #0f172a);
    outline: none;
    resize: vertical;

    &:focus {
      border-color: var(--theme--primary, #6366f1);
    }
  }
}

.simulation-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--theme--border-color-subdued, #e2e8f0);
}
</style>

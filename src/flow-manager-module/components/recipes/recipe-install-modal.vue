<template>
  <v-dialog :model-value="active" max-width="840" persistent @update:model-value="onClose">
    <v-card v-if="recipe" class="recipe-install-card">
      <!-- Dialog Header -->
      <v-card-title class="dialog-header">
        <div class="header-left">
          <div
            class="recipe-icon-circle"
            :style="{ backgroundColor: `${recipe.color}20`, color: recipe.color }"
          >
            <v-icon :name="recipe.icon || 'auto_stories'" />
          </div>
          <div>
            <div class="recipe-modal-title">{{ recipe.name }}</div>
            <div class="recipe-modal-sub">
              By {{ recipe.author.name }} · v{{ recipe.version }} · {{ recipe.category }}
            </div>
          </div>
        </div>
        <v-button x-small icon secondary @click="onClose">
          <v-icon name="close" />
        </v-button>
      </v-card-title>

      <!-- Segmented Tab Navigation -->
      <div class="modal-tabs">
        <button
          class="modal-tab"
          :class="{ active: activeTab === 'preview' }"
          @click="activeTab = 'preview'"
        >
          <v-icon name="account_tree" small class="mr-1" />
          Pipeline Preview
        </button>
        <button
          class="modal-tab"
          :class="{ active: activeTab === 'configure' }"
          @click="activeTab = 'configure'"
        >
          <v-icon name="tune" small class="mr-1" />
          Configuration
          <span v-if="recipe.parameters?.length" class="tab-badge">
            {{ recipe.parameters.length }}
          </span>
        </button>
        <button
          class="modal-tab"
          :class="{ active: activeTab === 'json' }"
          @click="activeTab = 'json'"
        >
          <v-icon name="code" small class="mr-1" />
          Compiled JSON
        </button>
      </div>

      <!-- Dialog Body -->
      <v-card-text class="dialog-body">
        <!-- ================================================================= -->
        <!-- TAB 1: PIPELINE PREVIEW & DOCUMENTATION                           -->
        <!-- ================================================================= -->
        <div v-if="activeTab === 'preview'" class="tab-content preview-tab-content">
          <!-- Summary Banner -->
          <p class="recipe-desc">{{ recipe.description }}</p>

          <!-- Quick Metrics Bar -->
          <div class="preview-metrics-grid">
            <div class="metric-card">
              <span class="metric-label">Trigger</span>
              <div class="metric-value">
                <v-icon
                  :name="getTriggerMeta(recipe.flows[0]?.trigger || '').icon"
                  small
                  class="mr-1"
                />
                <span>{{ recipe.flows[0]?.trigger || 'webhook' }}</span>
              </div>
            </div>
            <div class="metric-card">
              <span class="metric-label">Pipeline Steps</span>
              <div class="metric-value">
                <v-icon name="format_list_numbered" small class="mr-1" />
                <span>{{ totalOperationsCount }} Operations</span>
              </div>
            </div>
            <div class="metric-card">
              <span class="metric-label">Parameters</span>
              <div class="metric-value">
                <v-icon name="vpn_key" small class="mr-1" />
                <span>{{ recipe.parameters?.length || 0 }} Required</span>
              </div>
            </div>
            <div class="metric-card">
              <span class="metric-label">Target Instance</span>
              <div class="metric-value">
                <v-icon :name="isLocalTarget ? 'storage' : 'cloud_queue'" small class="mr-1" />
                <span>{{ activeInstanceName }}</span>
              </div>
            </div>
          </div>

          <!-- Interactive Pipeline Architecture Diagram -->
          <div class="pipeline-section">
            <div class="section-title-row">
              <label class="section-label">Pipeline Execution Flow</label>
              <span class="section-meta"
                >{{ recipe.flows.length }} Flow · {{ totalOperationsCount }} Steps</span
              >
            </div>

            <div
              v-for="(flow, flowIdx) in recipe.flows"
              :key="flowIdx"
              class="flow-pipeline-container"
            >
              <div class="flow-title-bar">
                <div
                  class="flow-icon-circle"
                  :style="{
                    backgroundColor: `${flow.color || recipe.color}20`,
                    color: flow.color || recipe.color,
                  }"
                >
                  <v-icon :name="flow.icon || recipe.icon || 'bolt'" small />
                </div>
                <div class="flow-name-box">
                  <span class="flow-name-text">{{ flow.name }}</span>
                  <span class="flow-trigger-meta">
                    Triggered by <strong>{{ getTriggerMeta(flow.trigger).label }}</strong>
                  </span>
                </div>
                <span class="status-tag">Draft on install</span>
              </div>

              <!-- Trigger Card -->
              <div class="pipeline-node trigger-node">
                <div class="node-badge trigger-badge">
                  <v-icon :name="getTriggerMeta(flow.trigger).icon" x-small class="mr-1" />
                  <span>START TRIGGER</span>
                </div>
                <div class="node-main">
                  <div class="node-name">{{ getTriggerMeta(flow.trigger).label }}</div>
                  <div v-if="flow.options && Object.keys(flow.options).length" class="node-sub">
                    Configured options: <code>{{ Object.keys(flow.options).join(', ') }}</code>
                  </div>
                </div>
              </div>

              <!-- Connector Line -->
              <div v-if="flow.operations?.length" class="pipeline-connector">
                <div class="connector-line"></div>
                <v-icon name="south" class="connector-arrow" />
              </div>

              <!-- Operations Chain with Branching -->
              <div class="operations-chain">
                <template v-for="(op, opIdx) in flow.operations" :key="op.key">
                  <div class="pipeline-node operation-node">
                    <div
                      class="node-badge op-type-badge"
                      :style="{
                        backgroundColor: `${getOperationMeta(op.type).color}18`,
                        color: getOperationMeta(op.type).color,
                      }"
                    >
                      <v-icon :name="getOperationMeta(op.type).icon" x-small class="mr-1" />
                      <span>{{ getOperationMeta(op.type).label }}</span>
                    </div>

                    <div class="node-main">
                      <div class="node-header">
                        <span class="node-step-index">#{{ opIdx + 1 }}</span>
                        <span class="node-name">{{ op.name }}</span>
                        <code class="node-key">{{ op.key }}</code>
                      </div>

                      <div v-if="getOperationSummary(op)" class="node-summary">
                        {{ getOperationSummary(op) }}
                      </div>

                      <!-- Branching Badges -->
                      <div v-if="op.resolve || op.reject" class="node-branches">
                        <div v-if="op.resolve" class="branch-pill resolve">
                          <v-icon name="check_circle" x-small class="mr-1" />
                          <span
                            >On Resolve ➔
                            <strong>{{ getOperationNameByKey(op.resolve) }}</strong></span
                          >
                        </div>
                        <div v-if="op.reject" class="branch-pill reject">
                          <v-icon name="cancel" x-small class="mr-1" />
                          <span
                            >On Reject ➔
                            <strong>{{ getOperationNameByKey(op.reject) }}</strong></span
                          >
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Connector Arrow to next operation if not last -->
                  <div v-if="opIdx < flow.operations.length - 1" class="pipeline-connector">
                    <div class="connector-line"></div>
                    <v-icon name="south" class="connector-arrow" />
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Documentation & Setup Instructions -->
          <div v-if="recipe.documentation" class="doc-section">
            <label class="section-label">Setup Instructions & Prerequisites</label>
            <div class="doc-card">
              <pre class="doc-text">{{ recipe.documentation }}</pre>
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- TAB 2: CONFIGURATION & PARAMETERS                                 -->
        <!-- ================================================================= -->
        <div v-else-if="activeTab === 'configure'" class="tab-content configure-tab-content">
          <!-- Instance Target Selector -->
          <div class="config-section">
            <label class="section-label">Destination Instance</label>
            <div class="target-instance-box">
              <v-icon :name="isLocalTarget ? 'storage' : 'cloud_queue'" small class="mr-2" />
              <span class="target-name">{{ activeInstanceName }}</span>
              <span class="target-badge">{{ isLocalTarget ? 'Local' : 'Remote' }}</span>
            </div>
          </div>

          <!-- Parameters Configuration Form -->
          <div v-if="recipe.parameters?.length" class="config-section">
            <label class="section-label">Parameters & Configuration</label>
            <p class="section-sub">
              Customize the credentials and parameters for this automation recipe.
            </p>

            <div class="parameters-list">
              <div v-for="param in recipe.parameters" :key="param.key" class="param-field">
                <div class="param-header">
                  <span class="param-label">{{ param.label }}</span>
                  <span v-if="param.required" class="required-star">*</span>
                  <code class="param-key">{{ param.key }}</code>
                </div>
                <p v-if="param.description" class="param-desc">{{ param.description }}</p>

                <!-- Secret Input -->
                <v-input
                  v-if="param.type === 'secret'"
                  v-model="paramValues[param.key]"
                  type="password"
                  :placeholder="param.placeholder || 'Enter secret token / key'"
                  class="form-control"
                />

                <!-- Number Input -->
                <v-input
                  v-else-if="param.type === 'number'"
                  v-model.number="paramValues[param.key]"
                  type="number"
                  :placeholder="param.placeholder || 'Enter number'"
                  class="form-control"
                />

                <!-- Select Input -->
                <v-select
                  v-else-if="param.type === 'select'"
                  v-model="paramValues[param.key]"
                  :items="param.options || []"
                  class="form-control"
                />

                <!-- Standard / Cron Input -->
                <v-input
                  v-else
                  v-model="paramValues[param.key]"
                  :placeholder="param.placeholder || 'Enter value'"
                  class="form-control"
                />
              </div>
            </div>
          </div>

          <!-- Collection Requirements Mapping -->
          <div v-if="recipe.collections?.length" class="config-section">
            <label class="section-label">Collection Mappings</label>
            <p class="section-sub">Map the recipe's data triggers to your actual collections.</p>

            <div class="collections-list">
              <div v-for="col in recipe.collections" :key="col.key" class="param-field">
                <div class="param-header">
                  <span class="param-label">{{ col.label }}</span>
                  <code class="param-key">{{ col.key }}</code>
                </div>
                <p v-if="col.description" class="param-desc">{{ col.description }}</p>
                <v-input
                  v-model="collectionMap[col.key]"
                  :placeholder="col.suggested || col.key"
                  class="form-control"
                />
              </div>
            </div>
          </div>

          <v-notice v-if="errorMessage" type="danger" class="mt-3">
            {{ errorMessage }}
          </v-notice>
        </div>

        <!-- ================================================================= -->
        <!-- TAB 3: COMPILED FLOW JSON                                         -->
        <!-- ================================================================= -->
        <div v-else-if="activeTab === 'json'" class="tab-content json-tab-content">
          <div class="json-header-row">
            <div>
              <label class="section-label">Compiled Payload Preview</label>
              <p class="section-sub">
                Live inspection of the exact flow and operation records ready to be inserted.
              </p>
            </div>
            <v-button x-small secondary @click="copyCompiledJson">
              <v-icon name="content_copy" left x-small />
              Copy JSON
            </v-button>
          </div>

          <div class="json-viewer-box">
            <pre><code>{{ compiledJsonPreview }}</code></pre>
          </div>
        </div>
      </v-card-text>

      <!-- Dialog Footer -->
      <v-card-actions class="dialog-footer">
        <div class="footer-left">
          <v-button secondary @click="onClose">Cancel</v-button>
          <v-button v-if="activeTab !== 'preview'" secondary @click="activeTab = 'preview'">
            <v-icon name="arrow_back" left small />
            Pipeline Preview
          </v-button>
        </div>

        <div class="footer-right">
          <v-button v-if="activeTab === 'preview'" @click="activeTab = 'configure'">
            Configure & Install
            <v-icon name="arrow_forward" right small />
          </v-button>

          <v-button v-else :loading="isInstalling" :disabled="!isFormValid" @click="handleInstall">
            <v-icon name="download" left />
            Install Automation
          </v-button>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject } from 'vue';
import { useApi, useStores } from '@directus/extensions-sdk';
import type {
  IFlowRecipe,
  IRecipeOperation,
  ICredential,
  FlowManagerUtilsContext,
  FlowsStore,
} from '../../../types';
import { compileRecipe } from '../../../utils/recipe.util';
import { formatConnectionError } from '../../../utils/error.util';
import { ENDPOINT_EXTENSION_NAME } from '../../../constants';
import { notify } from '../../../utils/notification.util';

const props = withDefaults(
  defineProps<{
    recipe: IFlowRecipe | null;
    active: boolean;
    selectedCredential?: string;
    credentials?: ICredential[];
    initialTab?: 'preview' | 'configure' | 'json';
  }>(),
  {
    selectedCredential: '',
    credentials: () => [],
    initialTab: 'preview',
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'installed', payload: { flowIds: string[] }): void;
}>();

const api = useApi();
const { useNotificationsStore, useFlowsStore } = useStores();
const notificationsStore = useNotificationsStore();
const flowsStore: FlowsStore = useFlowsStore();
const flowManagerUtils = inject<Partial<FlowManagerUtilsContext>>('flowManagerUtils', {});

const activeTab = ref<'preview' | 'configure' | 'json'>('preview');

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      activeTab.value = props.initialTab || 'preview';
    }
  },
  { immediate: true },
);

watch(
  () => props.initialTab,
  (newTab) => {
    if (newTab) {
      activeTab.value = newTab;
    }
  },
);

async function hydrateLocalFlow() {
  if (flowManagerUtils?.hydrateLocalFlow) {
    await flowManagerUtils.hydrateLocalFlow();
  } else {
    try {
      await flowsStore.hydrate();
    } catch {
      // ignore store hydration errors
    }
  }
}

const paramValues = ref<Record<string, unknown>>({});
const collectionMap = ref<Record<string, string>>({});
const isInstalling = ref(false);
const errorMessage = ref<string | null>(null);

const isLocalTarget = computed(
  () => !props.selectedCredential || props.selectedCredential === 'local',
);

const activeInstanceName = computed(() => {
  if (isLocalTarget.value) return 'Local Directus';
  const c = props.credentials?.find((cred) => cred.id === props.selectedCredential);
  return c?.name || 'Remote Directus';
});

const totalOperationsCount = computed(() => {
  if (!props.recipe?.flows) return 0;
  return props.recipe.flows.reduce((acc, f) => acc + (f.operations?.length || 0), 0);
});

// Initialize form inputs whenever recipe changes
watch(
  () => props.recipe,
  (newRecipe) => {
    errorMessage.value = null;
    if (!newRecipe) return;

    const initialParams: Record<string, unknown> = {};
    for (const p of newRecipe.parameters || []) {
      initialParams[p.key] = p.default !== undefined ? p.default : '';
    }
    paramValues.value = initialParams;

    const initialCols: Record<string, string> = {};
    for (const c of newRecipe.collections || []) {
      initialCols[c.key] = c.suggested || c.key;
    }
    collectionMap.value = initialCols;
  },
  { immediate: true },
);

const isFormValid = computed(() => {
  if (!props.recipe) return false;
  for (const p of props.recipe.parameters || []) {
    if (p.required) {
      const val = paramValues.value[p.key];
      if (val === undefined || val === null || val === '') return false;
    }
  }
  return true;
});

function getOperationNameByKey(key?: string | null): string {
  if (!key || !props.recipe?.flows) return '';
  for (const flow of props.recipe.flows) {
    const op = flow.operations?.find((o) => o.key === key);
    if (op) return op.name || op.key;
  }
  return key;
}

function getOperationMeta(type: string): { icon: string; color: string; label: string } {
  switch (type) {
    case 'condition':
      return { icon: 'call_split', color: '#f59e0b', label: 'Condition' };
    case 'request':
    case 'webhook':
      return { icon: 'http', color: '#3b82f6', label: 'HTTP Request' };
    case 'item-create':
    case 'create-data':
      return { icon: 'add_circle', color: '#10b981', label: 'Create Record' };
    case 'item-read':
    case 'read-data':
      return { icon: 'find_in_page', color: '#6366f1', label: 'Read Data' };
    case 'item-update':
    case 'update-data':
      return { icon: 'edit', color: '#06b6d4', label: 'Update Record' };
    case 'item-delete':
    case 'delete-data':
      return { icon: 'delete', color: '#ef4444', label: 'Delete Record' };
    case 'exec':
    case 'run-script':
      return { icon: 'code', color: '#8b5cf6', label: 'Run Script' };
    case 'mail':
      return { icon: 'mail', color: '#ec4899', label: 'Send Email' };
    case 'notification':
      return { icon: 'notifications', color: '#14b8a6', label: 'Notification' };
    case 'log':
      return { icon: 'notes', color: '#64748b', label: 'Log Message' };
    case 'sleep':
      return { icon: 'hourglass_empty', color: '#eab308', label: 'Sleep Delay' };
    case 'transform':
      return { icon: 'transform', color: '#a855f7', label: 'Transform Payload' };
    default:
      return { icon: 'settings', color: '#64748b', label: type || 'Operation' };
  }
}

function getTriggerMeta(trigger: string): { icon: string; label: string } {
  switch (trigger) {
    case 'webhook':
      return { icon: 'webhook', label: 'Webhook (Incoming HTTP)' };
    case 'event':
      return { icon: 'bolt', label: 'Event Hook (Action / Filter)' };
    case 'schedule':
      return { icon: 'schedule', label: 'Schedule (Cron Timer)' };
    case 'manual':
      return { icon: 'touch_app', label: 'Manual Trigger' };
    default:
      return { icon: 'play_arrow', label: trigger || 'Trigger' };
  }
}

function getOperationSummary(op: IRecipeOperation): string {
  if (!op.options) return '';
  switch (op.type) {
    case 'request':
    case 'webhook': {
      const method = (op.options.method as string) || 'GET';
      const url = (op.options.url as string) || '';
      return `${method.toUpperCase()} ${url}`;
    }
    case 'condition': {
      const filter = op.options.filter;
      if (filter && typeof filter === 'object') {
        return `Evaluates ${Object.keys(filter).join(', ')} rules`;
      }
      return 'Conditional branching filter';
    }
    case 'item-create':
    case 'create-data':
    case 'item-update':
    case 'update-data': {
      const col = (op.options.collection as string) || '';
      return col ? `Collection: ${col}` : '';
    }
    case 'mail': {
      const to = (op.options.to as string) || '';
      return to ? `To: ${to}` : 'Send transactional email';
    }
    case 'exec':
    case 'run-script': {
      return 'Custom JavaScript sandbox execution';
    }
    case 'log': {
      return 'Outputs execution log data';
    }
    default:
      return '';
  }
}

const compiledJsonPreview = computed(() => {
  if (!props.recipe) return '';
  try {
    const compiled = compileRecipe(props.recipe, paramValues.value, collectionMap.value);
    return JSON.stringify(compiled, null, 2);
  } catch (err: unknown) {
    return `// Error compiling recipe payload:\n// ${err instanceof Error ? err.message : String(err)}`;
  }
});

async function copyCompiledJson() {
  if (!compiledJsonPreview.value) return;
  try {
    await navigator.clipboard.writeText(compiledJsonPreview.value);
    notify.info(notificationsStore, 'Copied to Clipboard', 'Compiled flow JSON is ready to paste.');
  } catch {
    // Ignore clipboard errors
  }
}

function onClose() {
  emit('close');
}

async function handleInstall() {
  if (!props.recipe || !isFormValid.value || isInstalling.value) return;

  isInstalling.value = true;
  errorMessage.value = null;

  try {
    const compiled = compileRecipe(props.recipe, paramValues.value, collectionMap.value);

    // 1. Create Flows & Operations on Target Instance
    if (isLocalTarget.value) {
      for (const flowPayload of compiled.flows) {
        await api.post('/flows', flowPayload);
      }
      for (const opPayload of compiled.operations) {
        await api.post('/operations', opPayload);
      }
      await hydrateLocalFlow();
    } else {
      const cred = props.credentials?.find((c) => c.id === props.selectedCredential);
      if (!cred) throw new Error('Target remote credential not found.');

      for (const flowPayload of compiled.flows) {
        await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
          url: `${cred.url}/flows`,
          staticToken: cred.staticToken,
          method: 'POST',
          payload: flowPayload,
        });
      }
      for (const opPayload of compiled.operations) {
        await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
          url: `${cred.url}/operations`,
          staticToken: cred.staticToken,
          method: 'POST',
          payload: opPayload,
        });
      }
    }

    notify.success(
      notificationsStore,
      'Recipe Installed!',
      `Successfully installed "${props.recipe.name}" (${compiled.flows.length} flow created).`,
    );

    emit('installed', { flowIds: compiled.flows.map((f) => f.id) });
    onClose();
  } catch (err: unknown) {
    errorMessage.value = formatConnectionError(err, 'Failed to install recipe.');
  } finally {
    isInstalling.value = false;
  }
}
</script>

<style scoped lang="scss">
.recipe-install-card {
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));

  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .recipe-icon-circle {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .recipe-modal-title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.2;
  }

  .recipe-modal-sub {
    font-size: 12px;
    color: var(--theme--foreground-subdued, #64748b);
    margin-top: 3px;
  }
}

.modal-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px;
  background-color: var(--theme--background-subdued, rgba(0, 0, 0, 0.02));
  border-bottom: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));

  .modal-tab {
    display: inline-flex;
    align-items: center;
    padding: 12px 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--theme--foreground-subdued, #64748b);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      color: var(--theme--foreground, #1e293b);
    }

    &.active {
      color: var(--theme--primary, #6644ff);
      border-bottom-color: var(--theme--primary, #6644ff);
    }

    .tab-badge {
      font-size: 10px;
      font-weight: 700;
      background: var(--theme--primary, #6644ff);
      color: #fff;
      padding: 1px 6px;
      border-radius: 10px;
      margin-left: 6px;
    }
  }
}

.dialog-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;

  .recipe-desc {
    font-size: 13px;
    line-height: 1.6;
    color: var(--theme--foreground, #1e293b);
    margin-bottom: 18px;
  }
}

/* Quick Metrics Bar */
.preview-metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 24px;

  .metric-card {
    background-color: var(--theme--background-subdued, rgba(0, 0, 0, 0.02));
    border: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.06));
    border-radius: 8px;
    padding: 10px 14px;

    .metric-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--theme--foreground-subdued, #64748b);
      margin-bottom: 4px;
    }

    .metric-value {
      display: flex;
      align-items: center;
      font-size: 13px;
      font-weight: 700;
      color: var(--theme--foreground, #1e293b);
    }
  }
}

/* Pipeline Architecture Section */
.pipeline-section {
  margin-bottom: 24px;

  .section-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;

    .section-meta {
      font-size: 12px;
      color: var(--theme--foreground-subdued, #64748b);
    }
  }
}

.flow-pipeline-container {
  background-color: var(--theme--background-subdued, rgba(0, 0, 0, 0.015));
  border: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;

  .flow-title-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px dashed var(--theme--border-subdued, rgba(0, 0, 0, 0.08));

    .flow-icon-circle {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .flow-name-box {
      flex: 1;
      display: flex;
      flex-direction: column;

      .flow-name-text {
        font-size: 14px;
        font-weight: 700;
      }

      .flow-trigger-meta {
        font-size: 11px;
        color: var(--theme--foreground-subdued, #64748b);
      }
    }

    .status-tag {
      font-size: 10px;
      font-weight: 600;
      color: var(--theme--foreground-subdued, #64748b);
      background: rgba(0, 0, 0, 0.04);
      padding: 2px 8px;
      border-radius: 4px;
    }
  }
}

/* Pipeline Nodes */
.pipeline-node {
  background-color: var(--theme--background, #fff);
  border: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);

  &.trigger-node {
    border-left: 4px solid var(--theme--primary, #6644ff);
  }

  &.operation-node {
    border-left: 4px solid var(--theme--border-subdued, #cbd5e1);
  }

  .node-badge {
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;

    &.trigger-badge {
      background-color: rgba(102, 68, 255, 0.12);
      color: var(--theme--primary, #6644ff);
    }
  }

  .node-main {
    flex: 1;

    .node-header {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;

      .node-step-index {
        font-size: 11px;
        font-weight: 700;
        color: var(--theme--foreground-subdued, #64748b);
      }

      .node-name {
        font-size: 13px;
        font-weight: 700;
      }

      .node-key {
        font-size: 11px;
        color: var(--theme--foreground-subdued, #64748b);
        background: rgba(0, 0, 0, 0.04);
        padding: 1px 5px;
        border-radius: 3px;
      }
    }

    .node-summary {
      font-size: 12px;
      color: var(--theme--foreground-subdued, #64748b);
      margin-top: 4px;
    }

    .node-branches {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
      flex-wrap: wrap;

      .branch-pill {
        display: inline-flex;
        align-items: center;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;

        &.resolve {
          background-color: rgba(16, 185, 129, 0.1);
          color: #059669;
        }

        &.reject {
          background-color: rgba(245, 158, 11, 0.12);
          color: #d97706;
        }
      }
    }
  }
}

.pipeline-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;

  .connector-line {
    width: 2px;
    height: 12px;
    background-color: var(--theme--border-subdued, rgba(0, 0, 0, 0.12));
  }

  .connector-arrow {
    font-size: 14px;
    color: var(--theme--foreground-subdued, #94a3b8);
    margin-top: -2px;
  }
}

/* Documentation Card */
.doc-section {
  margin-top: 24px;

  .doc-card {
    background-color: var(--theme--background-subdued, rgba(0, 0, 0, 0.02));
    border: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));
    border-radius: 8px;
    padding: 14px 18px;

    .doc-text {
      font-family: inherit;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      color: var(--theme--foreground, #1e293b);
      margin: 0;
    }
  }
}

/* JSON Code Viewer */
.json-tab-content {
  .json-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .json-viewer-box {
    background-color: #0f172a;
    color: #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    max-height: 480px;
    overflow: auto;

    pre {
      margin: 0;
      font-family: 'Fira Code', 'Roboto Mono', monospace;
      font-size: 12px;
      line-height: 1.5;
    }
  }
}

/* Configuration & Form Styles */
.config-section {
  margin-bottom: 22px;

  .section-label {
    display: block;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--theme--foreground-subdued, #64748b);
    margin-bottom: 6px;
  }

  .section-sub {
    font-size: 12px;
    color: var(--theme--foreground-subdued, #64748b);
    margin-bottom: 12px;
  }
}

.target-instance-box {
  display: inline-flex;
  align-items: center;
  background-color: var(--theme--background-subdued, rgba(0, 0, 0, 0.03));
  border: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;

  .target-name {
    font-weight: 600;
    margin-right: 8px;
  }

  .target-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    background: var(--theme--primary, #6644ff);
    color: #fff;
    padding: 2px 6px;
    border-radius: 4px;
  }
}

.param-field {
  background-color: var(--theme--background-subdued, rgba(0, 0, 0, 0.02));
  border: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.06));
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 12px;

  .param-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;

    .param-label {
      font-size: 13px;
      font-weight: 600;
    }

    .required-star {
      color: var(--theme--danger, #ef4444);
      font-weight: 700;
    }

    .param-key {
      font-size: 11px;
      color: var(--theme--foreground-subdued, #64748b);
      background: rgba(0, 0, 0, 0.04);
      padding: 1px 5px;
      border-radius: 3px;
    }
  }

  .param-desc {
    font-size: 11px;
    color: var(--theme--foreground-subdued, #64748b);
    margin-bottom: 8px;
  }

  .form-control {
    width: 100%;
  }
}

:deep(.v-card-actions.dialog-footer),
.dialog-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 10px;
  row-gap: 12px;
  column-gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));

  .footer-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    row-gap: 10px;
  }

  .footer-right {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    row-gap: 10px;
  }
}
</style>

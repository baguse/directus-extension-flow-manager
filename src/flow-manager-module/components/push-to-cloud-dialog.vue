<script setup lang="ts">
import { computed, nextTick, ref, toRefs, watch } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import type {
  ICredential,
  IFlow,
  IFolder,
  IFlowPushMergePlan,
  IFlowSnapshotData,
  IFlowDiffResult,
} from '../../types';
import { maskingText } from '../../utils/string.util';
import { useFlowDiff } from '../../composables/use-flow-diff';
import {
  generateHighlightedJsonDiff,
  type HighlightedJsonDiff,
} from '../../utils/diff-highlighter.util';
import { ENDPOINT_EXTENSION_NAME } from '../../constants';

const props = withDefaults(
  defineProps<{
    value: boolean;
    credentials: ICredential[];
    loading?: boolean;
    flow?: IFlow | IFolder | null;
    selectedFlows?: IFlow[];
  }>(),
  {
    credentials: () => [],
    loading: false,
    flow: null,
    selectedFlows: () => [],
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (
    e: 'proceed',
    payload: {
      credential: ICredential;
      mergePlan?: IFlowPushMergePlan;
      flowId?: string;
    },
  ): void;
}>();

const { value, credentials, loading } = toRefs(props);
const api = useApi();
const { compareSnapshots } = useFlowDiff();

const selectedId = ref<string | null>(null);
const isInspecting = ref(false);
const inspectError = ref<string | null>(null);

interface PreflightData {
  exists: boolean;
  localFlow: IFlow;
  remoteFlow: IFlow | null;
}

const preflightResult = ref<PreflightData | null>(null);

// Dialog tab state
const activeTab = ref<'merge' | 'visual' | 'json'>('merge');

// Merge plan staging state
const stagedMetadataFields = ref<Set<string>>(new Set());
const stagedCreateOpIds = ref<Set<string>>(new Set());
const stagedUpdateOpIds = ref<Set<string>>(new Set());
const stagedDeleteOpIds = ref<Set<string>>(new Set());
const remoteStatusChoice = ref<'keep' | 'inactive' | 'active'>('keep');
const newFlowStatusChoice = ref<'inactive' | 'active'>('inactive');

// Raw JSON Diff controls
const diffViewMode = ref<'split' | 'unified'>('split');
const isLineWrapEnabled = ref(false);
const currentDiffIndex = ref(0);
const diffContainerRef = ref<HTMLElement | null>(null);

const credentialOptions = computed(() => {
  return credentials.value.map((credential) => ({
    text: credential.name,
    value: credential.id,
  }));
});

const selectedItem = computed(() => {
  return credentials.value.find((credential) => credential.id === selectedId.value) || null;
});

const isBatch = computed(() => {
  return (props.selectedFlows && props.selectedFlows.length > 1) ?? false;
});

const targetFlow = computed<IFlow | null>(() => {
  if (props.flow && 'trigger' in props.flow) {
    return props.flow as IFlow;
  }
  if (props.selectedFlows && props.selectedFlows.length > 0) {
    return props.selectedFlows[0] || null;
  }
  return null;
});

function toSnapshotData(f: IFlow): IFlowSnapshotData {
  const ops = f.operations || [];
  const rootOp = ops.find((o) => o.id === f.operation);
  return {
    flow: f,
    operations: ops,
    rootOperationKey: rootOp?.key || null,
    category: f.flow_manager_metadata_id?.flow_manager_category || null,
  };
}

const diffResult = computed<IFlowDiffResult | null>(() => {
  if (!preflightResult.value?.exists || !preflightResult.value.remoteFlow) {
    return null;
  }
  const remoteSnapshot = toSnapshotData(preflightResult.value.remoteFlow);
  const localSnapshot = toSnapshotData(preflightResult.value.localFlow);
  return compareSnapshots(remoteSnapshot, localSnapshot);
});

const addedOps = computed(() => {
  return (diffResult.value?.operationsDiff || []).filter((op) => op.changeType === 'added');
});

const removedOps = computed(() => {
  return (diffResult.value?.operationsDiff || []).filter((op) => op.changeType === 'removed');
});

const modifiedOps = computed(() => {
  return (diffResult.value?.operationsDiff || []).filter((op) => op.changeType === 'modified');
});

const unchangedOps = computed(() => {
  return (diffResult.value?.operationsDiff || []).filter((op) => op.changeType === 'unchanged');
});

const highlightedJsonDiff = computed<HighlightedJsonDiff>(() => {
  if (!diffResult.value) {
    return {
      sideBySideRows: [],
      unifiedRows: [],
      stats: { addedLines: 0, removedLines: 0, totalDiffChunks: 0, hasChanges: false },
      diffRowIndices: [],
    };
  }
  return generateHighlightedJsonDiff(
    diffResult.value.rawSourceJson,
    diffResult.value.rawTargetJson,
  );
});

const totalDiffChunks = computed(() => highlightedJsonDiff.value.diffRowIndices.length);

const totalStagedCount = computed(() => {
  return (
    stagedMetadataFields.value.size +
    stagedCreateOpIds.value.size +
    stagedUpdateOpIds.value.size +
    stagedDeleteOpIds.value.size
  );
});

const totalAvailableChanges = computed(() => {
  const metaCount = diffResult.value?.metadataChanges?.length || 0;
  const addCount = addedOps.value.length;
  const modCount = modifiedOps.value.length;
  const remCount = removedOps.value.length;
  return metaCount + addCount + modCount + remCount;
});

const isAllStaged = computed(() => {
  const metaCount = diffResult.value?.metadataChanges?.length || 0;
  const addCount = addedOps.value.length;
  const modCount = modifiedOps.value.length;
  return (
    stagedMetadataFields.value.size === metaCount &&
    stagedCreateOpIds.value.size === addCount &&
    stagedUpdateOpIds.value.size === modCount
  );
});

async function inspectRemote() {
  if (!selectedItem.value || !targetFlow.value) return;

  isInspecting.value = true;
  inspectError.value = null;
  preflightResult.value = null;

  try {
    const res = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/push-to-cloud/preflight`, {
      config: {
        url: selectedItem.value.url,
        staticToken: selectedItem.value.staticToken,
      },
      flowId: targetFlow.value.id,
    });

    preflightResult.value = res.data;

    // Initialize staged selections
    nextTick(() => {
      stagedMetadataFields.value.clear();
      stagedCreateOpIds.value.clear();
      stagedUpdateOpIds.value.clear();
      stagedDeleteOpIds.value.clear();

      if (diffResult.value?.hasChanges) {
        // Stage all incoming metadata changes by default
        for (const meta of diffResult.value.metadataChanges) {
          stagedMetadataFields.value.add(meta.field);
        }

        // Stage all added operations by default
        const localOps = targetFlow.value?.operations || [];
        for (const op of addedOps.value) {
          const match = localOps.find((o) => o.key === op.key);
          if (match) stagedCreateOpIds.value.add(match.id);
        }

        // Stage all modified operations by default
        for (const op of modifiedOps.value) {
          const match = localOps.find((o) => o.key === op.key);
          if (match) stagedUpdateOpIds.value.add(match.id);
        }

        // Note: stagedDeleteOpIds is left empty by default for safety!
      }
    });
  } catch (err: unknown) {
    const resMsg =
      (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data
        ?.error ||
      (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data
        ?.message;
    inspectError.value =
      resMsg || (err instanceof Error ? err.message : 'Failed to inspect remote instance.');
  } finally {
    isInspecting.value = false;
  }
}

watch(selectedId, (newId) => {
  if (newId) {
    inspectRemote();
  } else {
    preflightResult.value = null;
    inspectError.value = null;
  }
});

watch(value, (isOpen) => {
  if (isOpen) {
    activeTab.value = 'merge';
    currentDiffIndex.value = 0;
    if (credentials.value.length === 1 && credentials.value[0]?.id) {
      selectedId.value = credentials.value[0].id;
    } else if (selectedId.value) {
      inspectRemote();
    }
  } else {
    preflightResult.value = null;
    inspectError.value = null;
  }
});

function toggleAll(selectAll: boolean) {
  if (selectAll) {
    for (const meta of diffResult.value?.metadataChanges || []) {
      stagedMetadataFields.value.add(meta.field);
    }
    const localOps = targetFlow.value?.operations || [];
    for (const op of addedOps.value) {
      const match = localOps.find((o) => o.key === op.key);
      if (match) stagedCreateOpIds.value.add(match.id);
    }
    for (const op of modifiedOps.value) {
      const match = localOps.find((o) => o.key === op.key);
      if (match) stagedUpdateOpIds.value.add(match.id);
    }
  } else {
    stagedMetadataFields.value.clear();
    stagedCreateOpIds.value.clear();
    stagedUpdateOpIds.value.clear();
    stagedDeleteOpIds.value.clear();
  }
}

function toggleMetadataField(field: string) {
  if (stagedMetadataFields.value.has(field)) {
    stagedMetadataFields.value.delete(field);
  } else {
    stagedMetadataFields.value.add(field);
  }
}

function toggleCreateOp(id: string) {
  if (stagedCreateOpIds.value.has(id)) {
    stagedCreateOpIds.value.delete(id);
  } else {
    stagedCreateOpIds.value.add(id);
  }
}

function toggleUpdateOp(id: string) {
  if (stagedUpdateOpIds.value.has(id)) {
    stagedUpdateOpIds.value.delete(id);
  } else {
    stagedUpdateOpIds.value.add(id);
  }
}

function toggleDeleteOp(id: string) {
  if (stagedDeleteOpIds.value.has(id)) {
    stagedDeleteOpIds.value.delete(id);
  } else {
    stagedDeleteOpIds.value.add(id);
  }
}

function scrollToDiff(index: number) {
  if (totalDiffChunks.value === 0) return;
  const clampedIndex = (index + totalDiffChunks.value) % totalDiffChunks.value;
  currentDiffIndex.value = clampedIndex;

  nextTick(() => {
    const el = diffContainerRef.value?.querySelector(`[data-diff-chunk="${clampedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

function nextDiff() {
  scrollToDiff(currentDiffIndex.value + 1);
}

function prevDiff() {
  scrollToDiff(currentDiffIndex.value - 1);
}

function handleConfirmPush(forceOverwriteAll = false) {
  if (!selectedItem.value || !targetFlow.value) return;

  if (isBatch.value) {
    // For batch push without individual merge
    emit('proceed', {
      credential: selectedItem.value,
    });
    return;
  }

  if (!preflightResult.value?.exists) {
    // Flow does not exist -> Create new flow
    emit('proceed', {
      credential: selectedItem.value,
      flowId: targetFlow.value.id,
      mergePlan: {
        remoteStatus: newFlowStatusChoice.value,
      },
    });
    return;
  }

  if (forceOverwriteAll) {
    // Overwrite all without selective filter
    emit('proceed', {
      credential: selectedItem.value,
      flowId: targetFlow.value.id,
    });
    return;
  }

  // Selective Git-style merge
  const mergePlan: IFlowPushMergePlan = {
    metadataFields: Array.from(stagedMetadataFields.value),
    createOperationIds: Array.from(stagedCreateOpIds.value),
    updateOperationIds: Array.from(stagedUpdateOpIds.value),
    deleteOperationIds: Array.from(stagedDeleteOpIds.value),
    remoteStatus: remoteStatusChoice.value,
  };

  emit('proceed', {
    credential: selectedItem.value,
    flowId: targetFlow.value.id,
    mergePlan,
  });
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
</script>

<template>
  <v-dialog
    :model-value="value"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card class="push-to-cloud-card">
      <v-card-title>
        <div class="dialog-title-wrapper">
          <div class="title-main">
            <v-icon name="cloud_upload" class="mr-2 title-icon" />
            <span>Push Flow to Remote Instance</span>
          </div>

          <div v-if="targetFlow" class="flow-pill-badge">
            <v-icon :name="targetFlow.icon || 'bolt'" small class="mr-1 flow-icon" />
            <span class="flow-name">{{ targetFlow.name }}</span>
            <code class="flow-id">{{ targetFlow.id }}</code>
          </div>
        </div>
      </v-card-title>

      <v-card-text class="dialog-body-scroll">
        <!-- Target Remote Credential Selector -->
        <div class="credential-selector-card">
          <div class="section-label">Select Target Remote Instance:</div>
          <div class="selector-row">
            <v-select
              v-model="selectedId"
              :items="credentialOptions"
              placeholder="Choose a remote Directus instance..."
              class="cred-select"
            />
            <v-button
              secondary
              small
              :disabled="!selectedId || isInspecting"
              :loading="isInspecting"
              @click="inspectRemote"
            >
              <v-icon name="refresh" small class="mr-1" />
              Check Remote
            </v-button>
          </div>

          <div v-if="selectedItem" class="cred-details-row">
            <div class="cred-info-item">
              <span class="info-label">Remote URL:</span>
              <code class="info-code">{{ selectedItem.url || '-' }}</code>
            </div>
            <div class="cred-info-item">
              <span class="info-label">Token:</span>
              <code class="info-code">{{ maskingText(selectedItem.staticToken) || '-' }}</code>
            </div>
          </div>
        </div>

        <!-- Inspection Loading State -->
        <div v-if="isInspecting" class="state-box inspecting-state">
          <v-progress-linear indeterminate class="mb-3" />
          <div class="inspect-text">
            Connecting to <strong>{{ selectedItem?.name }}</strong> and comparing flow definitions...
          </div>
        </div>

        <!-- Inspection Error Notice -->
        <div v-else-if="inspectError" class="state-box error-state">
          <v-notice type="danger">
            <div class="notice-title">Failed to Connect to Remote Instance</div>
            <div class="notice-desc">{{ inspectError }}</div>
            <div class="notice-action">
              <v-button x-small secondary @click="inspectRemote">Retry Check</v-button>
            </div>
          </v-notice>
        </div>

        <!-- Preflight Result: Flow DOES NOT EXIST (Create New) -->
        <div
          v-else-if="preflightResult && !preflightResult.exists"
          class="state-box create-new-state"
        >
          <div class="status-banner new-flow-banner">
            <div class="banner-icon-box green">
              <v-icon name="add_circle" />
            </div>
            <div class="banner-content">
              <div class="banner-title">New Flow on Remote (No Conflict)</div>
              <div class="banner-desc">
                Flow <strong>"{{ targetFlow?.name }}"</strong> does not exist on
                <strong>{{ selectedItem?.name }}</strong>. Pushing will create a new flow with the
                exact same ID.
              </div>
            </div>
          </div>

          <div class="flow-creation-summary">
            <div class="summary-metric">
              <span class="metric-num">{{ targetFlow?.operations?.length || 0 }}</span>
              <span class="metric-label">Operations to Create</span>
            </div>
            <div class="summary-metric">
              <span class="metric-val trigger-val">{{ targetFlow?.trigger }}</span>
              <span class="metric-label">Trigger Type</span>
            </div>
            <div class="status-selector-metric">
              <span class="metric-label">Initial Status on Remote:</span>
              <div class="status-radio-group">
                <label class="radio-label">
                  <input v-model="newFlowStatusChoice" type="radio" value="inactive" />
                  <span>Inactive (Recommended)</span>
                </label>
                <label class="radio-label">
                  <input v-model="newFlowStatusChoice" type="radio" value="active" />
                  <span>Active</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Preflight Result: Flow EXISTS and is IDENTICAL -->
        <div
          v-else-if="preflightResult && preflightResult.exists && !diffResult?.hasChanges"
          class="state-box identical-state"
        >
          <div class="status-banner in-sync-banner">
            <div class="banner-icon-box blue">
              <v-icon name="check_circle" />
            </div>
            <div class="banner-content">
              <div class="banner-title">Flow is Already in Sync</div>
              <div class="banner-desc">
                The local flow and remote flow on <strong>{{ selectedItem?.name }}</strong> are
                completely identical. No differences were detected.
              </div>
            </div>
          </div>
        </div>

        <!-- Preflight Result: Flow EXISTS with DIFFERENCES (Git-Style Merge & Diff) -->
        <div
          v-else-if="preflightResult && preflightResult.exists && diffResult?.hasChanges"
          class="state-box diff-detected-state"
        >
          <!-- Status Banner -->
          <div class="status-banner diff-banner">
            <div class="banner-icon-box orange">
              <v-icon name="difference" />
            </div>
            <div class="banner-content">
              <div class="banner-title">Differences Detected Between Local & Remote</div>
              <div class="banner-desc">
                Flow exists on <strong>{{ selectedItem?.name }}</strong>. Select which changes to
                stage and merge into the remote instance.
              </div>
            </div>
            <div class="diff-counter-pill">
              <span class="pill-staged">{{ totalStagedCount }}/{{ totalAvailableChanges }}</span>
              <span class="pill-label">changes staged</span>
            </div>
          </div>

          <!-- View Mode Switcher Tabs -->
          <div class="diff-tabs-bar">
            <button
              type="button"
              :class="['tab-btn', { active: activeTab === 'merge' }]"
              @click="activeTab = 'merge'"
            >
              <v-icon name="call_merge" small class="mr-1" />
              Git Merge & Selection
              <span v-if="totalStagedCount > 0" class="tab-badge">{{ totalStagedCount }}</span>
            </button>
            <button
              type="button"
              :class="['tab-btn', { active: activeTab === 'visual' }]"
              @click="activeTab = 'visual'"
            >
              <v-icon name="dashboard_customize" small class="mr-1" />
              Visual Changes
            </button>
            <button
              type="button"
              :class="['tab-btn', { active: activeTab === 'json' }]"
              @click="activeTab = 'json'"
            >
              <v-icon name="code" small class="mr-1" />
              Raw JSON Compare
            </button>
          </div>

          <!-- TAB 1: GIT MERGE & SELECTION -->
          <div v-if="activeTab === 'merge'" class="merge-tab-content">
            <div class="merge-toolbar">
              <div class="merge-quick-btns">
                <button
                  type="button"
                  class="action-link-btn"
                  @click="toggleAll(!isAllStaged)"
                >
                  <v-icon :name="isAllStaged ? 'remove_done' : 'done_all'" small class="mr-1" />
                  {{ isAllStaged ? 'Deselect All' : 'Select All Incoming Changes' }}
                </button>
              </div>

              <!-- Remote Target Status Option -->
              <div class="remote-status-setting">
                <span class="status-setting-lbl">Remote Status:</span>
                <select v-model="remoteStatusChoice" class="remote-status-select">
                  <option value="keep">
                    Keep Remote Status ({{ preflightResult.remoteFlow?.status || 'current' }})
                  </option>
                  <option value="inactive">Set Inactive</option>
                  <option value="active">Set Active</option>
                </select>
              </div>
            </div>

            <!-- 1. Metadata Changes -->
            <div
              v-if="diffResult?.metadataChanges && diffResult.metadataChanges.length > 0"
              class="merge-section"
            >
              <div class="merge-section-header">
                <v-icon name="tune" small class="mr-1" />
                <span class="section-heading">Flow Settings ({{ diffResult.metadataChanges.length }})</span>
              </div>
              <div class="merge-table">
                <div
                  v-for="item in diffResult.metadataChanges"
                  :key="item.field"
                  class="merge-row"
                  :class="{ staged: stagedMetadataFields.has(item.field) }"
                  @click="toggleMetadataField(item.field)"
                >
                  <div class="merge-checkbox-col" @click.stop>
                    <input
                      type="checkbox"
                      :checked="stagedMetadataFields.has(item.field)"
                      @change="toggleMetadataField(item.field)"
                    />
                  </div>
                  <div class="merge-field-col">
                    <strong>{{ item.field }}</strong>
                  </div>
                  <div class="merge-from-col">
                    <span class="badge-remote">Remote</span>
                    <code>{{ formatValue(item.from) }}</code>
                  </div>
                  <div class="merge-arrow-col">
                    <v-icon name="arrow_forward" small />
                  </div>
                  <div class="merge-to-col">
                    <span class="badge-local">Local</span>
                    <code>{{ formatValue(item.to) }}</code>
                  </div>
                </div>
              </div>
            </div>

            <!-- 2. Operations to Create (+ Added locally) -->
            <div v-if="addedOps.length > 0" class="merge-section">
              <div class="merge-section-header green-header">
                <v-icon name="add_circle" small class="mr-1" />
                <span class="section-heading">Operations to Create on Remote (+{{ addedOps.length }})</span>
              </div>
              <div class="ops-merge-list">
                <div
                  v-for="op in addedOps"
                  :key="`add-${op.key}`"
                  class="op-merge-item added"
                  :class="{ staged: stagedCreateOpIds.has(targetFlow?.operations?.find(o => o.key === op.key)?.id || '') }"
                  @click="toggleCreateOp(targetFlow?.operations?.find(o => o.key === op.key)?.id || '')"
                >
                  <div class="op-check-col" @click.stop>
                    <input
                      type="checkbox"
                      :checked="stagedCreateOpIds.has(targetFlow?.operations?.find(o => o.key === op.key)?.id || '')"
                      @change="toggleCreateOp(targetFlow?.operations?.find(o => o.key === op.key)?.id || '')"
                    />
                  </div>
                  <span class="op-type-tag added">+ Added</span>
                  <strong class="op-title">{{ op.name || op.key }}</strong>
                  <code class="op-key-tag">[{{ op.key }}]</code>
                  <span class="op-kind-tag">type: {{ op.type }}</span>
                </div>
              </div>
            </div>

            <!-- 3. Operations to Update (~ Modified locally) -->
            <div v-if="modifiedOps.length > 0" class="merge-section">
              <div class="merge-section-header orange-header">
                <v-icon name="edit" small class="mr-1" />
                <span class="section-heading">Operations to Update on Remote (~{{ modifiedOps.length }})</span>
              </div>
              <div class="ops-merge-list">
                <div
                  v-for="op in modifiedOps"
                  :key="`mod-${op.key}`"
                  class="op-merge-item modified"
                  :class="{ staged: stagedUpdateOpIds.has(targetFlow?.operations?.find(o => o.key === op.key)?.id || '') }"
                  @click="toggleUpdateOp(targetFlow?.operations?.find(o => o.key === op.key)?.id || '')"
                >
                  <div class="op-main-row">
                    <div class="op-check-col" @click.stop>
                      <input
                        type="checkbox"
                        :checked="stagedUpdateOpIds.has(targetFlow?.operations?.find(o => o.key === op.key)?.id || '')"
                        @change="toggleUpdateOp(targetFlow?.operations?.find(o => o.key === op.key)?.id || '')"
                      />
                    </div>
                    <span class="op-type-tag modified">~ Modified</span>
                    <strong class="op-title">{{ op.name || op.key }}</strong>
                    <code class="op-key-tag">[{{ op.key }}]</code>
                    <span class="op-kind-tag">type: {{ op.type }}</span>
                  </div>
                  <div v-if="op.details && op.details.length" class="op-diff-details">
                    <div v-for="(det, dIdx) in op.details" :key="dIdx" class="detail-line">
                      <span class="det-field">{{ det.field }}:</span>
                      <span class="det-remote">- {{ formatValue(det.from) }}</span>
                      <span class="det-local">+ {{ formatValue(det.to) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 4. Operations Only on Remote (- Removed locally) -->
            <div v-if="removedOps.length > 0" class="merge-section">
              <div class="merge-section-header red-header">
                <v-icon name="remove_circle" small class="mr-1" />
                <span class="section-heading">Operations Only on Remote (-{{ removedOps.length }})</span>
              </div>
              <div class="section-hint-box">
                These operations exist on the remote instance but were removed locally. By default,
                they are preserved on remote. Check the box if you explicitly wish to delete them
                from the remote flow.
              </div>
              <div class="ops-merge-list">
                <div
                  v-for="op in removedOps"
                  :key="`rem-${op.key}`"
                  class="op-merge-item removed"
                  :class="{ staged: stagedDeleteOpIds.has(preflightResult?.remoteFlow?.operations?.find(o => o.key === op.key)?.id || '') }"
                  @click="toggleDeleteOp(preflightResult?.remoteFlow?.operations?.find(o => o.key === op.key)?.id || '')"
                >
                  <div class="op-check-col" @click.stop>
                    <input
                      type="checkbox"
                      :checked="stagedDeleteOpIds.has(preflightResult?.remoteFlow?.operations?.find(o => o.key === op.key)?.id || '')"
                      @change="toggleDeleteOp(preflightResult?.remoteFlow?.operations?.find(o => o.key === op.key)?.id || '')"
                    />
                  </div>
                  <span class="op-type-tag removed">- Delete from Remote</span>
                  <strong class="op-title">{{ op.name || op.key }}</strong>
                  <code class="op-key-tag">[{{ op.key }}]</code>
                  <span class="op-kind-tag">type: {{ op.type }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: VISUAL CHANGES -->
          <div v-else-if="activeTab === 'visual'" class="visual-tab-content">
            <div class="stats-row">
              <div class="stat-badge added">
                <span class="stat-count">+{{ addedOps.length }}</span>
                <span class="stat-label">Added</span>
              </div>
              <div class="stat-badge removed">
                <span class="stat-count">-{{ removedOps.length }}</span>
                <span class="stat-label">Removed</span>
              </div>
              <div class="stat-badge modified">
                <span class="stat-count">~{{ modifiedOps.length }}</span>
                <span class="stat-label">Modified</span>
              </div>
              <div class="stat-badge unchanged">
                <span class="stat-count">={{ unchangedOps.length }}</span>
                <span class="stat-label">Unchanged</span>
              </div>
            </div>

            <!-- Operations visual graph changes list -->
            <div class="ops-list">
              <div v-for="op in addedOps" :key="`v-add-${op.key}`" class="op-card added-card">
                <div class="op-header">
                  <span class="badge-op-type added">+ Added</span>
                  <strong class="op-name">{{ op.name || op.key }}</strong>
                  <code class="op-key">[{{ op.key }}]</code>
                  <span class="op-kind">type: {{ op.type }}</span>
                </div>
              </div>
              <div v-for="op in removedOps" :key="`v-rem-${op.key}`" class="op-card removed-card">
                <div class="op-header">
                  <span class="badge-op-type removed">- Removed</span>
                  <strong class="op-name">{{ op.name || op.key }}</strong>
                  <code class="op-key">[{{ op.key }}]</code>
                  <span class="op-kind">type: {{ op.type }}</span>
                </div>
              </div>
              <div v-for="op in modifiedOps" :key="`v-mod-${op.key}`" class="op-card modified-card">
                <div class="op-header">
                  <span class="badge-op-type modified">~ Modified</span>
                  <strong class="op-name">{{ op.name || op.key }}</strong>
                  <code class="op-key">[{{ op.key }}]</code>
                  <span class="op-kind">type: {{ op.type }}</span>
                </div>
                <div v-if="op.details && op.details.length" class="op-details">
                  <div v-for="(det, dIdx) in op.details" :key="dIdx" class="op-detail-row">
                    <span class="detail-field">{{ det.field }}:</span>
                    <div class="detail-diff">
                      <span class="detail-from">- {{ formatValue(det.from) }}</span>
                      <span class="detail-to">+ {{ formatValue(det.to) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 3: RAW JSON COMPARE -->
          <div v-else-if="activeTab === 'json'" class="json-tab-content">
            <div class="raw-json-toolbar">
              <div class="toolbar-left-stats">
                <div class="diff-stats-pill">
                  <span class="stat-tag added">+{{ highlightedJsonDiff.stats.addedLines }}</span>
                  <span class="stat-tag removed">-{{ highlightedJsonDiff.stats.removedLines }}</span>
                  <span class="stat-tag chunks">{{ totalDiffChunks }} change{{ totalDiffChunks > 1 ? 's' : '' }}</span>
                </div>
                <div v-if="totalDiffChunks > 0" class="diff-navigator">
                  <button type="button" class="nav-btn" title="Previous difference" @click="prevDiff">
                    <v-icon name="arrow_upward" small />
                  </button>
                  <span class="nav-counter">{{ currentDiffIndex + 1 }}/{{ totalDiffChunks }}</span>
                  <button type="button" class="nav-btn" title="Next difference" @click="nextDiff">
                    <v-icon name="arrow_downward" small />
                  </button>
                </div>
              </div>

              <div class="toolbar-controls">
                <div class="view-mode-toggle-group">
                  <button
                    type="button"
                    :class="['mode-btn', { active: diffViewMode === 'split' }]"
                    @click="diffViewMode = 'split'"
                  >
                    <v-icon name="vertical_split" small class="mr-1" />
                    Split
                  </button>
                  <button
                    type="button"
                    :class="['mode-btn', { active: diffViewMode === 'unified' }]"
                    @click="diffViewMode = 'unified'"
                  >
                    <v-icon name="view_agenda" small class="mr-1" />
                    Unified
                  </button>
                </div>
                <button
                  type="button"
                  :class="['tool-btn', { active: isLineWrapEnabled }]"
                  @click="isLineWrapEnabled = !isLineWrapEnabled"
                >
                  <v-icon name="wrap_text" small class="mr-1" />
                  Wrap Lines
                </button>
              </div>
            </div>

            <!-- Diff Table -->
            <div
              ref="diffContainerRef"
              :class="['diff-table-container', { 'wrap-lines': isLineWrapEnabled }]"
            >
              <div v-if="diffViewMode === 'split'" class="diff-header-bar">
                <div class="diff-header-col source">
                  <span class="pane-badge source">Remote</span>
                  <span class="pane-title-text">{{ selectedItem?.name }} (Current)</span>
                </div>
                <div class="diff-header-col target">
                  <span class="pane-badge target">Local</span>
                  <span class="pane-title-text">Local Instance (Incoming)</span>
                </div>
              </div>

              <div v-if="diffViewMode === 'split'" class="diff-rows-wrapper split-mode">
                <div
                  v-for="row in highlightedJsonDiff.sideBySideRows"
                  :key="row.rowIndex"
                  class="diff-row split-mode"
                  :class="{
                    'is-diff': row.isDiff,
                    'is-current-chunk': row.diffIndex === currentDiffIndex,
                  }"
                  :data-row-index="row.rowIndex"
                  :data-diff-chunk="row.diffIndex"
                >
                  <div class="diff-cell left-cell" :class="row.left.type">
                    <span class="line-num">{{ row.left.lineNum ?? '' }}</span>
                    <span class="diff-sign">{{ row.left.type === 'removed' ? '-' : '' }}</span>
                    <span class="line-text">
                      <template v-if="row.left.type === 'empty'">
                        <span class="empty-line-filler" />
                      </template>
                      <template v-else-if="row.left.wordParts && row.left.wordParts.length > 0">
                        <span
                          v-for="(part, pIdx) in row.left.wordParts"
                          :key="pIdx"
                          :class="['word-part', { 'word-changed': part.changed }]"
                        >{{ part.text }}</span>
                      </template>
                      <template v-else>{{ row.left.text }}</template>
                    </span>
                  </div>

                  <div class="diff-cell right-cell" :class="row.right.type">
                    <span class="line-num">{{ row.right.lineNum ?? '' }}</span>
                    <span class="diff-sign">{{ row.right.type === 'added' ? '+' : '' }}</span>
                    <span class="line-text">
                      <template v-if="row.right.type === 'empty'">
                        <span class="empty-line-filler" />
                      </template>
                      <template v-else-if="row.right.wordParts && row.right.wordParts.length > 0">
                        <span
                          v-for="(part, pIdx) in row.right.wordParts"
                          :key="pIdx"
                          :class="['word-part', { 'word-changed': part.changed }]"
                        >{{ part.text }}</span>
                      </template>
                      <template v-else>{{ row.right.text }}</template>
                    </span>
                  </div>
                </div>
              </div>

              <div v-else class="diff-rows-wrapper unified-mode">
                <div
                  v-for="uRow in highlightedJsonDiff.unifiedRows"
                  :key="uRow.rowIndex"
                  class="diff-row unified"
                  :class="[
                    uRow.type,
                    {
                      'is-diff': uRow.isDiff,
                      'is-current-chunk': uRow.diffIndex === currentDiffIndex,
                    },
                  ]"
                  :data-row-index="uRow.rowIndex"
                  :data-diff-chunk="uRow.diffIndex"
                >
                  <div class="diff-cell unified-cell" :class="uRow.type">
                    <span class="line-num left">{{ uRow.leftLineNum ?? '' }}</span>
                    <span class="line-num right">{{ uRow.rightLineNum ?? '' }}</span>
                    <span class="diff-sign">
                      {{ uRow.type === 'added' ? '+' : uRow.type === 'removed' ? '-' : ' ' }}
                    </span>
                    <span class="line-text">
                      <template v-if="uRow.wordParts && uRow.wordParts.length > 0">
                        <span
                          v-for="(part, pIdx) in uRow.wordParts"
                          :key="pIdx"
                          :class="['word-part', { 'word-changed': part.changed }]"
                        >{{ part.text }}</span>
                      </template>
                      <template v-else>{{ uRow.text }}</template>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="dialog-actions-bar">
        <div class="actions-left">
          <v-button secondary :disabled="loading" @click="emit('update:modelValue', false)">
            Cancel
          </v-button>
        </div>

        <div class="actions-right">
          <!-- Overwrite Force Push (only if diff exists) -->
          <v-button
            v-if="preflightResult && preflightResult.exists && diffResult?.hasChanges"
            secondary
            :disabled="!selectedItem || loading || isInspecting"
            :loading="loading"
            class="force-push-btn"
            title="Overwrite remote flow completely with local flow"
            @click="handleConfirmPush(true)"
          >
            Force Overwrite All
          </v-button>

          <!-- Primary Push Button -->
          <v-button
            :disabled="
              !selectedItem ||
              loading ||
              isInspecting ||
              (preflightResult?.exists && diffResult?.hasChanges && totalStagedCount === 0)
            "
            :loading="loading"
            @click="handleConfirmPush(false)"
          >
            <template v-if="!preflightResult || isInspecting">
              Push to Cloud
            </template>
            <template v-else-if="!preflightResult.exists">
              <v-icon name="cloud_upload" left />
              Push & Create on Remote
            </template>
            <template v-else-if="!diffResult?.hasChanges">
              <v-icon name="sync" left />
              Re-push (Overwrite)
            </template>
            <template v-else>
              <v-icon name="call_merge" left />
              Merge & Push ({{ totalStagedCount }} Change{{ totalStagedCount > 1 ? 's' : '' }})
            </template>
          </v-button>
        </div>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.push-to-cloud-card {
  --v-card-min-width: min(94vw, 1100px);
  max-inline-size: min(94vw, 1100px) !important;
  max-width: 1100px !important;
  width: min(94vw, 1100px) !important;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.dialog-title-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  flex-wrap: wrap;
  gap: 10px;
}

.title-main {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--theme--foreground, #1e293b);

  .title-icon {
    color: var(--theme--primary, #6366f1);
  }
}

.flow-pill-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background-color: var(--theme--background-subdued, #f1f5f9);
  border-radius: 6px;
  font-size: 12px;

  .flow-icon {
    color: var(--theme--primary, #6366f1);
  }
  .flow-name {
    font-weight: 600;
    margin-right: 6px;
  }
  .flow-id {
    font-size: 10px;
    color: var(--theme--foreground-subdued, #64748b);
  }
}

.dialog-body-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  max-height: 72vh;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.credential-selector-card {
  background-color: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
}

.selector-row {
  display: flex;
  align-items: center;
  gap: 12px;

  .cred-select {
    flex: 1;
  }
}

.cred-details-row {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
  padding-top: 4px;

  .info-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .info-code {
    background-color: rgba(0, 0, 0, 0.05);
    padding: 1px 5px;
    border-radius: 4px;
    font-family: monospace;
  }
}

.state-box {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &.inspecting-state {
    padding: 24px 0;
    text-align: center;
    font-size: 13px;
    color: var(--theme--foreground-subdued, #64748b);
  }
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 8px;

  .banner-icon-box {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &.green {
      background-color: rgba(34, 197, 94, 0.15);
      color: #10b981;
    }
    &.blue {
      background-color: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
    }
    &.orange {
      background-color: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
  }

  &.new-flow-banner {
    background-color: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.25);
  }

  &.in-sync-banner {
    background-color: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.25);
  }

  &.diff-banner {
    background-color: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .banner-content {
    flex: 1;

    .banner-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--theme--foreground, #1e293b);
      margin-bottom: 2px;
    }
    .banner-desc {
      font-size: 12px;
      color: var(--theme--foreground-subdued, #64748b);
    }
  }
}

.diff-counter-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(245, 158, 11, 0.2);
  padding: 6px 12px;
  border-radius: 6px;

  .pill-staged {
    font-size: 16px;
    font-weight: 800;
    color: #b45309;
  }
  .pill-label {
    font-size: 10px;
    font-weight: 600;
    color: #b45309;
    text-transform: uppercase;
  }
}

.flow-creation-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background-color: var(--theme--background-subdued, #f8fafc);
  border-radius: 8px;

  .summary-metric {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .metric-num {
      font-size: 20px;
      font-weight: 800;
      color: var(--theme--primary, #6366f1);
    }
    .metric-val {
      font-size: 14px;
      font-weight: 700;
      text-transform: capitalize;
    }
    .metric-label {
      font-size: 11px;
      color: var(--theme--foreground-subdued, #64748b);
    }
  }

  .status-selector-metric {
    margin-left: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;

    .metric-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--theme--foreground-subdued, #64748b);
    }

    .status-radio-group {
      display: flex;
      align-items: center;
      gap: 14px;

      .radio-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        cursor: pointer;
      }
    }
  }
}

.diff-tabs-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 2px solid var(--theme--border-color-subdued, #e2e8f0);
  padding-bottom: 2px;

  .tab-btn {
    display: inline-flex;
    align-items: center;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 600;
    border: none;
    background: transparent;
    color: var(--theme--foreground-subdued, #64748b);
    cursor: pointer;
    border-radius: 6px 6px 0 0;
    transition: all 0.15s ease;

    &.active {
      color: var(--theme--primary, #6366f1);
      border-bottom: 2px solid var(--theme--primary, #6366f1);
      margin-bottom: -4px;
    }

    .tab-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 10px;
      background-color: var(--theme--primary, #6366f1);
      color: white;
      margin-left: 6px;
    }
  }
}

.merge-tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.merge-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;

  .action-link-btn {
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--theme--primary, #6366f1);
    background: transparent;
    border: none;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  .remote-status-setting {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;

    .status-setting-lbl {
      color: var(--theme--foreground-subdued, #64748b);
    }

    .remote-status-select {
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
      background-color: var(--theme--background, #ffffff);
    }
  }
}

.merge-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  padding: 12px 16px;

  .merge-section-header {
    display: flex;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
    color: var(--theme--foreground, #1e293b);

    &.green-header {
      color: #059669;
    }
    &.orange-header {
      color: #d97706;
    }
    &.red-header {
      color: #dc2626;
    }
  }
}

.section-hint-box {
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
  padding: 4px 0 8px;
}

.merge-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.merge-row {
  display: grid;
  grid-template-columns: 28px 140px 1fr 24px 1fr;
  align-items: center;
  padding: 6px 10px;
  background-color: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.1s ease;

  &.staged {
    border-color: rgba(99, 102, 241, 0.4);
    background-color: rgba(99, 102, 241, 0.03);
  }

  &:hover {
    filter: brightness(0.98);
  }

  .merge-from-col code {
    color: #dc2626;
    background-color: rgba(239, 68, 68, 0.08);
    padding: 2px 4px;
    border-radius: 4px;
    margin-left: 6px;
  }

  .merge-to-col code {
    color: #059669;
    background-color: rgba(16, 185, 129, 0.08);
    padding: 2px 4px;
    border-radius: 4px;
    margin-left: 6px;
  }

  .badge-remote {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    color: #dc2626;
  }
  .badge-local {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    color: #059669;
  }
}

.ops-merge-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.op-merge-item {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  background-color: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.1s ease;

  &.staged {
    border-color: rgba(99, 102, 241, 0.5);
    background-color: rgba(99, 102, 241, 0.04);
  }

  .op-main-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .op-title {
    font-size: 13px;
    color: var(--theme--foreground, #1e293b);
  }

  .op-key-tag {
    font-size: 11px;
    color: var(--theme--foreground-subdued, #64748b);
  }

  .op-kind-tag {
    font-size: 11px;
    color: var(--theme--foreground-subdued, #64748b);
    margin-left: auto;
  }

  .op-type-tag {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;

    &.added {
      background-color: #10b981;
      color: white;
    }
    &.modified {
      background-color: #f59e0b;
      color: white;
    }
    &.removed {
      background-color: #ef4444;
      color: white;
    }
  }

  .op-diff-details {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dashed rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 11px;

    .detail-line {
      display: flex;
      align-items: center;
      gap: 8px;

      .det-field {
        font-weight: 600;
        min-width: 60px;
        color: var(--theme--foreground-subdued, #64748b);
      }
      .det-remote {
        color: #dc2626;
        font-family: monospace;
      }
      .det-local {
        color: #059669;
        font-family: monospace;
      }
    }
  }
}

.visual-tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-row {
  display: flex;
  gap: 12px;

  .stat-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 14px;
    border-radius: 6px;
    min-width: 70px;

    &.added {
      background-color: rgba(16, 185, 129, 0.1);
      color: #059669;
    }
    &.removed {
      background-color: rgba(239, 68, 68, 0.1);
      color: #dc2626;
    }
    &.modified {
      background-color: rgba(245, 158, 11, 0.1);
      color: #d97706;
    }
    &.unchanged {
      background-color: var(--theme--background-subdued, #f1f5f9);
      color: var(--theme--foreground-subdued, #64748b);
    }

    .stat-count {
      font-size: 16px;
      font-weight: 800;
    }
    .stat-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
  }
}

.ops-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.op-card {
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid transparent;

  &.added-card {
    background-color: rgba(16, 185, 129, 0.05);
    border-color: rgba(16, 185, 129, 0.2);
  }
  &.removed-card {
    background-color: rgba(239, 68, 68, 0.05);
    border-color: rgba(239, 68, 68, 0.2);
  }
  &.modified-card {
    background-color: rgba(245, 158, 11, 0.05);
    border-color: rgba(245, 158, 11, 0.2);
  }

  .op-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge-op-type {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 5px;
    border-radius: 4px;

    &.added {
      background-color: #10b981;
      color: white;
    }
    &.removed {
      background-color: #ef4444;
      color: white;
    }
    &.modified {
      background-color: #f59e0b;
      color: white;
    }
  }

  .op-name {
    font-size: 13px;
  }
  .op-key {
    font-size: 11px;
    color: var(--theme--foreground-subdued, #64748b);
  }
  .op-kind {
    font-size: 11px;
    color: var(--theme--foreground-subdued, #64748b);
    margin-left: auto;
  }

  .op-details {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dashed rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;

    .op-detail-row {
      display: flex;
      gap: 8px;

      .detail-field {
        font-weight: 600;
        min-width: 60px;
        color: var(--theme--foreground-subdued, #64748b);
      }
      .detail-diff {
        display: flex;
        flex-direction: column;
        gap: 1px;

        .detail-from {
          color: #dc2626;
          font-family: monospace;
        }
        .detail-to {
          color: #059669;
          font-family: monospace;
        }
      }
    }
  }
}

.json-tab-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.raw-json-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.toolbar-left-stats {
  display: flex;
  align-items: center;
  gap: 10px;
}

.diff-stats-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background-color: var(--theme--background-subdued, #f1f5f9);
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;

  .stat-tag {
    &.added {
      color: #10b981;
    }
    &.removed {
      color: #ef4444;
    }
    &.chunks {
      color: var(--theme--foreground-subdued, #64748b);
      font-weight: 500;
      margin-left: 2px;
    }
  }
}

.diff-navigator {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background-color: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
  border-radius: 4px;
  padding: 1px 4px;

  .nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px;
    color: var(--theme--foreground-subdued, #64748b);
    border-radius: 2px;

    &:hover {
      background-color: var(--theme--background-subdued, #f1f5f9);
      color: var(--theme--foreground, #1e293b);
    }
  }

  .nav-counter {
    font-size: 10px;
    font-weight: 600;
    color: var(--theme--foreground-subdued, #64748b);
    padding: 0 4px;
  }
}

.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-mode-toggle-group {
  display: inline-flex;
  border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
  border-radius: 4px;
  overflow: hidden;

  .mode-btn {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 500;
    border: none;
    background-color: var(--theme--background, #ffffff);
    color: var(--theme--foreground-subdued, #64748b);
    cursor: pointer;

    &.active {
      background-color: rgba(99, 102, 241, 0.12);
      color: var(--theme--primary, #6366f1);
      font-weight: 600;
    }

    &:hover:not(.active) {
      background-color: var(--theme--background-subdued, #f1f5f9);
    }
  }
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
  background-color: var(--theme--background, #ffffff);
  color: var(--theme--foreground-subdued, #64748b);
  cursor: pointer;

  &.active {
    background-color: rgba(99, 102, 241, 0.1);
    border-color: var(--theme--primary, #6366f1);
    color: var(--theme--primary, #6366f1);
    font-weight: 600;
  }
}

.diff-table-container {
  display: flex;
  flex-direction: column;
  background-color: #0f172a;
  color: #f8fafc;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  overflow: auto;
  max-height: 44vh;
  width: 100%;
  box-sizing: border-box;

  &.wrap-lines {
    .line-text {
      white-space: pre-wrap !important;
      word-break: break-all;
    }
  }
}

.diff-header-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  background-color: #1e293b;
  border-bottom: 1px solid #334155;
  padding: 6px 12px;
  position: sticky;
  top: 0;
  z-index: 2;
}

.diff-header-col {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  min-width: 0;

  .pane-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 3px;

    &.source {
      background-color: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }
    &.target {
      background-color: rgba(34, 197, 94, 0.2);
      color: #4ade80;
    }
  }

  .pane-title-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.diff-rows-wrapper {
  display: flex;
  flex-direction: column;
  min-width: 100%;
}

.diff-row {
  display: grid;
  width: 100%;
  box-sizing: border-box;

  &.split-mode {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  &.unified {
    grid-template-columns: 1fr;
  }

  &.is-current-chunk {
    background-color: rgba(99, 102, 241, 0.18) !important;
    outline: 1px solid rgba(99, 102, 241, 0.5);
  }

  &:hover {
    filter: brightness(1.08);
  }
}

.diff-cell {
  display: flex;
  align-items: stretch;
  min-width: 0;
  box-sizing: border-box;

  &.left-cell {
    border-right: 1px solid #1e293b;
  }

  &.removed {
    background-color: rgba(239, 68, 68, 0.14);
    color: #fca5a5;

    .line-num {
      background-color: rgba(239, 68, 68, 0.22);
      color: #f87171;
    }
  }

  &.added {
    background-color: rgba(34, 197, 94, 0.14);
    color: #86efac;

    .line-num {
      background-color: rgba(34, 197, 94, 0.22);
      color: #4ade80;
    }
  }

  &.empty {
    background-color: rgba(15, 23, 42, 0.4);
    background-image: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 5px,
      rgba(255, 255, 255, 0.02) 5px,
      rgba(255, 255, 255, 0.02) 10px
    );
  }
}

.line-num {
  width: 38px;
  min-width: 38px;
  text-align: right;
  padding: 0 6px;
  color: #475569;
  background-color: rgba(0, 0, 0, 0.2);
  user-select: none;
  font-size: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  border-right: 1px solid rgba(255, 255, 255, 0.05);

  &.left {
    border-right: none;
  }
  &.right {
    padding-left: 2px;
  }
}

.diff-sign {
  width: 16px;
  min-width: 16px;
  text-align: center;
  user-select: none;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.line-text {
  flex: 1;
  padding: 0 8px;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.empty-line-filler {
  display: inline-block;
  height: 100%;
  width: 100%;
}

.word-part {
  &.word-changed {
    font-weight: 700;
    border-radius: 2px;
    padding: 0 2px;
  }
}

.diff-cell.removed .word-changed {
  background-color: rgba(239, 68, 68, 0.45);
  color: #ffffff;
}

.diff-cell.added .word-changed {
  background-color: rgba(34, 197, 94, 0.45);
  color: #ffffff;
}


:deep(.v-card-actions.dialog-actions-bar),
:deep(.v-card-actions),
.dialog-actions-bar {
  display: flex !important;
  flex-direction: row !important;
  flex-flow: row nowrap !important;
  align-items: center !important;
  justify-content: space-between !important;
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 14px 24px !important;
  border-top: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  background-color: var(--theme--background-subdued, #f8fafc);
  flex-shrink: 0 !important;

  .actions-left {
    display: inline-flex !important;
    flex-direction: row !important;
    align-items: center !important;
    flex-shrink: 0 !important;
  }

  .actions-right {
    display: inline-flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 12px !important;
    flex-shrink: 0 !important;
    flex-wrap: nowrap !important;
  }

  :deep(.v-button) {
    display: inline-flex !important;
    inline-size: auto !important;
    width: auto !important;
    max-width: none !important;
    margin: 0 !important;
    margin-block-end: 0 !important;
    margin-inline-start: 0 !important;
    flex-shrink: 0 !important;

    .button {
      display: inline-flex !important;
      inline-size: auto !important;
      width: auto !important;
      min-width: auto !important;
      white-space: nowrap !important;
    }
  }
}

.mr-1 {
  margin-right: 4px;
}
.mr-2 {
  margin-right: 8px;
}
.mb-3 {
  margin-bottom: 12px;
}
</style>

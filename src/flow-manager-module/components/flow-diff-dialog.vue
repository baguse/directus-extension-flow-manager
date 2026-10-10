<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import type { IFlowDiffResult } from '../../types';

const props = withDefaults(
  defineProps<{
    value: boolean;
    diff: IFlowDiffResult | null;
    sourceTitle?: string;
    targetTitle?: string;
    categoriesMap?: Map<string, string>;
  }>(),
  {
    sourceTitle: 'Live Flow',
    targetTitle: 'Selected Snapshot',
    categoriesMap: () => new Map(),
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const activeTab = ref<'visual' | 'json'>('visual');
const sourcePreRef = ref<HTMLElement | null>(null);
const targetPreRef = ref<HTMLElement | null>(null);
const isSyncScrollEnabled = ref(true);
const isLineWrapEnabled = ref(false);

let isSyncing = false;

function onSourceScroll() {
  if (!isSyncScrollEnabled.value || isSyncing) return;
  const source = sourcePreRef.value;
  const target = targetPreRef.value;
  if (!source || !target) return;

  if (target.scrollTop === source.scrollTop && target.scrollLeft === source.scrollLeft) {
    return;
  }

  isSyncing = true;
  try {
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
  } finally {
    requestAnimationFrame(() => {
      isSyncing = false;
    });
  }
}

function onTargetScroll() {
  if (!isSyncScrollEnabled.value || isSyncing) return;
  const source = sourcePreRef.value;
  const target = targetPreRef.value;
  if (!source || !target) return;

  if (source.scrollTop === target.scrollTop && source.scrollLeft === target.scrollLeft) {
    return;
  }

  isSyncing = true;
  try {
    source.scrollTop = target.scrollTop;
    source.scrollLeft = target.scrollLeft;
  } finally {
    requestAnimationFrame(() => {
      isSyncing = false;
    });
  }
}

function toggleSyncScroll() {
  isSyncScrollEnabled.value = !isSyncScrollEnabled.value;
  if (isSyncScrollEnabled.value && sourcePreRef.value && targetPreRef.value) {
    targetPreRef.value.scrollTop = sourcePreRef.value.scrollTop;
    targetPreRef.value.scrollLeft = sourcePreRef.value.scrollLeft;
  }
}

function toggleLineWrap() {
  isLineWrapEnabled.value = !isLineWrapEnabled.value;
}

watch(activeTab, (tab) => {
  if (tab === 'json') {
    nextTick(() => {
      if (sourcePreRef.value) {
        sourcePreRef.value.scrollTop = 0;
        sourcePreRef.value.scrollLeft = 0;
      }
      if (targetPreRef.value) {
        targetPreRef.value.scrollTop = 0;
        targetPreRef.value.scrollLeft = 0;
      }
    });
  }
});

const addedOps = computed(() =>
  (props.diff?.operationsDiff || []).filter((op) => op.changeType === 'added'),
);
const removedOps = computed(() =>
  (props.diff?.operationsDiff || []).filter((op) => op.changeType === 'removed'),
);
const modifiedOps = computed(() =>
  (props.diff?.operationsDiff || []).filter((op) => op.changeType === 'modified'),
);
const unchangedOps = computed(() =>
  (props.diff?.operationsDiff || []).filter((op) => op.changeType === 'unchanged'),
);

function formatValue(val: unknown, field?: string): string {
  if (val === null || val === undefined) return 'null';
  if (field === 'category' && typeof val === 'string') {
    if (props.categoriesMap && props.categoriesMap.has(val)) {
      return props.categoriesMap.get(val) || val;
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    if (isUuid) return 'Uncategorized';
  }
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}
</script>

<template>
  <v-dialog
    :model-value="value"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card class="diff-card">
      <v-card-title>
        <div class="diff-header">
          <div class="title-with-icon">
            <v-icon name="compare_arrows" class="mr-2" />
            <span>Version Diff Inspector</span>
          </div>
          <div class="comparison-pills">
            <span class="pill source">{{ sourceTitle }}</span>
            <v-icon name="arrow_forward" small class="arrow-icon" />
            <span class="pill target">{{ targetTitle }}</span>
          </div>
        </div>
      </v-card-title>

      <div class="view-switch-bar">
        <button
          type="button"
          :class="['switch-btn', { active: activeTab === 'visual' }]"
          @click="activeTab = 'visual'"
        >
          <v-icon name="dashboard_customize" small class="mr-1" />
          Visual Changes
        </button>
        <button
          type="button"
          :class="['switch-btn', { active: activeTab === 'json' }]"
          @click="activeTab = 'json'"
        >
          <v-icon name="code" small class="mr-1" />
          Raw JSON Compare
        </button>
      </div>

      <v-card-text :class="['diff-content-scroll', { 'json-tab-active': activeTab === 'json' }]">
        <!-- Visual Diff Tab -->
        <div v-if="activeTab === 'visual'">
          <div v-if="!diff?.hasChanges" class="no-changes-box">
            <v-icon name="check_circle" class="check-icon" />
            <div class="no-changes-title">No Differences Detected</div>
            <div class="no-changes-sub">
              The flow settings and operation graph are completely identical between these versions.
            </div>
          </div>

          <div v-else class="changes-container">
            <!-- Summary stats -->
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

            <!-- Flow Metadata Changes -->
            <div
              v-if="diff?.metadataChanges && diff.metadataChanges.length > 0"
              class="diff-section"
            >
              <div class="section-title">
                <v-icon name="tune" small class="mr-1" />
                Flow Metadata Changes ({{ diff.metadataChanges.length }})
              </div>
              <div class="meta-table">
                <div v-for="item in diff.metadataChanges" :key="item.field" class="meta-row">
                  <div class="meta-field">{{ item.field }}</div>
                  <div class="meta-from">
                    <span class="meta-label">From:</span>
                    <code>{{ formatValue(item.from, item.field) }}</code>
                  </div>
                  <div class="meta-to">
                    <span class="meta-label">To:</span>
                    <code>{{ formatValue(item.to, item.field) }}</code>
                  </div>
                </div>
              </div>
            </div>

            <!-- Operations Changes -->
            <div class="diff-section">
              <div class="section-title">
                <v-icon name="account_tree" small class="mr-1" />
                Operations Graph Changes
              </div>

              <div class="ops-list">
                <!-- Added Ops -->
                <div v-for="op in addedOps" :key="`added-${op.key}`" class="op-card added-card">
                  <div class="op-header">
                    <span class="badge-op-type added">+ Added</span>
                    <strong class="op-name">{{ op.name || op.key }}</strong>
                    <code class="op-key">[{{ op.key }}]</code>
                    <span class="op-kind">type: {{ op.type }}</span>
                  </div>
                </div>

                <!-- Removed Ops -->
                <div
                  v-for="op in removedOps"
                  :key="`removed-${op.key}`"
                  class="op-card removed-card"
                >
                  <div class="op-header">
                    <span class="badge-op-type removed">- Removed</span>
                    <strong class="op-name">{{ op.name || op.key }}</strong>
                    <code class="op-key">[{{ op.key }}]</code>
                    <span class="op-kind">type: {{ op.type }}</span>
                  </div>
                </div>

                <!-- Modified Ops -->
                <div v-for="op in modifiedOps" :key="`mod-${op.key}`" class="op-card modified-card">
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

                <!-- Unchanged Ops summary -->
                <div v-if="unchangedOps.length > 0" class="unchanged-summary">
                  <v-icon name="check" small class="mr-1" />
                  <span
                    >{{ unchangedOps.length }} operation{{
                      unchangedOps.length > 1 ? 's' : ''
                    }}
                    unchanged ({{ unchangedOps.map((o) => o.key).join(', ') }})</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Raw JSON Compare Tab -->
        <div v-else class="raw-json-container">
          <div class="raw-json-toolbar">
            <div class="json-stats-hint">
              <v-icon
                :name="isSyncScrollEnabled ? 'sync' : 'sync_disabled'"
                small
                class="mr-1 sync-icon"
              />
              <span>{{ isSyncScrollEnabled ? 'Scroll synced' : 'Scroll independent' }}</span>
            </div>
            <div class="toolbar-controls">
              <button
                type="button"
                :class="['tool-btn', { active: isSyncScrollEnabled }]"
                title="Toggle synchronized scrolling"
                @click="toggleSyncScroll"
              >
                <v-icon :name="isSyncScrollEnabled ? 'sync' : 'sync_disabled'" small class="mr-1" />
                Sync Scroll: {{ isSyncScrollEnabled ? 'ON' : 'OFF' }}
              </button>
              <button
                type="button"
                :class="['tool-btn', { active: isLineWrapEnabled }]"
                title="Toggle line wrapping"
                @click="toggleLineWrap"
              >
                <v-icon name="wrap_text" small class="mr-1" />
                Wrap Lines
              </button>
            </div>
          </div>

          <div class="raw-json-grid">
            <div class="json-pane">
              <div class="pane-title">
                <span class="pane-badge source">Source</span>
                <span class="pane-title-text">{{ sourceTitle }}</span>
              </div>
              <pre
                ref="sourcePreRef"
                :class="['json-pre', { 'wrap-lines': isLineWrapEnabled }]"
                @scroll="onSourceScroll"
              ><code>{{ diff?.rawSourceJson }}</code></pre>
            </div>
            <div class="json-pane">
              <div class="pane-title">
                <span class="pane-badge target">Target</span>
                <span class="pane-title-text">{{ targetTitle }}</span>
              </div>
              <pre
                ref="targetPreRef"
                :class="['json-pre', { 'wrap-lines': isLineWrapEnabled }]"
                @scroll="onTargetScroll"
              ><code>{{ diff?.rawTargetJson }}</code></pre>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-button secondary @click="emit('update:modelValue', false)"> Close </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.diff-card {
  max-width: 780px;
  width: min(90vw, 780px);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.title-with-icon {
  display: flex;
  align-items: center;
}

.comparison-pills {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pill {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;

  &.source {
    background-color: var(--theme--background-subdued, #f1f5f9);
    color: var(--theme--foreground-subdued, #64748b);
  }

  &.target {
    background-color: rgba(99, 102, 241, 0.12);
    color: #4f46e5;
  }
}

.arrow-icon {
  color: var(--theme--foreground-subdued, #94a3b8);
}

.view-switch-bar {
  display: flex;
  padding: 0 24px;
  gap: 8px;
  border-bottom: 1px solid var(--theme--border-color-subdued, #e2e8f0);
}

.switch-btn {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--theme--foreground-subdued, #64748b);
  cursor: pointer;
  border-bottom: 2px solid transparent;

  &.active {
    color: var(--theme--primary, #6366f1);
    border-bottom-color: var(--theme--primary, #6366f1);
  }

  &:hover:not(.active) {
    color: var(--theme--foreground, #1e293b);
  }
}

.diff-content-scroll {
  overflow-y: auto;
  padding: 16px 20px;
  max-height: 60vh;

  &.json-tab-active {
    overflow-y: hidden;
  }
}

.no-changes-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
}

.check-icon {
  font-size: 48px;
  color: var(--theme--success, #10b981);
  margin-bottom: 12px;
}

.no-changes-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
}

.no-changes-sub {
  font-size: 13px;
  color: var(--theme--foreground-subdued, #64748b);
  margin-top: 4px;
}

.stats-row {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.stat-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;

  &.added {
    background-color: rgba(16, 185, 129, 0.12);
    color: #059669;
  }
  &.removed {
    background-color: rgba(239, 68, 68, 0.12);
    color: #dc2626;
  }
  &.modified {
    background-color: rgba(245, 158, 11, 0.12);
    color: #d97706;
  }
  &.unchanged {
    background-color: var(--theme--background-subdued, #f1f5f9);
    color: var(--theme--foreground-subdued, #64748b);
  }
}

.diff-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--theme--foreground-subdued, #64748b);
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.meta-table {
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  overflow: hidden;
}

.meta-row {
  display: grid;
  grid-template-columns: 140px 1fr 1fr;
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid var(--theme--border-color-subdued, #f1f5f9);

  &:last-child {
    border-bottom: none;
  }
}

.meta-field {
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
}

.meta-from code {
  color: #dc2626;
  background-color: rgba(239, 68, 68, 0.08);
  padding: 2px 4px;
  border-radius: 4px;
}

.meta-to code {
  color: #059669;
  background-color: rgba(16, 185, 129, 0.08);
  padding: 2px 4px;
  border-radius: 4px;
}

.ops-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.op-card {
  padding: 10px 14px;
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
}

.op-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.badge-op-type {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px;
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
  color: var(--theme--foreground, #1e293b);
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
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.op-detail-row {
  font-size: 11px;
  display: flex;
  gap: 8px;
}

.detail-field {
  font-weight: 600;
  color: var(--theme--foreground-subdued, #64748b);
  min-width: 70px;
}

.detail-diff {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-from {
  color: #dc2626;
  font-family: monospace;
}

.detail-to {
  color: #059669;
  font-family: monospace;
}

.unchanged-summary {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--theme--background-subdued, #f8fafc);
  border-radius: 6px;
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
}

.raw-json-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
}

.raw-json-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.json-stats-hint {
  display: flex;
  align-items: center;
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);

  .sync-icon {
    font-size: 14px;
    color: var(--theme--primary, #6366f1);
  }
}

.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 8px;
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
  transition: all 0.15s ease;

  &.active {
    background-color: rgba(99, 102, 241, 0.1);
    border-color: var(--theme--primary, #6366f1);
    color: var(--theme--primary, #6366f1);
    font-weight: 600;
  }

  &:hover:not(.active) {
    background-color: var(--theme--background-subdued, #f1f5f9);
    color: var(--theme--foreground, #1e293b);
  }
}

.raw-json-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
}

.json-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
  overflow: hidden;
}

.pane-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--theme--foreground-subdued, #64748b);
  min-width: 0;
}

.pane-badge {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;

  &.source {
    background-color: var(--theme--background-subdued, #e2e8f0);
    color: var(--theme--foreground-subdued, #475569);
  }

  &.target {
    background-color: rgba(99, 102, 241, 0.12);
    color: #4f46e5;
  }
}

.pane-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.json-pre {
  background-color: #0f172a;
  color: #f8fafc;
  padding: 12px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  overflow: auto;
  max-height: 48vh;
  margin: 0;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  white-space: pre;

  &.wrap-lines {
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.mr-1 {
  margin-right: 4px;
}

.mr-2 {
  margin-right: 8px;
}
</style>

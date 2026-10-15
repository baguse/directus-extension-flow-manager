<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import type { IFlowDiffResult } from '../../types';
import { generateHighlightedJsonDiff } from '../../utils/diff-highlighter.util';
import type { HighlightedJsonDiff } from '../../utils/diff-highlighter.util';

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

const isHighlightDiffEnabled = ref(true);
const diffViewMode = ref<'split' | 'unified'>('split');
const currentDiffIndex = ref(0);
const diffContainerRef = ref<HTMLElement | null>(null);

const highlightedDiff = computed<HighlightedJsonDiff>(() => {
  return generateHighlightedJsonDiff(props.diff?.rawSourceJson, props.diff?.rawTargetJson);
});

const totalDiffChunks = computed(() => highlightedDiff.value.diffRowIndices.length);

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
      if (diffContainerRef.value) {
        diffContainerRef.value.scrollTop = 0;
        diffContainerRef.value.scrollLeft = 0;
      }
      currentDiffIndex.value = 0;
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
            <div class="toolbar-left-stats">
              <div v-if="highlightedDiff.stats.hasChanges" class="diff-stats-pill">
                <span class="stat-tag added" title="Added lines"
                  >+{{ highlightedDiff.stats.addedLines }}</span
                >
                <span class="stat-tag removed" title="Removed lines"
                  >-{{ highlightedDiff.stats.removedLines }}</span
                >
                <span class="stat-tag chunks"
                  >{{ totalDiffChunks }} difference{{ totalDiffChunks > 1 ? 's' : '' }}</span
                >
              </div>
              <div v-else class="diff-stats-identical">
                <v-icon name="check_circle" small class="identical-icon" />
                <span>JSON payloads are identical</span>
              </div>

              <!-- Jump to diff navigation -->
              <div v-if="isHighlightDiffEnabled && totalDiffChunks > 0" class="diff-navigator">
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
              <!-- Highlight Diff Toggle -->
              <button
                type="button"
                :class="['tool-btn', { active: isHighlightDiffEnabled }]"
                title="Toggle diff highlighting"
                @click="isHighlightDiffEnabled = !isHighlightDiffEnabled"
              >
                <v-icon name="format_paint" small class="mr-1" />
                Diff Highlight: {{ isHighlightDiffEnabled ? 'ON' : 'OFF' }}
              </button>

              <!-- Split / Unified Toggle (only shown when Highlight is ON) -->
              <div v-if="isHighlightDiffEnabled" class="view-mode-toggle-group">
                <button
                  type="button"
                  :class="['mode-btn', { active: diffViewMode === 'split' }]"
                  title="Side-by-side split view"
                  @click="diffViewMode = 'split'"
                >
                  <v-icon name="vertical_split" small class="mr-1" />
                  Split
                </button>
                <button
                  type="button"
                  :class="['mode-btn', { active: diffViewMode === 'unified' }]"
                  title="Unified inline view"
                  @click="diffViewMode = 'unified'"
                >
                  <v-icon name="view_agenda" small class="mr-1" />
                  Unified
                </button>
              </div>

              <!-- Wrap Lines Toggle -->
              <button
                type="button"
                :class="['tool-btn', { active: isLineWrapEnabled }]"
                title="Toggle line wrapping"
                @click="toggleLineWrap"
              >
                <v-icon name="wrap_text" small class="mr-1" />
                Wrap Lines
              </button>

              <!-- Sync Scroll (only when in raw unhighlighted mode) -->
              <button
                v-if="!isHighlightDiffEnabled"
                type="button"
                :class="['tool-btn', { active: isSyncScrollEnabled }]"
                title="Toggle synchronized scrolling"
                @click="toggleSyncScroll"
              >
                <v-icon :name="isSyncScrollEnabled ? 'sync' : 'sync_disabled'" small class="mr-1" />
                Sync: {{ isSyncScrollEnabled ? 'ON' : 'OFF' }}
              </button>
            </div>
          </div>

          <!-- Highlighted Diff View (Default) -->
          <div
            v-if="isHighlightDiffEnabled"
            ref="diffContainerRef"
            :class="['diff-table-container', { 'wrap-lines': isLineWrapEnabled }]"
          >
            <!-- Column Titles for Split Mode -->
            <div v-if="diffViewMode === 'split'" class="diff-header-bar">
              <div class="diff-header-col source">
                <span class="pane-badge source">Source</span>
                <span class="pane-title-text">{{ sourceTitle }}</span>
              </div>
              <div class="diff-header-col target">
                <span class="pane-badge target">Target</span>
                <span class="pane-title-text">{{ targetTitle }}</span>
              </div>
            </div>

            <!-- SPLIT (SIDE-BY-SIDE) MODE -->
            <div v-if="diffViewMode === 'split'" class="diff-rows-wrapper split-mode">
              <div
                v-for="row in highlightedDiff.sideBySideRows"
                :key="row.rowIndex"
                class="diff-row split-mode"
                :class="{
                  'is-diff': row.isDiff,
                  'is-current-chunk': row.diffIndex === currentDiffIndex,
                }"
                :data-row-index="row.rowIndex"
                :data-diff-chunk="row.diffIndex"
              >
                <!-- Left Cell (Source) -->
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
                        >{{ part.text }}</span
                      >
                    </template>
                    <template v-else>
                      {{ row.left.text }}
                    </template>
                  </span>
                </div>

                <!-- Right Cell (Target) -->
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
                        >{{ part.text }}</span
                      >
                    </template>
                    <template v-else>
                      {{ row.right.text }}
                    </template>
                  </span>
                </div>
              </div>
            </div>

            <!-- UNIFIED (INLINE) MODE -->
            <div v-else class="diff-rows-wrapper unified-mode">
              <div
                v-for="uRow in highlightedDiff.unifiedRows"
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
                        >{{ part.text }}</span
                      >
                    </template>
                    <template v-else>
                      {{ uRow.text }}
                    </template>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Raw Fallback View (when Diff Highlight is turned OFF) -->
          <div v-else class="raw-json-grid">
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

.diff-stats-identical {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #10b981;
  font-weight: 500;

  .identical-icon {
    font-size: 14px;
    color: #10b981;
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
    transition: all 0.15s ease;

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
  max-height: 48vh;
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
  transition: background-color 0.1s ease;

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
</style>

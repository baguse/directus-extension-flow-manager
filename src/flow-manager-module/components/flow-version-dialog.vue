<script setup lang="ts">
import { ref, watch, computed, inject } from 'vue';
import { useStores } from '@directus/extensions-sdk';
import type {
  IFlow,
  IFlowSnapshot,
  IFlowDiffResult,
  ICredential,
  FlowManagerUtilsContext,
} from '../../types';
import { useFlowSnapshots } from '../../composables/use-flow-snapshots';
import { useFlowDiff } from '../../composables/use-flow-diff';
import { useFlowCanonical } from '../../composables/use-flow-canonical';
import { formatRelativeTime } from '../../flow-manager-panels/shared/time.util';
import { slugify } from '../../utils/string.util';
import FlowCreateSnapshotModal from './flow-create-snapshot-modal.vue';
import FlowDiffDialog from './flow-diff-dialog.vue';
import FlowGitExportModal from './flow-git-export-modal.vue';

const props = withDefaults(
  defineProps<{
    value: boolean;
    flow: IFlow | null;
    allFlows?: IFlow[];
    categoriesMap?: Map<string, string>;
    selectedCredential?: string;
    credentials?: ICredential[];
  }>(),
  {
    allFlows: () => [],
    categoriesMap: () => new Map(),
    selectedCredential: 'local',
    credentials: () => [],
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'flowRestored', flowId: string): void;
}>();

const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();

const selectedCredentialRef = computed(() => props.selectedCredential || 'local');
const credentialsRef = computed(() => props.credentials || []);

const remoteInstanceName = computed(() => {
  if (!props.selectedCredential || props.selectedCredential === 'local') return null;
  const cred = props.credentials?.find((c) => c.id === props.selectedCredential);
  return cred?.name || 'Remote Instance';
});

const flowManagerUtils = inject<FlowManagerUtilsContext>('flowManagerUtils');

const {
  snapshots,
  loading: snapshotLoading,
  error: snapshotError,
  loadSnapshots,
  createSnapshot,
  rollbackToSnapshot,
  deleteSnapshot,
  suggestNextVersion,
  buildSnapshotData,
  fetchFlow,
} = useFlowSnapshots({
  selectedCredential: selectedCredentialRef,
  credentials: credentialsRef,
  hydrateLocalFlow: flowManagerUtils?.hydrateLocalFlow,
});

const { compareSnapshots } = useFlowDiff();
const { toCanonicalJson, downloadBlob } = useFlowCanonical();

// Live flow state (always kept fresh from Directus API)
const currentLiveFlow = ref<IFlow | null>(null);
const isFlowLoading = ref(false);
const activeLiveFlow = computed(() => currentLiveFlow.value || props.flow);

async function refetchLiveFlow(flowId?: string): Promise<IFlow | null> {
  const targetId = flowId || props.flow?.id;
  if (!targetId) return null;
  isFlowLoading.value = true;
  try {
    const fetched = await fetchFlow(targetId);
    if (fetched) {
      currentLiveFlow.value = fetched;
    }
    return fetched;
  } catch (err: unknown) {
    console.error('Failed to refetch live flow:', err);
    return null;
  } finally {
    isFlowLoading.value = false;
  }
}

// Modal visibility states
const showCreateModal = ref(false);
const showDiffDialog = ref(false);
const showGitModal = ref(false);

// Diff state
const activeDiff = ref<IFlowDiffResult | null>(null);
const diffTargetTitle = ref('');

// Rollback confirmation dialog state
const showRollbackConfirm = ref(false);
const targetSnapshotForRollback = ref<IFlowSnapshot | null>(null);
const rollbackProgressMessage = ref('');
const isRollingBack = ref(false);

// Delete confirmation dialog state
const showDeleteConfirm = ref(false);
const targetSnapshotIdForDelete = ref<string | null>(null);

const suggestedVersion = computed(() => suggestNextVersion(snapshots.value));

watch(
  () => [props.value, props.flow?.id, props.selectedCredential] as const,
  async ([isOpen, flowId], oldVal) => {
    const wasOpen = oldVal?.[0];
    const oldFlowId = oldVal?.[1];

    if (isOpen) {
      if (flowId !== oldFlowId || !wasOpen) {
        currentLiveFlow.value = null;
        snapshots.value = [];
      }
      if (flowId && typeof flowId === 'string') {
        await Promise.all([refetchLiveFlow(flowId), loadSnapshots(flowId)]);
      }
    } else {
      currentLiveFlow.value = null;
      snapshots.value = [];
    }
  },
  { immediate: true },
);

async function onRefresh() {
  if (props.flow?.id) {
    await Promise.all([refetchLiveFlow(props.flow.id), loadSnapshots(props.flow.id)]);
  }
}

async function handleCreateSnapshot(payload: {
  version: string;
  name: string;
  description: string;
  tag: 'manual' | 'release';
}) {
  let target = currentLiveFlow.value;
  if (!target || !target.operations) {
    target = await refetchLiveFlow();
  }
  const flowToUse = target || props.flow;
  if (!flowToUse) return;

  const result = await createSnapshot(flowToUse, payload);
  if (result) {
    showCreateModal.value = false;
  }
}

async function handleCompare(snapshot: IFlowSnapshot) {
  let target = currentLiveFlow.value;
  if (!target || !target.operations) {
    target = await refetchLiveFlow();
  }
  const flowToUse = target || props.flow;
  if (!flowToUse) return;

  const liveData = buildSnapshotData(flowToUse);
  const diffResult = compareSnapshots(liveData, snapshot.data);
  activeDiff.value = diffResult;
  diffTargetTitle.value = `${snapshot.version} (${snapshot.name})`;
  showDiffDialog.value = true;
}

function openRollbackConfirmation(snapshot: IFlowSnapshot) {
  targetSnapshotForRollback.value = snapshot;
  rollbackProgressMessage.value = '';
  showRollbackConfirm.value = true;
}

async function executeRollback() {
  if (!props.flow?.id || !targetSnapshotForRollback.value) return;
  isRollingBack.value = true;
  try {
    // Refetch live flow so the pre-rollback safety backup captures true live state
    const freshLive = await refetchLiveFlow();
    const flowToRollback = freshLive || props.flow;

    const success = await rollbackToSnapshot(
      flowToRollback,
      targetSnapshotForRollback.value,
      (step) => {
        rollbackProgressMessage.value = step;
      },
    );
    if (success) {
      // Refetch live flow immediately so currentLiveFlow has the rolled-back operations!
      await refetchLiveFlow(props.flow.id);
      showRollbackConfirm.value = false;
      targetSnapshotForRollback.value = null;
      emit('flowRestored', props.flow.id);
    }
  } finally {
    isRollingBack.value = false;
  }
}

function openDeleteConfirmation(snapshotId: string) {
  targetSnapshotIdForDelete.value = snapshotId;
  showDeleteConfirm.value = true;
}

async function executeDelete() {
  if (!targetSnapshotIdForDelete.value) return;
  await deleteSnapshot(targetSnapshotIdForDelete.value);
  showDeleteConfirm.value = false;
  targetSnapshotIdForDelete.value = null;
}

function downloadSnapshotJson(snapshot: IFlowSnapshot) {
  try {
    const current = activeLiveFlow.value || props.flow;
    const snapData = typeof snapshot.data === 'string' ? JSON.parse(snapshot.data) : snapshot.data;
    const flowName = current?.name || snapshot.name || snapData?.flow?.name || 'flow';
    const versionStr = snapshot.version || 'snapshot';
    const rawCat =
      snapData?.category ||
      snapData?.flow?.category ||
      current?.flow_manager_metadata_id?.flow_manager_category;
    const catName = getCategoryName(rawCat);
    const jsonStr = toCanonicalJson(snapData, catName);
    const filename = `${slugify(flowName)}-${slugify(versionStr)}.json`;
    downloadBlob(jsonStr, filename);
    notificationsStore.add({
      type: 'success',
      title: 'Snapshot Exported',
      text: `Downloaded ${filename}.`,
    });
  } catch (err: unknown) {
    console.error('Failed to export snapshot JSON:', err);
    notificationsStore.add({
      type: 'error',
      title: 'Export Failed',
      text: err instanceof Error ? err.message : String(err),
    });
  }
}

function getTagLabel(tag: string): string {
  switch (tag) {
    case 'release':
      return 'Release';
    case 'manual':
      return 'Manual';
    case 'auto_pre_rollback':
      return 'Auto Backup';
    case 'auto_pre_restore':
      return 'Pre-Restore';
    default:
      return tag;
  }
}

function getCategoryName(categoryId?: string | null): string | null {
  if (!categoryId) return null;
  if (props.categoriesMap && props.categoriesMap.has(categoryId)) {
    return props.categoriesMap.get(categoryId) || null;
  }
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId);
  return isUuid ? null : categoryId;
}

function formatAuthor(userCreated: IFlowSnapshot['user_created']): string {
  if (!userCreated) return 'System';
  if (typeof userCreated === 'string') {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      userCreated,
    );
    if (isUuid) {
      return props.selectedCredential && props.selectedCredential !== 'local'
        ? 'Remote User'
        : 'Directus User';
    }
    return userCreated;
  }
  const parts = [userCreated.first_name, userCreated.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return userCreated.email || 'Directus User';
}
</script>

<template>
  <v-dialog
    :model-value="value"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card class="version-dialog-card">
      <v-card-title>
        <div class="version-header">
          <div class="header-left">
            <v-icon name="history" class="header-icon" />
            <div>
              <div class="header-title">Version History & Snapshots</div>
              <div v-if="activeLiveFlow" class="header-sub">
                <span class="flow-pill-name" :title="activeLiveFlow.name">{{
                  activeLiveFlow.name
                }}</span>
                <span
                  v-if="activeLiveFlow.id"
                  class="flow-pill-id"
                  :title="`Flow ID: ${activeLiveFlow.id}`"
                >
                  #{{ activeLiveFlow.id.slice(0, 8) }}
                </span>
                <span v-if="remoteInstanceName" class="remote-pill">
                  <v-icon name="cloud" x-small class="mr-1" />
                  {{ remoteInstanceName }}
                </span>
              </div>
            </div>
          </div>
          <div class="header-actions">
            <v-button small @click="showCreateModal = true">
              <v-icon name="add" class="mr-1" />
              Take Snapshot
            </v-button>
            <v-button secondary small @click="showGitModal = true">
              <v-icon name="terminal" class="mr-1" />
              Export Git Schema
            </v-button>
            <v-button secondary small icon @click="onRefresh">
              <v-icon name="refresh" />
            </v-button>
          </div>
        </div>
      </v-card-title>

      <v-card-text class="version-content-scroll">
        <!-- Error Notice -->
        <v-notice v-if="snapshotError" type="danger" class="mb-3">
          {{ snapshotError }}
        </v-notice>

        <!-- Loading State -->
        <div v-if="snapshotLoading && !snapshots.length" class="loading-state">
          <v-progress-circular indeterminate />
          <span class="loading-text">Loading snapshots history...</span>
        </div>

        <!-- Empty State -->
        <div v-else-if="!snapshots.length" class="empty-state">
          <div class="empty-icon-wrap">
            <v-icon name="history_toggle_off" class="empty-icon" />
          </div>
          <div class="empty-title">No Snapshots Yet</div>
          <div class="empty-sub">
            Take snapshots to save known-good states, track pipeline changes, and rollback safely
            with 1-click.
          </div>
          <v-button class="mt-3" @click="showCreateModal = true">
            <v-icon name="add" class="mr-1" />
            Create First Snapshot
          </v-button>
        </div>

        <!-- Timeline List -->
        <div v-else class="timeline-container">
          <div v-for="(snap, index) in snapshots" :key="snap.id" class="timeline-item">
            <!-- Timeline connector -->
            <div class="timeline-marker-col">
              <div :class="['marker-dot', snap.tag]">
                <v-icon
                  :name="
                    snap.tag === 'release'
                      ? 'star'
                      : snap.tag.startsWith('auto')
                        ? 'shield'
                        : 'commit'
                  "
                  x-small
                />
              </div>
              <div v-if="index < snapshots.length - 1" class="marker-line" />
            </div>

            <!-- Snapshot Card -->
            <div class="snapshot-entry-card">
              <div class="entry-header">
                <div class="entry-main-info">
                  <div class="badge-row">
                    <span class="version-badge">{{ snap.version }}</span>
                    <span :class="['tag-badge', snap.tag]">{{ getTagLabel(snap.tag) }}</span>
                  </div>
                  <div class="entry-name" :title="snap.name">{{ snap.name }}</div>
                </div>
                <div class="entry-meta">
                  <span class="entry-time">
                    <v-icon name="schedule" x-small class="mr-1" />
                    {{ formatRelativeTime(snap.date_created) }}
                  </span>
                  <span class="entry-dot">•</span>
                  <span class="entry-author">
                    <v-icon name="person" x-small class="mr-1" />
                    {{ formatAuthor(snap.user_created) }}
                  </span>
                </div>
              </div>

              <div v-if="snap.description" class="entry-description">
                {{ snap.description }}
              </div>

              <div class="entry-specs">
                <span class="spec-pill">
                  <v-icon name="account_tree" x-small class="mr-1" />
                  {{ snap.data?.operations?.length || 0 }} operations
                </span>
                <span class="spec-pill">
                  <v-icon name="bolt" x-small class="mr-1" />
                  {{ snap.data?.flow?.trigger || 'manual' }}
                </span>
                <span v-if="getCategoryName(snap.data?.category)" class="spec-pill category-item">
                  <v-icon name="folder" x-small class="mr-1" />
                  {{ getCategoryName(snap.data?.category) }}
                </span>
              </div>

              <!-- Action buttons per snapshot -->
              <div class="entry-actions">
                <v-button x-small secondary @click="handleCompare(snap)">
                  <v-icon name="compare_arrows" class="mr-1" />
                  Compare vs Live
                </v-button>

                <v-button
                  x-small
                  secondary
                  class="rollback-btn"
                  @click="openRollbackConfirmation(snap)"
                >
                  <v-icon name="history" class="mr-1" />
                  Rollback to this
                </v-button>

                <v-button x-small secondary @click="downloadSnapshotJson(snap)">
                  <v-icon name="file_download" class="mr-1" />
                  Export JSON
                </v-button>

                <v-button
                  x-small
                  secondary
                  class="delete-btn"
                  icon
                  @click="openDeleteConfirmation(snap.id)"
                >
                  <v-icon name="delete" />
                </v-button>
              </div>
            </div>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-button secondary @click="emit('update:modelValue', false)"> Close </v-button>
      </v-card-actions>
    </v-card>

    <!-- Sub-modals -->
    <FlowCreateSnapshotModal
      :value="showCreateModal"
      :flow="activeLiveFlow"
      :existing-snapshots="snapshots"
      :suggested-version="suggestedVersion"
      @update:model-value="showCreateModal = $event"
      @create="handleCreateSnapshot"
    />

    <FlowDiffDialog
      :value="showDiffDialog"
      :diff="activeDiff"
      source-title="Live Flow"
      :target-title="diffTargetTitle"
      :categories-map="categoriesMap"
      @update:model-value="showDiffDialog = $event"
    />

    <FlowGitExportModal
      :value="showGitModal"
      :flow="activeLiveFlow"
      :flows="allFlows"
      :categories-map="categoriesMap"
      @update:model-value="showGitModal = $event"
    />

    <!-- Rollback Safety Confirmation Dialog -->
    <v-dialog
      :model-value="showRollbackConfirm"
      :persistent="true"
      @update:model-value="showRollbackConfirm = false"
    >
      <v-card class="confirm-dialog-card">
        <v-card-title>
          <div class="confirm-title danger-theme">
            <v-icon name="warning" class="mr-2" />
            <span>Confirm Flow Rollback</span>
          </div>
        </v-card-title>
        <v-card-text>
          <div class="confirm-body">
            <p>
              Are you sure you want to rollback <strong>{{ activeLiveFlow?.name }}</strong> to
              snapshot <strong>{{ targetSnapshotForRollback?.version }}</strong> ("{{
                targetSnapshotForRollback?.name
              }}")?
            </p>
            <div class="safety-notice">
              <v-icon name="verified_user" class="notice-icon mr-2" />
              <div>
                <strong>Safety Net Guarantee:</strong>
                An automatic backup snapshot (<code>auto_pre_rollback</code>) of your current live
                flow will be taken immediately before any operations are modified.
              </div>
            </div>
            <div v-if="isRollingBack" class="rollback-status-box">
              <v-progress-circular indeterminate small class="mr-2" />
              <span>{{ rollbackProgressMessage || 'Executing atomic rollback...' }}</span>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button secondary :disabled="isRollingBack" @click="showRollbackConfirm = false">
            Cancel
          </v-button>
          <v-button :loading="isRollingBack" class="danger-confirm-btn" @click="executeRollback">
            <v-icon name="history" class="mr-1" />
            Proceed with Rollback
          </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Snapshot Confirmation Dialog -->
    <v-dialog
      :model-value="showDeleteConfirm"
      :persistent="true"
      @update:model-value="showDeleteConfirm = false"
    >
      <v-card class="confirm-dialog-card">
        <v-card-title>Delete Snapshot</v-card-title>
        <v-card-text>
          Are you sure you want to permanently delete this snapshot? This action cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="showDeleteConfirm = false"> Cancel </v-button>
          <v-button danger @click="executeDelete"> Delete </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<style scoped lang="scss">
.version-dialog-card {
  max-width: 860px;
  width: 90vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}

.version-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  width: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 340px;
}

.header-icon {
  font-size: 28px;
  color: var(--theme--primary, #6366f1);
  flex-shrink: 0;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
  line-height: 1.2;
}

.header-sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  margin-top: 4px;
}

.flow-pill-name {
  font-weight: 600;
  color: var(--theme--primary, #6366f1);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-pill-id {
  color: var(--theme--foreground-subdued, #94a3b8);
  font-family: monospace;
  font-size: 11px;
  background-color: var(--theme--background-subdued, rgba(148, 163, 184, 0.12));
  padding: 1px 6px;
  border-radius: 4px;
  cursor: help;
}

.remote-pill {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--theme--primary, #6366f1);
  background: var(--theme--primary-background, rgba(99, 102, 241, 0.1));
  border: 1px solid var(--theme--primary-subdued, rgba(99, 102, 241, 0.25));
  padding: 1px 8px;
  border-radius: 12px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.version-content-scroll {
  overflow-y: auto;
  padding: 16px 24px;
  max-height: 65vh;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  gap: 12px;
}

.loading-text {
  font-size: 13px;
  color: var(--theme--foreground-subdued, #64748b);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
}

.empty-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background-color: var(--theme--background-subdued, #f1f5f9);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.empty-icon {
  font-size: 32px;
  color: var(--theme--foreground-subdued, #94a3b8);
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
}

.empty-sub {
  font-size: 13px;
  color: var(--theme--foreground-subdued, #64748b);
  max-width: 420px;
  margin-top: 4px;
}

.timeline-container {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 12px;
  position: relative;
}

.timeline-marker-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.marker-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;

  &.release {
    background-color: #8b5cf6;
    color: white;
  }
  &.manual {
    background-color: #3b82f6;
    color: white;
  }
  &.auto_pre_rollback {
    background-color: #f59e0b;
    color: white;
  }
  &.auto_pre_restore {
    background-color: #64748b;
    color: white;
  }
}

.marker-line {
  flex: 1;
  width: 2px;
  background-color: var(--theme--border-color-subdued, #e2e8f0);
  margin: 4px 0;
  min-height: 24px;
}

.snapshot-entry-card {
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  padding: 14px 16px;
  background-color: var(--theme--background, #ffffff);
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.entry-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.entry-main-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 280px;
}

.badge-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.version-badge {
  font-family: monospace;
  font-size: 12px;
  font-weight: 700;
  background-color: #0f172a;
  color: #38bdf8;
  padding: 2px 6px;
  border-radius: 4px;
}

.tag-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;

  &.release {
    background-color: rgba(139, 92, 246, 0.12);
    color: #7c3aed;
  }
  &.manual {
    background-color: rgba(59, 130, 246, 0.12);
    color: #2563eb;
  }
  &.auto_pre_rollback {
    background-color: rgba(245, 158, 11, 0.12);
    color: #d97706;
  }
  &.auto_pre_restore {
    background-color: rgba(100, 116, 139, 0.12);
    color: #475569;
  }
}

.entry-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
  word-break: break-word;
  line-height: 1.3;
}

.entry-meta {
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  white-space: nowrap;
}

.entry-time,
.entry-author {
  display: inline-flex;
  align-items: center;
}

.entry-description {
  font-size: 12px;
  color: var(--theme--foreground, #334155);
  line-height: 1.4;
  background-color: var(--theme--background-subdued, #f8fafc);
  padding: 6px 10px;
  border-radius: 4px;
}

.entry-specs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.spec-pill {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
  background-color: var(--theme--background-subdued, #f8fafc);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
}

.spec-pill.category-item {
  color: var(--theme--primary, #6366f1);
  background-color: var(--theme--primary-background, rgba(99, 102, 241, 0.08));
  border-color: var(--theme--primary-subdued, rgba(99, 102, 241, 0.2));
}

.entry-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--theme--border-color-subdued, #f1f5f9);
}

.rollback-btn {
  --v-button-color-text: #b45309;
  --v-button-background-color: rgba(245, 158, 11, 0.08);
  --v-button-border-color: rgba(245, 158, 11, 0.2);

  &:hover {
    --v-button-background-color: rgba(245, 158, 11, 0.16);
  }
}

.delete-btn {
  margin-left: auto;
  --v-button-color-text: #ef4444;
  --v-button-color-hover: #dc2626;
}

.confirm-dialog-card {
  max-width: 520px;
}

.confirm-title {
  display: flex;
  align-items: center;
}

.danger-theme {
  color: #dc2626;
}

.safety-notice {
  display: flex;
  align-items: flex-start;
  padding: 10px 12px;
  background-color: rgba(59, 130, 246, 0.08);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: #1e3a8a;
  margin-top: 12px;
}

.notice-icon {
  color: #2563eb;
  margin-top: 2px;
}

.rollback-status-box {
  display: flex;
  align-items: center;
  margin-top: 12px;
  padding: 8px 12px;
  background-color: #fef3c7;
  border-radius: 6px;
  color: #92400e;
  font-size: 12px;
}

.danger-confirm-btn {
  --v-button-color: #dc2626;
  --v-button-background-color: #fee2e2;
  --v-button-color-hover: #b91c1c;
}

.mt-3 {
  margin-top: 12px;
}

.mr-1 {
  margin-right: 4px;
}

.mr-2 {
  margin-right: 8px;
}
</style>

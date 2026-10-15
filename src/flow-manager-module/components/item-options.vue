<template>
  <div class="item-options-wrapper" @click.stop>
    <v-menu placement="left-start" show-arrow>
      <template #activator="{ toggle }">
        <v-icon name="more_vert" clickable class="ctx-toggle" @click.stop.prevent="toggle" />
      </template>
      <v-list v-if="item.type !== 'category'">
        <v-list-item
          v-if="
            flowItem.trigger === 'manual' &&
            flowItem.status === 'active' &&
            selectedCredential === 'local'
          "
          clickable
          @click="showRunDialog(flowItem)"
        >
          <v-list-item-icon>
            <v-icon name="play_arrow" />
          </v-list-item-icon>
          <v-list-item-content> Run </v-list-item-content>
        </v-list-item>
        <v-list-item
          v-else-if="flowItem.trigger === 'webhook' && flowItem.status === 'active'"
          clickable
          @click="showRunWebhookDialog(flowItem)"
        >
          <v-list-item-icon>
            <v-icon name="play_arrow" />
          </v-list-item-icon>
          <v-list-item-content> Run </v-list-item-content>
        </v-list-item>
        <v-list-item v-if="isLocal" clickable @click="openDashboardDetail(flowItem.id)">
          <v-list-item-icon>
            <v-icon name="insights" />
          </v-list-item-icon>
          <v-list-item-content> Open Dashboard </v-list-item-content>
        </v-list-item>
        <v-list-item clickable @click="openSimulationDialog(flowItem)">
          <v-list-item-icon>
            <v-icon name="science" />
          </v-list-item-icon>
          <v-list-item-content> Sandbox Simulation </v-list-item-content>
        </v-list-item>
        <v-list-item clickable @click="openVersionDialog(flowItem)">
          <v-list-item-icon>
            <v-icon name="history" />
          </v-list-item-icon>
          <v-list-item-content> Version History </v-list-item-content>
        </v-list-item>
        <v-list-item clickable @click="openGitExportDialog(flowItem)">
          <v-list-item-icon>
            <v-icon name="terminal" />
          </v-list-item-icon>
          <v-list-item-content> Export for Git </v-list-item-content>
        </v-list-item>
        <v-list-item :disabled="flowItem.options?.locked" clickable @click="showEditFlowDialog(flowItem)">
          <v-list-item-icon>
            <v-icon name="edit" />
          </v-list-item-icon>
          <v-list-item-content> Edit Flow </v-list-item-content>
        </v-list-item>
        <v-list-item
          v-if="!flowItem.options?.locked"
          clickable
          @click="handleToggleLock(flowItem, true)"
        >
          <v-list-item-icon>
            <v-icon name="lock" />
          </v-list-item-icon>
          <v-list-item-content> Enable Safety Lock </v-list-item-content>
        </v-list-item>
        <v-list-item
          v-else
          clickable
          @click="showUnlockModal = true"
        >
          <v-list-item-icon>
            <v-icon name="lock_open" />
          </v-list-item-icon>
          <v-list-item-content> Unlock Flow </v-list-item-content>
        </v-list-item>
        <v-list-item
          v-if="!flowItem.options?.archived"
          :disabled="flowItem.options?.locked"
          clickable
          @click="handleArchiveFlow(flowItem)"
        >
          <v-list-item-icon>
            <v-icon name="archive" />
          </v-list-item-icon>
          <v-list-item-content> Archive Flow </v-list-item-content>
        </v-list-item>
        <v-list-item
          v-else
          clickable
          @click="handleRestoreFlow(flowItem)"
        >
          <v-list-item-icon>
            <v-icon name="unarchive" />
          </v-list-item-icon>
          <v-list-item-content> Restore to Workspace </v-list-item-content>
        </v-list-item>
        <v-list-item clickable @click="duplicate(flowItem)">
          <v-list-item-icon>
            <v-icon name="content_copy" />
          </v-list-item-icon>
          <v-list-item-content> Duplicate </v-list-item-content>
        </v-list-item>
        <v-list-item clickable @click="backup(flowItem)">
          <v-list-item-icon>
            <v-icon name="file_download" />
          </v-list-item-icon>
          <v-list-item-content> Backup </v-list-item-content>
        </v-list-item>
        <v-list-item clickable @click="showPushToCloud(flowItem)">
          <v-list-item-icon>
            <v-icon name="cloud_upload" />
          </v-list-item-icon>
          <v-list-item-content> Push to Cloud </v-list-item-content>
        </v-list-item>
        <v-list-item clickable @click="showDeleteItemDialog(flowItem)">
          <v-list-item-icon>
            <v-icon name="delete" />
          </v-list-item-icon>
          <v-list-item-content> Delete </v-list-item-content>
        </v-list-item>
      </v-list>
      <v-list v-else>
        <v-list-item clickable @click="duplicateFolder(item as IFolder)">
          <v-list-item-icon>
            <v-icon name="content_copy" />
          </v-list-item-icon>
          <v-list-item-content> Duplicate Folder </v-list-item-content>
        </v-list-item>
        <v-list-item clickable @click="showEditFolderDialog(item as IFolder)">
          <v-list-item-icon>
            <v-icon name="edit" />
          </v-list-item-icon>
          <v-list-item-content> Edit Folder </v-list-item-content>
        </v-list-item>
        <v-list-item clickable @click="showDeleteItemDialog(item as IFolder)">
          <v-list-item-icon>
            <v-icon name="delete" />
          </v-list-item-icon>
          <v-list-item-content> Delete Folder </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-menu>

    <!-- Unlock Confirmation Dialog -->
    <v-dialog :model-value="showUnlockModal" @update:model-value="showUnlockModal = $event">
      <v-card v-if="flowItem" class="unlock-dialog-card">
        <v-card-title class="dialog-title">
          <v-icon name="lock_open" left />
          <span>Unlock Flow</span>
        </v-card-title>
        <v-card-text>
          <p>
            Are you sure you want to disable Safety Lock for <strong>{{ flowItem.name }}</strong>?
          </p>
          <p class="unlock-subtext">
            Unlocking will allow changes, status updates, and deletions on this flow.
          </p>
        </v-card-text>
        <v-card-actions class="dialog-actions">
          <v-button secondary @click="showUnlockModal = false">
            Cancel
          </v-button>
          <v-button kind="warning" @click="handleConfirmUnlock">
            <v-icon name="lock_open" left />
            Unlock Flow
          </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts">
import { type PropType, computed, defineComponent, inject, ref } from 'vue';
import type { IFlow, IFolder, FlowManagerUtilsContext } from '../../types';
import { useRouter } from 'vue-router';

export default defineComponent({
  props: {
    item: {
      type: Object as PropType<IFlow | IFolder>,
      required: true,
    },
    isLocal: {
      type: Boolean,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter();
    const flowManagerUtils = inject<FlowManagerUtilsContext>('flowManagerUtils');

    const selectedCredential = computed(() => flowManagerUtils?.selectedCredential?.value);
    const flowItem = computed(() => props.item as IFlow);
    const showUnlockModal = ref(false);

    function handleToggleLock(item: IFlow, targetState?: boolean) {
      flowManagerUtils?.toggleSafetyLock?.(item, targetState);
    }

    function handleConfirmUnlock() {
      if (flowItem.value) {
        flowManagerUtils?.toggleSafetyLock?.(flowItem.value, false);
        showUnlockModal.value = false;
      }
    }

    function handleArchiveFlow(item: IFlow) {
      flowManagerUtils?.archiveFlow?.(item);
    }

    function handleRestoreFlow(item: IFlow) {
      flowManagerUtils?.restoreFlow?.(item);
    }

    return {
      flowItem,
      showEditFlowDialog,
      duplicate,
      backup,
      showPushToCloud,
      showDeleteItemDialog,
      duplicateFolder,
      showEditFolderDialog,
      showRunDialog,
      showRunWebhookDialog,
      selectedCredential,
      openDashboardDetail,
      openSimulationDialog,
      openVersionDialog,
      openGitExportDialog,
      showUnlockModal,
      handleToggleLock,
      handleConfirmUnlock,
      handleArchiveFlow,
      handleRestoreFlow,
    };

    function showEditFlowDialog(item: IFlow) {
      flowManagerUtils?.showEditFlowDialog?.(item);
    }

    function duplicate(item: IFlow, isDuplicate?: boolean) {
      flowManagerUtils?.duplicate?.(item, isDuplicate);
    }

    function backup(item: IFlow) {
      flowManagerUtils?.backup?.(item);
    }

    function showPushToCloud(item: IFlow) {
      flowManagerUtils?.showPushToCloud?.(item);
    }

    function showDeleteItemDialog(item: IFlow | IFolder) {
      flowManagerUtils?.showDeleteItemDialog?.(item);
    }

    function duplicateFolder(item: IFolder) {
      flowManagerUtils?.duplicateFolder?.(item);
    }

    function showEditFolderDialog(item: IFolder) {
      flowManagerUtils?.showEditFolderDialog?.(item);
    }

    function showRunDialog(item: IFlow) {
      flowManagerUtils?.showRunDialog?.(item);
    }

    function showRunWebhookDialog(item: IFlow) {
      flowManagerUtils?.showRunWebhookDialog?.(item);
    }

    function openDashboardDetail(itemId: string) {
      if (selectedCredential.value && selectedCredential.value !== 'local') {
        router.push({
          path: `/flow-manager/dashboard/${itemId}`,
          query: { credential: selectedCredential.value },
        });
      } else {
        router.push(`/flow-manager/dashboard/${itemId}`);
      }
    }

    function openVersionDialog(item: IFlow) {
      flowManagerUtils?.openVersionDialog?.(item);
    }

    function openSimulationDialog(item: IFlow) {
      flowManagerUtils?.openSimulationDialog?.(item);
    }

    function openGitExportDialog(item: IFlow) {
      flowManagerUtils?.openGitExportDialog?.(item);
    }
  },
});
</script>

<style lang="scss" scoped>
.item-options-wrapper {
  display: inline-flex;
  align-items: center;
}

.ctx-toggle {
  --v-icon-color: var(--foreground-subdued);

  &:hover {
    --v-icon-color: var(--foreground-normal);
  }
}

.unlock-dialog-card {
  max-width: 480px;

  .dialog-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .unlock-subtext {
    font-size: 12px;
    color: var(--theme--foreground-subdued, #64748b);
    margin-top: 6px;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 24px;
  }
}
</style>

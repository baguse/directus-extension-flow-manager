<template>
  <v-menu placement="left-start" show-arrow>
    <template #activator="{ toggle }">
      <v-icon name="more_vert" clickable class="ctx-toggle" @click.prevent="toggle" />
    </template>
    <v-list v-if="item.type !== 'category'">
      <v-list-item
        v-if="
          item.trigger === 'manual' && item.status === 'active' && selectedCredential === 'local'
        "
        clickable
        @click="showRunDialog(item)"
      >
        <v-list-item-icon>
          <v-icon name="play_arrow" />
        </v-list-item-icon>
        <v-list-item-content> Run </v-list-item-content>
      </v-list-item>
      <v-list-item
        v-else-if="item.trigger === 'webhook' && item.status === 'active'"
        clickable
        @click="showRunWebhookDialog(item)"
      >
        <v-list-item-icon>
          <v-icon name="play_arrow" />
        </v-list-item-icon>
        <v-list-item-content> Run </v-list-item-content>
      </v-list-item>
      <v-list-item v-if="isLocal" clickable @click="openDashboardDetail(item.id)">
        <v-list-item-icon>
          <v-icon name="insights" />
        </v-list-item-icon>
        <v-list-item-content> Open Dashboard </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="openVersionDialog(item)">
        <v-list-item-icon>
          <v-icon name="history" />
        </v-list-item-icon>
        <v-list-item-content> Version History </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="openGitExportDialog(item)">
        <v-list-item-icon>
          <v-icon name="terminal" />
        </v-list-item-icon>
        <v-list-item-content> Export for Git </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="showEditFlowDialog(item)">
        <v-list-item-icon>
          <v-icon name="edit" />
        </v-list-item-icon>
        <v-list-item-content> Edit Flow </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="duplicate(item)">
        <v-list-item-icon>
          <v-icon name="content_copy" />
        </v-list-item-icon>
        <v-list-item-content> Duplicate </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="backup(item)">
        <v-list-item-icon>
          <v-icon name="file_download" />
        </v-list-item-icon>
        <v-list-item-content> Backup </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="showPushToCloud(item)">
        <v-list-item-icon>
          <v-icon name="cloud_upload" />
        </v-list-item-icon>
        <v-list-item-content> Push to Cloud </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="showDeleteItemDialog(item)">
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
      <v-list-item clickable @click="showDeleteItemDialog(item)">
        <v-list-item-icon>
          <v-icon name="delete" />
        </v-list-item-icon>
        <v-list-item-content> Delete Folder </v-list-item-content>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script lang="ts">
import { type PropType, computed, defineComponent, inject } from 'vue';
import type { IFlow, IFolder, FlowManagerUtilsContext } from '../../types';
import { useRouter } from 'vue-router';

export default defineComponent({
  props: {
    item: {
      type: Object as PropType<IFlow>,
      required: true,
    },
    isLocal: {
      type: Boolean,
      required: true,
    },
  },
  setup() {
    const router = useRouter();
    const flowManagerUtils = inject<FlowManagerUtilsContext>('flowManagerUtils');

    const selectedCredential = computed(() => flowManagerUtils?.selectedCredential?.value);

    return {
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
      openVersionDialog,
      openGitExportDialog,
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

    function showDeleteItemDialog(item: IFlow) {
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

    function openGitExportDialog(item: IFlow) {
      flowManagerUtils?.openGitExportDialog?.(item);
    }
  },
});
</script>

<style lang="scss" scoped>
.ctx-toggle {
  --v-icon-color: var(--foreground-subdued);

  &:hover {
    --v-icon-color: var(--foreground-normal);
  }
}
</style>

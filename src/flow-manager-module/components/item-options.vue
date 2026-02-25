<template>
  <v-menu placement="left-start" show-arrow>
    <template #activator="{ toggle }">
      <v-icon name="more_vert" clickable class="ctx-toggle" @click.prevent="toggle" />
    </template>
    <v-list v-if="item.type !== 'category'">
      <v-list-item
        v-if="item.trigger === 'manual' && item.status === 'active' && selectedCredential === 'local'"
        clickable
        @click="showRunDialog(item)"
      >
        <v-list-item-icon>
          <v-icon name="play_arrow" />
        </v-list-item-icon>
        <v-list-item-content> Run </v-list-item-content>
      </v-list-item>
      <v-list-item v-else-if="item.trigger === 'webhook' && item.status === 'active'" clickable @click="showRunWebhookDialog(item)">
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
import { type PropType, type Ref, computed, defineComponent, inject, toRefs } from "vue";
import type { IFlow, IFolder } from "../../types";
import { useRouter } from "vue-router";

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
  setup(props) {
    const router = useRouter();
    const { item, isLocal } = toRefs(props);
    const flowManagerUtils = inject<{
      duplicate: (item: IFlow, isDuplicate?: boolean) => Promise<void>;
      backup: (item: IFlow) => Promise<void>;
      showPushToCloud: (item: IFlow) => Promise<void>;
      showDeleteItemDialog: (item: IFlow) => Promise<void>;
      duplicateFolder: (item: IFolder) => Promise<void>;
      showEditFolderDialog: (item: IFolder) => Promise<void>;
      showRunDialog: (item: IFlow) => Promise<void>;
      showRunWebhookDialog: (item: IFlow) => Promise<void>;
      selectedCredential: Ref<string>;
    }>("flowManagerUtils");

    const selectedCredential = computed(() => flowManagerUtils?.selectedCredential.value);

    return {
      item,
      duplicate,
      backup,
      showPushToCloud,
      showDeleteItemDialog,
      duplicateFolder,
      showEditFolderDialog,
      showRunDialog,
      showRunWebhookDialog,
      selectedCredential,
      isLocal,
      openDashboardDetail,
    };

    function duplicate(item: IFlow, isDuplicate?: boolean) {
      flowManagerUtils?.duplicate(item, isDuplicate);
    }

    function backup(item: IFlow) {
      flowManagerUtils?.backup(item);
    }

    function showPushToCloud(item: IFlow) {
      flowManagerUtils?.showPushToCloud(item);
    }

    function showDeleteItemDialog(item: IFlow) {
      flowManagerUtils?.showDeleteItemDialog(item);
    }

    function duplicateFolder(item: IFolder) {
      flowManagerUtils?.duplicateFolder(item);
    }

    function showEditFolderDialog(item: IFolder) {
      flowManagerUtils?.showEditFolderDialog(item);
    }

    function showRunDialog(item: IFlow) {
      flowManagerUtils?.showRunDialog(item);
    }

    function showRunWebhookDialog(item: IFlow) {
      flowManagerUtils?.showRunWebhookDialog(item);
    }

    function openDashboardDetail(itemId: string) {
      router.push(`/flow-manager/dashboard/${itemId}`);
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

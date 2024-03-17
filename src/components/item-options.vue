<template>
  <v-menu placement="left-start" show-arrow>
    <template #activator="{ toggle }">
      <v-icon name="more_vert" clickable class="ctx-toggle" @click.prevent="toggle" />
    </template>
    <v-list>
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
      <v-list-item clickable @click="showDeleteFlowDialog(item)">
        <v-list-item-icon>
          <v-icon name="delete" />
        </v-list-item-icon>
        <v-list-item-content> Delete </v-list-item-content>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script lang="ts">
import { defineComponent, PropType, toRefs, inject } from "vue";
import { IFlow } from "../types";

export default defineComponent({
  props: {
    item: {
      type: Object as PropType<IFlow>,
      required: true,
    },
  },
  setup(props) {
    const { item } = toRefs(props);
    const flowManagerUtils = inject<{
      duplicate: (item: IFlow, isDuplicate?: boolean) => Promise<void>;
      backup: (item: IFlow) => Promise<void>;
      showPushToCloud: (item: IFlow) => Promise<void>;
      showDeleteFlowDialog: (item: IFlow) => Promise<void>;
    }>("flowManagerUtils");

    const duplicate = (item: IFlow, isDuplicate?: boolean) => {
      flowManagerUtils?.duplicate(item, isDuplicate);
    };

    const backup = (item: IFlow) => {
      flowManagerUtils?.backup(item);
    };

    const showPushToCloud = (item: IFlow) => {
      flowManagerUtils?.showPushToCloud(item);
    };

    const showDeleteFlowDialog = (item: IFlow) => {
      flowManagerUtils?.showDeleteFlowDialog(item);
    };

    return {
      item,
      duplicate,
      backup,
      showPushToCloud,
      showDeleteFlowDialog,
    };
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

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    viewListMode: boolean;
    selectedItemsCount: number;
    selectedFlowsInactiveCount: number;
    selectedFlowsActiveCount: number;
    selectedCredential: string;
  }>(),
  {
    viewListMode: false,
    selectedItemsCount: 0,
    selectedFlowsInactiveCount: 0,
    selectedFlowsActiveCount: 0,
    selectedCredential: 'local',
  },
);

const emit = defineEmits<{
  (e: 'selectAll'): void;
  (e: 'activateSelected'): void;
  (e: 'deactivateSelected'): void;
  (e: 'backupSelected'): void;
  (e: 'duplicateSelected'): void;
  (e: 'deleteSelected'): void;
  (e: 'pushToCloudSelected'): void;
}>();

const showSelect = defineModel<boolean>('showSelect', { default: false });
const isSelectAll = defineModel<boolean>('isSelectAll', { default: false });
</script>

<template>
  <div
    :class="{
      'top-bar-panel': true,
      'table-mode': !props.viewListMode,
      'list-view-mode': props.viewListMode,
    }"
  >
    <v-checkbox v-model="showSelect">Show Select</v-checkbox>
    <v-checkbox v-if="showSelect" v-model="isSelectAll" @update:model-value="emit('selectAll')">
      Select All
    </v-checkbox>

    <v-button
      v-if="showSelect"
      v-tooltip.bottom="'Activate Selected'"
      icon
      rounded
      small
      :disabled="!props.selectedFlowsInactiveCount"
      @click="emit('activateSelected')"
    >
      <v-icon name="play_circle" />
    </v-button>

    <v-button
      v-if="showSelect"
      v-tooltip.bottom="'Deactivate Selected'"
      icon
      rounded
      small
      :disabled="!props.selectedFlowsActiveCount"
      @click="emit('deactivateSelected')"
    >
      <v-icon name="pause_circle" />
    </v-button>

    <v-button
      v-if="showSelect"
      v-tooltip.bottom="'Backup Selected'"
      icon
      rounded
      small
      :disabled="!props.selectedItemsCount"
      @click="emit('backupSelected')"
    >
      <v-icon name="file_download" />
    </v-button>

    <v-button
      v-if="showSelect"
      v-tooltip.bottom="'Duplicate Selected'"
      icon
      rounded
      small
      :disabled="!props.selectedItemsCount"
      @click="emit('duplicateSelected')"
    >
      <v-icon name="content_copy" />
    </v-button>

    <v-button
      v-if="showSelect"
      v-tooltip.bottom="'Delete Selected'"
      icon
      rounded
      small
      :disabled="!props.selectedItemsCount"
      @click="emit('deleteSelected')"
    >
      <v-icon name="delete" />
    </v-button>

    <v-button
      v-if="showSelect && props.selectedCredential === 'local'"
      v-tooltip.bottom="'Push to Cloud Selected'"
      icon
      rounded
      small
      :disabled="!props.selectedItemsCount"
      @click="emit('pushToCloudSelected')"
    >
      <v-icon name="cloud_upload" />
    </v-button>

    <div v-if="showSelect" class="align-content-center">
      {{ props.selectedItemsCount }} Item{{ props.selectedItemsCount > 1 ? 's' : '' }} Selected
    </div>
  </div>
</template>

<style scoped lang="scss">
.top-bar-panel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}

.table-mode {
  margin-bottom: 8px;
}

.list-view-mode {
  margin-bottom: 4px;
}

.align-content-center {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--theme--foreground-subdued);
  margin-left: 8px;
}
</style>

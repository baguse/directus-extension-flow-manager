<script lang="ts" setup>
import Draggable from 'vuedraggable';
import type { IFlow, IFolder } from '../../types';
import FlowItem from './flow-item.vue';
import {
  ANIMATION_DURATION,
  EASING,
  EMPTY_INSERT_THRESHOLD,
  FALLBACK_ON_BODY,
  FALLBACK_TOLERANCE,
  FORCE_FALLBACK,
  INVERT_SWAP,
  SWAP_THRESHOLD,
} from '../../constants';
import { onDragEnd, onDragStart } from '../../utils/flow-drag.util';

withDefaults(
  defineProps<{
    items: (IFlow | IFolder)[];
    allFlows: (IFlow | IFolder)[];
    isArchive?: boolean;
    showSelect?: boolean;
    selectedItems?: string[];
  }>(),
  {
    isArchive: false,
    showSelect: false,
    selectedItems: () => [],
  },
);

const emit = defineEmits<{
  (e: 'sort', event: (IFlow & IFolder)[], parentId?: string | null): void;
}>();
</script>

<template>
  <div v-if="!items.length" class="empty-list-container">
    <v-info
      :icon="isArchive ? 'archive' : 'folder_open'"
      :title="isArchive ? 'Archive is Empty' : 'This folder is empty'"
      center
    >
      {{
        isArchive
          ? 'Flows moved to Archive will appear here safely out of the workspace.'
          : 'No flows in this category.'
      }}
    </v-info>
  </div>
  <v-list v-else class="draggable-list">
    <draggable
      :force-fallback="FORCE_FALLBACK"
      :fallback-on-body="FALLBACK_ON_BODY"
      :fallback-tolerance="FALLBACK_TOLERANCE"
      :empty-insert-threshold="EMPTY_INSERT_THRESHOLD"
      :invert-swap="INVERT_SWAP"
      :animation="ANIMATION_DURATION"
      :easing="EASING"
      :swap-threshold="SWAP_THRESHOLD"
      :model-value="items"
      item-key="id"
      handle=".drag-handle"
      class="root-drag-container"
      :group="{ name: 'flows' }"
      @update:model-value="emit('sort', $event)"
      @start="onDragStart"
      @end="onDragEnd"
    >
      <template #item="{ element }">
        <FlowItem
          :item="element"
          :items="allFlows"
          :show-select="showSelect"
          :selected-items="selectedItems"
          @update:sort="(e: (IFlow & IFolder)[], p?: string | null) => emit('sort', e, p)"
        />
      </template>
    </draggable>
  </v-list>
</template>

<style lang="scss" scoped>
.empty-list-container {
  padding: 48px 16px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.root-drag-container {
  padding: 8px 0;
  overflow: visible;
}

.draggable-list :deep(.sortable-ghost) {
  opacity: 0.7;
  pointer-events: none !important;

  .v-list-item {
    --v-list-item-background-color: var(
      --theme--primary-subdued,
      var(--primary-alt, rgba(102, 68, 255, 0.08))
    );
    --v-list-item-border-color: var(--theme--primary, var(--primary, #6644ff));
    border: 1.5px dashed var(--theme--primary, var(--primary, #6644ff)) !important;
    border-radius: var(--border-radius, 6px);
    pointer-events: none !important;

    > * {
      opacity: 0;
    }
  }
}

.draggable-list {
  margin-left: 10px;
  margin-right: 10px;
}
</style>

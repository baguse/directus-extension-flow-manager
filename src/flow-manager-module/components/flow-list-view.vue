<script lang="ts" setup>
import Draggable from 'vuedraggable';
import type { IFlow, IFolder } from '../../types';
import FlowItem from './flow-item.vue';

withDefaults(
  defineProps<{
    items: Partial<IFlow | IFolder>[];
    allFlows: (IFlow | IFolder)[];
    showSelect?: boolean;
    selectedItems?: string[];
  }>(),
  {
    showSelect: false,
    selectedItems: () => [],
  },
);

const emit = defineEmits<{
  (e: 'sort', event: (IFlow & IFolder)[], parentId?: string | null): void;
}>();
</script>

<template>
  <v-list class="draggable-list">
    <draggable
      :force-fallback="true"
      :model-value="items"
      item-key="id"
      handle=".drag-handle"
      :swap-threshold="0.3"
      class="root-drag-container"
      :group="{ name: 'flows' }"
      @update:model-value="emit('sort', $event)"
    >
      <template #item="{ element }">
        <div class="list-group-item">
          <FlowItem
            :item="element"
            :items="allFlows"
            :show-select="showSelect"
            :selected-items="selectedItems"
            @update:sort="(e: (IFlow & IFolder)[], p?: string | null) => emit('sort', e, p)"
          />
        </div>
      </template>
    </draggable>
  </v-list>
</template>

<style lang="scss" scoped>
.root-drag-container {
  padding: 8px 0;
  overflow: hidden;
}

.draggable-list :deep(.sortable-ghost) {
  .v-list-item {
    --v-list-item-background-color: var(--primary-alt);
    --v-list-item-border-color: var(--primary);
    --v-list-item-background-color-hover: var(--primary-alt);
    --v-list-item-border-color-hover: var(--primary);

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

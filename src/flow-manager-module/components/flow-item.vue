<script lang="ts" setup>
import { toRefs, computed, inject } from 'vue';
import { FlowManagerUtilsContext, IFlow, IFolder } from '../../types';
import Draggable from 'vuedraggable';
import { useLocalStorage } from '../../composables/use-local-storage';
import itemOptions from './item-options.vue';
import { ANIMATION_DURATION, EASING, EMPTY_INSERT_THRESHOLD, FALLBACK_ON_BODY, FALLBACK_TOLERANCE, FORCE_FALLBACK, INVERT_SWAP, SWAP_THRESHOLD } from '../../constants';
import { onDragEnd, onDragStart } from '../../utils/flow-drag.util';

const props = withDefaults(
  defineProps<{
    item: IFlow & IFolder;
    items: (IFlow | IFolder)[];
    showSelect: boolean;
    selectedItems: string[];
  }>(),
  {
    showSelect: false,
    selectedItems: () => [],
  },
);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const emit = defineEmits(['selectItem']);

const { item, items, selectedItems, showSelect } = toRefs(props);
const flowManagerUtils = inject<FlowManagerUtilsContext>('flowManagerUtils');
const nestedFlows = computed(() => {
  const itemId = props.item?.id ? String(props.item.id).trim() : '';
  const itemName = (props.item as IFolder)?.name ? String((props.item as IFolder).name).trim() : '';

  if (!itemId && !itemName) return [];

  return (items.value || [])
    .filter((flow) => {
      if (!flow || flow.id === itemId) return false;
      return flow.flow_manager_metadata_id?.flow_manager_category === props.item.id;
    })
    .sort(
      (a, b) =>
        (a.flow_manager_metadata_id?.flow_manager_order || 0) -
        (b.flow_manager_metadata_id?.flow_manager_order || 0),
    );
});
const { data: isItemExpanded } = useLocalStorage<boolean>(
  `settings-collapsed-flow-manager-${props.item.id}`,
  true,
);

const isActive = computed(() => !isCategory.value && item.value.status === 'active');

const isCategory = computed(() => item.value.type === 'category');

const resolvedIcon = computed(() => {
  const iconStr = item.value?.icon ? String(item.value.icon).trim() : '';
  if (iconStr) return iconStr;
  if (isCategory.value) return 'folder';
  return 'bolt';
});

const resolvedColor = computed(() => {
  const colorStr = item.value?.color ? String(item.value.color).trim() : '';
  if (colorStr) return colorStr;
  return 'var(--theme--foreground, var(--theme--background-inverted, var(--background-inverted, #000000)))';
});

const triggerType = computed(() => {
  return item.value.trigger?.toUpperCase();
});

const isLocal = computed(() => flowManagerUtils?.selectedCredential?.value === 'local');

const selected = computed({
  get: () => {
    return !!selectedItems.value?.includes(item.value.id);
  },
  set: (value: boolean) => {
    flowManagerUtils?.selectItemKey?.(item.value.id, value);
  },
});

function toggleCollapse() {
  isItemExpanded.value = !isItemExpanded.value;
}

function onGroupSortChange(updates: IFlow[]) {
  flowManagerUtils?.onSort(updates, item.value.id);
}

function selectItem() {
  flowManagerUtils?.selectItem?.(item.value);
  if (isCategory.value) {
    toggleCollapse();
  }
}
</script>

<template>
  <div class="row-item" :class="{ 'is-category': isCategory }">
    <v-list-item
      block
      dense
      clickable
      style="height: 49px"
      :class="{ hidden: !isCategory && !isActive }"
      @click="selectItem()"
    >
      <v-list-item-icon>
        <v-icon class="drag-handle" name="drag_handle" />
      </v-list-item-icon>
      <div v-if="!isCategory && showSelect">
        <v-checkbox
          v-model="selected"
          @update:model-value="($e: boolean) => $emit('selectItem', $e)"
        />
      </div>
      <v-icon
        v-if="isCategory"
        :name="resolvedIcon"
        :color="resolvedColor"
        :style="{ color: resolvedColor }"
        :class="`mr-4`"
      />
      <v-icon
        v-else
        v-tooltip.bottom="isActive ? 'Active' : 'Inactive'"
        :name="resolvedIcon"
        :color="resolvedColor"
        :style="{ color: resolvedColor }"
        :class="`mr-4`"
      />
      <div v-if="!isCategory && !isActive" class="item-detail">
        <v-badge
          v-if="triggerType"
          :value="item.flow_manager_metadata_id?.flow_manager_run_counter || 0"
          class="notifications-badge"
        >
          <v-chip x-small class="item-name text-gray mr-4 trigger-chip">{{ triggerType }}</v-chip>
        </v-badge>
        <span ref="itemName" class="item-name text-gray">{{ item.name }}</span>
        <span v-if="item.description" class="item-note text-gray">{{ item.description }}</span>
      </div>
      <div v-else class="item-detail">
        <v-badge
          v-if="triggerType"
          :value="item.flow_manager_metadata_id?.flow_manager_run_counter || 0"
          class="notifications-badge"
        >
          <v-chip x-small active class="item-name mr-4 trigger-chip">{{ triggerType }} </v-chip>
        </v-badge>
        <span ref="itemName" class="item-name">{{ item.name }}</span>
        <span v-if="!isCategory && item.description" class="item-note">{{ item.description }}</span>
      </div>
      <v-icon
        v-if="!isCategory"
        v-tooltip="'Go to Flow'"
        name="open_in_new"
        clickable
        @click.stop.prevent="() => flowManagerUtils?.goToFlow({ item })"
      />
      <v-icon
        v-if="nestedFlows?.length"
        v-tooltip="isItemExpanded ? 'Collapse' : 'Expand'"
        :name="isItemExpanded ? 'unfold_less' : 'unfold_more'"
        clickable
        @click.stop.prevent="toggleCollapse"
      />
      <item-options :item="item" :is-local="isLocal" />
    </v-list-item>


    <transition-expand>
      <draggable
        v-if="!nestedFlows.length || isItemExpanded"
        :force-fallback="FORCE_FALLBACK"
        :fallback-on-body="FALLBACK_ON_BODY"
        :fallback-tolerance="FALLBACK_TOLERANCE"
        :empty-insert-threshold="EMPTY_INSERT_THRESHOLD"
        :invert-swap="INVERT_SWAP"
        :animation="ANIMATION_DURATION"
        :easing="EASING"
        :swap-threshold="SWAP_THRESHOLD"
        :model-value="nestedFlows"
        :group="{ name: 'flows' }"
        class="drag-container"
        item-key="id"
        handle=".drag-handle"
        @update:model-value="onGroupSortChange"
        @start="onDragStart"
        @end="onDragEnd"
      >
        <template #item="{ element }">
          <flow-item
            :item="element"
            :items="items"
            :selected-items="selectedItems"
            :show-select="showSelect"
          />
        </template>
      </draggable>
    </transition-expand>
  </div>
</template>

<style lang="scss">
.drag-handle {
  cursor: grab;
}

.mr-4 {
  margin-right: 4px;
}

.drag-container {
  margin-top: 4px;
  margin-left: 24px;
  padding: 0;
  min-height: 0;
  transition: border-color var(--fast, 0.15s) ease, background-color var(--fast, 0.15s) ease;

  > .row-item:last-child {
    margin-bottom: 0;
  }
}

.drag-container:empty {
  min-height: 0;
  margin: 0;
  padding: 0;
}

body.is-dragging-flow {
  cursor: grabbing !important;
  user-select: none !important;
  -webkit-user-select: none !important;

  * {
    user-select: none !important;
  }

}

.sortable-fallback {
  opacity: 0.95 !important;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18), 0 4px 10px rgba(0, 0, 0, 0.08) !important;
  border-radius: var(--border-radius, 6px) !important;
  pointer-events: none !important;
  cursor: grabbing !important;
  background-color: var(--theme--background, var(--background-normal, #ffffff)) !important;
  border: 1px solid var(--theme--primary, var(--primary, #6644ff)) !important;
  height: auto !important;
  max-height: 320px;
  margin-bottom: 0 !important;
  overflow: hidden !important;
}

.row-item {
  margin-bottom: 8px;
  will-change: transform;
}

.item-name {
  flex-shrink: 0;
  margin-left: 10px;
}

.item-detail {
  display: flex;
  flex-grow: 1;
  align-items: center;
  height: 100%;
  overflow: hidden;
  font-family: var(--family-monospace);
  pointer-events: none;
}

.item-note {
  margin-left: 4px;
  overflow: hidden;
  color: var(--foreground-subdued, var(--theme--foreground-subdued, gray));
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity var(--fast) var(--transition);
}

.v-list-item:hover .item-note {
  opacity: 1;
}

.text-gray {
  color: var(--foreground-subdued, var(--theme--foreground-subdued, gray));
}

.trigger-chip {
  --v-chip-color: white;
  --v-chip-background-color: var(--theme--primary, var(--primary));
}
</style>

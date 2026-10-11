<script lang="ts" setup>
import { toRefs, computed, inject } from 'vue';
import type { FlowManagerUtilsContext, IFlow, IFolder } from '../../types';
import Draggable from 'vuedraggable';
import { useLocalStorage } from '../../composables/use-local-storage';
import itemOptions from './item-options.vue';

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
const nestedFlows = computed(() =>
  items.value
    .filter((flow) => {
      const cat = flow.flow_manager_metadata_id?.flow_manager_category;
      return cat === props.item.id;
    })
    .sort(
      (a, b) =>
        (a.flow_manager_metadata_id?.flow_manager_order || 0) -
        (b.flow_manager_metadata_id?.flow_manager_order || 0),
    ),
);
const { data: isItemExpanded } = useLocalStorage<boolean>(
  `settings-collapsed-flow-manager-${props.item.id}`,
  true,
);

const isActive = computed(() => item.value.status === 'active');

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
  flowManagerUtils?.onSort?.(updates, item.value.id);
}

function selectItem() {
  flowManagerUtils?.selectItem?.(item.value);
}
</script>

<template>
  <div class="row-item">
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
        v-tooltip.bottom="item.status === 'active' ? 'Active' : 'Inactive'"
        :name="resolvedIcon"
        :color="resolvedColor"
        :style="{ color: resolvedColor }"
        :class="`mr-4`"
      />
      <div v-if="!isCategory && !isActive" class="item-detail">
        <v-badge
          v-if="triggerType"
          :value="item.flow_manager_metadata_id?.flow_manager_run_counter || 0"
          :class="{
            'badge-success': !item.flow_manager_metadata_id?.flow_manager_last_run_message,
            'badge-error': !!item.flow_manager_metadata_id?.flow_manager_last_run_message,
          }"
        >
          <v-chip x-small active class="item-name mr-4 trigger-chip is-inactive">{{
            triggerType
          }}</v-chip>
        </v-badge>
        <span ref="itemName" class="item-name text-gray">{{ item.name }}</span>
        <span v-if="item.description" class="item-note text-gray">{{ item.description }}</span>
      </div>
      <div v-else class="item-detail">
        <v-badge
          v-if="triggerType"
          :value="item.flow_manager_metadata_id?.flow_manager_run_counter || 0"
          :class="{
            'badge-success': !item.flow_manager_metadata_id?.flow_manager_last_run_message,
            'badge-error': !!item.flow_manager_metadata_id?.flow_manager_last_run_message,
          }"
        >
          <v-chip x-small active class="item-name mr-4 trigger-chip">{{ triggerType }}</v-chip>
        </v-badge>
        <span ref="itemName" class="item-name">{{ item.name }}</span>
        <span v-if="item.description" class="item-note">{{ item.description }}</span>
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
        v-if="isItemExpanded"
        :force-fallback="true"
        :model-value="nestedFlows"
        :group="{ name: 'flows' }"
        :swap-threshold="0.3"
        class="drag-container"
        item-key="id"
        handle=".drag-handle"
        @update:model-value="onGroupSortChange"
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
  cursor: move;
}

.mr-4 {
  margin-right: 4px;
}

.drag-container {
  margin-top: 8px;
  margin-left: 20px;
}

.drag-handle {
  cursor: grab;
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

.row-item {
  margin-bottom: 8px;
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
  --v-chip-color: var(--foreground-inverted, var(--theme--foreground-inverted, #ffffff));
  --v-chip-background-color: var(--theme--primary);
  background-color: var(--theme--primary) !important;
  color: var(--foreground-inverted, var(--theme--foreground-inverted, #ffffff)) !important;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;

  :deep(*) {
    color: var(--foreground-inverted, var(--theme--foreground-inverted, #ffffff)) !important;
  }

  &.is-inactive {
    opacity: 0.7;
  }
}

.badge-error {
  --v-badge-background-color: #fa284b;
}

.badge-success {
  --v-badge-background-color: #4a9e35;
}
</style>

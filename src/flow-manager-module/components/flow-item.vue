<script lang="ts" setup>
import { toRefs, computed, inject, Ref } from "vue";
import { ICredential, IFlow, IFolder } from "../../types";
import Draggable from "vuedraggable";
import { useRouter } from "vue-router";
import { useLocalStorage } from "../../composables/use-local-storage";
import itemOptions from "./item-options.vue";

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
  }
);

const emit = defineEmits(["selectItem"]);

const router = useRouter();
const { item, items, selectedItems, showSelect } = toRefs(props);
const flowManagerUtils = inject<{
  onSort: (event: any[], parentId: string) => void;
  selectItem: (item: IFlow) => void;
  selectItemKey: (key: string, isSelected: boolean) => void;
  selectedItems: Ref<string[]>;
  selectedCredential: Ref<string>;
  credentials: Ref<ICredential[]>;
}>("flowManagerUtils");
const nestedFlows = computed(() =>
  items.value
    .filter((flow) => flow.flow_manager_category === props.item.id)
    .sort((a, b) => (a.flow_manager_order || 0) - (b.flow_manager_order || 0))
);
const { data: isItemExpanded } = useLocalStorage<boolean>(`settings-collapsed-flow-manager-${props.item.id}`, true);

const isActive = computed(() => item.value.status === "active");

const isCategory = computed(() => item.value.type === "category");

const triggerType = computed(() => {
  return item.value.trigger?.toUpperCase();
});

const isLocal = computed(() => flowManagerUtils?.selectedCredential.value === "local");

const selected = computed({
  get: () => {
    return !!selectedItems.value?.includes(item.value.id);
  },
  set: (value: boolean) => {
    flowManagerUtils?.selectItemKey(item.value.id, value);
  },
});

function toggleCollapse() {
  isItemExpanded.value = !isItemExpanded.value;
}

function onGroupSortChange(updates: IFlow[]) {
  flowManagerUtils?.onSort(updates, item.value.id);
}

function goToFlow(item: IFlow & IFolder) {
  if (item.type === "category") return;

  if (isLocal.value) {
    router.push(`/settings/flows/${item.id}`);
  } else {
    const credential = flowManagerUtils?.credentials.value.find((cred) => cred.id === flowManagerUtils?.selectedCredential.value);
    if (credential) {
      const a = document.createElement("a");
      a.href = `${credential.url}/admin/settings/flows/${item.id}`;
      a.target = "_blank";
      a.click();
      document.body.removeChild(a);
    }
  }
}

function selectItem() {
  flowManagerUtils?.selectItem(item.value);
}
</script>

<template>
  <div class="row-item">
    <v-list-item block dense clickable style="height: 49px" :class="{ hidden: !isCategory && !isActive }" @click="selectItem()">
      <v-list-item-icon>
        <v-icon class="drag-handle" name="drag_handle" />
      </v-list-item-icon>
      <div v-if="!isCategory && showSelect">
        <v-checkbox v-model="selected" @update:model-value="($e: boolean) => $emit('selectItem', $e)" />
      </div>
      <v-icon
        v-if="isCategory"
        :name="item.icon"
        :color="item.color || 'var(--theme--background-inverted, var(--background-inverted))'"
        :class="`mr-4`"
      />
      <v-icon
        v-else
        :name="item.icon || ''"
        :color="item.color || 'var(--theme--background-inverted, var(--background-inverted)'"
        :class="`mr-4`"
        v-tooltip.bottom="item.status === 'active' ? 'Active' : 'Inactive'"
      />
      <div v-if="!isCategory && !isActive" class="item-detail">
        <v-badge
          :value="item.flow_manager_run_counter || 0"
          :class="{ 'badge-success': !item.flow_manager_last_run_message, 'badge-error': !!item.flow_manager_last_run_message }"
        >
          <v-chip x-small class="item-name text-gray mr-4 trigger-chip">{{ triggerType }}</v-chip>
        </v-badge>
        <span ref="itemName" class="item-name text-gray">{{ item.name }}</span>
        <span v-if="item.description" class="item-note text-gray">{{ item.description }}</span>
      </div>
      <div v-else class="item-detail">
        <v-badge
          v-if="triggerType"
          :value="item.flow_manager_run_counter || 0"
          :class="{ 'badge-success': !item.flow_manager_last_run_message, 'badge-error': !!item.flow_manager_last_run_message }"
        >
          <v-chip x-small active class="item-name mr-4 trigger-chip">{{ triggerType }} </v-chip>
        </v-badge>
        <span ref="itemName" class="item-name">{{ item.name }}</span>
        <span v-if="item.description" class="item-note">{{ item.description }}</span>
      </div>
      <v-icon v-if="!isCategory" v-tooltip="'Go to Flow'" name="open_in_new" clickable @click.stop.prevent="goToFlow(item)" />
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
          <flow-item :item="element" :items="items" :selected-items="selectedItems" :show-select="showSelect" />
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
  --v-chip-color: var(--foreground-inverted, var(--theme--foreground));
  --v-chip-background-color: var(--theme--primary);
}

.badge-error {
  --v-badge-background-color: #fa284b;
}

.badge-success {
  --v-badge-background-color: #4a9e35;
}
</style>

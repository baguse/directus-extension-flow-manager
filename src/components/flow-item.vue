<template>
  <div class="row-item">
    <v-list-item block dense clickable :class="{ hidden: item.type !== 'category' && item.status !== 'active' }">
      <v-list-item-icon>
        <v-icon class="drag-handle" name="drag_handle" v-if="item.type !== 'category'" />
      </v-list-item-icon>
      <v-icon v-if="item.type === 'category'" :name="item.icon" :class="`mr-4`" />
      <v-icon
        v-else
        :name="item.icon"
        :color="item.color || 'var(--primary)'"
        :class="`mr-4`"
        v-tooltip.bottom="item.status === 'active' ? 'Active' : 'Inactive'"
      />
      <div class="item-detail">
        <span ref="itemName" class="item-name">{{ item.name }}</span>
        <span v-if="item.description" class="item-note">{{ item.description }}</span>
      </div>

      <v-icon
        v-if="nestedFlows?.length"
        v-tooltip="isItemExpanded ? 'Collapse' : 'Expand'"
        :name="isItemExpanded ? 'unfold_less' : 'unfold_more'"
        clickable
        @click.stop.prevent="toggleCollapse"
      />
      <item-options v-if="item.type !== 'category'" :item="item" />
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
            @set-nested-sort="($event) => $emit('setNestedSort', $event, element.id)"
          />
        </template>
      </draggable>
    </transition-expand>
  </div>
</template>

<script lang="ts">
import { PropType, defineComponent, toRefs, computed } from "vue";
import { IFlow, IFolder } from "../types";
import Draggable from "vuedraggable";
import { useRouter } from "vue-router";
import { useLocalStorage } from "../composables/use-local-storage";
import itemOptions from "./item-options.vue";

export default defineComponent({
  components: {
    Draggable,
    itemOptions,
  },
  props: {
    item: {
      type: Object as PropType<IFlow & IFolder>,
      required: true,
    },
    items: {
      type: Array as PropType<IFlow[]>,
      required: true,
    },
  },
  emits: ["setNestedSort"],
  setup(props, { emit }) {
    const router = useRouter();
    const { item, items } = toRefs(props);
    const nestedFlows = computed(() =>
      props.items
        .filter((flow) => flow.flow_manager_category === props.item.id)
        .sort((a, b) => (a.flow_manager_order || 0) - (b.flow_manager_order || 0))
    );
    const { data: isItemExpanded } = useLocalStorage<boolean>(`settings-collapsed-flow-manager-${props.item.id}`, true);
    return {
      item,
      items,
      nestedFlows,
      isItemExpanded,
      toggleCollapse,
      onGroupSortChange,
      goToFlow,
    };

    function toggleCollapse() {
      isItemExpanded.value = !isItemExpanded.value;
    }

    function onGroupSortChange(updates: IFlow[]) {
      emit("setNestedSort", updates, item.value.id);
    }

    function goToFlow(item: IFlow & IFolder) {
      if (item.type === "category") return;
      router.push(`/settings/flows/${item.id}`);
    }
  },
});
</script>

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
  margin-left: 16px;
  overflow: hidden;
  color: var(--foreground-subdued);
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity var(--fast) var(--transition);
}

.v-list-item:hover .item-note {
  opacity: 1;
}

.hidden .item-name {
  color: var(--foreground-subdued);
}
</style>

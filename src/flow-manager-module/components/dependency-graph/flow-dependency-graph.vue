<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { MarkerType, Position, VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core';
import { Background, BackgroundVariant } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

import type { IFlow, IFolder } from '../../../types';
import {
  buildFlowDependencyGraph,
  getFlowImpact,
  type DependencyEdge,
  type DependencyGraphNode,
  type FlowImpactSummary,
} from '../../../utils/flow-dependency.util';
import FlowNode from './flow-node.vue';
import CollectionNode from './collection-node.vue';

const props = withDefaults(
  defineProps<{
    flows: IFlow[];
    flowCategories?: IFolder[];
    flowChildMap?: Record<string, (IFlow | IFolder)[]>;
    parentId?: string | null;
    selectedFlowId?: string | null;
  }>(),
  {
    flowCategories: () => [],
    flowChildMap: () => ({}),
    parentId: null,
    selectedFlowId: null,
  },
);

const emit = defineEmits<{
  (e: 'selectFlow', flow: IFlow): void;
  (e: 'goToFlow', payload: { item: IFlow }): void;
  (e: 'simulateFlow', flow: IFlow): void;
}>();

const { fitView } = useVueFlow();

// Compute flows that have children (act as parent folders)
const flowsWithChildren = computed<IFlow[]>(() => {
  const parentIdSet = new Set<string>();

  if (props.flowChildMap && Object.keys(props.flowChildMap).length > 0) {
    for (const [parentId, children] of Object.entries(props.flowChildMap)) {
      if (children && children.length > 0) {
        parentIdSet.add(parentId);
      }
    }
  }

  for (const flow of props.flows) {
    const parentId = flow.flow_manager_metadata_id?.flow_manager_category;
    if (parentId) {
      parentIdSet.add(parentId);
    }
  }
  for (const cat of props.flowCategories || []) {
    const parentId = cat.flow_manager_metadata_id?.flow_manager_category;
    if (parentId) {
      parentIdSet.add(parentId);
    }
  }

  return props.flows
    .filter((flow) => parentIdSet.has(flow.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
});

function getChildrenCount(flowId: string): number {
  if (props.flowChildMap && props.flowChildMap[flowId]) {
    return props.flowChildMap[flowId]!.length;
  }
  let count = 0;
  for (const f of props.flows) {
    if (f.flow_manager_metadata_id?.flow_manager_category === flowId) {
      count++;
    }
  }
  for (const c of props.flowCategories || []) {
    if (c.flow_manager_metadata_id?.flow_manager_category === flowId) {
      count++;
    }
  }
  return count;
}

// Single flows without children
const individualFlows = computed<IFlow[]>(() => {
  const parentIdSet = new Set(flowsWithChildren.value.map((f) => f.id));
  return props.flows
    .filter((flow) => !parentIdSet.has(flow.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
});

// Graph Controls State
const searchQuery = ref('');
const statusFilter = ref<'all' | 'active' | 'inactive'>('all');
const categoryFilter = ref<string>('all');
const includeCollections = ref(true);
const onlyConnected = ref(false);
const layoutDirection = ref<'LR' | 'TB'>('LR');
const activeSelectedNodeId = ref<string | null>(
  props.selectedFlowId ? `flow:${props.selectedFlowId}` : null,
);
const showCycleOnly = ref(false);

let isInternalSelection = false;

watch(
  () => props.parentId,
  (newParentId) => {
    if (newParentId && newParentId !== '__archive__') {
      categoryFilter.value = newParentId;
    } else if (!newParentId) {
      categoryFilter.value = 'all';
    }
  },
  { immediate: true },
);

watch(
  () => props.selectedFlowId,
  (newId) => {
    if (newId) {
      activeSelectedNodeId.value = `flow:${newId}`;
      if (!isInternalSelection && !props.parentId) {
        categoryFilter.value = newId;
      }
    }
  },
  { immediate: true },
);

watch(categoryFilter, () => {
  nextTick(() => {
    fitView({ padding: 0.2 });
  });
});

// Compute base dependency graph data
const graphData = computed(() => {
  return buildFlowDependencyGraph(props.flows, {
    includeCollections: includeCollections.value,
    filterStatus: statusFilter.value,
    filterCategory: categoryFilter.value,
    searchQuery: searchQuery.value,
    onlyConnected: onlyConnected.value,
    direction: layoutDirection.value,
    flowCategories: props.flowCategories,
  });
});

// Selected flow impact analysis
const selectedImpact = computed<FlowImpactSummary | null>(() => {
  if (!activeSelectedNodeId.value || !activeSelectedNodeId.value.startsWith('flow:')) {
    return null;
  }
  const flowId = activeSelectedNodeId.value.replace('flow:', '');
  return getFlowImpact(flowId, graphData.value, props.flows);
});

// Compute highlighted nodes & edges based on selection or cycle filter
const highlightedState = computed(() => {
  const activeId = activeSelectedNodeId.value;
  const cycleOnly = showCycleOnly.value;

  if (cycleOnly) {
    const cycleNodes = graphData.value.cycleNodeIds;
    return {
      activeNodeIds: cycleNodes,
      activeEdgeIds: new Set(graphData.value.edges.filter((e) => e.isCycle).map((e) => e.id)),
    };
  }

  if (!activeId) {
    return null;
  }

  const activeNodeIds = new Set<string>([activeId]);
  const activeEdgeIds = new Set<string>();

  for (const edge of graphData.value.edges) {
    if (edge.source === activeId || edge.target === activeId) {
      activeNodeIds.add(edge.source);
      activeNodeIds.add(edge.target);
      activeEdgeIds.add(edge.id);
    }
  }

  return { activeNodeIds, activeEdgeIds };
});

// Format nodes for @vue-flow
const vueFlowNodes = computed<Node[]>(() => {
  const highlight = highlightedState.value;

  return graphData.value.nodes.map((node: DependencyGraphNode) => {
    const isSelected = activeSelectedNodeId.value === node.id;
    const isDimmed = highlight !== null && !highlight.activeNodeIds.has(node.id);

    return {
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      selected: isSelected,
      style: {
        opacity: isDimmed ? '0.25' : '1',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      },
    };
  });
});

// Format edges for @vue-flow
const vueFlowEdges = computed<Edge[]>(() => {
  const highlight = highlightedState.value;
  const activeId = activeSelectedNodeId.value;

  return graphData.value.edges.map((edge: DependencyEdge) => {
    const isDimmed = highlight !== null && !highlight.activeEdgeIds.has(edge.id);
    const isDownstream = activeId && edge.source === activeId;
    const isUpstream = activeId && edge.target === activeId;

    let strokeColor = 'var(--theme--border-color, #94a3b8)';
    let strokeWidth = 1.5;
    let animated = false;

    if (edge.isCycle) {
      strokeColor = 'var(--theme--danger, #ef4444)';
      strokeWidth = 2.5;
      animated = true;
    } else if (isDownstream) {
      strokeColor = 'var(--theme--warning, #f59e0b)';
      strokeWidth = 2.5;
      animated = true;
    } else if (isUpstream) {
      strokeColor = 'var(--theme--primary, #6366f1)';
      strokeWidth = 2.5;
      animated = true;
    } else if (edge.type === 'collection-to-flow') {
      strokeColor = 'var(--theme--success, #10b981)';
    }

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated,
      style: {
        stroke: strokeColor,
        strokeWidth,
        opacity: isDimmed ? 0.2 : 1,
        transition: 'all 0.2s ease',
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
        width: 16,
        height: 16,
      },
      labelStyle: {
        fill: 'var(--theme--foreground-subdued, #64748b)',
        fontWeight: 600,
        fontSize: 10,
      },
      labelBgStyle: {
        fill: 'var(--theme--background-normal, #f8fafc)',
        stroke: strokeColor,
        strokeWidth: 1,
        rx: 4,
        ry: 4,
      },
      labelBgPadding: [4, 2] as [number, number],
    };
  });
});

function onNodeClick(event: { node: Node }) {
  isInternalSelection = true;
  activeSelectedNodeId.value = event.node.id;
  showCycleOnly.value = false;

  if (event.node.type === 'flowNode') {
    const flowId = event.node.id.replace('flow:', '');
    const flow = props.flows.find((f) => f.id === flowId);
    if (flow) {
      emit('selectFlow', flow);
    }
  }
  setTimeout(() => {
    isInternalSelection = false;
  }, 100);
}

function onPaneClick() {
  activeSelectedNodeId.value = null;
  showCycleOnly.value = false;
}

function handleNavigate(flowId: string) {
  const flow = props.flows.find((f) => f.id === flowId);
  if (flow) {
    emit('goToFlow', { item: flow });
  }
}

function handleSimulate(flowId: string) {
  const flow = props.flows.find((f) => f.id === flowId);
  if (flow) {
    emit('simulateFlow', flow);
  }
}

function toggleDirection() {
  layoutDirection.value = layoutDirection.value === 'LR' ? 'TB' : 'LR';
  nextTick(() => {
    fitView({ padding: 0.2 });
  });
}

function toggleCycleFilter() {
  showCycleOnly.value = !showCycleOnly.value;
  activeSelectedNodeId.value = null;
  nextTick(() => {
    fitView({ padding: 0.2 });
  });
}

function resetView() {
  searchQuery.value = '';
  statusFilter.value = 'all';
  categoryFilter.value = 'all';
  onlyConnected.value = false;
  activeSelectedNodeId.value = null;
  showCycleOnly.value = false;
  nextTick(() => {
    fitView({ padding: 0.2 });
  });
}
</script>

<template>
  <div class="flow-dependency-container">
    <!-- Top Toolbar -->
    <div class="graph-toolbar">
      <div class="toolbar-left">
        <!-- Search Field -->
        <div class="toolbar-search">
          <v-icon name="search" small class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search flow or collection..."
            class="search-input"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="clear-search-btn"
            @click="searchQuery = ''"
          >
            <v-icon name="close" x-small />
          </button>
        </div>

        <!-- Category Dropdown -->
        <select v-model="categoryFilter" class="toolbar-select">
          <option value="all">All Categories</option>

          <optgroup v-if="flowCategories.length" label="Folders / Categories">
            <option v-for="cat in flowCategories" :key="cat.id" :value="cat.id">
              📁 {{ cat.name }}
            </option>
          </optgroup>

          <optgroup v-if="flowsWithChildren.length" label="Flows with Children">
            <option v-for="flow in flowsWithChildren" :key="flow.id" :value="flow.id">
              ⚡ {{ flow.name }} ({{ getChildrenCount(flow.id) }})
            </option>
          </optgroup>

          <optgroup v-if="individualFlows.length" label="Individual Flows">
            <option v-for="flow in individualFlows" :key="flow.id" :value="flow.id">
              🔗 {{ flow.name }}
            </option>
          </optgroup>
        </select>

        <!-- Status Filter -->
        <div class="status-button-group">
          <button
            type="button"
            class="status-btn"
            :class="{ active: statusFilter === 'all' }"
            @click="statusFilter = 'all'"
          >
            All
          </button>
          <button
            type="button"
            class="status-btn"
            :class="{ active: statusFilter === 'active' }"
            @click="statusFilter = 'active'"
          >
            Active
          </button>
          <button
            type="button"
            class="status-btn"
            :class="{ active: statusFilter === 'inactive' }"
            @click="statusFilter = 'inactive'"
          >
            Inactive
          </button>
        </div>
      </div>

      <div class="toolbar-right">
        <!-- Collection Nodes Toggle -->
        <label class="toolbar-toggle" title="Show intermediate database collection nodes">
          <input v-model="includeCollections" type="checkbox" />
          <span>Collections</span>
        </label>

        <!-- Connected Only Toggle -->
        <label
          class="toolbar-toggle"
          title="Hide flows that have no incoming or outgoing dependencies"
        >
          <input v-model="onlyConnected" type="checkbox" />
          <span>Only Connected</span>
        </label>

        <!-- Layout Direction Toggle -->
        <button
          type="button"
          class="icon-action-btn"
          :title="`Switch layout to ${layoutDirection === 'LR' ? 'Top-to-Bottom' : 'Left-to-Right'}`"
          @click="toggleDirection"
        >
          <v-icon :name="layoutDirection === 'LR' ? 'swap_horiz' : 'swap_vert'" small />
          <span>{{ layoutDirection }}</span>
        </button>

        <!-- Fit View Button -->
        <button
          type="button"
          class="icon-action-btn"
          title="Fit view to canvas"
          @click="fitView({ padding: 0.2 })"
        >
          <v-icon name="filter_center_focus" small />
        </button>

        <!-- Reset Button -->
        <button type="button" class="icon-action-btn" title="Reset filters" @click="resetView">
          <v-icon name="refresh" small />
        </button>
      </div>
    </div>

    <!-- Cycle Alert Banner (if cycles exist) -->
    <div v-if="graphData.stats.cycleCount > 0" class="cycle-banner">
      <div class="cycle-banner-content">
        <v-icon name="warning" small class="cycle-banner-icon" />
        <span class="cycle-banner-text">
          <strong>{{ graphData.stats.cycleCount }} Circular Loop(s) Detected:</strong>
          These flows trigger mutations that form a feedback loop.
        </span>
      </div>
      <button
        type="button"
        class="cycle-banner-btn"
        :class="{ 'is-active': showCycleOnly }"
        @click="toggleCycleFilter"
      >
        {{ showCycleOnly ? 'Show All Flows' : 'Highlight Cycles' }}
      </button>
    </div>

    <!-- Main Canvas -->
    <div class="graph-canvas-wrapper">
      <VueFlow
        :nodes="vueFlowNodes"
        :edges="vueFlowEdges"
        :fit-view-on-init="true"
        :min-zoom="0.2"
        :max-zoom="2.5"
        class="custom-vue-flow"
        @node-click="onNodeClick"
        @pane-click="onPaneClick"
      >
        <template #node-flowNode="nodeProps">
          <FlowNode
            v-bind="nodeProps"
            :target-position="layoutDirection === 'LR' ? Position.Left : Position.Top"
            :source-position="layoutDirection === 'LR' ? Position.Right : Position.Bottom"
            @navigate="handleNavigate"
          />
        </template>

        <template #node-collectionNode="nodeProps">
          <CollectionNode
            v-bind="nodeProps"
            :target-position="layoutDirection === 'LR' ? Position.Left : Position.Top"
            :source-position="layoutDirection === 'LR' ? Position.Right : Position.Bottom"
          />
        </template>

        <Background :variant="BackgroundVariant.Dots" :gap="18" :size="1.2" color="#94a3b8" />
        <Controls position="bottom-left" />
      </VueFlow>

      <!-- Stats Bar (Bottom Center) -->
      <div class="graph-stats-bar">
        <span class="stat-item">
          <strong>{{ graphData.stats.totalFlows }}</strong> Flows
        </span>
        <span v-if="includeCollections" class="stat-item">
          <strong>{{ graphData.stats.totalCollections }}</strong> Collections
        </span>
        <span class="stat-item">
          <strong>{{ graphData.stats.totalEdges }}</strong> Links
        </span>
        <span v-if="graphData.stats.cycleCount > 0" class="stat-item danger">
          <strong>{{ graphData.stats.cycleCount }}</strong> Cycles
        </span>
        <span v-if="activeSelectedNodeId" class="clear-focus-link" @click="onPaneClick">
          Clear Focus
        </span>
      </div>

      <!-- Impact Radar Floating Drawer (When a flow is selected) -->
      <transition name="drawer-slide">
        <div v-if="selectedImpact" class="impact-radar-card">
          <div class="radar-header">
            <div class="radar-title-box">
              <span class="radar-eyebrow">FLOW DEPENDENCY RADAR</span>
              <h4 class="radar-title">{{ selectedImpact.flowName }}</h4>
            </div>

            <div class="radar-actions">
              <button
                type="button"
                class="simulate-flow-btn"
                title="Sandbox Simulation (Dry Run)"
                @click="handleSimulate(selectedImpact.flowId)"
              >
                <v-icon name="science" x-small />
                <span>Simulate</span>
              </button>
              <button
                type="button"
                class="open-flow-btn"
                title="Edit Flow in Directus"
                @click="handleNavigate(selectedImpact.flowId)"
              >
                <v-icon name="open_in_new" x-small />
                <span>Edit Flow</span>
              </button>
              <button
                type="button"
                class="close-radar-btn"
                title="Close"
                @click="activeSelectedNodeId = null"
              >
                <v-icon name="close" small />
              </button>
            </div>
          </div>

          <!-- Cycle Alert in Radar -->
          <div v-if="selectedImpact.isCycleParticipant" class="radar-cycle-warning">
            <v-icon name="warning" small class="warning-icon" />
            <div>
              <strong>Potential Infinite Loop Warning:</strong>
              <div>This flow is part of a circular execution loop.</div>
            </div>
          </div>

          <!-- Two-column Impact Grid -->
          <div class="radar-grid">
            <!-- Left: Upstream Dependencies -->
            <div class="radar-column">
              <div class="column-header upstream">
                <v-icon name="arrow_back" small />
                <span
                  >Triggered By ({{
                    selectedImpact.upstreamFlows.length + selectedImpact.upstreamCollections.length
                  }})</span
                >
              </div>

              <div class="column-list">
                <div
                  v-if="
                    selectedImpact.upstreamFlows.length === 0 &&
                    selectedImpact.upstreamCollections.length === 0
                  "
                  class="empty-column-msg"
                >
                  Root flow (no upstream flows or collections)
                </div>

                <div
                  v-for="item in selectedImpact.upstreamFlows"
                  :key="item.id"
                  class="radar-item flow-item"
                  @click="activeSelectedNodeId = `flow:${item.id}`"
                >
                  <v-icon name="bolt" x-small class="item-icon" />
                  <div class="item-content">
                    <span class="item-name">{{ item.name }}</span>
                    <span class="item-via">{{ item.via }}</span>
                  </div>
                </div>

                <div
                  v-for="col in selectedImpact.upstreamCollections"
                  :key="col"
                  class="radar-item col-item"
                >
                  <v-icon name="folder" x-small class="item-icon" />
                  <div class="item-content">
                    <span class="item-name">{{ col }}</span>
                    <span class="item-via">Listens to events</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right: Downstream Impact / Blast Radius -->
            <div class="radar-column">
              <div class="column-header downstream">
                <v-icon name="arrow_forward" small />
                <span
                  >Triggers ({{
                    selectedImpact.downstreamFlows.length +
                    selectedImpact.downstreamCollections.length
                  }})</span
                >
              </div>

              <div class="column-list">
                <div
                  v-if="
                    selectedImpact.downstreamFlows.length === 0 &&
                    selectedImpact.downstreamCollections.length === 0
                  "
                  class="empty-column-msg"
                >
                  Leaf flow (does not trigger any other flows)
                </div>

                <div
                  v-for="item in selectedImpact.downstreamFlows"
                  :key="item.id"
                  class="radar-item flow-item"
                  @click="activeSelectedNodeId = `flow:${item.id}`"
                >
                  <v-icon name="bolt" x-small class="item-icon" />
                  <div class="item-content">
                    <span class="item-name">{{ item.name }}</span>
                    <span class="item-via">{{ item.via }}</span>
                  </div>
                </div>

                <div
                  v-for="col in selectedImpact.downstreamCollections"
                  :key="col"
                  class="radar-item col-item"
                >
                  <v-icon name="folder" x-small class="item-icon" />
                  <div class="item-content">
                    <span class="item-name">{{ col }}</span>
                    <span class="item-via">Writes / Mutates</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.flow-dependency-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
  background-color: var(--theme--background-normal, #f8fafc);
  overflow: hidden;
}

.graph-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background-color: var(--theme--card--background, #ffffff);
  border-bottom: 1px solid var(--theme--border-color, #e2e8f0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  z-index: 10;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-search {
  position: relative;
  display: flex;
  align-items: center;
  width: 220px;
  height: 32px;
  background-color: var(--theme--form--field--input--background, #f1f5f9);
  border: 1px solid var(--theme--border-color, #cbd5e1);
  border-radius: var(--theme--border-radius, 6px);
  padding: 0 8px;

  .search-icon {
    color: var(--theme--foreground-subdued, #94a3b8);
    margin-right: 6px;
  }

  .search-input {
    width: 100%;
    border: none;
    background: transparent;
    outline: none;
    font-size: 12px;
    color: var(--theme--foreground, #0f172a);

    &::placeholder {
      color: var(--theme--foreground-subdued, #94a3b8);
    }
  }

  .clear-search-btn {
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--theme--foreground-subdued, #94a3b8);
    padding: 2px;
    display: flex;

    &:hover {
      color: var(--theme--foreground, #0f172a);
    }
  }
}

.toolbar-select {
  height: 32px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--theme--border-radius, 6px);
  border: 1px solid var(--theme--border-color, #cbd5e1);
  background-color: var(--theme--form--field--input--background, #f1f5f9);
  color: var(--theme--foreground, #0f172a);
  outline: none;
  cursor: pointer;
}

.status-button-group {
  display: inline-flex;
  border-radius: var(--theme--border-radius, 6px);
  background-color: var(--theme--form--field--input--background, #f1f5f9);
  border: 1px solid var(--theme--border-color, #cbd5e1);
  padding: 2px;
  gap: 2px;

  .status-btn {
    border: none;
    background: transparent;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 500;
    border-radius: 4px;
    color: var(--theme--foreground-subdued, #64748b);
    cursor: pointer;
    transition: all 0.15s ease;

    &.active {
      background-color: var(--theme--card--background, #ffffff);
      color: var(--theme--primary, #6366f1);
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    }
  }
}

.toolbar-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  color: var(--theme--foreground-subdued, #64748b);
  cursor: pointer;
  user-select: none;

  input[type='checkbox'] {
    cursor: pointer;
    accent-color: var(--theme--primary, #6366f1);
  }
}

.icon-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 8px;
  border-radius: var(--theme--border-radius, 6px);
  border: 1px solid var(--theme--border-color, #cbd5e1);
  background-color: var(--theme--card--background, #ffffff);
  color: var(--theme--foreground-subdued, #64748b);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background-color: var(--theme--background-normal, #f1f5f9);
    color: var(--theme--primary, #6366f1);
    border-color: var(--theme--primary, #6366f1);
  }
}

.cycle-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background-color: #fef2f2;
  border-bottom: 1px solid #fecaca;
  color: var(--theme--danger, #991b1b);
  z-index: 9;
}

.cycle-banner-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cycle-banner-icon {
  color: var(--theme--danger, #ef4444);
}

.cycle-banner-text {
  font-size: 12px;
  color: #7f1d1d;
}

.cycle-banner-btn {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #f87171;
  background-color: #fee2e2;
  color: #991b1b;
  cursor: pointer;

  &:hover,
  &.is-active {
    background-color: #ef4444;
    color: #ffffff;
  }
}

.graph-canvas-wrapper {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
}

.custom-vue-flow {
  width: 100%;
  height: 100%;
}

.graph-stats-bar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: var(--theme--card--background, rgba(255, 255, 255, 0.94));
  backdrop-filter: blur(8px);
  border: 1px solid var(--theme--border-color, #e2e8f0);
  border-radius: 20px;
  padding: 4px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  z-index: 5;
  pointer-events: auto;
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);

  .stat-item {
    strong {
      color: var(--theme--foreground, #0f172a);
    }

    &.danger {
      color: var(--theme--danger, #ef4444);
      strong {
        color: var(--theme--danger, #ef4444);
      }
    }
  }

  .clear-focus-link {
    cursor: pointer;
    color: var(--theme--primary, #6366f1);
    font-weight: 600;
    text-decoration: underline;
    margin-left: 4px;
  }
}

/* Radar Floating Drawer */
.impact-radar-card {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: 400px;
  background-color: var(--theme--card--background, #ffffff);
  border: 1px solid var(--theme--border-color, #cbd5e1);
  border-radius: var(--theme--border-radius, 10px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  z-index: 20;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.radar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--theme--border-color, #e2e8f0);
  background-color: var(--theme--background-subdued, #f8fafc);
}

.radar-eyebrow {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--theme--primary, #6366f1);
  display: block;
}

.radar-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--theme--foreground, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.radar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.simulate-flow-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--theme--primary, #6366f1);
  background-color: var(--theme--primary-background, rgba(99, 102, 241, 0.1));
  color: var(--theme--primary, #6366f1);
  cursor: pointer;

  &:hover {
    background-color: var(--theme--primary, #6366f1);
    color: #ffffff;
  }
}

.open-flow-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid var(--theme--primary, #6366f1);
  background-color: transparent;
  color: var(--theme--primary, #6366f1);
  cursor: pointer;

  &:hover {
    background-color: var(--theme--primary, #6366f1);
    color: #ffffff;
  }
}

.close-radar-btn {
  border: none;
  background: transparent;
  color: var(--theme--foreground-subdued, #94a3b8);
  cursor: pointer;
  display: flex;
  padding: 2px;

  &:hover {
    color: var(--theme--foreground, #0f172a);
  }
}

.radar-cycle-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background-color: #fee2e2;
  border-bottom: 1px solid #fecaca;
  color: #991b1b;
  font-size: 11px;

  .warning-icon {
    color: #ef4444;
    margin-top: 1px;
    flex-shrink: 0;
  }
}

.radar-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
  flex: 1;
}

.radar-column {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.column-header {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  padding-bottom: 4px;
  border-bottom: 2px solid;

  &.upstream {
    color: var(--theme--primary, #6366f1);
    border-color: var(--theme--primary, #6366f1);
  }

  &.downstream {
    color: var(--theme--warning, #f59e0b);
    border-color: var(--theme--warning, #f59e0b);
  }
}

.column-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.empty-column-msg {
  font-size: 11px;
  font-style: italic;
  color: var(--theme--foreground-subdued, #94a3b8);
  padding: 6px 0;
}

.radar-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 4px;
  background-color: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background-color: var(--theme--background-normal, #f1f5f9);
    border-color: var(--theme--primary, #6366f1);
  }

  .item-icon {
    margin-top: 2px;
    flex-shrink: 0;
  }

  &.flow-item .item-icon {
    color: var(--theme--primary, #6366f1);
  }

  &.col-item .item-icon {
    color: var(--theme--warning, #f59e0b);
  }
}

.item-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.item-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--theme--foreground, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-via {
  font-size: 9px;
  color: var(--theme--foreground-subdued, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.97);
}
</style>

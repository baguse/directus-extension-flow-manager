<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { DependencyNodeData } from '../../../utils/flow-dependency.util';

const props = withDefaults(
  defineProps<{
    id: string;
    data: DependencyNodeData;
    selected?: boolean;
    targetPosition?: Position;
    sourcePosition?: Position;
  }>(),
  {
    selected: false,
    targetPosition: Position.Left,
    sourcePosition: Position.Right,
  },
);

const emit = defineEmits<{
  (e: 'navigate', flowId: string): void;
}>();

const flow = computed(() => props.data.flow);
const isActive = computed(() => props.data.status === 'active');

const triggerIcon = computed(() => {
  switch (props.data.triggerType) {
    case 'event':
      return 'bolt';
    case 'webhook':
      return 'webhook';
    case 'schedule':
      return 'schedule';
    case 'operation':
      return 'call_split';
    case 'manual':
      return 'touch_app';
    default:
      return 'play_circle';
  }
});

const triggerLabel = computed(() => {
  if (props.data.triggerType === 'event') {
    const cols = props.data.flow?.options?.collections;
    if (Array.isArray(cols) && cols.length > 0) {
      return `Event (${cols.join(', ')})`;
    }
    return 'Event';
  }
  return props.data.triggerType ? props.data.triggerType.toUpperCase() : 'FLOW';
});

function onDoubleClick(e: MouseEvent) {
  e.stopPropagation();
  if (flow.value?.id) {
    emit('navigate', flow.value.id);
  }
}
</script>

<template>
  <div
    class="flow-graph-node"
    :class="{
      'is-selected': selected,
      'is-active': isActive,
      'is-inactive': !isActive,
      'is-cycle': data.isCycleParticipant,
    }"
    @dblclick="onDoubleClick"
  >
    <Handle type="target" :position="targetPosition" class="custom-node-handle target-handle" />

    <div class="node-content">
      <!-- Icon & Header Info -->
      <div class="node-header">
        <div
          class="node-icon-wrapper"
          :style="{
            backgroundColor: data.color ? `${data.color}22` : 'rgba(99, 102, 241, 0.12)',
            color: data.color || 'var(--theme--primary, #6366f1)',
          }"
        >
          <v-icon :name="data.icon || 'bolt'" small />
        </div>

        <div class="node-title-box">
          <div class="node-title" :title="data.label">{{ data.label }}</div>
          <div v-if="data.categoryName" class="node-category" :title="data.categoryName">
            <v-icon name="folder" x-small class="category-icon" />
            <span>{{ data.categoryName }}</span>
          </div>
        </div>

        <div
          class="status-indicator"
          :class="isActive ? 'status-active' : 'status-inactive'"
          :title="isActive ? 'Flow is active' : 'Flow is inactive'"
        />
      </div>

      <!-- Badges Row -->
      <div class="node-badges">
        <span class="trigger-badge" :title="triggerLabel">
          <v-icon :name="triggerIcon" x-small class="badge-icon" />
          <span class="badge-text">{{ triggerLabel }}</span>
        </span>

        <span
          v-if="data.operationsCount !== undefined && data.operationsCount > 0"
          class="ops-badge"
          :title="`${data.operationsCount} operation(s)`"
        >
          {{ data.operationsCount }} ops
        </span>

        <span
          v-if="data.isCycleParticipant"
          class="cycle-warning-badge"
          title="⚠️ Part of a circular dependency loop"
        >
          <v-icon name="warning" x-small class="warn-icon" />
          <span>Loop</span>
        </span>
      </div>

      <!-- Connection Counters -->
      <div class="node-footer">
        <span
          v-if="data.upstreamCount > 0"
          class="metric-pill upstream"
          :title="`Triggered by ${data.upstreamCount} node(s)`"
        >
          <v-icon name="arrow_back" x-small />
          <span>{{ data.upstreamCount }} in</span>
        </span>

        <span
          v-if="data.downstreamCount > 0"
          class="metric-pill downstream"
          :title="`Triggers ${data.downstreamCount} node(s)`"
        >
          <v-icon name="arrow_forward" x-small />
          <span>{{ data.downstreamCount }} out</span>
        </span>
      </div>
    </div>

    <Handle type="source" :position="sourcePosition" class="custom-node-handle source-handle" />
  </div>
</template>

<style lang="scss" scoped>
.flow-graph-node {
  box-sizing: border-box;
  width: 260px;
  min-height: 88px;
  border-radius: var(--theme--border-radius, 8px);
  background-color: var(--theme--card--background, var(--theme--background-subdued, #ffffff));
  border: 1px solid var(--theme--border-color, #e2e8f0);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  padding: 10px 12px;
  transition: all 0.2s ease-in-out;
  cursor: pointer;
  user-select: none;

  &:hover {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
    border-color: var(--theme--primary, #6366f1);
  }

  &.is-selected {
    border-color: var(--theme--primary, #6366f1);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
  }

  &.is-inactive {
    opacity: 0.72;
    border-style: dashed;
  }

  &.is-cycle {
    border-color: var(--theme--danger, #ef4444);
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
  }
}

.node-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  flex-shrink: 0;
}

.node-title-box {
  flex: 1;
  min-width: 0;
}

.node-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme--foreground, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.node-category {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--theme--foreground-subdued, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
  margin-top: 2px;

  .category-icon {
    font-size: 11px;
    flex-shrink: 0;
  }
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &.status-active {
    background-color: var(--theme--success, #10b981);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
  }

  &.status-inactive {
    background-color: var(--theme--foreground-subdued, #94a3b8);
  }
}

.node-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.trigger-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  background-color: var(--theme--background-normal, #f1f5f9);
  color: var(--theme--foreground-subdued, #475569);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  .badge-icon {
    font-size: 11px;
    flex-shrink: 0;
  }

  .badge-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ops-badge {
  display: inline-block;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 10px;
  background-color: var(--theme--background-accent, rgba(0, 0, 0, 0.04));
  color: var(--theme--foreground-subdued, #64748b);
}

.cycle-warning-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  background-color: rgba(239, 68, 68, 0.12);
  color: var(--theme--danger, #ef4444);

  .warn-icon {
    font-size: 11px;
  }
}

.node-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.metric-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--theme--foreground-subdued, #64748b);
  background-color: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);

  &.upstream {
    color: var(--theme--primary, #6366f1);
  }

  &.downstream {
    color: var(--theme--warning, #f59e0b);
  }
}

:deep(.custom-node-handle) {
  width: 10px;
  height: 10px;
  background-color: var(--theme--primary, #6366f1);
  border: 2px solid var(--theme--card--background, #ffffff);
  border-radius: 50%;
  transition: transform 0.15s ease;

  &:hover {
    transform: scale(1.3);
  }
}
</style>

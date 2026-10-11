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

const isSystem = computed(() => {
  return props.data.collectionName?.startsWith('directus_') ?? false;
});

const writersCount = computed(() => props.data.writers?.length || 0);
const listenersCount = computed(() => props.data.listeners?.length || 0);
</script>

<template>
  <div
    class="collection-graph-node"
    :class="{
      'is-selected': selected,
      'is-system': isSystem,
      'is-cycle': data.isCycleParticipant,
    }"
  >
    <Handle
      type="target"
      :position="targetPosition"
      class="custom-collection-handle target-handle"
    />

    <div class="collection-content">
      <div class="collection-header">
        <div class="collection-icon">
          <v-icon :name="isSystem ? 'settings' : 'folder'" small />
        </div>

        <div class="collection-info">
          <div class="collection-name" :title="data.collectionName">
            {{ data.collectionName }}
          </div>
          <div class="collection-meta">
            <span
              v-if="writersCount > 0"
              class="meta-item writers"
              :title="`${writersCount} flow(s) write to this collection`"
            >
              <v-icon name="edit" x-small />
              {{ writersCount }} write
            </span>
            <span
              v-if="listenersCount > 0"
              class="meta-item listeners"
              :title="`${listenersCount} flow(s) listen to events`"
            >
              <v-icon name="bolt" x-small />
              {{ listenersCount }} listen
            </span>
          </div>
        </div>

        <span
          v-if="data.isCycleParticipant"
          class="collection-cycle-badge"
          title="⚠️ Part of a circular dependency loop"
        >
          <v-icon name="warning" x-small />
        </span>
      </div>
    </div>

    <Handle
      type="source"
      :position="sourcePosition"
      class="custom-collection-handle source-handle"
    />
  </div>
</template>

<style lang="scss" scoped>
.collection-graph-node {
  box-sizing: border-box;
  width: 200px;
  min-height: 56px;
  border-radius: var(--theme--border-radius, 6px);
  background-color: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color, #cbd5e1);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
  padding: 8px 10px;
  transition: all 0.2s ease-in-out;
  cursor: pointer;
  user-select: none;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    border-color: var(--theme--warning, #f59e0b);
  }

  &.is-selected {
    border-color: var(--theme--warning, #f59e0b);
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25);
  }

  &.is-cycle {
    border-color: var(--theme--danger, #ef4444);
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
  }
}

.collection-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collection-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  background-color: rgba(245, 158, 11, 0.14);
  color: var(--theme--warning, #d97706);
  flex-shrink: 0;
}

.is-system .collection-icon {
  background-color: rgba(100, 116, 139, 0.12);
  color: var(--theme--foreground-subdued, #64748b);
}

.collection-info {
  flex: 1;
  min-width: 0;
}

.collection-name {
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
  color: var(--theme--foreground, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.collection-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 9px;
  font-weight: 500;
  color: var(--theme--foreground-subdued, #64748b);

  &.writers {
    color: var(--theme--primary, #6366f1);
  }

  &.listeners {
    color: var(--theme--success, #10b981);
  }
}

.collection-cycle-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--theme--danger, #ef4444);
  flex-shrink: 0;
}

:deep(.custom-collection-handle) {
  width: 9px;
  height: 9px;
  background-color: var(--theme--warning, #f59e0b);
  border: 2px solid var(--theme--card--background, #ffffff);
  border-radius: 50%;
  transition: transform 0.15s ease;

  &:hover {
    transform: scale(1.3);
  }
}
</style>

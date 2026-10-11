<template>
  <v-list-item-icon class="item-icon-wrap">
    <v-icon
      :name="resolvedIcon"
      :color="resolvedColor"
      :style="{ color: resolvedColor }"
      class="item-icon"
    />
  </v-list-item-icon>
  <v-list-item-content class="item-content-wrap">
    <div class="item-row">
      <div class="item-name-section">
        <span
          v-if="type !== 'category'"
          class="status-indicator-dot"
          :class="status === 'active' ? 'active' : 'inactive'"
          :title="status === 'active' ? 'Active' : 'Inactive'"
        />
        <v-text-overflow
          class="item-title"
          :class="{ 'is-inactive': status !== 'active' && type !== 'category' }"
          :text="name"
          :highlight="search"
        />
      </div>

      <div class="item-meta-section">
        <span
          v-if="type !== 'category' && triggerBadge"
          class="trigger-chip"
          :class="{ 'is-inactive': status !== 'active' }"
        >
          {{ triggerBadge }}
        </span>
        <span
          v-if="childCount !== undefined && childCount > 0"
          class="child-count-chip"
          :title="`${childCount} ${childCount === 1 ? 'child' : 'children'}`"
        >
          {{ childCount }}
        </span>
      </div>
    </div>
  </v-list-item-content>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    name: string;
    search?: string;
    icon?: string | null;
    color?: string | null;
    type?: string;
    triggerType?: string;
    status?: string;
    childCount?: number;
  }>(),
  {
    icon: '',
    color: '',
  },
);

const resolvedIcon = computed(() => {
  const iconStr = props.icon ? String(props.icon).trim() : '';
  if (iconStr) return iconStr;
  if (props.type === 'category') return 'folder';
  return 'bolt';
});

const resolvedColor = computed(() => {
  const colorStr = props.color ? String(props.color).trim() : '';
  if (colorStr) return colorStr;
  return 'var(--theme--foreground, var(--theme--background-inverted, var(--background-inverted, #000000)))';
});

const triggerBadge = computed(() => {
  if (!props.triggerType) return '';
  return props.triggerType.toUpperCase();
});
</script>

<style lang="scss" scoped>
.item-icon-wrap {
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  flex-shrink: 0;

  .item-icon {
    font-size: 18px;
    flex-shrink: 0;
    color: var(--theme--foreground, var(--theme--background-inverted, currentColor));
  }
}

.item-content-wrap {
  min-width: 0;
  flex: 1;
}

.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.item-name-section {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.status-indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;

  &.active {
    background-color: var(--theme--success, #10b981);
    box-shadow: 0 0 4px var(--theme--success, #10b981);
  }

  &.inactive {
    background-color: var(--theme--foreground-subdued, #94a3b8);
    opacity: 0.5;
  }
}

.item-title {
  font-size: 13px;
  line-height: 1.3;
  color: var(--theme--foreground);

  &.is-inactive {
    color: var(--theme--foreground-subdued);
  }
}

.item-meta-section {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.trigger-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0 5px;
  border-radius: 4px;
  background-color: var(--theme--primary);
  color: var(--foreground-inverted, var(--theme--foreground-inverted, #ffffff));
  line-height: 1;
  flex-shrink: 0;

  &.is-inactive {
    opacity: 0.7;
  }
}

.child-count-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  min-width: 18px;
  font-size: 10px;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 9px;
  background-color: var(--theme--primary);
  color: var(--foreground-inverted, var(--theme--foreground-inverted, #ffffff));
  line-height: 1;
  flex-shrink: 0;
}
</style>

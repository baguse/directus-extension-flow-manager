<script setup lang="ts">
import type { Filter } from '@directus/types';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { cleanFilter } from '../../utils/filter.util';

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    collection: string;
    filter?: Filter | null;
    placeholder?: string;
  }>(),
  {
    filter: null,
    placeholder: 'Search flows...',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
  (e: 'update:filter', value: Filter | null): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const isFilterOpen = ref(false);
const isExpanded = ref(Boolean(props.modelValue));

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      isExpanded.value = true;
    }
  },
);

function onInput(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const val = target?.value ?? '';
  emit('update:modelValue', val.length > 0 ? val : null);
}

function expandAndFocus() {
  isExpanded.value = true;
  nextTick(() => {
    inputRef.value?.focus();
  });
}

function clearSearch() {
  emit('update:modelValue', null);
  if (inputRef.value) {
    inputRef.value.value = '';
    inputRef.value.focus();
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (props.modelValue) {
      clearSearch();
    } else {
      isExpanded.value = false;
      inputRef.value?.blur();
    }
  }
}

function onFilterChange(updatedFilter: Filter | null) {
  emit('update:filter', updatedFilter);
}

function clearFilter() {
  emit('update:filter', null);
}

function handleClickOutside(event: MouseEvent) {
  if (isFilterOpen.value) return;

  const target = event.target as HTMLElement | null;
  if (target?.closest?.('.v-menu-content')) return;

  const el = containerRef.value;
  if (!el || (target && el.contains(target))) return;

  if (!props.modelValue) {
    isExpanded.value = false;
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleClickOutside);
});

/**
 * Counts active rule expressions inside a Directus Filter structure.
 */
function countFilterRules(filterData: unknown): number {
  if (!filterData || typeof filterData !== 'object') return 0;

  let total = 0;
  for (const [key, val] of Object.entries(filterData as Record<string, unknown>)) {
    if ((key === '_and' || key === '_or') && Array.isArray(val)) {
      for (const item of val) {
        total += countFilterRules(item);
      }
    } else if (key.startsWith('_')) {
      total += 1;
    } else if (val && typeof val === 'object') {
      total += countFilterRules(val);
    }
  }
  return total;
}

const activeFilterCount = computed(() => countFilterRules(cleanFilter(props.filter)));
</script>

<template>
  <div
    ref="containerRef"
    class="custom-search-container"
    :class="{
      'is-expanded': isExpanded,
      'has-value': Boolean(modelValue),
      'has-active-filters': activeFilterCount > 0,
      'is-filter-open': isFilterOpen,
    }"
  >
    <div class="search-input-shell" :class="{ 'is-expanded': isExpanded }" @click="expandAndFocus">
      <button
        type="button"
        class="search-btn"
        :title="isExpanded ? '' : 'Search'"
        @click.stop="expandAndFocus"
      >
        <v-icon name="search" small class="btn-icon" />
      </button>

      <input
        ref="inputRef"
        type="text"
        class="search-input-field"
        :value="modelValue || ''"
        :placeholder="placeholder"
        @input="onInput"
        @keydown="onKeydown"
      />

      <button
        v-if="modelValue && isExpanded"
        type="button"
        class="clear-btn"
        title="Clear search"
        @click.stop="clearSearch"
      >
        <v-icon name="close" small class="btn-icon" />
      </button>

      <span v-if="isExpanded" class="action-divider" />

      <v-menu
        v-model="isFilterOpen"
        placement="bottom-end"
        show-arrow
        :close-on-content-click="false"
      >
        <template #activator="{ toggle }">
          <button
            type="button"
            class="filter-btn"
            :class="{ 'is-active': activeFilterCount > 0 || isFilterOpen }"
            :title="activeFilterCount > 0 ? `${activeFilterCount} active filter(s)` : 'Filter'"
            @click.stop="toggle"
          >
            <v-icon name="filter_list" small class="btn-icon" />
            <span v-if="activeFilterCount > 0" class="filter-count-badge">
              {{ activeFilterCount }}
            </span>
          </button>
        </template>

        <div class="filter-popover-panel">
          <div class="filter-popover-header">
            <div class="filter-popover-title">
              <v-icon name="filter_list" small class="header-icon" />
              <span>Filter Rules</span>
              <span v-if="activeFilterCount > 0" class="active-count-chip">
                {{ activeFilterCount }}
              </span>
            </div>

            <v-button v-if="activeFilterCount > 0" x-small secondary @click="clearFilter">
              Reset
            </v-button>
          </div>

          <div class="filter-popover-content">
            <interface-system-filter
              :value="filter"
              :collection-name="collection"
              @input="onFilterChange"
            />
          </div>
        </div>
      </v-menu>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.custom-search-container {
  display: inline-flex;
  align-items: center;
  position: relative;
  box-sizing: border-box;
}

.search-input-shell {
  display: inline-flex;
  align-items: center;
  height: 44px;
  width: 76px;
  min-width: 76px;
  box-sizing: border-box;
  padding: 0 4px;
  background-color: var(
    --theme--form--field--input--background,
    var(--theme--background-subdued, #f8fafc)
  );
  border: var(--theme--border-width, 1px) solid
    var(--theme--form--field--input--border-color, var(--theme--border-color, #e2e8f0));
  border-radius: 22px;
  cursor: pointer;
  transition:
    width var(--fast, 180ms) cubic-bezier(0.4, 0, 0.2, 1),
    border-color var(--fast, 150ms) ease,
    box-shadow var(--fast, 150ms) ease;

  &:hover {
    border-color: var(
      --theme--form--field--input--border-color-hover,
      var(--theme--primary, #6644ff)
    );
  }

  &.is-expanded {
    width: 240px;
    padding-left: 6px;
    padding-right: 4px;
    cursor: default;
    border-color: var(--theme--primary, #6644ff);
    box-shadow: 0 0 0 2px var(--theme--primary-subdued, rgba(102, 68, 255, 0.12));

    @media (min-width: 960px) {
      width: 280px;
    }
  }
}

.search-btn,
.filter-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: var(--theme--foreground-subdued, #64748b);
  flex-shrink: 0;
  transition:
    color var(--fast, 150ms) ease,
    background-color var(--fast, 150ms) ease;

  &:hover {
    color: var(--theme--primary, #6644ff);
    background-color: var(--theme--primary-background, rgba(102, 68, 255, 0.08));
  }

  &.is-active {
    color: var(--theme--primary, #6644ff);
  }

  .btn-icon {
    pointer-events: none;
  }
}

.search-input-field {
  display: none;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0 6px;
  font-size: 14px;
  line-height: 20px;
  color: var(--theme--foreground, #0f172a);
  background: transparent;
  border: none;
  outline: none;

  .is-expanded & {
    display: block;
  }

  &::placeholder {
    color: var(--theme--foreground-subdued, #94a3b8);
  }
}

.clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  margin: 0 2px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  color: var(--theme--foreground-subdued, #64748b);
  flex-shrink: 0;
  transition: color var(--fast, 150ms) ease;

  &:hover {
    color: var(--theme--danger, #ef4444);
  }

  .btn-icon {
    pointer-events: none;
  }
}

.action-divider {
  display: block;
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background-color: var(--theme--border-color, #e2e8f0);
  flex-shrink: 0;
}

.filter-count-badge {
  position: absolute;
  top: 1px;
  right: 1px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: #ffffff;
  background-color: var(--theme--primary, #6644ff);
  border-radius: 7px;
  box-shadow: 0 0 0 1.5px var(--theme--background, #ffffff);
}

.filter-popover-panel {
  width: 360px;
  max-width: calc(100vw - 32px);
  max-height: 65vh;
  display: flex;
  flex-direction: column;
  background-color: var(--theme--background, #ffffff);
  border: var(--theme--border-width, 1px) solid var(--theme--border-color, #e2e8f0);
  border-radius: var(--theme--border-radius, 8px);
  box-shadow:
    0 10px 25px -5px rgba(0, 0, 0, 0.1),
    0 8px 10px -6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.filter-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: var(--theme--border-width, 1px) solid var(--theme--border-color, #e2e8f0);
  background-color: var(--theme--background-subdued, #f8fafc);
}

.filter-popover-title {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--theme--foreground, #0f172a);

  .header-icon {
    margin-right: 6px;
    color: var(--theme--primary, #6644ff);
  }
}

.active-count-chip {
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--theme--primary, #6644ff);
  background-color: var(--theme--primary-background, rgba(102, 68, 255, 0.12));
  border-radius: 10px;
}

.filter-popover-content {
  padding: 8px 10px;
  overflow-y: auto;
  flex: 1;
}
</style>

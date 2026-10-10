<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Header, IFlow, IFolder } from '../../types';
import { TRIGGER_TYPES } from '../../constants';

interface TableSort {
  by: string;
  desc: boolean;
}

interface ShortcutFilter {
  status: string;
  trigger: string;
  flow_manager_category: string;
}

const props = withDefaults(
  defineProps<{
    items: IFlow[];
    sort: TableSort | null;
    loading: boolean;
    showSelect: boolean;
    selectedCredential: string;
    selectedShortcutFilter: ShortcutFilter;
    usedCategoryList: Partial<IFolder>[];
    getCategoryName: (categoryId: string) => string;
    getCategoryIcon: (categoryId: string) => { name?: string; color?: string };
    formatDateLong: (date?: string | null) => string;
    totalVisible?: number;
    showFirstLast?: boolean;
  }>(),
  {
    sort: null,
    loading: false,
    showSelect: false,
    selectedCredential: 'local',
    totalVisible: 5,
    showFirstLast: true,
  },
);

const emit = defineEmits<{
  (e: 'click:row', item: { item: IFlow }): void;
  (e: 'update:sort', sort: TableSort): void;
  (e: 'run', item: IFlow): void;
  (e: 'goToFlow', { item }: { item: IFlow }): void;
  (e: 'openDashboard', flowId: string): void;
  (e: 'duplicate', item: IFlow): void;
  (e: 'backup', item: IFlow): void;
  (e: 'pushToCloud', item: IFlow): void;
  (e: 'delete', item: IFlow): void;
  (e: 'openVersionDialog', item: IFlow): void;
  (e: 'openGitExportDialog', item: IFlow): void;
  (e: 'setStatusFilter', status: string): void;
  (e: 'setTriggerFilter', trigger: string): void;
  (e: 'setCategoryFilter', category: string): void;
}>();

const headers = defineModel<Header[]>('headers', { default: () => [] });
const selectedItems = defineModel<string[]>('modelValue', { default: () => [] });
const page = defineModel<number>('page', { default: 1 });
const limit = defineModel<number>('limit', { default: 25 });

const selectedContextMenuCategory = ref<string>('');

const defaultLimits = [10, 25, 50, 100];
const limitOptions = computed(() => {
  const currentLimit = Number(limit.value) || 25;
  const values = [...defaultLimits];
  if (!values.includes(currentLimit) && currentLimit > 0) {
    values.push(currentLimit);
    values.sort((a, b) => a - b);
  }
  return values.map((val) => ({ text: String(val), value: val }));
});

const totalItems = computed(() => props.items?.length || 0);

const totalPages = computed(() => {
  const l = Number(limit.value) || 25;
  return Math.max(1, Math.ceil(totalItems.value / l));
});

const paginatedItems = computed(() => {
  const l = Number(limit.value) || 25;
  const currentPage = Math.max(1, Math.min(page.value, totalPages.value));
  const start = (currentPage - 1) * l;
  return props.items.slice(start, start + l);
});

const paginationLabel = computed(() => {
  const total = totalItems.value;
  if (total === 0) return '0 flows';
  const l = Number(limit.value) || 25;
  const currentPage = Math.max(1, Math.min(page.value, totalPages.value));
  const start = (currentPage - 1) * l + 1;
  const end = Math.min(currentPage * l, total);
  if (total === 1) return '1 flow';
  return `${start}–${end} of ${total} flows`;
});

function onLimitChange(val: unknown) {
  const numericVal = Number(val) || 25;
  limit.value = numericVal;
  const newTotalPages = Math.max(1, Math.ceil(totalItems.value / numericVal));
  if (page.value > newTotalPages) {
    page.value = Math.max(1, newTotalPages);
  }
}

watch([totalItems, limit], () => {
  if (page.value > totalPages.value) {
    page.value = Math.max(1, totalPages.value);
  }
});

watch(
  () => props.selectedShortcutFilter,
  () => {
    page.value = 1;
  },
  { deep: true },
);

function onContextMenuTable(text: string) {
  selectedContextMenuCategory.value = text;
}

async function copySelectedTextToClipboard() {
  if (selectedContextMenuCategory.value) {
    await navigator.clipboard.writeText(selectedContextMenuCategory.value);
  }
}
</script>

<template>
  <div class="flow-table-container">
    <v-menu ref="contextMenuTable" show-arrow placement="bottom-start">
      <v-list>
        <v-list-item clickable @click="copySelectedTextToClipboard()">
          <v-list-item-icon>
            <v-icon name="play_arrow" />
          </v-list-item-icon>
          <v-list-item-content>
            <v-text-overflow :text="'Copy Category Id'" />
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-menu>

    <div class="layout-tabular main-table">
      <v-table
        ref="table"
        v-model="selectedItems"
        v-model:headers="headers"
        class="table"
        :items="paginatedItems"
        :sort="props.sort"
        :loading="loading"
        show-resize
        must-sort
        allow-header-reorder
        :show-select="showSelect ? 'multiple' : 'none'"
        item-key="id"
        selection-use-keys
        @click:row="emit('click:row', $event)"
        @update:sort="emit('update:sort', $event)"
      >
        <template #[`item.icon`]="{ item }">
          <v-icon v-if="item.icon" :name="item.icon || ''" :color="item.color" />
        </template>

        <template #[`item.status`]="{ item }">
          <v-chip v-if="item.status !== 'active'" x-small class="item-name trigger-chip-inactive">
            {{ item.status.toUpperCase() }}
          </v-chip>
          <v-chip v-else x-small active class="item-name trigger-chip">
            {{ item.status.toUpperCase() }}
          </v-chip>
        </template>

        <template #[`item.flow_manager_last_run_at`]="{ item }">
          {{ formatDateLong(item.flow_manager_metadata_id?.flow_manager_last_run_at) }}
        </template>

        <template #[`item.date_created`]="{ item }">
          {{ formatDateLong(item.date_created) }}
        </template>

        <template #[`item.flow_manager_run_counter`]="{ item }">
          {{ item.flow_manager_metadata_id?.flow_manager_run_counter || 0 }}
        </template>

        <template #[`item.trigger`]="{ item }">
          {{ item.trigger.toUpperCase() }}
        </template>

        <template #[`item.flow_manager_category`]="{ item }">
          <v-icon
            v-bind="getCategoryIcon(item.flow_manager_metadata_id?.flow_manager_category)"
            class="mr-1"
          />
          <div
            v-context-menu="'contextMenuTable'"
            @contextmenu="onContextMenuTable(item.flow_manager_category)"
          >
            {{ getCategoryName(item.flow_manager_metadata_id?.flow_manager_category) }}
          </div>
        </template>

        <template #item-append="{ item }">
          <v-menu placement="bottom-end" show-arrow :close-on-content-click="true">
            <template #activator="{ toggle }">
              <v-icon name="more_vert" class="ctx-toggle" @click="toggle" />
            </template>

            <v-list>
              <v-list-item
                v-if="
                  item.trigger === 'manual' &&
                  item.status === 'active' &&
                  selectedCredential === 'local'
                "
                clickable
                @click="emit('run', item)"
              >
                <v-list-item-icon>
                  <v-icon name="play_arrow" />
                </v-list-item-icon>
                <v-list-item-content> Run </v-list-item-content>
              </v-list-item>

              <v-list-item clickable @click="emit('goToFlow', { item })">
                <v-list-item-icon>
                  <v-icon name="bolt" />
                </v-list-item-icon>
                <v-list-item-content> Go To Flow </v-list-item-content>
              </v-list-item>

              <v-list-item clickable @click="emit('openDashboard', item.id)">
                <v-list-item-icon>
                  <v-icon name="insights" />
                </v-list-item-icon>
                <v-list-item-content> Open Dashboard </v-list-item-content>
              </v-list-item>

              <v-list-item clickable @click="emit('openVersionDialog', item)">
                <v-list-item-icon>
                  <v-icon name="history" />
                </v-list-item-icon>
                <v-list-item-content> Version History </v-list-item-content>
              </v-list-item>

              <v-list-item clickable @click="emit('openGitExportDialog', item)">
                <v-list-item-icon>
                  <v-icon name="terminal" />
                </v-list-item-icon>
                <v-list-item-content> Export for Git </v-list-item-content>
              </v-list-item>

              <v-list-item clickable @click="emit('duplicate', item)">
                <v-list-item-icon>
                  <v-icon name="content_copy" />
                </v-list-item-icon>
                <v-list-item-content> Duplicate </v-list-item-content>
              </v-list-item>

              <v-list-item clickable @click="emit('backup', item)">
                <v-list-item-icon>
                  <v-icon name="file_download" />
                </v-list-item-icon>
                <v-list-item-content> Backup </v-list-item-content>
              </v-list-item>

              <v-list-item clickable @click="emit('pushToCloud', item)">
                <v-list-item-icon>
                  <v-icon name="cloud_upload" />
                </v-list-item-icon>
                <v-list-item-content> Push to Cloud </v-list-item-content>
              </v-list-item>

              <v-list-item clickable @click="emit('delete', item)">
                <v-list-item-icon>
                  <v-icon name="delete" />
                </v-list-item-icon>
                <v-list-item-content> Delete </v-list-item-content>
              </v-list-item>
            </v-list>
          </v-menu>
        </template>

        <template #header-context-menu="{ header }">
          <v-list>
            <v-list-item
              :disabled="!header.sortable"
              :active="props.sort?.by === header.value && props.sort?.desc === false"
              clickable
              @click="emit('update:sort', { by: header.value, desc: false })"
            >
              <v-list-item-icon>
                <v-icon name="sort" class="flip" />
              </v-list-item-icon>
              <v-list-item-content> Sort Ascending </v-list-item-content>
            </v-list-item>

            <v-list-item
              :active="props.sort?.by === header.value && props.sort?.desc === true"
              :disabled="!header.sortable"
              clickable
              @click="emit('update:sort', { by: header.value, desc: true })"
            >
              <v-list-item-icon>
                <v-icon name="sort" />
              </v-list-item-icon>
              <v-list-item-content> Sort Descending </v-list-item-content>
            </v-list-item>

            <v-divider />

            <template v-if="header.value === 'status'">
              <v-list-item
                :active="selectedShortcutFilter.status === 'active'"
                clickable
                @click="emit('setStatusFilter', 'active')"
              >
                <v-list-item-icon>
                  <v-icon name="play_arrow" />
                </v-list-item-icon>
                <v-list-item-content> Show Active </v-list-item-content>
              </v-list-item>
              <v-list-item
                :active="selectedShortcutFilter.status === 'inactive'"
                clickable
                @click="emit('setStatusFilter', 'inactive')"
              >
                <v-list-item-icon>
                  <v-icon name="pause" class="flip" />
                </v-list-item-icon>
                <v-list-item-content> Show Inactive </v-list-item-content>
              </v-list-item>
              <v-list-item clickable @click="emit('setStatusFilter', 'all')">
                <v-list-item-icon>
                  <v-icon name="close" class="flip" />
                </v-list-item-icon>
                <v-list-item-content> Reset </v-list-item-content>
              </v-list-item>
            </template>

            <template v-if="header.value === 'trigger'">
              <v-list-item
                v-for="trigger in TRIGGER_TYPES"
                :key="trigger"
                :active="selectedShortcutFilter.trigger === trigger"
                clickable
                @click="emit('setTriggerFilter', trigger)"
              >
                <v-list-item-icon>
                  <v-icon name="bolt" />
                </v-list-item-icon>
                <v-list-item-content> Show {{ trigger.toUpperCase() }} </v-list-item-content>
              </v-list-item>
              <v-list-item clickable @click="emit('setTriggerFilter', 'all')">
                <v-list-item-icon>
                  <v-icon name="close" />
                </v-list-item-icon>
                <v-list-item-content> Reset </v-list-item-content>
              </v-list-item>
            </template>

            <template v-if="header.value === 'flow_manager_category'">
              <v-list-item
                v-for="category in usedCategoryList"
                :key="category.id"
                :active="selectedShortcutFilter.flow_manager_category === category.id"
                clickable
                @click="emit('setCategoryFilter', category.id as string)"
              >
                <v-list-item-icon>
                  <v-icon :name="category.icon || 'folder'" :color="category.color" />
                </v-list-item-icon>
                <v-list-item-content> Show {{ category.name }} </v-list-item-content>
              </v-list-item>
              <v-list-item clickable @click="emit('setCategoryFilter', 'all')">
                <v-list-item-icon>
                  <v-icon name="close" class="flip" />
                </v-list-item-icon>
                <v-list-item-content> Reset </v-list-item-content>
              </v-list-item>
            </template>
          </v-list>
        </template>
      </v-table>
    </div>

    <!-- Pagination footer -->
    <div v-if="totalItems > 0" class="pagination-footer">
      <div class="pagination-info">
        <span class="pagination-label">{{ paginationLabel }}</span>
        <div class="per-page-selector">
          <span class="per-page-label">Per page:</span>
          <v-select
            :model-value="limit"
            class="limit-select small"
            inline
            :items="limitOptions"
            @update:model-value="onLimitChange"
          />
        </div>
      </div>

      <v-pagination
        v-model="page"
        :length="totalPages"
        :total-visible="props.totalVisible"
        :show-first-last="props.showFirstLast"
        :disabled="loading"
        class="pagination-controls"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ctx-toggle {
  cursor: pointer;
}

.trigger-chip {
  --v-chip-background-color: var(--theme--primary);
  --v-chip-color: var(--white);
}

.trigger-chip-inactive {
  --v-chip-background-color: var(--theme--background-normal);
  --v-chip-color: var(--theme--foreground-subdued);
}

.mr-1 {
  margin-right: 4px;
}

.flip {
  transform: scaleY(-1);
}

.pagination-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px var(--content-padding, 32px);
  border-top: var(--theme--border-width, 1px) solid
    var(--theme--border-color, var(--border-subdued, rgba(0, 0, 0, 0.08)));
  background-color: var(--theme--background, var(--background-page, #ffffff));
  position: sticky;
  bottom: 0;
  z-index: 2;
  flex-wrap: wrap;
  gap: 12px;
}

.pagination-info {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--theme--foreground-subdued, var(--foreground-subdued, #666));
}

.pagination-label {
  white-space: nowrap;
}

.per-page-selector {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.per-page-label {
  font-size: 13px;
  white-space: nowrap;
  color: var(--theme--foreground-subdued, var(--foreground-subdued, #666));
}

.limit-select {
  --v-select-height: 32px;
  min-width: 80px;
}

.pagination-controls {
  display: flex;
  align-items: center;
  margin: 0;
}
</style>

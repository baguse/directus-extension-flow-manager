<script setup lang="ts">
import { ref } from 'vue';
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
  }>(),
  {
    sort: null,
    loading: false,
    showSelect: false,
    selectedCredential: 'local',
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
  (e: 'setStatusFilter', status: string): void;
  (e: 'setTriggerFilter', trigger: string): void;
  (e: 'setCategoryFilter', category: string): void;
}>();

const headers = defineModel<Header[]>('headers', { default: () => [] });
const selectedItems = defineModel<string[]>('modelValue', { default: () => [] });

const selectedContextMenuCategory = ref<string>('');

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
        :items="items"
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
</style>

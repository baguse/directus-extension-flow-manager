<template>
  <div class="content-navigation-wrapper">
    <!-- Header Area: Instance Switcher & Directus Info -->
    <div class="sidebar-header">
      <div class="instance-card">
        <div class="instance-label-row">
          <div class="instance-badge">
            <v-icon
              :name="isLocalInstance ? 'storage' : 'cloud_queue'"
              x-small
              class="instance-icon"
            />
            <span class="instance-type-label">{{
              isLocalInstance ? 'Local Directus' : 'Remote Directus'
            }}</span>
          </div>
          <span
            v-if="serverInfo?.version"
            class="version-chip"
            :title="`Directus Version ${serverInfo.version}`"
          >
            v{{ serverInfo.version }}
          </span>
        </div>

        <div class="instance-select-container">
          <v-select
            v-model="selectedCredential"
            :items="credentialOptions"
            class="instance-select"
            density="compact"
          />
        </div>

        <div class="instance-status-row">
          <span class="status-indicator-dot" :class="{ 'is-connected': isDatabaseUpdated }" />
          <span class="status-indicator-text">{{ activeInstanceName }}</span>
        </div>
      </div>

      <!-- Quick Navigation: All Flows & Analytics Dashboard -->
      <div class="quick-nav-group">
        <button
          type="button"
          class="quick-nav-btn"
          :class="{ 'is-active': isAllFlowsRoute }"
          @click="navigateToHome"
        >
          <div class="quick-nav-left">
            <v-icon name="bolt" small class="quick-nav-icon" />
            <span class="quick-nav-label">All Flows</span>
          </div>
          <span v-if="allFlowsCount > 0" class="quick-nav-counter">{{ allFlowsCount }}</span>
        </button>

        <button
          type="button"
          class="quick-nav-btn"
          :class="{ 'is-active': isDashboardRoute }"
          @click="navigateToDashboard"
        >
          <div class="quick-nav-left">
            <v-icon name="insights" small class="quick-nav-icon" />
            <span class="quick-nav-label">Dashboard</span>
          </div>
          <span class="quick-nav-tag">Analytics</span>
        </button>
      </div>

      <!-- Explorer Controls: Header & Search (shown when flows exist) -->
      <div v-if="!hideFlows && allFlowsCount > 0 && isDatabaseUpdated" class="explorer-toolbar">
        <div class="explorer-title-row">
          <div class="explorer-heading">
            <span>EXPLORER</span>
            <span class="explorer-badge">{{ rootFlows.length }}</span>
          </div>
          <v-button
            v-tooltip.bottom="toggleButtonLabel"
            x-small
            icon
            rounded
            secondary
            class="toggle-expand-btn"
            @click="onNavigationAction"
          >
            <v-icon :name="toggleButtonIcon" x-small />
          </v-button>
        </div>

        <div class="explorer-search-wrapper">
          <v-input
            v-model="tmpSearch"
            type="search"
            small
            placeholder="Search hierarchy..."
            @input="debounce(onSearchChange, 300)"
          >
            <template #prepend>
              <v-icon name="search" small class="search-lead-icon" />
            </template>
            <template #append>
              <v-icon v-if="tmpSearch" name="close" x-small clickable @click="clearSearch" />
            </template>
          </v-input>
        </div>
      </div>
    </div>

    <!-- Tree Navigation List -->
    <div v-if="!hideFlows" class="tree-scroll-container">
      <v-list
        v-if="isDatabaseUpdated && filteredRootFlows.length"
        v-model="activeGroups"
        scope="content-navigation"
        class="content-navigation"
        tabindex="-1"
        nav
        :mandatory="false"
      >
        <navigation-item
          v-for="(flow, flowIndex) in filteredRootFlows"
          :key="`${flow.id}_${flowIndex}`"
          :flow="flow"
          :flow-child-map="flowChildMap"
          :search="search"
        />
      </v-list>

      <div v-else-if="isDatabaseUpdated && search" class="empty-search-state">
        <v-icon name="search_off" class="empty-icon" />
        <p class="empty-message">No matching flows found</p>
        <v-button x-small secondary @click="clearSearch">Reset Search</v-button>
      </div>

      <div v-else-if="!allFlowsCount && isDatabaseUpdated" class="empty-flows-state">
        <v-icon name="account_tree" class="empty-icon" />
        <p class="empty-message">No flows configured yet</p>
      </div>
    </div>

    <!-- Footer Summary Strip -->
    <div v-if="!hideFlows && allFlowsCount > 0" class="sidebar-footer">
      <span class="footer-count">
        {{ allFlowsCount }} {{ allFlowsCount === 1 ? 'flow' : 'flows' }}
      </span>
      <span class="footer-badge">
        {{ isLocalInstance ? 'Local' : activeCredentialLabel }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRefs, inject, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import NavigationItem from './navigation-item.vue';
import type { ICredential, IFlow, IFolder, IServerInfo } from '../../types';
import { useLocalStorage } from '../../composables/use-local-storage';

const props = withDefaults(
  defineProps<{
    currentCollection?: string;
    rootFlows?: Partial<IFlow & IFolder>[];
    flowChildMap?: Record<string, (IFlow | IFolder)[]>;
    allFlows?: (IFolder | IFlow)[];
    viewMode?: string;
    serverInfo?: IServerInfo;
    isDatabaseUpdated?: boolean;
    hideFlows?: boolean;
  }>(),
  {
    currentCollection: undefined,
    rootFlows: () => [],
    flowChildMap: () => ({}),
    allFlows: () => [],
    viewMode: 'LIST',
    serverInfo: undefined,
    isDatabaseUpdated: true,
    hideFlows: false,
  },
);

const { rootFlows, flowChildMap, allFlows, isDatabaseUpdated, hideFlows } = toRefs(props);
const search = ref<string>('');
const tmpSearch = ref<string>('');
const timeOutId = ref<NodeJS.Timeout | null>(null);

const route = useRoute();
const router = useRouter();

const flowManagerUtils = inject<{
  credentials: Ref<ICredential[]>;
  selectedCredential: Ref<string>;
  setCredential: (credential: string) => void;
}>('flowManagerUtils');

const selectedCredential = computed({
  get: () => flowManagerUtils?.selectedCredential.value,
  set: (value) => flowManagerUtils?.setCredential?.(value as string),
});

const isLocalInstance = computed(() => {
  return !selectedCredential.value || selectedCredential.value === 'local';
});

const activeCredentialLabel = computed(() => {
  if (isLocalInstance.value) return 'Local';
  const c = flowManagerUtils?.credentials?.value?.find((c) => c.id === selectedCredential.value);
  return c?.name || 'Remote';
});

const activeInstanceName = computed(() => {
  if (isLocalInstance.value) return 'Local Directus Instance';
  const c = flowManagerUtils?.credentials?.value?.find((c) => c.id === selectedCredential.value);
  return c ? `Connected: ${c.name}` : 'Connected';
});

const allFlowsCount = computed(() => allFlows.value?.length || 0);

const isAllFlowsRoute = computed(() => {
  return (
    (route.path === '/flow-manager' || route.path === '/flow-manager/') && !route.params.parentId
  );
});

const isDashboardRoute = computed(() => {
  return route.path.startsWith('/flow-manager/dashboard');
});

function navigateToHome() {
  if (selectedCredential.value && selectedCredential.value !== 'local') {
    router.push({
      path: '/flow-manager',
      query: { credential: selectedCredential.value },
    });
  } else {
    router.push('/flow-manager');
  }
}

function navigateToDashboard() {
  if (selectedCredential.value && selectedCredential.value !== 'local') {
    router.push({
      path: '/flow-manager/dashboard',
      query: { credential: selectedCredential.value },
    });
  } else {
    router.push('/flow-manager/dashboard');
  }
}

function clearSearch() {
  search.value = '';
  tmpSearch.value = '';
}

const credentialOptions = computed(() => {
  const credentials =
    flowManagerUtils?.credentials?.value?.map((credential) => ({
      text: credential.name,
      value: credential.id,
    })) || [];

  return [
    {
      text: 'Local Directus',
      value: 'local',
    },
    ...credentials,
  ];
});

const filteredItemFlag = computed(() => {
  if (hideFlows.value || !allFlows.value) return {};
  const cache: Record<string, boolean> = {};

  for (let i = 0; i < allFlows.value.length; i++) {
    const flow = allFlows.value[i] as IFlow | IFolder;
    const { id } = flow;
    cache[id as string] = checkFlowHaveChildSearched(flow);
  }

  return cache;
});

const filteredRootFlows = computed(() => {
  if (hideFlows.value) return [];
  if (!search.value) return rootFlows.value;
  return rootFlows.value.filter((flow) => {
    if (!flow.id) return false;
    return filteredItemFlag.value[flow.id] ?? false;
  });
});

function checkFlowHaveChildSearched(item: IFlow | IFolder): boolean {
  const { id, name } = item;

  if (name?.toLowerCase().includes(search.value.toLowerCase())) {
    return true;
  }

  const children = flowChildMap.value[id as string];
  if (!children?.length) {
    return false;
  }

  const isExist = children.some((child) => {
    return child.name.toLowerCase().includes(search.value.toLowerCase());
  });

  if (isExist) {
    return true;
  }

  return children.some((child) => {
    return checkFlowHaveChildSearched(child);
  });
}

const { data: activeGroups } = useLocalStorage<string[]>(`settings-active-groups-flow-manager`, []);

const toggleButtonLabel = computed(() => {
  return activeGroups.value?.length ? 'Collapse All' : 'Expand All';
});

const toggleButtonIcon = computed(() => {
  return activeGroups.value?.length ? 'unfold_less' : 'unfold_more';
});

function onSearchChange() {
  if (!search.value) {
    return;
  }

  const result: string[] = [];
  const flowFlags = Object.entries(filteredItemFlag.value);
  for (let i = 0; i < flowFlags.length; i++) {
    const [key, value] = flowFlags[i] as [string, boolean];
    if (value) {
      result.push(key);
    }
  }

  activeGroups.value = result;
}

function debounce(fn: () => void, delay: number) {
  if (timeOutId.value) clearTimeout(timeOutId.value);
  timeOutId.value = setTimeout(() => {
    search.value = tmpSearch.value;
    fn();
  }, delay);
}

function onNavigationAction() {
  if (activeGroups.value?.length) {
    activeGroups.value = [];
  } else {
    const result: string[] = [];
    const flowChildren = Object.entries(flowChildMap.value);
    for (let i = 0; i < flowChildren.length; i++) {
      const [key, value] = flowChildren[i] as [string, IFlow[]];
      if (value.length) {
        result.push(key);
      }
    }
    activeGroups.value = result;
  }
}
</script>

<style lang="scss" scoped>
.content-navigation-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100%;
  background-color: var(--theme--background-normal, var(--background-normal, #ffffff));
}

.sidebar-header {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 10px 10px 6px;
  background-color: var(--theme--background-normal, var(--background-normal, #ffffff));
  border-bottom: 1px solid var(--theme--border-color-subdued, rgba(128, 128, 128, 0.12));
}

/* Instance Card */
.instance-card {
  padding: 8px 10px;
  border-radius: 8px;
  background-color: var(--theme--background-subdued, rgba(128, 128, 128, 0.06));
  border: 1px solid var(--theme--border-color-subdued, rgba(128, 128, 128, 0.15));
  margin-bottom: 10px;
}

.instance-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.instance-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--theme--foreground-subdued);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;

  .instance-icon {
    font-size: 14px;
    color: var(--theme--primary);
  }
}

.version-chip {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background-color: var(--theme--background-normal, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, rgba(128, 128, 128, 0.15));
  color: var(--theme--foreground-subdued);
}

.instance-select-container {
  :deep(.v-select) {
    --input-height: 32px;
  }
}

.instance-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding-left: 2px;
}

.status-indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--theme--foreground-subdued, #94a3b8);
  flex-shrink: 0;

  &.is-connected {
    background-color: var(--theme--success, #10b981);
    box-shadow: 0 0 5px var(--theme--success, #10b981);
  }
}

.status-indicator-text {
  font-size: 11px;
  color: var(--theme--foreground-subdued);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Quick Nav Buttons */
.quick-nav-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 10px;
}

.quick-nav-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  color: var(--theme--foreground);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
  text-align: left;

  &:hover {
    background-color: var(--theme--background-subdued, rgba(128, 128, 128, 0.08));
    color: var(--theme--primary);
  }

  &.is-active {
    background-color: var(--theme--primary-subdued, rgba(102, 68, 255, 0.1));
    color: var(--theme--primary);
    font-weight: 600;
    border-color: var(--theme--primary-subdued, rgba(102, 68, 255, 0.2));

    .quick-nav-icon {
      color: var(--theme--primary);
    }
  }
}

.quick-nav-left {
  display: flex;
  align-items: center;
  gap: 8px;

  .quick-nav-icon {
    font-size: 16px;
    color: var(--theme--foreground-subdued);
    transition: color 0.15s ease;
  }
}

.quick-nav-counter {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  background-color: var(--theme--primary);
  color: var(--foreground-inverted, var(--theme--foreground-inverted, #ffffff));
}

.quick-nav-tag {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 1px 5px;
  border-radius: 4px;
  background-color: var(--theme--primary-subdued, rgba(102, 68, 255, 0.12));
  color: var(--theme--primary);
}

/* Explorer Toolbar */
.explorer-toolbar {
  padding-top: 4px;
}

.explorer-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.explorer-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--theme--foreground-subdued);
}

.explorer-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 8px;
  background-color: var(--theme--primary-subdued, rgba(102, 68, 255, 0.15));
  color: var(--theme--primary);
}

.action-icon-btn {
  --v-button-width: 22px;
  --v-button-height: 22px;
}

.explorer-search-wrapper {
  :deep(.v-input) {
    --input-height: 32px;
  }

  .search-lead-icon {
    font-size: 15px;
    color: var(--theme--foreground-subdued);
  }
}

/* Tree Scroll Container */
.tree-scroll-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 6px 16px;

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--theme--border-color-subdued, rgba(128, 128, 128, 0.2));
    border-radius: 3px;
  }
}

.content-navigation {
  flex-grow: 1;

  .v-detail {
    :deep(.v-divider) {
      margin: 0;
    }

    &:not(:first-child) :deep(.v-divider) {
      margin-top: 4px;
    }

    &.empty :deep(.v-divider) {
      margin-bottom: 4px;
    }
  }
}

/* Empty States */
.empty-search-state,
.empty-flows-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
  gap: 8px;

  .empty-icon {
    font-size: 28px;
    color: var(--theme--foreground-subdued);
    opacity: 0.6;
  }

  .empty-message {
    font-size: 12px;
    color: var(--theme--foreground-subdued);
    margin: 0;
  }
}

/* Footer Strip */
.sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--theme--foreground-subdued);
  border-top: 1px solid var(--theme--border-color-subdued, rgba(128, 128, 128, 0.1));
  background-color: var(--theme--background-subdued, rgba(128, 128, 128, 0.03));
}

.footer-count {
  font-weight: 500;
}

.footer-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background-color: var(--theme--background-normal, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, rgba(128, 128, 128, 0.15));
}
</style>

<template>
  <div v-if="viewMode === 'TABLE'" class="content-navigation-wrapper">
    <div class="action-bar">
      <v-select class="small" v-model="selectedCredential" :items="credentialOptions"></v-select>
      <div class="version">
        Directus Version <v-chip x-small active class="trigger-chip">
          {{ serverInfo?.version || "N/A" }}
        </v-chip>
      </div>
    </div>
  </div>
  <div v-else class="content-navigation-wrapper">
    <div class="action-bar">
      <v-select v-model="selectedCredential" :items="credentialOptions"></v-select>
      <div class="version">
        Directus Version <v-chip x-small active class="trigger-chip">
          {{ serverInfo?.version || "N/A" }}
        </v-chip>
      </div>
      <template v-if="allFlows.length">
        <div class="action-button">
          <v-button x-small to="/flow-manager"> Home </v-button>
          <v-button x-small to="/flow-manager/dashboard"> Dashboard </v-button>
          <v-button x-small @click="onNavigationAction">
            {{ activeGroups?.length ? "Collapse All" : "Expand All" }}
          </v-button>
        </div>
        <div class="search-input">
          <v-input type="search" small :placeholder="'Search Flow'" v-model="tmpSearch" @input="debounce(onSearchChange, 500)">
            <template v-slot:append>
              <v-icon
                v-if="tmpSearch"
                name="close"
                clickable
                @click="
                  search = '';
                  tmpSearch = '';
                "
              />
            </template>
          </v-input>
        </div>
      </template>
    </div>
    <v-list v-model="activeGroups" scope="content-navigation" class="content-navigation" tabindex="-1" nav :mandatory="false">
      <navigation-item
        v-for="(flow, flowIndex) in rootFlows"
        :key="`${flow.id}_${flowIndex}`"
        :flow="flow"
        :flow-child-map="flowChildMap"
        :search="search"
      />
    </v-list>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRefs, inject, Ref } from "vue";
import NavigationItem from "./navigation-item.vue";
import { ICredential, IFlow, IFolder, IServerInfo } from "../../types";
import { useLocalStorage } from "../../composables/use-local-storage";

const props = defineProps<{
  currentCollection?: string;
  rootFlows: Partial<IFlow & IFolder>[];
  flowChildMap: Record<string, (IFlow | IFolder)[]>;
  allFlows: IFolder[] | IFlow[];
  viewMode: string;
  serverInfo?: IServerInfo;
}>();

const { rootFlows, flowChildMap, allFlows, viewMode } = toRefs(props);
const search = ref<string>("");
const tmpSearch = ref<string>("");
const timeOutId = ref<NodeJS.Timeout | null>(null);

const flowManagerUtils = inject<{
  credentials: Ref<ICredential[]>;
  selectedCredential: Ref<string>;
  setCredential: (credential: string) => void;
}>("flowManagerUtils");

const selectedCredential = computed({
  get: () => flowManagerUtils?.selectedCredential.value,
  set: (value) => flowManagerUtils?.setCredential(value as string),
});
/**
 * @description
 * This is a computed property that returns a filtered list of items based on the search value.
 */
const filteredItemFlag = computed(() => {
  if (!allFlows.value) return {};
  const cache: Record<string, boolean> = {};

  for (let i = 0; i < allFlows.value.length; i++) {
    const flow = allFlows.value[i] as IFlow | IFolder;
    const { id } = flow;

    cache[id as string] = checkFlowHaveChildSearched(flow);
  }

  return cache;
});

const credentialOptions = computed(() => {
  const credentials =
    flowManagerUtils?.credentials?.value?.map((credential) => ({
      text: credential.name,
      value: credential.id,
    })) || [];

  return [
    {
      text: "Local",
      value: "local",
    },
    ...credentials,
  ];
});

function checkFlowHaveChildSearched(item: IFlow | IFolder): boolean {
  const { id, name } = item;

  if (name?.toLowerCase().includes(search.value.toLowerCase())) {
    return true;
  }

  let children = flowChildMap.value[id as string];
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

function debounce(fn: Function, delay: number) {
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
.group-name {
  padding-left: 8px;
  font-weight: 600;
}

.empty {
  .v-button {
    --v-button-color: var(--foreground-subdued);
    --v-button-background-color: var(--foreground-subdued);
    --v-button-background-color-hover: var(--primary);
  }
}

.content-navigation-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.content-navigation {
  --v-list-min-height: calc(100% - 64px);

  flex-grow: 1;

  .v-detail {
    :deep(.v-divider) {
      margin: 0px;
    }

    &:not(:first-child) :deep(.v-divider) {
      margin-top: 8px;
    }

    &.empty :deep(.v-divider) {
      margin-bottom: 8px;
    }
  }
}

.hidden-collection {
  --v-list-item-color: var(--foreground-subdued);
}

.action-bar {
  .search-input {
    --input-height: 40px;
    margin-top: 8px;
    margin-bottom: 8px;
  }

  .action-button {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
  }

  .version {
    margin-left: 4px;
    margin-top: 8px;
    display: flex;
    font-size: 14px;

    .trigger-chip {
      margin-left: 8px;
    }
  }

  position: sticky;
  top: 0;
  z-index: 2;
  padding: 12px;
  padding-bottom: 0;
  background-color: var(--background-normal, var(--theme--background-normal));
}
</style>

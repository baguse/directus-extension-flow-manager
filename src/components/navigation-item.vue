<template>
  <v-list-group
    v-if="childFlows?.length && matchesSearch"
    v-context-menu="flow.type !== 'category' ? 'contextMenu' : null"
    :to="`/flow-manager/${currentPath}`"
    scope="content-navigation"
    :value="flow.id"
    query
  >
    <template #activator>
      <navigation-item-content :name="flow.name || 'Flow'" :icon="flow.icon" :color="flow.color" :search="search" />
    </template>
    <navigation-item
      v-for="(childFlow, indexChild) in childFlows"
      :key="`${childFlow.id}_${indexChild}`"
      :flow="childFlow"
      :flow-child-map="flowChildMap"
      :search="search"
    />
  </v-list-group>

  <v-list-item v-context-menu="flow.type !== 'category' ? 'contextMenu' : null" v-else-if="matchesSearch">
    <navigation-item-content :search="search" :name="flow.name || 'Flow'" :icon="flow.icon" :color="flow.color" />
  </v-list-item>

  <v-menu v-if="flow.type !== 'category'" ref="contextMenu" show-arrow placement="bottom-start">
    <v-list>
      <v-list-item clickable :to="`/settings/flows/${flow.id}`">
        <v-list-item-icon>
          <v-icon name="bolt" />
        </v-list-item-icon>
        <v-list-item-content>
          <v-text-overflow :text="'Go to the Flow'" />
        </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="duplicate(flow as IFlow)">
        <v-list-item-icon>
          <v-icon name="content_copy" />
        </v-list-item-icon>
        <v-list-item-content> Duplicate </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="backup(flow as IFlow)">
        <v-list-item-icon>
          <v-icon name="file_download" />
        </v-list-item-icon>
        <v-list-item-content> Backup </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="showPushToCloud(flow as IFlow)">
        <v-list-item-icon>
          <v-icon name="cloud_upload" />
        </v-list-item-icon>
        <v-list-item-content> Push to Cloud </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="showDeleteFlowDialog(flow as IFlow)">
        <v-list-item-icon>
          <v-icon name="delete" />
        </v-list-item-icon>
        <v-list-item-content> Delete </v-list-item-content>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, toRefs, inject } from "vue";
import { IFlow, IFolder } from "../types";
import NavigationItemContent from "./navigation-item-content.vue";

const props = defineProps<{
  flow: Partial<IFlow & IFolder>;
  showHidden?: boolean;
  search?: string;
  flowChildMap: Record<string, IFlow[]>;
}>();

const { flow, search, flowChildMap } = toRefs(props);

const currentPath = computed(() => encodeURIComponent((flow.value.id as string) || ""));

const childFlows = computed(() => {
  const flows = (flowChildMap.value[flow.value.id as string] || []).sort(
    (a, b) => (a.flow_manager_order || 0) - (b.flow_manager_order || 0)
  );

  return flows;
});

const allChildreens = computed(() => {
  const childreens = [];
  let tmp = flowChildMap.value[flow.value.id as string] || [];
  while (tmp.length > 0) {
    childreens.push(...tmp);
    tmp = tmp.flatMap((flow) => flowChildMap.value[flow.id as string] || []);
  }

  return childreens;
});

const matchesSearch = computed<boolean>(() => {
  if (!props.search) return true;

  const searchQuery = props.search.toLowerCase();

  return matchesSearch(flow.value) || childrenMatchSearch(allChildreens.value);

  function childrenMatchSearch(items: Partial<IFlow & IFolder>[]): boolean {
    return items.some((item) => {
      return matchesSearch(item);
    });
  }

  function matchesSearch(item: Partial<IFlow & IFolder>) {
    return item?.name?.toLowerCase().includes(searchQuery);
  }
});

const flowManagerUtils = inject<{
  duplicate: (item: IFlow, isDuplicate?: boolean) => Promise<void>;
  backup: (item: IFlow) => Promise<void>;
  showPushToCloud: (item: IFlow) => Promise<void>;
  showDeleteFlowDialog: (item: IFlow) => Promise<void>;
}>("flowManagerUtils");

const duplicate = (item: IFlow, isDuplicate?: boolean) => {
  flowManagerUtils?.duplicate(item, isDuplicate);
};

const backup = (item: IFlow) => {
  flowManagerUtils?.backup(item);
};

const showPushToCloud = (item: IFlow) => {
  flowManagerUtils?.showPushToCloud(item);
};

const showDeleteFlowDialog = (item: IFlow) => {
  flowManagerUtils?.showDeleteFlowDialog(item);
};
</script>

<style scoped>
.hidden {
  --v-list-item-color: var(--foreground-subdued);
}
</style>

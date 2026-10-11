<script setup lang="ts">
import { computed, toRefs, inject, unref } from 'vue';
import type { FlowManagerUtilsContext, IFlow, IFolder } from '../../types';
import NavigationItemContent from './navigation-item-content.vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const props = defineProps<{
  flow: Partial<IFlow & IFolder> | IFlow | IFolder;
  search?: string;
  flowChildMap: Record<string, (IFlow | IFolder)[]>;
}>();

const { flow, search, flowChildMap } = toRefs(props);

const currentPath = computed(() => encodeURIComponent((flow.value.id as string) || ''));

const childFlows = computed(() => {
  const flows = (flowChildMap.value[flow.value.id as string] || []).sort(
    (a, b) =>
      ((a as IFlow).flow_manager_metadata_id?.flow_manager_order || 0) -
      ((b as IFlow).flow_manager_metadata_id?.flow_manager_order || 0),
  );

  return flows;
});

const allChildreens = computed<(IFlow | IFolder)[]>(() => {
  const childreens: (IFlow | IFolder)[] = [];
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

const flowItem = computed(() => flow.value as Partial<IFlow>);

const triggerType = computed(() => {
  return flowItem.value.trigger?.toUpperCase();
});

const flowManagerUtils = inject<FlowManagerUtilsContext>('flowManagerUtils');

const selectedCredential = computed(() => flowManagerUtils?.selectedCredential.value);

const parentId = flowManagerUtils?.parentId;
const isLocal = computed(() => selectedCredential.value === 'local');

const duplicate = (item: IFlow, isDuplicate?: boolean) => {
  flowManagerUtils?.duplicate?.(item, isDuplicate);
};

const backup = (item: IFlow) => {
  flowManagerUtils?.backup?.(item);
};

const showPushToCloud = (item: IFlow) => {
  flowManagerUtils?.showPushToCloud?.(item);
};

const showDeleteItemDialog = (item: IFlow | IFolder) => {
  flowManagerUtils?.showDeleteItemDialog?.(item);
};

const showRunDialog = (item: IFlow) => {
  flowManagerUtils?.showRunDialog?.(item);
};

const showEditFlowDialog = (item: IFlow) => {
  flowManagerUtils?.showEditFlowDialog?.(item);
};

const duplicateFolder = (item: IFolder) => {
  flowManagerUtils?.duplicateFolder?.(item);
};

const showEditFolderDialog = (item: IFolder) => {
  flowManagerUtils?.showEditFolderDialog?.(item);
};

const showRunWebhookDialog = (item: IFlow) => {
  flowManagerUtils?.showRunWebhookDialog?.(item);
};

function moveTo() {
  const destinationCategory = unref(parentId) || '';
  const destinationFlows = flowChildMap.value[destinationCategory] || [];
  destinationFlows.push(flow.value as IFlow | IFolder);

  const sourceCategory = flow.value.flow_manager_metadata_id?.flow_manager_category || '';
  const sourceFlows = flowChildMap.value[sourceCategory] || [];
  const reorderSourceFlows: (IFlow | IFolder)[] = [];
  sourceFlows.forEach((sourceFlow) => {
    if (sourceFlow.id !== flow.value.id) {
      reorderSourceFlows.push(sourceFlow as IFlow | IFolder);
    }
  });
  flowManagerUtils?.onSort?.(destinationFlows, destinationCategory);
  flowManagerUtils?.onSort?.(reorderSourceFlows, sourceCategory);
}

function openDashboardDetail(flowId: string) {
  if (selectedCredential.value && selectedCredential.value !== 'local') {
    router.push({
      path: `/flow-manager/dashboard/${flowId}`,
      query: { credential: selectedCredential.value },
    });
  } else {
    router.push(`/flow-manager/dashboard/${flowId}`);
  }
}

function onItemClick() {
  if (flow.value.type === 'category') {
    router.push(`/flow-manager/${currentPath.value}`);
  } else {
    flowManagerUtils?.selectItem?.(flow.value as IFlow);
  }
}

function onActivatorClick() {
  if (flow.value.type !== 'category') {
    flowManagerUtils?.selectItem?.(flow.value as IFlow);
  }
}
</script>

<template>
  <v-list-group
    v-if="childFlows?.length && matchesSearch"
    v-context-menu="'contextMenu'"
    :to="`/flow-manager/${currentPath}`"
    scope="content-navigation"
    :value="flow.id"
    query
  >
    <template #activator>
      <navigation-item-content
        :name="flow.name || 'Flow'"
        :icon="flow.icon"
        :color="flow.color"
        :search="search"
        :type="flow.type"
        :trigger-type="triggerType"
        :status="flowItem.status"
        :child-count="childFlows.length"
        @click="onActivatorClick"
      />
    </template>
    <navigation-item
      v-for="(childFlow, indexChild) in childFlows"
      :key="`${childFlow.id}_${indexChild}`"
      :flow="childFlow"
      :flow-child-map="flowChildMap"
      :search="search"
    />
  </v-list-group>

  <v-list-item
    v-else-if="matchesSearch"
    v-context-menu="'contextMenu'"
    clickable
    @click="onItemClick"
  >
    <navigation-item-content
      :search="search"
      :name="flow.name || 'Flow'"
      :icon="flow.icon"
      :color="flow.color"
      :type="flow.type"
      :trigger-type="triggerType"
      :status="flowItem.status"
      :child-count="childFlows?.length || 0"
    />
  </v-list-item>

  <v-menu ref="contextMenu" show-arrow placement="bottom-start">
    <v-list v-if="flow.type !== 'category'">
      <v-list-item
        v-if="flowItem.trigger === 'manual' && flowItem.status === 'active' && isLocal"
        clickable
        @click="showRunDialog(flow as IFlow)"
      >
        <v-list-item-icon>
          <v-icon name="play_arrow" />
        </v-list-item-icon>
        <v-list-item-content>
          <v-text-overflow :text="'Run'" />
        </v-list-item-content>
      </v-list-item>
      <v-list-item
        v-else-if="flowItem.trigger === 'webhook' && flowItem.status === 'active'"
        clickable
        @click="showRunWebhookDialog(flow as IFlow)"
      >
        <v-list-item-icon>
          <v-icon name="play_arrow" />
        </v-list-item-icon>
        <v-list-item-content>
          <v-text-overflow :text="'Run'" />
        </v-list-item-content>
      </v-list-item>
      <v-list-item
        clickable
        @click="flowManagerUtils?.goToFlow({ item: flow as unknown as IFlow })"
      >
        <v-list-item-icon>
          <v-icon name="bolt" />
        </v-list-item-icon>
        <v-list-item-content>
          <v-text-overflow :text="'Go to the Flow'" />
        </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="openDashboardDetail((flow as IFlow).id)">
        <v-list-item-icon>
          <v-icon name="insights" />
        </v-list-item-icon>
        <v-list-item-content>
          <v-text-overflow :text="'Open Dashboard'" />
        </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="showEditFlowDialog(flow as unknown as IFlow)">
        <v-list-item-icon>
          <v-icon name="edit" />
        </v-list-item-icon>
        <v-list-item-content>
          <v-text-overflow :text="'Edit Flow'" />
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
      <v-list-item clickable @click="showDeleteItemDialog(flow as IFlow)">
        <v-list-item-icon>
          <v-icon name="delete" />
        </v-list-item-icon>
        <v-list-item-content> Delete </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="moveTo()">
        <v-list-item-icon>
          <v-icon name="arrow_circle_right" />
        </v-list-item-icon>
        <v-list-item-content> Move to here </v-list-item-content>
      </v-list-item>
    </v-list>
    <v-list v-else>
      <v-list-item clickable @click="duplicateFolder(flow as IFolder)">
        <v-list-item-icon>
          <v-icon name="content_copy" />
        </v-list-item-icon>
        <v-list-item-content> Duplicate Folder </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="showEditFolderDialog(flow as IFolder)">
        <v-list-item-icon>
          <v-icon name="edit" />
        </v-list-item-icon>
        <v-list-item-content> Edit Folder </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="showDeleteItemDialog(flow as IFolder)">
        <v-list-item-icon>
          <v-icon name="delete" />
        </v-list-item-icon>
        <v-list-item-content> Delete Folder </v-list-item-content>
      </v-list-item>
      <v-list-item clickable @click="moveTo()">
        <v-list-item-icon>
          <v-icon name="move" />
        </v-list-item-icon>
        <v-list-item-content> Move to here </v-list-item-content>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<style scoped>
.hidden {
  --v-list-item-color: var(--foreground-subdued);
}
</style>

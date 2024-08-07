<script setup lang="ts">
import { ref, toRefs, Ref, computed, watch } from "vue";
import { IFlow } from "../../types";
import { useStores, useLayout, useApi } from "@directus/extensions-sdk";
import { Preset, Collection } from "@directus/types";
import debounce from "lodash/debounce";
import formatTitle from "@directus/format-title";

const props = defineProps<{
  selectedItem: Partial<IFlow>;
  value: boolean;
}>();

const emit = defineEmits(["update:modelValue", "reload:flow", "reload:tabularFlow"]);

const { selectedItem, value } = toRefs(props);
const { usePresetsStore, useCollectionsStore, useNotificationsStore } = useStores();
const presetsStore = usePresetsStore();
const { layoutWrapper } = useLayout(ref("tabular"));
const collectionsStore = useCollectionsStore();
const { allCollections } = collectionsStore;
const notificationsStore = useNotificationsStore();
const api = useApi();

const step = ref(1);
const selectedCollectionToRun = ref<string | null>(null);
const selectedItemKeys = ref<string[]>([]);
const loadingRunFlow = ref(false);
const confirmValues = ref<Record<string, any>>({});

const requireConfirmation = computed(() => selectedItem.value?.options?.requireConfirmation || false);
const requireSelection = computed(() => selectedItem.value?.options?.requireSelection || false);
const confirmDetails = computed(() => selectedItem.value?.options);
const isConfirmButtonDisabled = computed(() => {
  for (const field of confirmDetails.value?.fields || []) {
    if (
      field.meta?.required &&
      (!confirmValues.value || confirmValues.value[field.field] === null || confirmValues.value[field.field] === undefined)
    ) {
      return true;
    }
  }

  return false;
});

const fields = computed(() => {
  return (confirmDetails.value?.fields ?? []).map((field: Record<string, any>) => ({
    ...field,
    name: !field.name && field.field ? formatTitle(field.field) : field.name,
  }));
});

watch(
  [requireSelection, requireConfirmation],
  ([isNeedSelection, isNeedConfirmation]) => {
    if (isNeedSelection) {
      step.value = 1;
    } else if (isNeedConfirmation) {
      step.value = 2;
    } else {
      step.value = 3;
    }
  },
  {
    immediate: true,
  }
);

const existingTabularPreset: Ref<Partial<Preset>> = ref(
  presetsStore.getPresetForCollection(`flow-manager-${selectedCollectionToRun.value}`)
);
const updateExistingTabularPreset = debounce(() => {
  presetsStore.update(existingTabularPreset.value.id, {
    ...existingTabularPreset.value,
  });
}, 500);

const createNewTabularPreset = debounce(() => {
  presetsStore.savePreset({
    bookmark: null,
    collection: `flow-manager-${selectedCollectionToRun.value}`,
    ...existingTabularPreset.value,
  });
}, 500);

const tabularPreset = computed({
  get() {
    if (!selectedCollectionToRun.value) {
      return null;
    }

    return existingTabularPreset.value;
  },
  set(value) {
    existingTabularPreset.value = {
      ...existingTabularPreset.value,
      ...value,
    };

    if (!existingTabularPreset.value?.id) {
      createNewTabularPreset();
    } else {
      updateExistingTabularPreset();
    }

    presetsStore.hydrate();
    return value;
  },
});

const tabularFilter = computed({
  get() {
    if (!selectedCollectionToRun.value) {
      return null;
    }

    return tabularPreset.value?.filter;
  },
  set(value) {
    tabularPreset.value = {
      ...tabularPreset.value,
      filter: value,
    };
  },
});

const tabularSearch = computed({
  get() {
    if (!selectedCollectionToRun.value) {
      return null;
    }

    return tabularPreset.value?.search;
  },
  set(value) {
    tabularPreset.value = {
      ...tabularPreset.value,
      search: value,
    };
  },
});

const tabularLayoutOptions = computed({
  get() {
    if (!selectedCollectionToRun.value) {
      return null;
    }

    return tabularPreset.value?.layout_options;
  },
  set(value) {
    tabularPreset.value = {
      ...tabularPreset.value,
      layout_options: {
        ...(tabularPreset.value?.layout_options || {}),
        ...value,
      },
    };
  },
});

const tabularLayoutQuery = computed({
  get() {
    if (!selectedCollectionToRun.value) {
      return null;
    }

    return tabularPreset.value?.layout_query;
  },
  set(value) {
    tabularPreset.value = {
      ...tabularPreset.value,
      layout_query: {
        ...(tabularPreset.value?.layout_query || {}),
        ...value,
      },
    };
  },
});

const collectionMap: Record<string, Collection> = allCollections.reduce(
  (acc: Record<string, Collection>, collection: Collection) => {
    acc[collection.collection] = collection;
    return acc;
  },
  {}
);

function onSelectCollectionToRun(collection: string) {
  selectedCollectionToRun.value = collection;
  selectedItemKeys.value = [];
  existingTabularPreset.value = presetsStore.getPresetForCollection(`flow-manager-${selectedCollectionToRun.value}`);
}

function clearTabularFilters() {
  tabularSearch.value = null;
  tabularFilter.value = null;
}

async function runFlow() {
  loadingRunFlow.value = true;
  try {
    await api.post(`/flows/trigger/${selectedItem.value?.id}`, {
      collection: selectedCollectionToRun.value,
      keys: selectedItemKeys.value,
      ...confirmValues.value,
    });

    emit("reload:flow");
    emit("reload:tabularFlow");
    notificationsStore.add({
      type: "success",
      title: `Flow "${selectedItem.value.name}" has been run successfully`,
      closeable: true,
      persist: true,
    });
  } catch (error) {
    notificationsStore.add({
      type: "error",
      title: `Failed to run Flow "${selectedItem.value.name}"`,
      closeable: true,
      persist: true,
    });
  } finally {
    loadingRunFlow.value = false;
    emit("update:modelValue", false);
  }
}

function proceed() {
  if (step.value === 1) {
    if (requireConfirmation) {
      step.value = 2;
    } else {
      runFlow();
    }
  } else {
    runFlow();
  }
}

function resetConfirm() {
  step.value = 1;
  confirmValues.value = {};
  selectedCollectionToRun.value = null;
  selectedItemKeys.value = [];
  emit("update:modelValue", false);
}
</script>

<template>
  <v-dialog :model-value="value" @update:model-value="resetConfirm">
    <v-card v-if="step === 1 || step === 3">
      <v-card-title>Run {{ selectedItem?.name }}</v-card-title>
      <v-card-text>
        <div class="mb-2">
          <v-select
            :model-value="selectedCollectionToRun"
            placeholder="Select a Collection"
            :items="(selectedItem?.options?.collections || [])
              .map((collection: string) => ({ text: collectionMap[collection]?.name || collection, value: collection }))"
            @update:model-value="onSelectCollectionToRun($event)"
          />
        </div>
        <div v-if="selectedCollectionToRun" class="mb-2 flex-end">
          <search-input :collection="selectedCollectionToRun" v-model="tabularSearch" v-model:filter="tabularFilter" />
        </div>
        <div class="overflow-x-scroll">
          <component
            v-if="selectedCollectionToRun"
            v-model:layout-query="tabularLayoutQuery"
            v-model:layout-options="tabularLayoutOptions"
            :is="layoutWrapper"
            ref="layoutRef"
            v-model:selection="selectedItemKeys"
            v-slot="{ layoutState }"
            :filter-user="{}"
            :filter-system="{}"
            :filter="tabularFilter"
            :search="tabularSearch"
            :collection="selectedCollectionToRun"
            :clear-filters="clearTabularFilters"
            :reset-preset="() => {}"
          >
            <component :is="`layout-tabular`" v-bind="layoutState">
              <template #no-results>
                <div class="flex-column">
                  <div class="flex-center mb-2">No Result</div>
                  <div class="flex-center">
                    <v-button small @click="clearTabularFilters">Clear Filter</v-button>
                  </div>
                </div>
              </template>

              <template #no-items>
                <v-info title="Item Count" :icon="collectionMap[selectedCollectionToRun]?.icon" center> No Item </v-info>
              </template>
            </component>
          </component>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-button secondary @click="resetConfirm"> Cancel </v-button>
        <v-button
          :disabled="(requireSelection && !selectedItemKeys.length) || !selectedCollectionToRun"
          @click="proceed()"
          :loading="loadingRunFlow"
        >
          {{ requireConfirmation ? "Next" : `Run with ${selectedItemKeys.length} ${selectedItemKeys.length > 1 ? "Items" : "Item"}` }}
        </v-button>
      </v-card-actions>
    </v-card>

    <v-card v-else-if="step === 2">
      <template v-if="confirmDetails">
        <v-card-title>{{ confirmDetails.confirmationDescription ?? "Run Flow Confirmation" }}</v-card-title>

        <v-card-text class="confirm-form">
          <v-form
            v-if="confirmDetails?.fields?.length"
            :fields="fields"
            :model-value="confirmValues"
            autofocus
            primary-key="+"
            @update:model-value="confirmValues = $event"
          />
        </v-card-text>
      </template>

      <v-card-actions>
        <v-button secondary @click="resetConfirm"> Cancel </v-button>
        <v-button :disabled="isConfirmButtonDisabled" @click="runFlow()" :loading="loadingRunFlow">
          Run with {{ selectedItemKeys.length }} {{ selectedItemKeys.length > 1 ? "Items" : "Item" }}
        </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style lang="scss" scoped>
.overflow-x-scroll {
  overflow-x: scroll;
}

.fields {
  --theme--form--row-gap: 24px;

  .type-label {
    font-size: 1rem;
  }
}

.confirm-form {
  --theme--form--column-gap: 24px;
  --theme--form--row-gap: 24px;

  margin-top: var(--v-card-padding, 16px);

  :deep(.type-label) {
    font-size: 1rem;
  }
}
</style>

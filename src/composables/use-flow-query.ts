import { ref, computed, type Ref } from 'vue';
import debounce from 'lodash/debounce';
import type { useApi } from '@directus/extensions-sdk';
import type { Filter, Preset } from '@directus/types';
import type { DirectusFilter, ExtendedUser, Header, ICredential, IFlow, IFolder } from '../types';
import { ENDPOINT_EXTENSION_NAME } from '../constants';

export interface UseFlowQueryOptions {
  api: ReturnType<typeof useApi>;
  presetsStore: {
    getPresetForCollection?: (collection: string) => Preset | undefined;
    update: (id: number | string, data: Record<string, unknown>) => Promise<unknown>;
    savePreset: (data: Record<string, unknown>) => Promise<unknown>;
    hydrate: () => void | Promise<void>;
  };
  flows: Ref<IFlow[]>;
  flowCategories: Ref<IFolder[]>;
  credentials: Ref<ICredential[]>;
  selectedCredential: Ref<string>;
  currentUser: Ref<ExtendedUser | null | undefined>;
  initialPreset?: Preset;
}

type PresetState = Record<string, unknown> & Partial<Preset>;

export function useFlowQuery(options: UseFlowQueryOptions) {
  const {
    api,
    presetsStore,
    flows,
    flowCategories,
    credentials,
    selectedCredential,
    currentUser,
    initialPreset,
  } = options;

  const preset = ref<PresetState | undefined>(
    (initialPreset as PresetState | undefined) ||
      (presetsStore.getPresetForCollection?.('flow-manager') as PresetState | undefined),
  );
  const isTabularFlowLoading = ref(false);
  const tabularFlows = ref<IFlow[]>([]);

  const selectedShortcutFilter = ref({
    status: 'all',
    trigger: 'all',
    flow_manager_category: 'all',
  });

  const selectedShortcutFilterCategoryName = computed(() => {
    if (
      !selectedShortcutFilter.value.flow_manager_category ||
      selectedShortcutFilter.value.flow_manager_category === 'all'
    )
      return;
    const category = flowCategories.value.find(
      (c) => c.id === selectedShortcutFilter.value.flow_manager_category,
    );
    if (category) return category.name;
    const flow = flows.value.find(
      (f) => f.id === selectedShortcutFilter.value.flow_manager_category,
    );
    return flow?.name;
  });

  const flowIdMap = computed<Record<string, IFlow>>(() =>
    flows.value.reduce((existingMap: Record<string, IFlow>, flow: IFlow) => {
      const map = { ...existingMap };
      map[flow.id] = flow;
      return map;
    }, {}),
  );

  const folderMap = computed<Record<string, IFolder>>(() =>
    flowCategories.value.reduce((existingMap: Record<string, IFolder>, category: IFolder) => {
      const map = { ...existingMap };
      map[category.id] = category;
      return map;
    }, {}),
  );

  const flowChildMap = computed<Record<string, (IFlow | IFolder)[]>>(() => {
    const result: Record<string, (IFlow | IFolder)[]> = {};

    for (let i = 0; i < flows.value.length; i++) {
      const flow = flows.value[i];
      if (!flow) continue;

      const category = flow?.flow_manager_metadata_id?.flow_manager_category;
      if (category) {
        let list = result[category];
        if (!list) {
          list = [];
          result[category] = list;
        }

        list.push(flow);
      }
    }

    for (let i = 0; i < flowCategories.value.length; i++) {
      const folder = flowCategories.value[i];
      if (!folder) continue;

      const category = folder?.flow_manager_metadata_id?.flow_manager_category;
      if (category) {
        let list = result[category];
        if (!list) {
          list = [];
          result[category] = list;
        }

        list.push(folder);
      }
    }

    for (const [key, value] of Object.entries(result)) {
      result[key] = value.sort((a, b) => {
        return (
          (a.flow_manager_metadata_id?.flow_manager_order || 0) -
          (b.flow_manager_metadata_id?.flow_manager_order || 0)
        );
      });
    }

    return result;
  });

  const tableSort = computed<{
    by: string;
    desc: boolean;
  }>({
    get: () => {
      const savedSort = preset.value?.layout_query?.sort;
      return savedSort || { by: 'status', desc: false };
    },
    set(value: { by: string; desc: boolean }) {
      preset.value = {
        ...(preset.value || {}),
        layout_query: {
          ...(preset.value?.layout_query || {}),
          sort: value,
        },
      };
      updatePreset();
    },
  });

  const tablePage = ref(1);

  const tableLimit = computed<number>({
    get() {
      const savedLimit = preset.value?.layout_options?.limit;
      return typeof savedLimit === 'number' && savedLimit > 0 ? savedLimit : 25;
    },
    set(value: number) {
      preset.value = {
        ...(preset.value || {}),
        layout_options: {
          ...(preset.value?.layout_options || {}),
          limit: value,
        },
      };
      updatePreset();
    },
  });

  const tableFlowFilter = computed<Preset['filter']>({
    get: () => {
      return preset.value?.filter ?? null;
    },
    set(value: Preset['filter']) {
      preset.value = {
        ...(preset.value || {}),
        filter: value,
      };
      tablePage.value = 1;
      updatePreset();
    },
  });

  const tableFlowSearch = computed<Preset['search']>({
    get: () => {
      return preset.value?.search ?? null;
    },
    set(value: Preset['search']) {
      preset.value = {
        ...(preset.value || {}),
        search: value,
      };
      tablePage.value = 1;
      updatePreset();
    },
  });

  // true for list view, false for table view
  const viewListMode = computed<boolean>({
    get() {
      if (typeof preset.value?.layout_options?.viewListMode === 'undefined') {
        return true;
      }
      return preset.value?.layout_options?.viewListMode;
    },
    set(value: boolean) {
      preset.value = {
        ...(preset.value || {}),
        layout_options: {
          ...(preset.value?.layout_options || {}),
          viewListMode: value,
        },
      };
      updatePreset();
    },
  });

  const processedFlows = computed(() => {
    const numberFields = ['flow_manager_run_counter'];
    return [...flows.value].sort((a, b) => {
      const sort = tableSort.value;

      if (numberFields.includes(sort.by)) {
        const aValue = (a as unknown as Record<string, number>)[sort.by] || 0;
        const bValue = (b as unknown as Record<string, number>)[sort.by] || 0;
        return sort.desc ? bValue - aValue : aValue - bValue;
      }

      let aValue: string = (a as unknown as Record<string, string>)[sort.by] || '';
      let bValue: string = (b as unknown as Record<string, string>)[sort.by] || '';

      if (sort.by === 'flow_manager_category') {
        const aCategory = folderMap.value[aValue]?.name || flowIdMap.value[aValue]?.name || aValue;
        const bCategory = folderMap.value[bValue]?.name || flowIdMap.value[bValue]?.name || bValue;

        aValue = aCategory;
        bValue = bCategory;
      }
      if (sort.desc) {
        return bValue.localeCompare(aValue);
      }

      return aValue.localeCompare(bValue);
    });
  });

  const headers = computed<Header[]>({
    get() {
      const savedHeaders = preset.value?.layout_options?.headers;
      const defaultWidth = 300;
      return (
        savedHeaders || [
          {
            text: '',
            value: 'icon',
            width: 50,
            sortable: false,
          },
          {
            text: 'Status',
            value: 'status',
            sortable: true,
            width: defaultWidth,
          },
          {
            text: 'Name',
            value: 'name',
            sortable: true,
            width: defaultWidth,
          },
          {
            text: 'Category',
            value: 'flow_manager_category',
            sortable: true,
            width: defaultWidth,
          },
          {
            text: 'Trigger Type',
            value: 'trigger',
            sortable: true,
            width: defaultWidth,
          },
          {
            text: 'Description',
            value: 'description',
            sortable: true,
            width: defaultWidth,
          },
          {
            text: 'Total Runs',
            value: 'flow_manager_run_counter',
            sortable: true,
            width: defaultWidth,
          },
          {
            text: 'Last Run',
            value: 'flow_manager_last_run_at',
            sortable: true,
            width: defaultWidth,
          },
          {
            text: 'Date Created',
            value: 'date_created',
            sortable: true,
            width: defaultWidth,
          },
        ]
      ).map((h: Header) => {
        const editedHeader = { ...h };
        if (editedHeader.value === 'flow_manager_category') {
          editedHeader.text = selectedShortcutFilterCategoryName.value
            ? `Category (${selectedShortcutFilterCategoryName.value})`
            : 'Category';
        } else if (editedHeader.value === 'trigger') {
          editedHeader.text =
            selectedShortcutFilter.value.trigger && selectedShortcutFilter.value.trigger !== 'all'
              ? `Trigger Type (${selectedShortcutFilter.value.trigger.toUpperCase()})`
              : 'Trigger Type';
        }

        return editedHeader;
      });
    },
    set(value: Header[]) {
      preset.value = {
        ...(preset.value || {}),
        layout_options: {
          ...(preset.value?.layout_options || {}),
          headers: value,
        },
      };
      updatePreset();
    },
  });

  async function reloadTabularFlow() {
    try {
      isTabularFlowLoading.value = true;
      let sort = 'id';
      const sortMap: Record<string, string> = {
        flow_manager_order: 'flow_manager_metadata_id.flow_manager_order',
        flow_manager_category: 'flow_manager_metadata_id.flow_manager_category',
        flow_manager_run_counter: 'flow_manager_metadata_id.flow_manager_run_counter',
        flow_manager_last_run_at: 'flow_manager_metadata_id.flow_manager_last_run_at',
        flow_manager_last_run_message: 'flow_manager_metadata_id.flow_manager_last_run_message',
        flow_manager_last_run_operation: 'flow_manager_metadata_id.flow_manager_last_run_operation',
        flow_manager_error_counter: 'flow_manager_metadata_id.flow_manager_error_counter',
        flow_manager_success_counter: 'flow_manager_metadata_id.flow_manager_success_counter',
      };
      if (tableSort.value) {
        sort = sortMap[tableSort.value.by] || tableSort.value.by;
        if (tableSort.value.desc) {
          sort = `-${sort}`;
        }
      }
      const fields = ['*', 'operations.*', 'flow_manager_metadata_id.*'];

      let response: { data: { data: IFlow[] } } = { data: { data: [] } };
      if (selectedCredential.value === 'local') {
        response = await api.get('/flows', {
          params: {
            fields: fields.join(','),
            sort,
            filter: tableFlowFilter.value,
            search: tableFlowSearch.value,
          },
        });
      } else {
        const c = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (c) {
          const queries = [`fields=${fields.join(',')}`, `sort=${sort}`];
          if (tableFlowFilter.value) {
            queries.push(`filter=${JSON.stringify(tableFlowFilter.value)}`);
          }
          if (tableFlowSearch.value) {
            queries.push(`search=${tableFlowSearch.value}`);
          }
          response = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${c.url}/flows?${queries.join('&')}`,
            staticToken: c.staticToken,
            method: 'GET',
          });
        }
      }
      tabularFlows.value = response.data.data;
    } catch {
    } finally {
      isTabularFlowLoading.value = false;
    }
  }

  async function reloadExternalPreset() {
    const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
    if (credential && currentUser.value) {
      const {
        data: { data },
      } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
        url: `${credential.url}/presets?filter[user][_eq]=${currentUser.value?.id}&limit=-1`,
        staticToken: credential.staticToken,
        method: 'GET',
      });
      const [selectedPreset] = data.filter(
        (presetItem: { collection: string }) => presetItem.collection === 'flow-manager',
      );
      preset.value = selectedPreset;
    }
  }

  const updateExistingPreset = debounce(async () => {
    if (!preset.value?.id) return;
    if (selectedCredential.value === 'local') {
      await presetsStore.update(preset.value.id, {
        layout_options: {
          sort: tableSort.value,
          headers: headers.value,
          viewListMode: viewListMode.value,
          limit: tableLimit.value,
        },
        layout_query: {
          sort: tableSort.value,
        },
        filter: tableFlowFilter.value,
        search: tableFlowSearch.value,
      });
      presetsStore.hydrate();
    } else {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      if (credential) {
        await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
          url: `${credential.url}/presets/${preset.value.id}`,
          staticToken: credential.staticToken,
          method: 'PATCH',
          payload: {
            layout_options: {
              sort: tableSort.value,
              headers: headers.value,
              viewListMode: viewListMode.value,
              limit: tableLimit.value,
            },
            layout_query: {
              sort: tableSort.value,
            },
            filter: tableFlowFilter.value,
            search: tableFlowSearch.value,
          },
        });
      }
    }
    reloadTabularFlow();
  }, 500);

  const createNewPreset = debounce(async () => {
    if (selectedCredential.value === 'local') {
      await presetsStore.savePreset({
        bookmark: null,
        collection: 'flow-manager',
        layout_options: {
          sort: tableSort.value,
          headers: headers.value,
          viewListMode: viewListMode.value,
          limit: tableLimit.value,
        },
        layout_query: {
          sort: tableSort.value,
        },
        filter: tableFlowFilter.value,
        search: tableFlowSearch.value,
      });
      presetsStore.hydrate();
    } else {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      if (credential) {
        await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
          url: `${credential.url}/presets`,
          staticToken: credential.staticToken,
          method: 'POST',
          payload: {
            bookmark: null,
            collection: 'flow-manager',
            layout_options: {
              sort: tableSort.value,
              headers: headers.value,
              viewListMode: viewListMode.value,
              limit: tableLimit.value,
            },
            layout_query: {
              sort: tableSort.value,
            },
            filter: tableFlowFilter.value,
            search: tableFlowSearch.value,
            user: currentUser.value?.id,
          },
        });
        reloadExternalPreset();
      }
    }
    reloadTabularFlow();
  }, 500);

  function updatePreset() {
    isTabularFlowLoading.value = true;
    if (preset.value?.id) {
      updateExistingPreset();
    } else {
      createNewPreset();
    }
  }

  function onTableSortChange(sort: { by: string; desc: boolean }) {
    tableSort.value = sort;
    updatePreset();
  }

  function setStatusFilter(status: string) {
    const currentFilter = tableFlowFilter.value as DirectusFilter | null;
    const filteredAnd =
      currentFilter?._and?.filter(
        (filter: Record<string, unknown>) => Object.keys(filter)[0] !== 'status',
      ) || [];
    if (status !== 'all') {
      filteredAnd.push({
        status: {
          _eq: status,
        },
      });
    }
    tableFlowFilter.value = {
      ...(currentFilter || {}),
      _and: filteredAnd,
    } as unknown as Filter;
    selectedShortcutFilter.value.status = status;
    updatePreset();
  }

  function setTriggerFilter(trigger: string) {
    const currentFilter = tableFlowFilter.value as DirectusFilter | null;
    const filteredAnd =
      currentFilter?._and?.filter(
        (filter: Record<string, unknown>) => Object.keys(filter)[0] !== 'trigger',
      ) || [];
    if (trigger !== 'all') {
      filteredAnd.push({
        trigger: {
          _eq: trigger,
        },
      });
    }
    tableFlowFilter.value = {
      ...(currentFilter || {}),
      _and: filteredAnd,
    } as unknown as Filter;
    selectedShortcutFilter.value.trigger = trigger;
    updatePreset();
  }

  function setCategoryFilter(category: string) {
    const currentFilter = tableFlowFilter.value as DirectusFilter | null;
    const filteredAnd =
      currentFilter?._and?.filter(
        (filter: Record<string, unknown>) => Object.keys(filter)[0] !== 'flow_manager_metadata_id',
      ) || [];
    const metadataFilters =
      currentFilter?._and?.filter(
        (filter: Record<string, unknown>) => Object.keys(filter)[0] === 'flow_manager_metadata_id',
      ) || [];
    const otherMetadataFilters = metadataFilters.filter(
      (filter: Record<string, unknown>) =>
        !(filter.flow_manager_metadata_id as Record<string, unknown> | undefined)
          ?.flow_manager_category,
    );

    if (category !== 'all') {
      filteredAnd.push({
        flow_manager_metadata_id: {
          flow_manager_category: {
            _eq: category,
          },
        },
      });
    }
    tableFlowFilter.value = {
      ...(currentFilter || {}),
      _and: [...filteredAnd, ...otherMetadataFilters],
    } as unknown as Filter;
    selectedShortcutFilter.value.flow_manager_category = category;
    updatePreset();
  }

  function getCategoryName(categoryId: string) {
    if (folderMap.value[categoryId || '']?.name) {
      return `${folderMap.value[categoryId || '']?.name}`;
    }
    if (flowIdMap.value[categoryId]?.name) {
      return `${flowIdMap.value[categoryId]?.name}`;
    }

    return categoryId;
  }

  function getCategoryIcon(categoryId: string): { name?: string; color?: string | null } {
    if (!categoryId) {
      return {
        name: '',
      };
    }
    if (folderMap.value[categoryId || '']?.icon) {
      return {
        name: folderMap.value[categoryId || '']?.icon || undefined,
        color: folderMap.value[categoryId || '']?.color || null,
      };
    }
    if (flowIdMap.value[categoryId]?.icon) {
      return {
        name: flowIdMap.value[categoryId]?.icon || undefined,
        color: flowIdMap.value[categoryId]?.color || null,
      };
    }

    return {
      name: 'folder',
    };
  }

  return {
    preset,
    isTabularFlowLoading,
    tabularFlows,
    selectedShortcutFilter,
    selectedShortcutFilterCategoryName,
    flowIdMap,
    folderMap,
    flowChildMap,
    tableSort,
    tableFlowFilter,
    tableFlowSearch,
    viewListMode,
    processedFlows,
    headers,
    tablePage,
    tableLimit,
    reloadTabularFlow,
    reloadExternalPreset,
    updatePreset,
    onTableSortChange,
    setStatusFilter,
    setTriggerFilter,
    setCategoryFilter,
    getCategoryName,
    getCategoryIcon,
  };
}

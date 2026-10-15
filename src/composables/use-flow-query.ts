import { ref, computed, watch, type Ref } from 'vue';
import debounce from 'lodash/debounce';
import type { useApi } from '@directus/extensions-sdk';
import type { Filter, Preset } from '@directus/types';
import type {
  DirectusFilter,
  ExtendedUser,
  FlowViewMode,
  Header,
  ICredential,
  IFlow,
  IFolder,
} from '../types';
import { ENDPOINT_EXTENSION_NAME } from '../constants';
import { cleanFilter } from '../utils/filter.util';

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

  const rawInitial =
    (initialPreset as PresetState | undefined) ||
    (presetsStore.getPresetForCollection?.('flow-manager') as PresetState | undefined);
  if (rawInitial && typeof rawInitial.filter === 'string') {
    try {
      rawInitial.filter = JSON.parse(rawInitial.filter);
    } catch {
      rawInitial.filter = null;
    }
  }
  const preset = ref<PresetState | undefined>(rawInitial ? { ...rawInitial } : undefined);
  const isTabularFlowLoading = ref(false);
  const tabularFlows = ref<IFlow[]>([]);

  const selectedShortcutFilter = ref({
    status: 'all',
    trigger: 'all',
    flow_manager_category: 'all',
  });

  function syncShortcutFilters() {
    let currentFilter = preset.value?.filter as DirectusFilter | string | null | undefined;
    if (typeof currentFilter === 'string') {
      try {
        currentFilter = JSON.parse(currentFilter) as DirectusFilter;
      } catch {
        currentFilter = null;
      }
    }
    if (!currentFilter || typeof currentFilter !== 'object') {
      selectedShortcutFilter.value = {
        status: 'all',
        trigger: 'all',
        flow_manager_category: 'all',
      };
      return;
    }

    const rules: Record<string, unknown>[] = [];
    if (Array.isArray(currentFilter._and)) {
      rules.push(...(currentFilter._and as Record<string, unknown>[]));
    } else {
      rules.push(currentFilter as Record<string, unknown>);
    }

    let status = 'all';
    let trigger = 'all';
    let category = 'all';

    for (const r of rules) {
      if (r && typeof r === 'object') {
        const rec = r as Record<string, Record<string, unknown> | undefined>;
        if (rec.status && typeof rec.status === 'object' && rec.status._eq !== undefined) {
          status = String(rec.status._eq);
        }
        if (rec.trigger && typeof rec.trigger === 'object' && rec.trigger._eq !== undefined) {
          trigger = String(rec.trigger._eq);
        }
        const metadata = rec.flow_manager_metadata_id;
        if (metadata && typeof metadata === 'object') {
          const categoryField = (metadata as Record<string, unknown>).flow_manager_category;
          if (
            categoryField &&
            typeof categoryField === 'object' &&
            (categoryField as Record<string, unknown>)._eq !== undefined
          ) {
            category = String((categoryField as Record<string, unknown>)._eq);
          }
        }
      }
    }

    selectedShortcutFilter.value = {
      status,
      trigger,
      flow_manager_category: category,
    };
  }

  syncShortcutFilters();

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
      if (!flow || flow.options?.archived) continue;

      const category = flow?.flow_manager_metadata_id?.flow_manager_category;
      if (category) {
        const parentFlow = flowIdMap.value[category];
        if (parentFlow?.options?.archived) {
          continue;
        }
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
        const parentFlow = flowIdMap.value[category];
        if (parentFlow?.options?.archived) {
          continue;
        }
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
      const current = preset.value?.filter;
      if (typeof current === 'string') {
        try {
          return JSON.parse(current);
        } catch {
          return null;
        }
      }
      return current ?? null;
    },
    set(value: Preset['filter']) {
      let normalizedValue = value;
      if (typeof normalizedValue === 'string') {
        try {
          normalizedValue = JSON.parse(normalizedValue);
        } catch {
          normalizedValue = null;
        }
      }
      if (
        normalizedValue &&
        typeof normalizedValue === 'object' &&
        !Array.isArray(normalizedValue)
      ) {
        const obj = normalizedValue as Record<string, unknown>;
        if (
          Object.keys(obj).length === 0 ||
          (Array.isArray(obj._and) && obj._and.length === 0 && Object.keys(obj).length === 1) ||
          (Array.isArray(obj._or) && obj._or.length === 0 && Object.keys(obj).length === 1)
        ) {
          normalizedValue = null;
        }
      }
      preset.value = {
        ...(preset.value || {}),
        filter: normalizedValue,
      };
      tablePage.value = 1;
      syncShortcutFilters();
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

  // Current view mode: 'LIST' | 'TABLE' | 'GRAPH'
  const viewMode = computed<FlowViewMode>({
    get() {
      const rawMode = preset.value?.layout_options?.viewMode;
      if (
        rawMode === 'LIST' ||
        rawMode === 'TABLE' ||
        rawMode === 'GRAPH' ||
        rawMode === 'TIMELINE'
      ) {
        return rawMode;
      }
      if (typeof preset.value?.layout_options?.viewListMode !== 'undefined') {
        return preset.value.layout_options.viewListMode ? 'LIST' : 'TABLE';
      }
      return 'LIST';
    },
    set(value: FlowViewMode) {
      preset.value = {
        ...(preset.value || {}),
        layout_options: {
          ...(preset.value?.layout_options || {}),
          viewMode: value,
          viewListMode: value === 'LIST',
        },
      };
      updatePreset();
    },
  });

  // Backwards compatibility for boolean viewListMode
  const viewListMode = computed<boolean>({
    get() {
      return viewMode.value === 'LIST';
    },
    set(value: boolean) {
      viewMode.value = value ? 'LIST' : 'TABLE';
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
      const cleanedFilter = cleanFilter(tableFlowFilter.value);

      let response: { data: { data: IFlow[] } } = { data: { data: [] } };
      if (selectedCredential.value === 'local') {
        const queryParams: Record<string, unknown> = {
          fields: fields.join(','),
          sort,
        };
        if (cleanedFilter) {
          queryParams.filter = cleanedFilter;
        }
        if (tableFlowSearch.value) {
          queryParams.search = tableFlowSearch.value;
        }
        response = await api.get('/flows', {
          params: queryParams,
        });
      } else {
        const c = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (c) {
          const queries = [`fields=${fields.join(',')}`, `sort=${sort}`];
          if (cleanedFilter) {
            queries.push(`filter=${encodeURIComponent(JSON.stringify(cleanedFilter))}`);
          }
          if (tableFlowSearch.value) {
            queries.push(`search=${encodeURIComponent(tableFlowSearch.value)}`);
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
    if (!credential) {
      preset.value = undefined;
      return;
    }

    try {
      const {
        data: { data },
      } = await api.post<{ data: Preset[] }>(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
        url: `${credential.url}/presets?filter[collection][_eq]=flow-manager&limit=-1`,
        staticToken: credential.staticToken,
        method: 'GET',
      });

      if (Array.isArray(data) && data.length > 0) {
        const currentUserId = currentUser.value?.id;
        const matchingPreset =
          (currentUserId ? data.find((p) => p.user === currentUserId) : undefined) ||
          data.find((p) => !p.user) ||
          data[0];

        preset.value = matchingPreset ? { ...matchingPreset } : undefined;
      } else {
        preset.value = undefined;
      }
    } catch (err) {
      console.warn('[FLOW MANAGER] Failed to load remote preset:', err);
      preset.value = undefined;
    }
  }

  async function reloadPreset() {
    if (selectedCredential.value === 'local') {
      try {
        await presetsStore.hydrate?.();
      } catch {
        // Hydration might be in progress
      }
      let localPreset = presetsStore.getPresetForCollection?.('flow-manager') as
        PresetState | undefined;
      if (
        preset.value?.id &&
        Array.isArray((presetsStore as Record<string, unknown>).collectionPresets)
      ) {
        const matching = (
          (presetsStore as Record<string, unknown>).collectionPresets as Preset[]
        ).find((p: Preset) => p.id === preset.value?.id);
        if (matching) {
          localPreset = matching as PresetState;
        }
      }
      if (localPreset) {
        if (typeof localPreset.filter === 'string') {
          try {
            localPreset.filter = JSON.parse(localPreset.filter);
          } catch {
            localPreset.filter = null;
          }
        }
        preset.value = { ...localPreset };
      } else {
        preset.value = undefined;
      }
    } else {
      await reloadExternalPreset();
    }
    syncShortcutFilters();
  }

  watch(
    () => selectedCredential.value,
    async (newVal, oldVal) => {
      if (newVal !== oldVal) {
        await reloadPreset();
        tablePage.value = 1;
      }
    },
  );

  const updateExistingPreset = debounce(async () => {
    if (!preset.value?.id) {
      await createNewPreset();
      return;
    }
    const layoutOptions = {
      sort: tableSort.value,
      headers: headers.value,
      viewListMode: viewListMode.value,
      viewMode: viewMode.value,
      limit: tableLimit.value,
    };
    const layoutQuery = {
      sort: tableSort.value,
    };
    const rawFilter = tableFlowFilter.value;
    const filterToSave = cleanFilter(rawFilter) ?? rawFilter ?? null;

    try {
      if (selectedCredential.value === 'local') {
        const existing = presetsStore.getPresetForCollection?.('flow-manager');
        if (!existing?.id && !preset.value.id) {
          await createNewPreset();
          return;
        }

        const updated = (await presetsStore.update(preset.value.id, {
          layout_options: layoutOptions,
          layout_query: layoutQuery,
          filter: filterToSave,
          search: tableFlowSearch.value,
        })) as PresetState | undefined;

        if (updated?.id) {
          preset.value = {
            ...preset.value,
            ...updated,
            filter: rawFilter ?? null,
          };
        }
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (credential) {
          const res = await api.post<{ data: Preset }>(
            `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
            {
              url: `${credential.url}/presets/${preset.value.id}`,
              staticToken: credential.staticToken,
              method: 'PATCH',
              payload: {
                layout_options: layoutOptions,
                layout_query: layoutQuery,
                filter: filterToSave,
                search: tableFlowSearch.value,
              },
            },
          );
          if (res.data?.data) {
            preset.value = {
              ...preset.value,
              ...res.data.data,
              filter: rawFilter ?? null,
            };
          }
        }
      }
    } catch (err) {
      console.warn('[FLOW MANAGER] Failed to update preset, falling back to create new:', err);
      if (preset.value) {
        delete preset.value.id;
      }
      await createNewPreset();
    }
    reloadTabularFlow();
  }, 500);

  const createNewPreset = debounce(async () => {
    const layoutOptions = {
      sort: tableSort.value,
      headers: headers.value,
      viewListMode: viewListMode.value,
      viewMode: viewMode.value,
      limit: tableLimit.value,
    };
    const layoutQuery = {
      sort: tableSort.value,
    };
    const rawFilter = tableFlowFilter.value;
    const filterToSave = cleanFilter(rawFilter) ?? rawFilter ?? null;

    try {
      if (selectedCredential.value === 'local') {
        const saved = (await presetsStore.savePreset({
          bookmark: null,
          collection: 'flow-manager',
          layout_options: layoutOptions,
          layout_query: layoutQuery,
          filter: filterToSave,
          search: tableFlowSearch.value,
        })) as PresetState | undefined;

        if (saved?.id) {
          preset.value = {
            ...preset.value,
            ...saved,
            filter: rawFilter ?? null,
          };
        }
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (credential) {
          const res = await api.post<{ data: Preset }>(
            `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
            {
              url: `${credential.url}/presets`,
              staticToken: credential.staticToken,
              method: 'POST',
              payload: {
                bookmark: null,
                collection: 'flow-manager',
                layout_options: layoutOptions,
                layout_query: layoutQuery,
                filter: filterToSave,
                search: tableFlowSearch.value,
                ...(currentUser.value?.id ? { user: currentUser.value.id } : {}),
              },
            },
          );
          if (res.data?.data) {
            preset.value = {
              ...preset.value,
              ...res.data.data,
              filter: rawFilter ?? null,
            };
          }
        }
      }
    } catch (err) {
      console.warn('[FLOW MANAGER] Failed to create preset:', err);
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
  }

  function setStatusFilter(status: string) {
    const currentFilter =
      tableFlowFilter.value && typeof tableFlowFilter.value === 'object'
        ? (tableFlowFilter.value as DirectusFilter)
        : {};
    const filteredAnd =
      currentFilter._and?.filter(
        (filter: Record<string, unknown>) => Object.keys(filter)[0] !== 'status',
      ) || [];
    const { status: _s, ...restFilter } = currentFilter;

    if (status !== 'all') {
      filteredAnd.push({
        status: {
          _eq: status,
        },
      });
    }

    if (filteredAnd.length > 0) {
      tableFlowFilter.value = {
        ...restFilter,
        _and: filteredAnd,
      } as unknown as Filter;
    } else if (
      Object.keys(restFilter).length > 0 &&
      Object.keys(restFilter).some((k) => k !== '_and')
    ) {
      const { _and: _empty, ...rem } = restFilter;
      tableFlowFilter.value = Object.keys(rem).length > 0 ? (rem as unknown as Filter) : null;
    } else {
      tableFlowFilter.value = null;
    }
    selectedShortcutFilter.value.status = status;
  }

  function setTriggerFilter(trigger: string) {
    const currentFilter =
      tableFlowFilter.value && typeof tableFlowFilter.value === 'object'
        ? (tableFlowFilter.value as DirectusFilter)
        : {};
    const filteredAnd =
      currentFilter._and?.filter(
        (filter: Record<string, unknown>) => Object.keys(filter)[0] !== 'trigger',
      ) || [];
    const { trigger: _t, ...restFilter } = currentFilter;

    if (trigger !== 'all') {
      filteredAnd.push({
        trigger: {
          _eq: trigger,
        },
      });
    }

    if (filteredAnd.length > 0) {
      tableFlowFilter.value = {
        ...restFilter,
        _and: filteredAnd,
      } as unknown as Filter;
    } else if (
      Object.keys(restFilter).length > 0 &&
      Object.keys(restFilter).some((k) => k !== '_and')
    ) {
      const { _and: _empty, ...rem } = restFilter;
      tableFlowFilter.value = Object.keys(rem).length > 0 ? (rem as unknown as Filter) : null;
    } else {
      tableFlowFilter.value = null;
    }
    selectedShortcutFilter.value.trigger = trigger;
  }

  function setCategoryFilter(category: string) {
    const currentFilter =
      tableFlowFilter.value && typeof tableFlowFilter.value === 'object'
        ? (tableFlowFilter.value as DirectusFilter)
        : {};
    const filteredAnd =
      currentFilter._and?.filter((item: Record<string, unknown>) => {
        if (!item || typeof item !== 'object') return false;
        const key = Object.keys(item)[0];
        if (key !== 'flow_manager_metadata_id') return true;
        const meta = item.flow_manager_metadata_id;
        return !(
          meta &&
          typeof meta === 'object' &&
          (meta as Record<string, unknown>).flow_manager_category !== undefined
        );
      }) || [];
    const { flow_manager_metadata_id: _meta, ...restFilter } = currentFilter;

    if (category !== 'all') {
      filteredAnd.push({
        flow_manager_metadata_id: {
          flow_manager_category: {
            _eq: category,
          },
        },
      });
    }

    if (filteredAnd.length > 0) {
      tableFlowFilter.value = {
        ...restFilter,
        _and: filteredAnd,
      } as unknown as Filter;
    } else if (
      Object.keys(restFilter).length > 0 &&
      Object.keys(restFilter).some((k) => k !== '_and')
    ) {
      const { _and: _empty, ...rem } = restFilter;
      tableFlowFilter.value = Object.keys(rem).length > 0 ? (rem as unknown as Filter) : null;
    } else {
      tableFlowFilter.value = null;
    }
    selectedShortcutFilter.value.flow_manager_category = category;
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
    viewMode,
    viewListMode,
    processedFlows,
    headers,
    tablePage,
    tableLimit,
    reloadTabularFlow,
    reloadExternalPreset,
    reloadPreset,
    updatePreset,
    onTableSortChange,
    setStatusFilter,
    setTriggerFilter,
    setCategoryFilter,
    getCategoryName,
    getCategoryIcon,
  };
}

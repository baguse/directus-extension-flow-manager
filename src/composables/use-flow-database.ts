import { computed, ref, type Ref, type ComputedRef } from 'vue';
import type { Field } from '@directus/types';
import type { useApi } from '@directus/extensions-sdk';
import type {
  CollectionsStore,
  ExtendedField,
  FieldsStore,
  ICredential,
  IFlow,
  IFolder,
  ISyncFlowCounter,
} from '../types';
import { ENDPOINT_EXTENSION_NAME } from '../constants';
import useFields from '../utils/field.util';
import useCollections from '../utils/collection.util';

export interface UseFlowDatabaseOptions {
  api: ReturnType<typeof useApi>;
  fieldsStore: FieldsStore;
  collectionsStore: CollectionsStore;
  relationsStore: {
    upsertRelation: (collection: string, field: string, relation: unknown) => Promise<unknown>;
    hydrate: () => Promise<void>;
  };
  settingsStore: {
    updateSettings: (data: Record<string, unknown>, notify?: boolean) => void;
  };
  notificationsStore: {
    add: (notification: {
      type: string;
      title: string;
      closeable?: boolean;
      persist?: boolean;
    }) => void;
  };
  credentials: Ref<ICredential[]>;
  selectedCredential: Ref<string>;
  flows: Ref<IFlow[]>;
  flowFields: Ref<Field[]>;
  settingFields: Ref<Field[]>;
  flowCategories: Ref<IFolder[]>;
  settingDialog: Ref<boolean>;
  reloadFlow: () => Promise<void>;
  reloadTabularFlow: () => Promise<void>;
  reloadFields: (collection: string) => Promise<Field[]>;
  reloadFolders: () => Promise<IFolder[]>;
}

export function useFlowDatabase(options: UseFlowDatabaseOptions) {
  const {
    api,
    fieldsStore,
    collectionsStore,
    relationsStore,
    settingsStore,
    notificationsStore,
    credentials,
    selectedCredential,
    flows,
    flowFields,
    settingFields,
    flowCategories,
    settingDialog,
    reloadFlow,
    reloadTabularFlow,
    reloadFields,
    reloadFolders,
  } = options;

  const notCreatedFields = ref<Partial<ExtendedField>[]>([]);
  const differentFields = ref<Partial<Field>[]>([]);
  const notCreatedCollections = ref<string[]>([]);

  const isConfigurationLoading = ref(false);
  const isSyncingFlowCountersLoading = ref(false);

  const { ensureFields } = useFields({
    api,
    fieldsStore,
    credentials,
    selectedCredential,
  });

  const { ensureCollections } = useCollections({
    api,
    fieldsStore,
    collectionsStore,
    credentials,
    selectedCredential,
  });

  const isDatabaseUpdated: ComputedRef<boolean> = computed(() => {
    return !(
      notCreatedFields.value.length ||
      differentFields.value.length ||
      notCreatedCollections.value.length
    );
  });

  async function ensureDatabase() {
    try {
      const { notExistsFields, differentFields: differentFieldsResult } = await ensureFields();
      const { notExistsCollections } = await ensureCollections();
      notCreatedFields.value = notExistsFields;
      differentFields.value = differentFieldsResult;
      notCreatedCollections.value = notExistsCollections;
      if (notExistsFields.length || differentFields.value.length || notExistsCollections.length) {
        settingDialog.value = true;
      }
    } catch (err: unknown) {
      console.error('[FLOW MANAGER] Unable to check database schema:', err);
    }
  }

  async function configureFlowManagerDatabase() {
    isConfigurationLoading.value = true;

    if (selectedCredential.value === 'local') {
      for (const collectionName of notCreatedCollections.value) {
        await collectionsStore.upsertCollection(collectionName, {
          collection: collectionName,
          fields: [
            {
              field: 'id',
              type: 'uuid',
              meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
              schema: { is_primary_key: true, length: 36, has_auto_increment: false },
            },
            {
              field: 'date_created',
              type: 'timestamp',
              meta: {
                special: ['date-created'],
                interface: 'datetime',
                readonly: true,
                hidden: true,
                width: 'half',
                display: 'datetime',
                display_options: { relative: true },
              },
              schema: {},
            },
            {
              field: 'date_updated',
              type: 'timestamp',
              meta: {
                special: ['date-updated'],
                interface: 'datetime',
                readonly: true,
                hidden: true,
                width: 'half',
                display: 'datetime',
                display_options: { relative: true },
              },
              schema: {},
            },
          ],
          schema: {},
          meta: { singleton: false },
        });
      }
      for (const field of notCreatedFields.value) {
        if (!field.collection || !field.field) continue;
        const fieldPayload = { ...field };
        delete (fieldPayload as Record<string, unknown>).scope;
        await fieldsStore.createField(field.collection, fieldPayload);
        if (field.meta?.special?.includes('m2o')) {
          await relationsStore.upsertRelation(field.collection, field.field, {
            collection: field.collection,
            field: field.field,
            related_collection: field.schema?.related_collection,
            meta: { sort_field: null },
            schema: {
              on_delete: field.collection === 'flow_manager_credentials' ? 'CASCADE' : 'SET NULL',
            },
          });
        }
      }
      for (const field of differentFields.value) {
        if (!field.collection || !field.field) continue;
        const fieldPayload = { ...field };
        delete (fieldPayload as Record<string, unknown>).scope;
        await fieldsStore.deleteField(field.collection, field.field);
        await fieldsStore.createField(field.collection, fieldPayload);
      }
      await fieldsStore.hydrate();
      await collectionsStore.hydrate();
      await relationsStore.hydrate();
      flowFields.value = fieldsStore.getFieldsForCollection('directus_flows') as Field[];
      settingFields.value = fieldsStore.getFieldsForCollection('directus_settings') as Field[];
      if (notCreatedCollections.value.includes('flow_manager_metadata')) {
        await syncMetadata();
      }
    } else {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      if (credential) {
        for (const collectionName of notCreatedCollections.value) {
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential?.url}/collections`,
            staticToken: credential?.staticToken,
            method: 'POST',
            payload: {
              collection: collectionName,
              fields: [
                {
                  field: 'id',
                  type: 'uuid',
                  meta: { hidden: true, readonly: true, interface: 'input', special: ['uuid'] },
                  schema: { is_primary_key: true, length: 36, has_auto_increment: false },
                },
                {
                  field: 'date_created',
                  type: 'timestamp',
                  meta: {
                    special: ['date-created'],
                    interface: 'datetime',
                    readonly: true,
                    hidden: true,
                    width: 'half',
                    display: 'datetime',
                    display_options: { relative: true },
                  },
                  schema: {},
                },
                {
                  field: 'date_updated',
                  type: 'timestamp',
                  meta: {
                    special: ['date-updated'],
                    interface: 'datetime',
                    readonly: true,
                    hidden: true,
                    width: 'half',
                    display: 'datetime',
                    display_options: { relative: true },
                  },
                  schema: {},
                },
              ],
              schema: {},
              meta: { singleton: false },
            },
          });
        }
        for (const field of notCreatedFields.value) {
          if (!field.collection || !field.field) continue;
          const fieldPayload = { ...field };
          delete (fieldPayload as Record<string, unknown>).scope;
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential?.url}/fields/${field.collection}`,
            staticToken: credential?.staticToken,
            method: 'POST',
            payload: fieldPayload,
          });
          if (field.meta?.special?.includes('m2o')) {
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/relations`,
              staticToken: credential?.staticToken,
              method: 'POST',
              payload: {
                collection: field.collection,
                field: field.field,
                related_collection: field.schema?.related_collection,
                meta: { sort_field: null },
                schema: { on_delete: 'SET NULL' },
              },
            });
          }
        }
        for (const field of differentFields.value) {
          if (!field.collection || !field.field) continue;
          const fieldPayload = { ...field };
          delete (fieldPayload as Record<string, unknown>).scope;
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential?.url}/fields/${field.collection}/${field.field}`,
            staticToken: credential?.staticToken,
            method: 'DELETE',
          });
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential?.url}/fields/${field.collection}`,
            staticToken: credential?.staticToken,
            method: 'POST',
            payload: fieldPayload,
          });
        }

        flowFields.value = await reloadFields('directus_flows');
        settingFields.value = await reloadFields('directus_settings');
        if (notCreatedCollections.value.includes('flow_manager_metadata')) {
          await syncMetadata();
        }
      }
    }
    settingDialog.value = false;
    isConfigurationLoading.value = false;
    ensureDatabase();
  }

  async function syncMetadata() {
    try {
      await reloadFlow();
      const currentCategories = await reloadFolders();
      const categories = (currentCategories || []).map((c: IFolder) => {
        return {
          ...c,
          flow_manager_metadata_id: {
            flow_manager_order: c.flow_manager_order,
            flow_manager_category: c.flow_manager_category,
          },
        };
      });
      if (selectedCredential.value === 'local') {
        for (const flow of flows.value) {
          const {
            flow_manager_category,
            flow_manager_order,
            flow_manager_last_run_at,
            flow_manager_run_counter,
            flow_manager_last_run_message,
            flow_manager_last_run_operation,
            flow_manager_success_counter,
            flow_manager_error_counter,
          } = flow;
          const payload = {
            flow_manager_category,
            flow_manager_order,
            flow_manager_last_run_at,
            flow_manager_run_counter,
            flow_manager_last_run_message,
            flow_manager_last_run_operation,
            flow_manager_success_counter,
            flow_manager_error_counter,
          };
          const {
            data: { data: metadataResult },
          } = (await api.post('/items/flow_manager_metadata', payload)) as {
            data: { data: { id: string } };
          };
          await api.patch(`/flows/${flow.id}`, { flow_manager_metadata_id: metadataResult.id });
        }
        settingsStore.updateSettings(
          {
            flow_manager_categories: categories,
          },
          false,
        );
      } else {
        for (const flow of flows.value) {
          const {
            flow_manager_category,
            flow_manager_order,
            flow_manager_last_run_at,
            flow_manager_run_counter,
            flow_manager_last_run_message,
            flow_manager_last_run_operation,
            flow_manager_success_counter,
            flow_manager_error_counter,
          } = flow;
          const payload = {
            flow_manager_category,
            flow_manager_order,
            flow_manager_last_run_at,
            flow_manager_run_counter,
            flow_manager_last_run_message,
            flow_manager_last_run_operation,
            flow_manager_success_counter,
            flow_manager_error_counter,
          };
          const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
          const {
            data: { data: metadataResult },
          } = (await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential?.url}/items/flow_manager_metadata`,
            staticToken: credential?.staticToken,
            method: 'POST',
            payload,
          })) as { data: { data: { id: string } } };
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential?.url}/flows/${flow.id}`,
            staticToken: credential?.staticToken,
            method: 'PATCH',
            payload: { flow_manager_metadata_id: metadataResult.id },
          });
          await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential?.url}/settings`,
            staticToken: credential?.staticToken,
            method: 'PATCH',
            payload: {
              flow_manager_categories: categories,
            },
          });
        }
      }
      flowCategories.value = categories;
    } catch {
      notificationsStore.add({
        type: 'error',
        title: 'Failed to fetch Flows. Please check your credentials',
        closeable: true,
        persist: true,
      });
    }
  }

  async function syncFlowCounters() {
    isSyncingFlowCountersLoading.value = true;
    let payload: ISyncFlowCounter = {
      type: 'local',
    };
    if (selectedCredential.value !== 'local') {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      if (credential) {
        payload = {
          type: 'remote',
          url: credential.url,
          staticToken: credential.staticToken,
        };
      }
    }
    try {
      await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/sync-counters`, payload);
      notificationsStore.add({
        type: 'success',
        title: 'Flow counters synced successfully',
        closeable: true,
        persist: true,
      });
      reloadFlow();
      reloadTabularFlow();
      settingDialog.value = false;
    } catch {
      notificationsStore.add({
        type: 'error',
        title: 'Failed to sync the Flow counters',
        closeable: true,
        persist: true,
      });
    } finally {
      isSyncingFlowCountersLoading.value = false;
    }
  }

  return {
    notCreatedFields,
    differentFields,
    notCreatedCollections,
    isConfigurationLoading,
    isSyncingFlowCountersLoading,
    isDatabaseUpdated,
    ensureDatabase,
    configureFlowManagerDatabase,
    syncFlowCounters,
    syncMetadata,
  };
}

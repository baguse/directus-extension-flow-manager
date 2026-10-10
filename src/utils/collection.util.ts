import { Ref } from 'vue';
import { ENDPOINT_EXTENSION_NAME, REQUIRED_COLLECTIONS } from '../constants';
import type { CollectionsStore, FieldsStore, ICredential } from '../types';
import { useApi } from '@directus/extensions-sdk';

const useCollections = ({
  collectionsStore,
  selectedCredential,
  credentials,
  api,
}: {
  fieldsStore?: FieldsStore;
  collectionsStore: CollectionsStore;
  selectedCredential: Ref<string>;
  credentials: Ref<ICredential[]>;
  api: ReturnType<typeof useApi>;
}) => {
  const ensureCollections = async () => {
    const notExistsCollections: Array<string> = [];

    if (selectedCredential.value === 'local') {
      for (const c of REQUIRED_COLLECTIONS) {
        const collection = collectionsStore.getCollection(c.collection);
        if (!collection) {
          notExistsCollections.push(c.collection);
        }
      }
    } else {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      if (credential) {
        const remoteCollections = REQUIRED_COLLECTIONS.filter((c) => c.scope !== 'local');
        for (const c of remoteCollections) {
          try {
            await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/fields/${c.collection}`,
              staticToken: credential?.staticToken,
              method: 'GET',
            });
          } catch (err: unknown) {
            const anyErr = err as {
              response?: { data?: { status?: number }; status?: number };
            };
            const status = anyErr?.response?.data?.status ?? anyErr?.response?.status;
            if ([403, 404].includes(status || 0)) {
              notExistsCollections.push(c.collection);
            } else {
              throw err;
            }
          }
        }
      }
    }

    return {
      notExistsCollections,
    };
  };
  return {
    ensureCollections,
  };
};

export default useCollections;

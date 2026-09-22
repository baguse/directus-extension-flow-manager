import { Ref } from "vue";
import { ENDPOINT_EXTENSION_NAME,REQUIRED_COLLECTIONS } from "../constants";
import { ICredential } from "../types";
import { useApi } from "@directus/extensions-sdk";

const useCollections = ({
  collectionsStore,
  selectedCredential,
  credentials,
  api,
}: {
  fieldsStore: any;
  collectionsStore: any;
  selectedCredential: Ref<string>;
  credentials: Ref<ICredential[]>;
  api: ReturnType<typeof useApi>;
}) => {
  const ensureCollections = async () => {
    const notExistsCollections: Array<string> = [];

    if (selectedCredential.value === "local") {
      for (const c of REQUIRED_COLLECTIONS) {
        const collection = collectionsStore.getCollection(c.collection);
        if (!collection) {
          notExistsCollections.push(c.collection);
        }
      }
    } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (credential) {
          for (const c of REQUIRED_COLLECTIONS) {
            try {
              await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
                url: `${credential?.url}/fields/${c.collection}`,
                staticToken: credential?.staticToken,
                method: "GET",
              });
            } catch {
              notExistsCollections.push(c.collection);
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

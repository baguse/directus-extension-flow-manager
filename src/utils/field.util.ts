import { Ref } from "vue";
import type { Field } from "@directus/types";
import { ENDPOINT_EXTENSION_NAME, REQUIRED_FIELDS } from "../constants";
import { ICredential } from "../types";
import { useApi } from "@directus/extensions-sdk";

const useFields = ({
  fieldsStore,
  selectedCredential,
  credentials,
  api,
}: {
  fieldsStore: any;
  selectedCredential: Ref<string>;
  credentials: Ref<ICredential[]>;
  api: ReturnType<typeof useApi>;
}) => {
  const ensureFields = async () => {
    const fields: Array<Partial<Field>> = [];
    const fieldMap: Record<string, Partial<Field>[]> = REQUIRED_FIELDS.reduce((acc: Record<string, Partial<Field>[]>, field) => {
      if (!acc[`${field.collection}`]) {
        acc[`${field.collection}`] = [];
      }
      acc[`${field.collection}`]?.push(field);
      return acc;
    }, {});

    if (selectedCredential.value === "local") {
      for (const collectionName in fieldMap) {
        const existingFields: string[] = fieldsStore.getFieldsForCollection(collectionName).map((f: Field) => f.field);
        const requiredFields = fieldMap[collectionName] || [];

        for (const requiredField of requiredFields) {
          if (!existingFields.includes(requiredField.field!)) {
            fields.push(requiredField);
          }
        }
      }
    } else {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      if (credential) {
        for (const collectionName in fieldMap) {
          const {
            data: { data },
          } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
            url: `${credential?.url}/fields/${collectionName}`,
            staticToken: credential?.staticToken,
            method: "GET",
          });
          const existingFields: string[] = data.map((f: Field) => f.field);
          const requiredFields = fieldMap[collectionName] || [];
          for (const requiredField of requiredFields) {
            if (!existingFields.includes(requiredField.field!)) {
              fields.push(requiredField);
            }
          }
        }
      }
    }

    return fields;
  };
  return {
    ensureFields,
  };
};

export default useFields;

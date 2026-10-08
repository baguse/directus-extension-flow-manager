import { Ref } from 'vue';
import { ENDPOINT_EXTENSION_NAME, REQUIRED_FIELDS } from '../constants';
import type { ExtendedField, FieldsStore, ICredential } from '../types';
import { useApi } from '@directus/extensions-sdk';

const useFields = ({
  fieldsStore,
  selectedCredential,
  credentials,
  api,
}: {
  fieldsStore: FieldsStore;
  selectedCredential: Ref<string>;
  credentials: Ref<ICredential[]>;
  api: ReturnType<typeof useApi>;
}) => {
  const ensureFields = async () => {
    const notExistsFields: Array<Partial<ExtendedField>> = [];
    const differentFields: Array<Partial<ExtendedField>> = [];
    const fieldMap: Record<string, Partial<ExtendedField>[]> = REQUIRED_FIELDS.reduce(
      (acc: Record<string, Partial<ExtendedField>[]>, field) => {
        if (!acc[`${field.collection}`]) {
          acc[`${field.collection}`] = [];
        }
        acc[`${field.collection}`]?.push(field);
        return acc;
      },
      {},
    );

    if (selectedCredential.value === 'local') {
      for (const collectionName in fieldMap) {
        const existingFields = fieldsStore.getFieldsForCollection(collectionName);
        const requiredFields = fieldMap[collectionName] || [];

        for (const requiredField of requiredFields) {
          const existingField = existingFields.find(
            (f: ExtendedField) => f.field === requiredField.field,
          );
          if (!existingField) {
            notExistsFields.push(requiredField);
          } else if (existingField.type !== requiredField.type) {
            differentFields.push(requiredField);
          }
        }
      }
    } else {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      if (credential) {
        for (const collectionName in fieldMap) {
          const requiredFields = fieldMap[collectionName] || [];
          try {
            const {
              data: { data },
            } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
              url: `${credential?.url}/fields/${collectionName}`,
              staticToken: credential?.staticToken,
              method: 'GET',
            });
            const existingFields: ExtendedField[] = data;
            for (const requiredField of requiredFields) {
              const existingField = existingFields.find(
                (f: ExtendedField) => f.field === requiredField.field,
              );
              if (!existingField) {
                notExistsFields.push(requiredField);
              } else if (existingField.type !== requiredField.type) {
                differentFields.push(requiredField);
              }
            }
          } catch {
            notExistsFields.push(...requiredFields);
          }
        }
      }
    }

    return {
      notExistsFields,
      differentFields,
    };
  };
  return {
    ensureFields,
  };
};

export default useFields;

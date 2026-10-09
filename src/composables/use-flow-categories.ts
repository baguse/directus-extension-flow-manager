import { ref, type Ref } from 'vue';
import type { ICredential, IFolder } from '../types';
import { ENDPOINT_EXTENSION_NAME } from '../constants';
import { generateRandomString } from '../utils/string.util';

export interface UseFlowCategoriesOptions {
  initialCategories?: (string | IFolder)[];
  settingsStore: {
    updateSettings: (data: Record<string, unknown>, notify?: boolean) => void;
  };
  api: {
    post: (url: string, payload?: unknown) => Promise<unknown>;
  };
  credentials: Ref<ICredential[]>;
  selectedCredential: Ref<string>;
  openSettingDialog?: () => void;
}

export function useFlowCategories(options: UseFlowCategoriesOptions) {
  const {
    initialCategories = [],
    settingsStore,
    api,
    credentials,
    selectedCredential,
    openSettingDialog,
  } = options;

  const flowCategories = ref<IFolder[]>(
    initialCategories.map((category: string | IFolder) => {
      if (typeof category === 'string') {
        return {
          id: category,
          name: category,
          type: 'category' as const,
          icon: 'folder',
          color: '',
          flow_manager_metadata_id: {
            flow_manager_order: 0,
          },
        };
      }
      return category;
    }),
  );

  const selectedCategory = ref<IFolder>({
    id: '',
    name: '',
    type: 'category',
    icon: 'folder',
    color: '',
  });

  const isEditCategory = ref(false);

  function patchCategory(item: IFolder) {
    let categoryIndex = flowCategories.value.findIndex((category) => category.id === item.id);
    const payload: Partial<IFolder> = {};

    if (typeof item.name === 'string') {
      payload.name = item.name;
    }

    if (typeof item.icon === 'string') {
      payload.icon = item.icon;
    }

    if (typeof item.color === 'string') {
      payload.color = item.color;
    }

    if (typeof item.flow_manager_metadata_id?.flow_manager_order === 'number') {
      if (!payload.flow_manager_metadata_id) {
        payload.flow_manager_metadata_id = {};
      }
      payload.flow_manager_metadata_id.flow_manager_order =
        item.flow_manager_metadata_id.flow_manager_order;
    }

    if (typeof item.flow_manager_metadata_id?.flow_manager_category !== 'undefined') {
      if (!payload.flow_manager_metadata_id) {
        payload.flow_manager_metadata_id = {};
      }
      payload.flow_manager_metadata_id.flow_manager_category =
        item.flow_manager_metadata_id.flow_manager_category;
    }

    if (categoryIndex > -1) {
      flowCategories.value[categoryIndex] = {
        ...flowCategories.value[categoryIndex],
        ...(payload as IFolder),
      };
    } else {
      /**
       * TODO: Will be deprecated in the future
       */
      categoryIndex = flowCategories.value.findIndex((category) => category.name === item.name);
      if (
        categoryIndex !== -1 &&
        flowCategories.value[categoryIndex]?.id === flowCategories.value[categoryIndex]?.name
      ) {
        flowCategories.value[categoryIndex] = {
          ...flowCategories.value[categoryIndex],
          ...(payload as IFolder),
        };
      }
    }
  }

  async function saveCategories() {
    if (selectedCredential.value === 'local') {
      settingsStore.updateSettings(
        {
          flow_manager_categories: flowCategories.value,
        },
        false,
      );
    } else {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
        url: `${credential?.url}/settings`,
        staticToken: credential?.staticToken,
        method: 'PATCH',
        payload: {
          flow_manager_categories: flowCategories.value,
        },
      });
    }
  }

  async function saveCategory() {
    if (!selectedCategory.value.name) return;

    if (!isEditCategory.value) {
      flowCategories.value = [
        ...flowCategories.value,
        {
          id: generateRandomString(10),
          name: selectedCategory.value.name,
          type: 'category',
          icon: selectedCategory.value.icon || 'folder',
          color: selectedCategory.value.color,
          flow_manager_metadata_id: {
            flow_manager_category: '',
            flow_manager_order: 0,
          },
        },
      ];
    } else {
      patchCategory({
        id: selectedCategory.value.id,
        name: selectedCategory.value.name,
        type: 'category',
        icon: selectedCategory.value.icon || 'folder',
        color: selectedCategory.value.color,
        flow_manager_metadata_id: {
          flow_manager_category:
            selectedCategory.value.flow_manager_metadata_id?.flow_manager_category,
          flow_manager_order: selectedCategory.value.flow_manager_metadata_id?.flow_manager_order,
        },
      });

      isEditCategory.value = false;
    }

    selectedCategory.value = {
      id: '',
      name: '',
      type: 'category',
      icon: 'folder',
      color: '',
    };

    await saveCategories();
  }

  async function deleteCategory(category: IFolder) {
    let isValidToDelete = false;
    let deletedIndex = flowCategories.value.findIndex(
      (flowCategory) => flowCategory.id === category.id,
    );

    if (deletedIndex !== -1) {
      isValidToDelete = true;
    } else {
      /**
       * TODO: Will be deprecated in the future
       */
      deletedIndex = flowCategories.value.findIndex(
        (flowCategory) => flowCategory.name === category.name,
      );
      if (
        deletedIndex !== -1 &&
        flowCategories.value[deletedIndex]?.id === flowCategories.value[deletedIndex]?.name
      ) {
        isValidToDelete = true;
      }
    }

    if (isValidToDelete) {
      if (selectedCategory.value.id === flowCategories.value[deletedIndex]?.id) {
        selectedCategory.value = {
          id: '',
          name: '',
          type: 'category',
          icon: 'folder',
          color: '',
        };
      }

      flowCategories.value.splice(deletedIndex, 1);

      await saveCategories();
    }
  }

  function selectCategoryForEdit({ item }: { item: IFolder }) {
    isEditCategory.value = true;
    selectedCategory.value = {
      id: item.id,
      name: item.name,
      type: 'category',
      icon: item.icon,
      color: item.color,
      flow_manager_metadata_id: {
        flow_manager_category: item.flow_manager_metadata_id?.flow_manager_category,
        flow_manager_order: item.flow_manager_metadata_id?.flow_manager_order,
      },
    };
  }

  function cancelEditCategory() {
    isEditCategory.value = false;
    selectedCategory.value = {
      id: '',
      name: '',
      type: 'category',
      icon: 'folder',
      color: '',
    };
  }

  function duplicateFolder(item: IFolder) {
    flowCategories.value = [
      ...flowCategories.value,
      {
        id: generateRandomString(10),
        name: `${item.name} - Duplicated`,
        type: 'category',
        icon: item.icon,
        color: item.color,
        flow_manager_metadata_id: {
          flow_manager_category: item.flow_manager_metadata_id?.flow_manager_category,
        },
      },
    ];

    saveCategories();
  }

  function showEditFolderDialog(item: IFolder) {
    selectCategoryForEdit({ item });
    if (openSettingDialog) {
      openSettingDialog();
    }
  }

  return {
    flowCategories,
    selectedCategory,
    isEditCategory,
    patchCategory,
    saveCategories,
    saveCategory,
    deleteCategory,
    selectCategoryForEdit,
    cancelEditCategory,
    duplicateFolder,
    showEditFolderDialog,
  };
}

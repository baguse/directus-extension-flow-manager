<script setup lang="ts">
import { toRefs } from 'vue';
import type { Field } from '@directus/types';
import type { ExtendedField, IFolder } from '../../types';

interface FolderHeader {
  text: string;
  value: string;
  width?: number;
  sortable?: boolean;
}

const props = withDefaults(
  defineProps<{
    value: boolean;
    isDatabaseUpdated: boolean;
    notCreatedCollections?: string[];
    notCreatedFields?: Partial<ExtendedField>[];
    differentFields?: Partial<Field>[];
    folderHeaders?: FolderHeader[];
    flowCategories?: IFolder[];
    selectedCategory: IFolder;
    isEditCategory?: boolean;
    isConfigurationLoading?: boolean;
    isSyncingFlowCountersLoading?: boolean;
  }>(),
  {
    notCreatedCollections: () => [],
    notCreatedFields: () => [],
    differentFields: () => [],
    folderHeaders: () => [
      {
        text: 'Name',
        value: 'name',
        width: 400,
      },
    ],
    flowCategories: () => [],
    isEditCategory: false,
    isConfigurationLoading: false,
    isSyncingFlowCountersLoading: false,
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:selectedCategory', value: IFolder): void;
  (e: 'selectCategoryForEdit', payload: { item: IFolder }): void;
  (e: 'deleteCategory', category: IFolder): void;
  (e: 'saveCategory'): void;
  (e: 'cancelEditCategory'): void;
  (e: 'configure'): void;
  (e: 'syncFlowCounters'): void;
}>();

const {
  value,
  isDatabaseUpdated,
  notCreatedCollections,
  notCreatedFields,
  differentFields,
  folderHeaders,
  flowCategories,
  selectedCategory,
  isEditCategory,
  isConfigurationLoading,
  isSyncingFlowCountersLoading,
} = toRefs(props);

function onUpdateCategoryName(name: string) {
  emit('update:selectedCategory', {
    ...selectedCategory.value,
    name,
  });
}

function onUpdateCategoryColor(color: string) {
  emit('update:selectedCategory', {
    ...selectedCategory.value,
    color,
  });
}

function onUpdateCategoryIcon(icon: string) {
  emit('update:selectedCategory', {
    ...selectedCategory.value,
    icon,
  });
}
</script>

<template>
  <v-dialog
    :model-value="value"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card>
      <v-card-title>Settings</v-card-title>
      <v-card-text>
        <div v-if="!isDatabaseUpdated">
          <v-error
            :error="{
              extensions: { code: 'Error' },
              message: `Flow Manager fields and collections are not configured. By clicking the 'Configure' button, you will create the necessary fields/collections or re-create the existing fields.`,
            }"
          ></v-error>
          <div v-if="notCreatedCollections.length" class="section-container">
            <div class="bold-text">Collections to be created:</div>
            <ul>
              <li v-for="collectionName in notCreatedCollections" :key="collectionName">
                <strong>{{ collectionName }}</strong>
              </li>
            </ul>
          </div>
          <div v-if="notCreatedFields.length" class="section-container">
            <div class="bold-text">Fields to be created:</div>
            <ul>
              <li v-for="field in notCreatedFields" :key="field.field">
                <template v-if="field.schema?.related_collection">
                  <strong
                    ><code>{{ field.field }}</code></strong
                  >
                  on
                  <strong
                    ><code>{{ field.collection }}</code></strong
                  >
                  related to collection
                  <strong
                    ><code>{{ field.schema.related_collection }}</code></strong
                  >
                </template>
                <template v-else>
                  <strong
                    ><code>{{ field.field }}</code></strong
                  >
                  on
                  <strong
                    ><code>{{ field.collection }}</code></strong
                  >
                </template>
              </li>
            </ul>
          </div>
          <div v-if="differentFields.length" class="section-container">
            <div class="bold-text">Fields to be re-created:</div>
            <ul>
              <li v-for="field in differentFields" :key="field.field">
                <strong
                  ><code>{{ field.field }}</code></strong
                >
                on
                <strong
                  ><code>{{ field.collection }}</code></strong
                >
              </li>
            </ul>
          </div>
        </div>
        <div v-else>
          <v-table
            :headers="folderHeaders"
            :items="flowCategories"
            @click:row="emit('selectCategoryForEdit', $event)"
          >
            <template #[`item.name`]="{ item }">
              <v-icon
                :name="item.icon || ''"
                :color="
                  item.color || 'var(--theme--background-inverted, var(--background-inverted))'
                "
              />
              <span class="ml-2">
                {{ item.name }}
              </span>
            </template>
            <template #item-append="{ item }">
              <v-icon
                v-tooltip.bottom="'Delete Category'"
                class="button-delete-category"
                name="delete"
                color="var(--theme-danger, var(--danger))"
                @click="emit('deleteCategory', item)"
              />
            </template>
          </v-table>
          <div class="input-form">
            <v-input
              v-tooltip.bottom="'Category Name'"
              :model-value="selectedCategory.name"
              placeholder="Category Name"
              @update:model-value="onUpdateCategoryName($event)"
            />
          </div>
          <div class="input-form">
            <interface-select-color
              width="full"
              :value="selectedCategory.color"
              @input="onUpdateCategoryColor($event)"
            />
          </div>
          <div class="input-form">
            <interface-select-icon
              :value="selectedCategory.icon"
              @input="onUpdateCategoryIcon($event)"
            />
          </div>
          <v-button
            class="input-form"
            :disabled="!selectedCategory.name"
            @click="emit('saveCategory')"
          >
            {{ isEditCategory ? 'Save' : 'Add' }}
          </v-button>
          <v-button
            v-if="isEditCategory"
            secondary
            class="input-form ml-2"
            @click="emit('cancelEditCategory')"
          >
            Cancel
          </v-button>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-button secondary @click="emit('update:modelValue', false)"> Close </v-button>
        <v-button
          v-if="!isDatabaseUpdated"
          :loading="isConfigurationLoading"
          @click="emit('configure')"
        >
          Configure
        </v-button>
        <v-button
          v-else
          class="input-form ml-2"
          :loading="isSyncingFlowCountersLoading"
          @click="emit('syncFlowCounters')"
        >
          Sync Flow Counters
        </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.section-container {
  margin-top: 15px;
}

.bold-text {
  font-weight: bold;
}

.input-form {
  margin-bottom: 7px;
  margin-top: 7px;
}

.ml-2 {
  margin-left: 8px;
}

.button-delete-category {
  cursor: pointer;
}
</style>

<template>
  <private-view title="Flow Recipes Marketplace">
    <template #title-outer:prepend>
      <v-button class="header-icon" rounded disabled icon secondary>
        <v-icon name="auto_stories" />
      </v-button>
    </template>

    <template #title-outer:append>
      <v-chip small class="ml-2">Community & Templates</v-chip>
    </template>

    <template #navigation>
      <content-navigation :server-info="serverInfo" :hide-flows="true" />
    </template>

    <template #actions>
      <input
        ref="fileInputRef"
        type="file"
        accept=".json"
        style="display: none"
        @change="handleFileUpload"
      />

      <v-button
        v-tooltip.bottom="'Import .recipe.json from disk'"
        secondary
        @click="triggerFilePicker"
      >
        <v-icon name="upload_file" left />
        Upload Recipe
      </v-button>

      <v-button
        v-tooltip.bottom="'Configure Cloud Hub (Go Server)'"
        icon
        rounded
        secondary
        @click="isHubConfigOpen = true"
      >
        <v-icon name="cloud" />
      </v-button>

      <v-button
        v-tooltip.bottom="'Refresh Catalog'"
        icon
        rounded
        secondary
        :loading="isLoading"
        @click="loadCatalog"
      >
        <v-icon name="refresh" />
      </v-button>
    </template>

    <div class="recipes-container">
      <!-- Hero Banner -->
      <div class="recipes-hero">
        <div class="hero-text">
          <h1 class="hero-title">Production-Ready Flow Automations</h1>
          <p class="hero-sub">
            Browse, parameterize, and deploy tested automation pipelines in seconds. Export your own
            flows to share with the community.
          </p>
        </div>

        <div class="hero-search-bar">
          <v-icon name="search" class="search-lead-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search recipes by name, tags, provider (Slack, Twilio, Gemini)..."
            class="search-input"
          />
          <v-icon
            v-if="searchQuery"
            name="close"
            class="clear-icon"
            clickable
            @click="searchQuery = ''"
          />
        </div>
      </div>

      <!-- Filters & Source Bar -->
      <div class="filter-toolbar">
        <div class="sources-tabs">
          <button
            type="button"
            :class="['source-tab', { active: activeSourceFilter === 'all' }]"
            @click="activeSourceFilter = 'all'"
          >
            All Sources ({{ allRecipes.length }})
          </button>
          <button
            type="button"
            :class="['source-tab', { active: activeSourceFilter === 'builtin' }]"
            @click="activeSourceFilter = 'builtin'"
          >
            <v-icon name="verified" x-small class="mr-1" />
            Official & Community ({{ builtinCount }})
          </button>
          <button
            type="button"
            :class="['source-tab', { active: activeSourceFilter === 'local' }]"
            @click="activeSourceFilter = 'local'"
          >
            <v-icon name="folder" x-small class="mr-1" />
            My Uploads ({{ localCount }})
          </button>
          <button
            type="button"
            :class="['source-tab', { active: activeSourceFilter === 'cloud' }]"
            @click="activeSourceFilter = 'cloud'"
          >
            <v-icon name="cloud" x-small class="mr-1" />
            Private Hub ({{ cloudCount }})
          </button>
        </div>

        <!-- Category Pills -->
        <div class="categories-scroll">
          <button
            type="button"
            :class="['category-pill', { active: activeCategory === 'all' }]"
            @click="activeCategory = 'all'"
          >
            All Categories
          </button>
          <button
            v-for="cat in availableCategories"
            :key="cat"
            type="button"
            :class="['category-pill', { active: activeCategory === cat }]"
            @click="activeCategory = cat"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <!-- Dropzone for Local Uploads -->
      <div
        class="drag-drop-zone"
        :class="{ 'is-dragging': isDraggingFile }"
        @dragover.prevent="isDraggingFile = true"
        @dragleave.prevent="isDraggingFile = false"
        @drop.prevent="handleFileDrop"
      >
        <v-icon name="file_upload" small class="mr-2" />
        <span
          >Drop any <code>.recipe.json</code> file anywhere here to instantly inspect and
          install.</span
        >
      </div>

      <!-- Catalog Cards Grid -->
      <div v-if="filteredRecipes.length" class="recipes-grid">
        <div
          v-for="recipe in filteredRecipes"
          :key="recipe.id"
          class="recipe-card"
          @click="openInstallModal(recipe, 'preview')"
        >
          <div class="card-top">
            <div
              class="recipe-icon"
              :style="{ backgroundColor: `${recipe.color}15`, color: recipe.color }"
            >
              <v-icon :name="recipe.icon || 'bolt'" />
            </div>

            <div class="card-badges">
              <span v-if="recipe.source === 'builtin'" class="source-badge builtin">Official</span>
              <span v-else-if="recipe.source === 'local'" class="source-badge local"
                >Local File</span
              >
              <span v-else-if="recipe.source === 'cloud'" class="source-badge cloud"
                >Private Hub</span
              >
              <span class="category-badge">{{ recipe.category }}</span>
            </div>
          </div>

          <div class="card-content">
            <h3 class="recipe-name" :title="recipe.name">{{ recipe.name }}</h3>
            <p class="recipe-summary">{{ recipe.description }}</p>

            <div class="recipe-tags">
              <span v-for="tag in recipe.tags.slice(0, 3)" :key="tag" class="tag-chip">
                #{{ tag }}
              </span>
            </div>
          </div>

          <div class="card-footer">
            <div class="author-info">
              <span class="author-name">By {{ recipe.author.name }}</span>
              <span class="flow-count">{{ recipe.flowCount }} flow</span>
            </div>

            <div class="card-actions">
              <v-button
                v-if="recipe.source === 'local'"
                v-tooltip.bottom="'Delete local recipe'"
                x-small
                icon
                secondary
                class="delete-btn"
                @click.stop="deleteLocalRecipe(recipe.id)"
              >
                <v-icon name="delete" x-small />
              </v-button>

              <v-button
                x-small
                secondary
                class="preview-btn"
                @click.stop="openInstallModal(recipe, 'preview')"
              >
                <v-icon name="visibility" left x-small />
                Preview
              </v-button>

              <v-button small @click.stop="openInstallModal(recipe, 'configure')">
                <v-icon name="bolt" left x-small />
                Install
              </v-button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <v-icon name="search_off" class="empty-icon" />
        <h3 class="empty-title">No recipes found</h3>
        <p class="empty-sub">Try searching with different terms or reset your filters.</p>
        <v-button secondary small @click="resetFilters">Reset Filters</v-button>
      </div>
    </div>

    <!-- Install Recipe Modal -->
    <RecipeInstallModal
      :recipe="selectedRecipeForInstall"
      :active="isInstallModalOpen"
      :selected-credential="selectedCredential"
      :credentials="credentials"
      :initial-tab="installModalTab"
      @close="isInstallModalOpen = false"
      @installed="onRecipeInstalled"
    />

    <!-- Hub Server Configuration Modal -->
    <v-dialog
      :model-value="isHubConfigOpen"
      max-width="500"
      @update:model-value="isHubConfigOpen = false"
    >
      <v-card>
        <v-card-title>Configure Private Go Cloud Hub</v-card-title>
        <v-card-text>
          <p class="text-sm mb-3">
            Connect Flow Manager to your dedicated Go registry server
            (<code>recipes-hub-server</code>) to sync private organization flows.
          </p>

          <div class="mb-3">
            <label class="form-label block text-xs font-semibold mb-1">Hub Server URL</label>
            <v-input
              v-model="hubUrl"
              placeholder="https://hub.flow-manager.dev or http://localhost:8084"
            />
          </div>

          <div>
            <label class="form-label block text-xs font-semibold mb-1">Team API Token</label>
            <v-input v-model="hubToken" type="password" placeholder="hub_team_token_..." />
          </div>
        </v-card-text>
        <v-card-actions class="justify-end dialog-footer">
          <v-button secondary @click="isHubConfigOpen = false">Cancel</v-button>
          <v-button @click="saveHubConfig">Save & Connect</v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </private-view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue';
import { useRouter } from 'vue-router';
import { useApi, useStores } from '@directus/extensions-sdk';
import ContentNavigation from './components/navigation.vue';
import RecipeInstallModal from './components/recipes/recipe-install-modal.vue';
import { useFlowCredentials } from '../composables/use-flow-credentials';
import { RecipeSourceService } from '../services/recipe-source.service';
import type { FlowRecipeSummary, IFlowRecipe, RecipeCategory, RecipeSourceType } from '../types';
import { notify } from '../utils/notification.util';

const api = useApi();
const router = useRouter();
const { useSettingsStore, useFieldsStore, useNotificationsStore, useFlowsStore } = useStores();
const settingsStore = useSettingsStore();
const fieldsStore = useFieldsStore();
const notificationsStore = useNotificationsStore();
const flowsStore = useFlowsStore();

const { credentials, selectedCredential, serverInfo } = useFlowCredentials({
  api,
  settingsStore,
  fieldsStore,
});

async function hydrateLocalFlow() {
  if (!selectedCredential.value || selectedCredential.value === 'local') {
    try {
      await flowsStore.hydrate();
    } catch {
      // ignore store hydration errors
    }
  }
}

provide('flowManagerUtils', {
  credentials,
  selectedCredential,
  setCredential: (cred: string) => {
    selectedCredential.value = cred;
  },
  hydrateLocalFlow,
});

const allRecipes = ref<FlowRecipeSummary[]>([]);
const isLoading = ref(false);
const searchQuery = ref('');
const activeSourceFilter = ref<RecipeSourceType | 'all'>('all');
const activeCategory = ref<RecipeCategory | 'all'>('all');

const isDraggingFile = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const isInstallModalOpen = ref(false);
const installModalTab = ref<'preview' | 'configure' | 'json'>('preview');
const selectedRecipeForInstall = ref<IFlowRecipe | null>(null);

const isHubConfigOpen = ref(false);
const hubUrl = ref(localStorage.getItem('fm_hub_url') || '');
const hubToken = ref(localStorage.getItem('fm_hub_token') || '');

const availableCategories: RecipeCategory[] = [
  'Communication',
  'Maintenance',
  'AI & LLM',
  'E-Commerce',
  'DevOps',
  'Security',
];

const builtinCount = computed(
  () => allRecipes.value.filter((r) => r.source === 'builtin' || r.source === 'github').length,
);
const localCount = computed(() => allRecipes.value.filter((r) => r.source === 'local').length);
const cloudCount = computed(() => allRecipes.value.filter((r) => r.source === 'cloud').length);

const filteredRecipes = computed(() => {
  let list = allRecipes.value;

  // Source filter
  if (activeSourceFilter.value === 'builtin') {
    list = list.filter((r) => r.source === 'builtin' || r.source === 'github');
  } else if (activeSourceFilter.value !== 'all') {
    list = list.filter((r) => r.source === activeSourceFilter.value);
  }

  // Category filter
  if (activeCategory.value !== 'all') {
    list = list.filter((r) => r.category === activeCategory.value);
  }

  // Search filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        r.author.name.toLowerCase().includes(q),
    );
  }

  return list;
});

async function loadCatalog() {
  isLoading.value = true;
  try {
    allRecipes.value = await RecipeSourceService.listAllRecipes({
      hubUrl: hubUrl.value.trim(),
      hubToken: hubToken.value.trim(),
      api,
    });
  } finally {
    isLoading.value = false;
  }
}

function resetFilters() {
  searchQuery.value = '';
  activeSourceFilter.value = 'all';
  activeCategory.value = 'all';
}

async function openInstallModal(
  summary: FlowRecipeSummary,
  tab: 'preview' | 'configure' | 'json' = 'preview',
) {
  installModalTab.value = tab;
  const full = await RecipeSourceService.getRecipeById(summary.id, summary.source, {
    hubUrl: hubUrl.value.trim(),
    hubToken: hubToken.value.trim(),
    api,
  });
  if (full) {
    selectedRecipeForInstall.value = full;
    isInstallModalOpen.value = true;
  } else {
    notify.error(
      notificationsStore,
      'Recipe Not Found',
      'Could not fetch the full recipe specification.',
    );
  }
}

function deleteLocalRecipe(id: string) {
  RecipeSourceService.deleteLocalRecipe(id);
  notify.info(notificationsStore, 'Recipe Removed', 'Deleted custom local recipe template.');
  loadCatalog();
}

function triggerFilePicker() {
  fileInputRef.value?.click();
}

async function parseAndImportRecipeFile(file: File) {
  try {
    const text = await file.text();
    const recipe: IFlowRecipe = JSON.parse(text);
    if (!recipe.id || !recipe.name || !recipe.flows) {
      throw new Error('Invalid recipe file structure.');
    }
    RecipeSourceService.saveLocalRecipe(recipe);
    notify.success(
      notificationsStore,
      'Recipe Imported',
      `Added "${recipe.name}" to your local templates.`,
    );
    await loadCatalog();
    // Open install modal in preview mode immediately
    selectedRecipeForInstall.value = recipe;
    installModalTab.value = 'preview';
    isInstallModalOpen.value = true;
  } catch (err) {
    notify.error(
      notificationsStore,
      'Invalid Recipe File',
      err instanceof Error ? err.message : 'Failed to parse .recipe.json file.',
    );
  }
}

function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    parseAndImportRecipeFile(file);
    input.value = '';
  }
}

function handleFileDrop(event: DragEvent) {
  isDraggingFile.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file && file.name.endsWith('.json')) {
    parseAndImportRecipeFile(file);
  }
}

async function saveHubConfig() {
  const url = hubUrl.value.trim();
  const token = hubToken.value.trim();
  localStorage.setItem('fm_hub_url', url);
  localStorage.setItem('fm_hub_token', token);
  isHubConfigOpen.value = false;

  if (url && token) {
    try {
      const health = await RecipeSourceService.testHubConnection(url, token, api);
      notify.success(
        notificationsStore,
        'Hub Connected via /process',
        `Connected to Private Go Hub v${health.version || '1.0.0'} (CSP bypassed).`,
      );
    } catch {
      notify.warning(
        notificationsStore,
        'Hub Saved with Warning',
        'Hub credentials saved, but the server could not be reached via /process proxy. Verify URL and port.',
      );
    }
  } else {
    notify.info(
      notificationsStore,
      'Hub Configuration Cleared',
      'Disconnected from private cloud hub.',
    );
  }

  loadCatalog();
}

async function onRecipeInstalled() {
  if (!selectedCredential.value || selectedCredential.value === 'local') {
    await hydrateLocalFlow();
  }
  // Option to redirect to all flows
  router.push('/flow-manager');
}

onMounted(() => {
  loadCatalog();
});
</script>

<style scoped lang="scss">
.recipes-container {
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
}

.recipes-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 20px 24px;
  margin-bottom: 24px;

  .hero-title {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--theme--foreground, #0f172a);
    margin-bottom: 8px;
  }

  .hero-sub {
    font-size: 15px;
    color: var(--theme--foreground-subdued, #64748b);
    max-width: 620px;
    line-height: 1.5;
    margin-bottom: 24px;
  }

  .hero-search-bar {
    position: relative;
    width: 100%;
    max-width: 580px;

    .search-lead-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--theme--foreground-subdued, #64748b);
      pointer-events: none;
    }

    .clear-icon {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--theme--foreground-subdued, #64748b);
    }

    .search-input {
      width: 100%;
      height: 46px;
      padding: 0 40px 0 42px;
      border-radius: 23px;
      border: 1.5px solid var(--theme--border, rgba(0, 0, 0, 0.12));
      background: var(--theme--background, #ffffff);
      font-size: 14px;
      color: var(--theme--foreground, #1e293b);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;

      &:focus {
        outline: none;
        border-color: var(--theme--primary, #6644ff);
        box-shadow: 0 0 0 3px rgba(102, 68, 255, 0.15);
      }
    }
  }
}

.filter-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;

  .sources-tabs {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));
    padding-bottom: 8px;
    overflow-x: auto;

    .source-tab {
      background: none;
      border: none;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
      color: var(--theme--foreground-subdued, #64748b);
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      transition: all 0.15s ease;

      &:hover {
        color: var(--theme--foreground, #0f172a);
        background: rgba(0, 0, 0, 0.04);
      }

      &.active {
        color: var(--theme--primary, #6644ff);
        background: var(--theme--primary-subdued, rgba(102, 68, 255, 0.1));
      }
    }
  }

  .categories-scroll {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;

    .category-pill {
      background: var(--theme--background, #fff);
      border: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.1));
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 500;
      color: var(--theme--foreground-subdued, #64748b);
      border-radius: 16px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--theme--foreground-subdued, #94a3b8);
        color: var(--theme--foreground, #0f172a);
      }

      &.active {
        background: var(--theme--foreground, #0f172a);
        color: #ffffff;
        border-color: var(--theme--foreground, #0f172a);
      }
    }
  }
}

.drag-drop-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  background: var(--theme--background-subdued, rgba(0, 0, 0, 0.02));
  border: 1.5px dashed var(--theme--border-subdued, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
  margin-bottom: 24px;
  transition: all 0.2s ease;

  code {
    background: rgba(0, 0, 0, 0.05);
    padding: 1px 4px;
    border-radius: 4px;
    margin: 0 4px;
  }

  &.is-dragging {
    background: var(--theme--primary-subdued, rgba(102, 68, 255, 0.08));
    border-color: var(--theme--primary, #6644ff);
    color: var(--theme--primary, #6644ff);
  }
}

.recipes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.recipe-card {
  background: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
    border-color: var(--theme--border, rgba(0, 0, 0, 0.18));
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;

    .recipe-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card-badges {
      display: flex;
      gap: 6px;
      align-items: center;

      .source-badge {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;

        &.builtin {
          background: #dbeafe;
          color: #1e40af;
        }

        &.local {
          background: #fef3c7;
          color: #92400e;
        }

        &.cloud {
          background: #e0e7ff;
          color: #4338ca;
        }
      }

      .category-badge {
        font-size: 11px;
        font-weight: 500;
        color: var(--theme--foreground-subdued, #64748b);
        background: rgba(0, 0, 0, 0.04);
        padding: 2px 8px;
        border-radius: 4px;
      }
    }
  }

  .card-content {
    flex: 1;
    margin-bottom: 16px;

    .recipe-name {
      font-size: 16px;
      font-weight: 700;
      color: var(--theme--foreground, #0f172a);
      margin-bottom: 6px;
      line-height: 1.3;
    }

    .recipe-summary {
      font-size: 13px;
      color: var(--theme--foreground-subdued, #64748b);
      line-height: 1.45;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-bottom: 12px;
    }

    .recipe-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;

      .tag-chip {
        font-size: 11px;
        color: var(--theme--foreground-subdued, #64748b);
        background: var(--theme--background-subdued, rgba(0, 0, 0, 0.03));
        padding: 2px 6px;
        border-radius: 4px;
      }
    }
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.06));
    padding-top: 14px;

    .author-info {
      display: flex;
      flex-direction: column;

      .author-name {
        font-size: 11px;
        font-weight: 600;
        color: var(--theme--foreground, #1e293b);
      }

      .flow-count {
        font-size: 10px;
        color: var(--theme--foreground-subdued, #64748b);
      }
    }

    .card-actions {
      display: flex;
      gap: 6px;
      align-items: center;

      .delete-btn {
        color: var(--theme--danger, #ef4444);
      }
    }
  }
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: var(--theme--background, #fff);
  border: 1px dashed var(--theme--border, rgba(0, 0, 0, 0.12));
  border-radius: 12px;

  .empty-icon {
    font-size: 48px;
    color: var(--theme--foreground-subdued, #94a3b8);
    margin-bottom: 12px;
  }

  .empty-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .empty-sub {
    font-size: 13px;
    color: var(--theme--foreground-subdued, #64748b);
    margin-bottom: 16px;
  }
}

:deep(.v-card-actions.dialog-footer),
.dialog-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 10px;
  row-gap: 12px;
  column-gap: 10px;
  padding: 16px 24px;
}
</style>

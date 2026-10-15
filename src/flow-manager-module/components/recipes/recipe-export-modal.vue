<template>
  <v-dialog :model-value="active" max-width="640" persistent @update:model-value="onClose">
    <v-card v-if="flow" class="recipe-export-card">
      <v-card-title class="dialog-header">
        <div class="header-left">
          <div class="header-icon-circle">
            <v-icon name="publish" />
          </div>
          <div>
            <div class="modal-title">Export as Flow Recipe</div>
            <div class="modal-sub">Convert "{{ flow.name }}" into a reusable community recipe</div>
          </div>
        </div>
        <v-button x-small icon secondary @click="onClose">
          <v-icon name="close" />
        </v-button>
      </v-card-title>

      <v-card-text class="dialog-body">
        <!-- Secret Detection Warning -->
        <v-notice
          v-if="detectedSecrets.length"
          type="warning"
          icon="security"
          class="secret-notice"
        >
          <div class="notice-title">
            <strong>{{ detectedSecrets.length }} Potential Hardcoded Secrets Detected</strong>
          </div>
          <div class="notice-text">
            We scanned this flow and detected tokens, passwords, or private keys. Make sure to
            remove or parameterize them before sharing publicly:
          </div>
          <ul class="secret-items-list">
            <li v-for="(sec, idx) in detectedSecrets" :key="idx">
              <strong>{{ sec.suspectedType }}</strong> in <code>{{ sec.path }}</code> ({{
                sec.snippet
              }})
            </li>
          </ul>
        </v-notice>

        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">Recipe Identifier (Slug)*</label>
            <v-input v-model="recipeId" placeholder="e.g. stripe-invoice-notifier" />
          </div>

          <div class="form-row">
            <label class="form-label">Recipe Title*</label>
            <v-input v-model="recipeTitle" placeholder="e.g. Stripe Invoice Email Notifier" />
          </div>

          <div class="form-row">
            <label class="form-label">Category</label>
            <v-select v-model="recipeCategory" :items="categoryOptions" />
          </div>

          <div class="form-row">
            <label class="form-label">Author Name</label>
            <v-input v-model="authorName" placeholder="Your name or organization" />
          </div>

          <div class="form-row">
            <label class="form-label">Tags (comma-separated)</label>
            <v-input v-model="tagsInput" placeholder="stripe, invoicing, email, webhook" />
          </div>

          <div class="form-row">
            <label class="form-label">Description</label>
            <v-textarea
              v-model="recipeDescription"
              placeholder="Describe what this automation recipe accomplishes and how to configure it..."
              rows="3"
            />
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="dialog-footer">
        <v-button secondary @click="onClose">Cancel</v-button>
        <v-button secondary :disabled="!isValid" @click="handleCopyJson">
          <v-icon :name="copied ? 'check' : 'content_copy'" left />
          {{ copied ? 'Copied JSON!' : 'Copy Recipe JSON' }}
        </v-button>
        <v-button
          v-if="hasHubConfigured"
          secondary
          :loading="isPublishingToHub"
          :disabled="!isValid"
          @click="handlePublishToHub"
        >
          <v-icon name="cloud_upload" left />
          Publish to Hub
        </v-button>
        <v-button :disabled="!isValid" @click="handleDownloadJson">
          <v-icon name="file_download" left />
          Download .recipe.json
        </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useStores, useApi } from '@directus/extensions-sdk';
import type { IFlow, IFlowRecipe, RecipeCategory } from '../../../types';
import {
  detectSecretsInFlow,
  exportFlowAsRecipe,
  type DetectedSecret,
} from '../../../utils/recipe.util';
import { RecipeSourceService } from '../../../services/recipe-source.service';

const props = defineProps<{
  flow: IFlow | null;
  active: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();
const api = useApi();

const isPublishingToHub = ref(false);
const hasHubConfigured = computed(() => {
  return !!localStorage.getItem('fm_hub_url') && !!localStorage.getItem('fm_hub_token');
});

const recipeId = ref('');
const recipeTitle = ref('');
const recipeCategory = ref<RecipeCategory>('Communication');
const authorName = ref('Directus Community Developer');
const tagsInput = ref('automation, webhook');
const recipeDescription = ref('');
const detectedSecrets = ref<DetectedSecret[]>([]);
const copied = ref(false);

const categoryOptions = [
  { text: 'Communication', value: 'Communication' },
  { text: 'Maintenance', value: 'Maintenance' },
  { text: 'AI & LLM', value: 'AI & LLM' },
  { text: 'E-Commerce', value: 'E-Commerce' },
  { text: 'DevOps', value: 'DevOps' },
  { text: 'Security', value: 'Security' },
  { text: 'General', value: 'General' },
];

watch(
  () => props.flow,
  (newFlow) => {
    if (!newFlow) return;
    recipeTitle.value = newFlow.name || 'Untitled Automation';
    recipeId.value = (newFlow.name || 'custom-recipe')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    recipeDescription.value = (newFlow.description as string) || '';
    detectedSecrets.value = detectSecretsInFlow(newFlow);
    copied.value = false;
  },
  { immediate: true },
);

const isValid = computed(() => {
  return !!recipeId.value.trim() && !!recipeTitle.value.trim();
});

function buildRecipeObject(): IFlowRecipe | null {
  if (!props.flow) return null;
  const tags = tagsInput.value
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  return exportFlowAsRecipe(props.flow, {
    id: recipeId.value.trim(),
    name: recipeTitle.value.trim(),
    description: recipeDescription.value.trim(),
    category: recipeCategory.value,
    authorName: authorName.value.trim(),
    tags,
  });
}

function handleDownloadJson() {
  const recipe = buildRecipeObject();
  if (!recipe) return;

  const jsonStr = JSON.stringify(recipe, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${recipe.id}.recipe.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  notificationsStore.add({
    type: 'success',
    title: 'Recipe Exported',
    text: `Saved "${recipe.name}" as ${recipe.id}.recipe.json`,
  });

  onClose();
}

async function handleCopyJson() {
  const recipe = buildRecipeObject();
  if (!recipe) return;

  try {
    await navigator.clipboard.writeText(JSON.stringify(recipe, null, 2));
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // ignore
  }
}

async function handlePublishToHub() {
  const recipe = buildRecipeObject();
  if (!recipe) return;

  const hubUrl = localStorage.getItem('fm_hub_url') || '';
  const hubToken = localStorage.getItem('fm_hub_token') || '';

  if (!hubUrl || !hubToken) {
    notificationsStore.add({
      type: 'warning',
      title: 'Hub Not Configured',
      text: 'Please configure your Go Cloud Hub URL and token in the Recipes tab.',
    });
    return;
  }

  isPublishingToHub.value = true;
  try {
    await RecipeSourceService.publishRecipeToHub(recipe, {
      hubUrl,
      hubToken,
      api,
    });

    notificationsStore.add({
      type: 'success',
      title: 'Published to Hub',
      text: `Recipe "${recipe.name}" published to Private Go Hub via /process proxy.`,
    });
    onClose();
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    notificationsStore.add({
      type: 'error',
      title: 'Publish Failed',
      text: `Could not publish recipe to Hub: ${errMsg}`,
    });
  } finally {
    isPublishingToHub.value = false;
  }
}

function onClose() {
  emit('close');
}
</script>

<style scoped lang="scss">
.recipe-export-card {
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-icon-circle {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--theme--primary-subdued, rgba(102, 68, 255, 0.1));
    color: var(--theme--primary, #6644ff);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-title {
    font-size: 16px;
    font-weight: 700;
  }

  .modal-sub {
    font-size: 12px;
    color: var(--theme--foreground-subdued, #64748b);
  }
}

.dialog-body {
  padding: 20px 24px;
}

.secret-notice {
  margin-bottom: 18px;

  .notice-title {
    font-size: 13px;
    margin-bottom: 4px;
  }

  .notice-text {
    font-size: 12px;
    margin-bottom: 8px;
  }

  .secret-items-list {
    margin: 0;
    padding-left: 18px;
    font-size: 11px;

    li {
      margin-bottom: 4px;
    }

    code {
      background: rgba(0, 0, 0, 0.05);
      padding: 1px 4px;
      border-radius: 3px;
    }
  }
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .form-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--theme--foreground, #1e293b);
    }
  }
}

:deep(.v-card-actions.dialog-footer),
.dialog-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px 10px;
  row-gap: 12px;
  column-gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--theme--border-subdued, rgba(0, 0, 0, 0.08));
}
</style>

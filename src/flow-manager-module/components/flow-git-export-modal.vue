<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStores } from '@directus/extensions-sdk';
import type { IFlow } from '../../types';
import { useFlowCanonical } from '../../composables/use-flow-canonical';

const props = withDefaults(
  defineProps<{
    value: boolean;
    flow: IFlow | null;
    flows?: IFlow[];
    categoriesMap?: Map<string, string>;
  }>(),
  {
    flows: () => [],
    categoriesMap: () => new Map(),
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();

const { exportFlowAsGitJson, exportAllFlowsAsGitZip, toCanonicalJson } = useFlowCanonical();

const isZipping = ref(false);

const jsonPreview = computed(() => {
  if (!props.flow) return '';
  const fullJson = toCanonicalJson(props.flow);
  // Show first 25 lines as preview
  const lines = fullJson.split('\n');
  if (lines.length > 25) {
    return lines.slice(0, 25).join('\n') + '\n  // ... remaining operations';
  }
  return fullJson;
});

function handleExportSingle() {
  if (!props.flow) return;
  try {
    const rawCatId = props.flow.flow_manager_metadata_id?.flow_manager_category;
    const catName =
      rawCatId && props.categoriesMap?.has?.(rawCatId)
        ? props.categoriesMap.get(rawCatId)
        : undefined;
    exportFlowAsGitJson(props.flow, catName);
    notificationsStore.add({
      type: 'success',
      title: 'Export Download Started',
      text: `Exported canonical schema for "${props.flow.name}".`,
    });
  } catch (err: unknown) {
    console.error('Failed to export single flow:', err);
    notificationsStore.add({
      type: 'error',
      title: 'Export Failed',
      text: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleExportZip() {
  if (!props.flows.length) return;
  isZipping.value = true;
  try {
    await exportAllFlowsAsGitZip(props.flows, props.categoriesMap);
    notificationsStore.add({
      type: 'success',
      title: 'Repository Bundle Exported',
      text: `Downloaded Git repository bundle with ${props.flows.length} flows.`,
    });
  } catch (err: unknown) {
    console.error('Failed to export zip bundle:', err);
    notificationsStore.add({
      type: 'error',
      title: 'Export Bundle Failed',
      text: err instanceof Error ? err.message : String(err),
    });
  } finally {
    isZipping.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="value"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card class="git-export-card">
      <v-card-title>
        <div class="title-with-icon">
          <v-icon name="terminal" class="mr-2" />
          <span>Git & CI/CD Schema Export</span>
        </div>
      </v-card-title>

      <v-card-text>
        <div class="intro-box">
          <v-icon name="hub" class="intro-icon mr-2" />
          <div class="intro-text">
            Flow Manager exports canonical, deterministic JSON schemas stripped of database IDs and
            runtime counters. Perfectly suited for Git version control, pull request code reviews,
            and CI/CD pipelines.
          </div>
        </div>

        <div class="export-options-grid">
          <!-- Option 1: Current Flow -->
          <div v-if="flow" class="export-option-card">
            <div class="option-header">
              <v-icon name="description" class="option-icon" />
              <div>
                <div class="option-title">Current Flow: {{ flow.name }}</div>
                <div class="option-sub">
                  Export as a single standalone <code>.flow.json</code> file
                </div>
              </div>
            </div>
            <div class="preview-box">
              <pre><code>{{ jsonPreview }}</code></pre>
            </div>
            <v-button class="action-btn" @click="handleExportSingle">
              <v-icon name="file_download" class="mr-1" />
              Download .flow.json
            </v-button>
          </div>

          <!-- Option 2: Full Repository Bundle -->
          <div class="export-option-card bundle-card">
            <div class="option-header">
              <v-icon name="folder_zip" class="option-icon zip-icon" />
              <div>
                <div class="option-title">Git Repository Bundle (ZIP)</div>
                <div class="option-sub">
                  Organizes all {{ flows.length }} flows into categorized folders with README and
                  schema docs
                </div>
              </div>
            </div>

            <div class="tree-preview">
              <div class="tree-line">📁 directus-flows-repo/</div>
              <div class="tree-line tree-indent">📄 README.md</div>
              <div class="tree-line tree-indent">📁 flows/</div>
              <div class="tree-line tree-double-indent">📁 integrations/</div>
              <div class="tree-line tree-triple-indent">📄 slack-alert.flow.json</div>
              <div class="tree-line tree-double-indent">📁 customer-data/</div>
              <div class="tree-line tree-triple-indent">📄 sync-crm.flow.json</div>
            </div>

            <v-button
              class="action-btn"
              :loading="isZipping"
              :disabled="!flows.length"
              @click="handleExportZip"
            >
              <v-icon name="download" class="mr-1" />
              Download Full Repo Bundle (ZIP)
            </v-button>
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-button secondary @click="emit('update:modelValue', false)"> Close </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.git-export-card {
  max-width: 780px;
  width: 90vw;
}

.title-with-icon {
  display: flex;
  align-items: center;
}

.intro-box {
  display: flex;
  align-items: flex-start;
  padding: 12px 14px;
  background-color: var(--theme--background-subdued, #f8fafc);
  border-radius: 6px;
  border-left: 3px solid var(--theme--primary, #6366f1);
  margin-bottom: 20px;
}

.intro-icon {
  color: var(--theme--primary, #6366f1);
  margin-top: 2px;
}

.intro-text {
  font-size: 13px;
  line-height: 1.4;
  color: var(--theme--foreground, #334155);
}

.export-options-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.export-option-card {
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  background-color: var(--theme--background, #ffffff);
  display: flex;
  flex-direction: column;
  gap: 12px;

  &.bundle-card {
    background-color: var(--theme--background-subdued, #f8fafc);
  }
}

.option-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.option-icon {
  font-size: 28px;
  color: var(--theme--primary, #6366f1);

  &.zip-icon {
    color: #f59e0b;
  }
}

.option-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme--foreground, #1e293b);
}

.option-sub {
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
  margin-top: 2px;
}

.preview-box {
  background-color: #0f172a;
  border-radius: 6px;
  padding: 10px 12px;
  overflow: auto;
  max-height: 140px;

  pre {
    margin: 0;
    font-size: 11px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: #38bdf8;
  }
}

.tree-preview {
  background-color: #0f172a;
  border-radius: 6px;
  padding: 10px 14px;
  font-family: monospace;
  font-size: 11px;
  color: #a7f3d0;
  line-height: 1.5;
}

.tree-indent {
  padding-left: 14px;
}

.tree-double-indent {
  padding-left: 28px;
}

.tree-triple-indent {
  padding-left: 42px;
}

.action-btn {
  align-self: flex-start;
}

.mr-1 {
  margin-right: 4px;
}

.mr-2 {
  margin-right: 8px;
}
</style>

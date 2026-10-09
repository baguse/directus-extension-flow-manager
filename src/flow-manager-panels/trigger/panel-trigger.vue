<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { PanelTriggerProps } from '../shared/types';
import { usePanelFlows } from '../shared/use-panel-flows';
import { formatRelativeTime, formatDuration } from '../shared/time.util';
import FlowTriggerModal from '../shared/flow-trigger-modal.vue';

const props = withDefaults(defineProps<PanelTriggerProps>(), {
  showHeader: false,
  flowId: null,
  customLabel: '',
  customIcon: '',
  customColor: '',
  buttonSize: 'large',
  showDetails: true,
});

const { flows, loading: flowsLoading, loadFlows, triggerFlow } = usePanelFlows();

const isTriggering = ref(false);
const showModal = ref(false);
const triggerFeedback = ref<{
  type: 'success' | 'error';
  message: string;
  durationMs?: number;
} | null>(null);

let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

const targetFlow = computed(() => {
  if (!props.flowId) return null;
  return flows.value.find((f) => f.id === props.flowId) || null;
});

const buttonLabel = computed(() => {
  if (props.customLabel && props.customLabel.trim()) {
    return props.customLabel.trim();
  }
  return targetFlow.value?.name || 'Trigger Flow';
});

const buttonIcon = computed(() => {
  if (props.customIcon && props.customIcon.trim()) {
    return props.customIcon.trim();
  }
  return targetFlow.value?.icon || 'bolt';
});

const buttonColorStyle = computed(() => {
  if (props.customColor) {
    return {
      '--v-button-background-color': props.customColor,
      '--v-button-border-color': props.customColor,
      '--v-button-background-color-hover': props.customColor,
    };
  }
  if (targetFlow.value?.color) {
    return {
      '--v-button-background-color': targetFlow.value.color,
      '--v-button-border-color': targetFlow.value.color,
      '--v-button-background-color-hover': targetFlow.value.color,
    };
  }
  return {};
});

const requiresDialog = computed(() => {
  if (!targetFlow.value) return false;
  const opts = targetFlow.value.options;
  return Boolean(opts?.requireConfirmation || (opts?.fields && opts.fields.length > 0));
});

function handleTriggerClick() {
  if (!targetFlow.value) return;

  if (requiresDialog.value) {
    showModal.value = true;
  } else {
    executeFlow({});
  }
}

async function executeFlow(payload: Record<string, unknown>) {
  if (!targetFlow.value) return;

  isTriggering.value = true;
  triggerFeedback.value = null;

  try {
    const res = await triggerFlow(targetFlow.value.id, payload);
    showModal.value = false;

    if (res.success) {
      triggerFeedback.value = {
        type: 'success',
        message: 'Flow executed successfully',
        durationMs: res.durationMs,
      };
      // Reload flows metadata to update counters
      loadFlows();
    } else {
      triggerFeedback.value = {
        type: 'error',
        message: res.error || 'Execution failed',
        durationMs: res.durationMs,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Execution failed';
    triggerFeedback.value = {
      type: 'error',
      message,
    };
  } finally {
    isTriggering.value = false;

    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    feedbackTimeout = setTimeout(() => {
      triggerFeedback.value = null;
    }, 5000);
  }
}

onMounted(() => {
  loadFlows();
});

watch(
  () => props.now,
  () => {
    loadFlows();
  },
);
</script>

<template>
  <div class="panel-trigger-container" :class="{ 'has-header': showHeader }">
    <div v-if="flowsLoading && flows.length === 0" class="loading-state">
      <v-progress-circular indeterminate />
    </div>

    <div v-else-if="!flowId || !targetFlow" class="empty-state">
      <v-icon name="touch_app" large class="mb-2" />
      <div class="empty-text">No Flow Selected</div>
      <div class="empty-sub">Configure this panel and select a flow to trigger.</div>
    </div>

    <div v-else class="trigger-content">
      <!-- Main Trigger Action Button -->
      <div class="button-wrapper">
        <v-button
          :class="[buttonSize === 'large' ? 'hero-btn' : 'std-btn']"
          :loading="isTriggering"
          :disabled="targetFlow.status !== 'active'"
          :style="buttonColorStyle"
          @click="handleTriggerClick"
        >
          <v-icon :name="buttonIcon" left />
          <span class="btn-text">{{ buttonLabel }}</span>
        </v-button>

        <div v-if="targetFlow.status !== 'active'" class="inactive-warning">
          <v-icon name="pause" small class="mr-1" />
          Flow is currently inactive
        </div>
      </div>

      <!-- Execution Feedback Badge -->
      <transition name="fade">
        <div
          v-if="triggerFeedback"
          class="feedback-banner"
          :class="triggerFeedback.type === 'success' ? 'feedback-success' : 'feedback-error'"
        >
          <v-icon
            :name="triggerFeedback.type === 'success' ? 'check_circle' : 'error'"
            small
            class="mr-1"
          />
          <span class="feedback-text">{{ triggerFeedback.message }}</span>
          <span v-if="triggerFeedback.durationMs" class="feedback-duration">
            ({{ formatDuration(triggerFeedback.durationMs) }})
          </span>
        </div>
      </transition>

      <!-- Flow Details & Stats Footer -->
      <div v-if="showDetails" class="trigger-footer">
        <div class="footer-stat">
          <span class="stat-label">Last Run:</span>
          <span class="stat-val">
            {{ formatRelativeTime(targetFlow.flow_manager_metadata?.flow_manager_last_run_at) }}
          </span>
        </div>
        <div class="footer-stat">
          <span class="stat-label">Total Runs:</span>
          <span class="stat-val">
            {{ (targetFlow.flow_manager_metadata?.flow_manager_run_counter || 0).toLocaleString() }}
          </span>
        </div>
        <div class="footer-stat">
          <span class="stat-label">Trigger:</span>
          <v-chip x-small class="trigger-chip">{{ targetFlow.trigger }}</v-chip>
        </div>
      </div>
    </div>

    <!-- Parameter Prompt Modal if required -->
    <flow-trigger-modal
      v-model="showModal"
      :flow="targetFlow"
      :loading="isTriggering"
      @submit="executeFlow"
      @cancel="showModal = false"
    />
  </div>
</template>

<style scoped lang="scss">
.panel-trigger-container {
  height: 100%;
  width: 100%;
  padding: 1rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: auto;
}

.has-header {
  padding-top: 0.5rem;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--theme--foreground-subdued);
}

.empty-text {
  font-weight: 700;
  font-size: 0.9375rem;
  color: var(--theme--foreground);
}

.empty-sub {
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.trigger-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  height: 100%;
  width: 100%;
}

.button-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.hero-btn {
  --v-button-height: 3.25rem;
  --v-button-font-size: 1rem;
  --v-button-min-width: 10rem;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
}

.std-btn {
  --v-button-height: 2.5rem;
  --v-button-font-size: 0.875rem;
  font-weight: 600;
}

.btn-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 250px;
}

.inactive-warning {
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: var(--theme--warning);
  display: flex;
  align-items: center;
}

.feedback-banner {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.75rem;
  border-radius: var(--theme--border-radius);
  font-size: 0.75rem;
  font-weight: 600;
  max-width: 90%;
  text-align: center;

  &.feedback-success {
    background: var(--theme--success-alt, rgba(46, 196, 182, 0.15));
    color: var(--theme--success, #2ec4b6);
  }

  &.feedback-error {
    background: var(--theme--danger-alt, rgba(231, 29, 54, 0.15));
    color: var(--theme--danger, #e71d36);
  }

  .feedback-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .feedback-duration {
    margin-left: 0.25rem;
    opacity: 0.8;
  }
}

.trigger-footer {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  padding-top: 0.5rem;
  border-top: 1px solid var(--theme--border-color-subdued);
  width: 100%;
  font-size: 0.75rem;
}

.footer-stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;

  .stat-label {
    color: var(--theme--foreground-subdued);
  }

  .stat-val {
    font-weight: 600;
  }

  .trigger-chip {
    text-transform: capitalize;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.mb-2 {
  margin-bottom: 0.5rem;
}

.mr-1 {
  margin-right: 0.25rem;
}
</style>

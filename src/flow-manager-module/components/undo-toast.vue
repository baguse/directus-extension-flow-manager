<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    active: boolean;
    message: string;
    duration?: number;
  }>(),
  {
    duration: 5000,
  },
);

const emit = defineEmits<{
  (e: 'undo'): void;
  (e: 'commit'): void;
  (e: 'pause'): void;
  (e: 'resume'): void;
}>();

const isPaused = ref(false);
const remainingMs = ref(props.duration);
const progressPercent = ref(100);

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastTickTime = 0;

function startTimer() {
  stopTimer();
  remainingMs.value = props.duration;
  progressPercent.value = 100;
  isPaused.value = false;
  lastTickTime = performance.now();

  intervalId = setInterval(() => {
    if (isPaused.value) {
      lastTickTime = performance.now();
      return;
    }

    const now = performance.now();
    const delta = now - lastTickTime;
    lastTickTime = now;

    remainingMs.value = Math.max(0, remainingMs.value - delta);
    progressPercent.value = Math.max(0, (remainingMs.value / props.duration) * 100);

    if (remainingMs.value <= 0) {
      stopTimer();
      emit('commit');
    }
  }, 50);
}

function stopTimer() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function onMouseEnter() {
  isPaused.value = true;
  emit('pause');
}

function onMouseLeave() {
  isPaused.value = false;
  lastTickTime = performance.now();
  emit('resume');
}

function onUndo() {
  stopTimer();
  emit('undo');
}

function onDeleteNow() {
  stopTimer();
  emit('commit');
}

function onDismiss() {
  stopTimer();
  emit('commit');
}

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      startTimer();
    } else {
      stopTimer();
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  stopTimer();
});
</script>

<template>
  <transition name="toast-slide">
    <div
      v-if="active"
      class="undo-toast"
      role="alert"
      aria-live="assertive"
      @mouseenter="onMouseEnter"
      @mouseleave="onMouseLeave"
    >
      <div class="toast-content">
        <v-icon name="delete" class="toast-icon" />
        <span class="toast-message" :title="message">{{ message }}</span>
      </div>

      <div class="toast-actions">
        <button type="button" class="btn btn-undo" @click="onUndo">
          <v-icon name="undo" x-small />
          <span>Undo</span>
        </button>

        <button type="button" class="btn btn-delete-now" @click="onDeleteNow">
          <v-icon name="delete_forever" x-small />
          <span>Delete Now</span>
        </button>

        <button
          type="button"
          class="btn-dismiss"
          title="Dismiss"
          aria-label="Dismiss"
          @click="onDismiss"
        >
          <v-icon name="close" x-small />
        </button>
      </div>

      <!-- Animated progress bar showing remaining cooldown -->
      <div class="toast-progress-bar" :style="{ width: `${progressPercent}%` }" />
    </div>
  </transition>
</template>

<style scoped lang="scss">
.undo-toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-width: 360px;
  max-width: min(92vw, 620px);
  padding: 0.625rem 0.875rem 0.75rem 1rem;
  background-color: var(--theme--background-inverted, #1c222c);
  color: var(--theme--foreground-inverted, #ffffff);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--theme--border-radius, 8px);
  box-shadow:
    0 10px 25px -5px rgba(0, 0, 0, 0.35),
    0 8px 10px -6px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  user-select: none;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
  flex: 1;

  .toast-icon {
    color: var(--theme--danger, #e35169);
    flex-shrink: 0;
  }

  .toast-message {
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.toast-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    height: 1.75rem;
    padding: 0 0.625rem;
    border-radius: var(--theme--border-radius, 4px);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    outline: none;
    transition: all 0.15s ease;
    white-space: nowrap;
    font-family: inherit;
    line-height: 1;

    &:active {
      transform: scale(0.97);
    }
  }

  .btn-undo {
    background-color: var(--theme--primary, #6644ff);
    color: var(--theme--primary-foreground, #ffffff);

    &:hover {
      background-color: var(--theme--primary-accent, #5533ee);
    }
  }

  .btn-delete-now {
    background-color: rgba(227, 81, 105, 0.15);
    color: var(--theme--danger, #e35169);
    border: 1px solid rgba(227, 81, 105, 0.35);

    &:hover {
      background-color: var(--theme--danger, #e35169);
      color: #ffffff;
      border-color: var(--theme--danger, #e35169);
    }
  }

  .btn-dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border-radius: var(--theme--border-radius, 4px);
    background: transparent;
    border: none;
    color: var(--theme--foreground-subdued, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    outline: none;
    transition: all 0.15s ease;

    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
      color: var(--theme--foreground-inverted, #ffffff);
    }

    &:active {
      transform: scale(0.95);
    }
  }
}

.toast-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background-color: var(--theme--primary, #6644ff);
  transition: width 50ms linear;
}

/* Animations */
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-slide-enter-from {
  opacity: 0;
  transform: translate(-50%, 1rem) scale(0.95);
}

.toast-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, 0.5rem) scale(0.98);
}
</style>

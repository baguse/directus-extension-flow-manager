<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import type { TimeTravelTrace, TimeTravelFrame } from '../../../utils/time-travel-debugger.util';
import type { IFlow } from '../../../types';

const props = withDefaults(
  defineProps<{
    trace: TimeTravelTrace;
    flow?: IFlow | null;
    initialIndex?: number;
  }>(),
  {
    flow: null,
    initialIndex: undefined,
  },
);

const emit = defineEmits<{
  (e: 'frame-change', frame: TimeTravelFrame): void;
}>();

// Playback state
const currentFrameIndex = ref<number>(0);
const isPlaying = ref(false);
const playbackSpeed = ref<number>(1);
const activeTab = ref<'delta' | 'last' | 'scope' | 'options'>('delta');
const lastViewMode = ref<'split' | 'output' | 'input'>('split');
const scopeSearch = ref('');
const copySuccessKey = ref<string | null>(null);

let timerId: ReturnType<typeof setInterval> | null = null;

const availableSpeeds = [0.5, 1, 2, 4];

// Initialize frame index on mount / trace change
function initFrame() {
  stopPlayback();
  if (props.initialIndex !== undefined && props.initialIndex >= 0) {
    currentFrameIndex.value = Math.min(props.initialIndex, props.trace.frames.length - 1);
  } else if (props.trace.failedStepIndex !== undefined) {
    currentFrameIndex.value = props.trace.failedStepIndex;
  } else {
    currentFrameIndex.value = 0;
  }
}

watch(
  () => props.trace,
  () => initFrame(),
  { immediate: true },
);

const frames = computed(() => props.trace.frames || []);
const totalFrames = computed(() => frames.value.length);

const currentFrame = computed<TimeTravelFrame | null>(() => {
  if (!frames.value.length) return null;
  return frames.value[currentFrameIndex.value] || frames.value[0] || null;
});

const progressPercent = computed(() => {
  if (totalFrames.value <= 1) return 100;
  return (currentFrameIndex.value / (totalFrames.value - 1)) * 100;
});

watch(currentFrame, (newFrame) => {
  if (newFrame) {
    emit('frame-change', newFrame);
  }
});

// Playback controls
function startPlayback() {
  if (totalFrames.value <= 1) return;
  // If at the end, restart from beginning
  if (currentFrameIndex.value >= totalFrames.value - 1) {
    currentFrameIndex.value = 0;
  }

  isPlaying.value = true;
  const intervalMs = Math.max(100, Math.round(1000 / playbackSpeed.value));

  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    if (currentFrameIndex.value < totalFrames.value - 1) {
      currentFrameIndex.value++;
      // Auto-pause if we hit a failed step during playback
      const frame = frames.value[currentFrameIndex.value];
      if (frame && frame.status === 'reject') {
        stopPlayback();
      }
    } else {
      stopPlayback();
    }
  }, intervalMs);
}

function stopPlayback() {
  isPlaying.value = false;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function togglePlay() {
  if (isPlaying.value) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function stepBack() {
  stopPlayback();
  if (currentFrameIndex.value > 0) {
    currentFrameIndex.value--;
  }
}

function stepForward() {
  stopPlayback();
  if (currentFrameIndex.value < totalFrames.value - 1) {
    currentFrameIndex.value++;
  }
}

function jumpToFirst() {
  stopPlayback();
  currentFrameIndex.value = 0;
}

function jumpToLast() {
  stopPlayback();
  currentFrameIndex.value = Math.max(0, totalFrames.value - 1);
}

function jumpToCrash() {
  stopPlayback();
  if (props.trace.failedStepIndex !== undefined) {
    currentFrameIndex.value = props.trace.failedStepIndex;
  }
}

function setFrame(index: number) {
  stopPlayback();
  currentFrameIndex.value = Math.max(0, Math.min(index, totalFrames.value - 1));
}

function setSpeed(speed: number) {
  playbackSpeed.value = speed;
  if (isPlaying.value) {
    // Restart interval with new speed
    startPlayback();
  }
}

// Scrubber drag / click
function onScrubberClick(e: MouseEvent) {
  const track = e.currentTarget as HTMLElement;
  const rect = track.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  const targetIndex = Math.round(ratio * (totalFrames.value - 1));
  setFrame(targetIndex);
}

// Keyboard shortcuts
function handleKeyDown(e: KeyboardEvent) {
  // Don't intercept if user is typing in an input
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    stepBack();
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    stepForward();
  } else if (e.code === 'Home') {
    e.preventDefault();
    jumpToFirst();
  } else if (e.code === 'End') {
    e.preventDefault();
    jumpToLast();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  stopPlayback();
  window.removeEventListener('keydown', handleKeyDown);
});

// Utilities
function formatJson(val: unknown): string {
  if (val === undefined) return 'undefined';
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

async function copyText(text: string, keyName: string) {
  try {
    await navigator.clipboard.writeText(text);
    copySuccessKey.value = keyName;
    setTimeout(() => {
      if (copySuccessKey.value === keyName) {
        copySuccessKey.value = null;
      }
    }, 1500);
  } catch {
    // ignore
  }
}

const filteredScopeKeys = computed(() => {
  if (!currentFrame.value) return [];
  const scope = currentFrame.value.afterState.scope || {};
  const keys = Object.keys(scope);
  if (!scopeSearch.value.trim()) return keys;
  const q = scopeSearch.value.toLowerCase().trim();
  return keys.filter((k) => k.toLowerCase().includes(q));
});

const totalDeltaCount = computed(() => {
  if (!currentFrame.value?.delta) return 0;
  const { added, modified, removed } = currentFrame.value.delta;
  return added.length + modified.length + removed.length;
});
</script>

<template>
  <div class="time-travel-player">
    <!-- 1. Player Video-Deck Bar -->
    <div class="deck-container">
      <div class="deck-top">
        <!-- Milestone Indicators / Step counter -->
        <div class="deck-status">
          <span class="pulse-indicator" :class="{ 'is-playing': isPlaying }"></span>
          <span class="status-label">
            {{ isPlaying ? 'REPLAYING' : 'PAUSED' }}
          </span>
          <span class="frame-counter">
            Frame {{ currentFrameIndex }} / {{ Math.max(0, totalFrames - 1) }}
          </span>
          <span v-if="currentFrame?.durationMs !== undefined" class="frame-duration">
            {{ currentFrame.durationMs }}ms
          </span>
        </div>

        <!-- Jump to Crash Action -->
        <div class="deck-quick-actions">
          <button
            v-if="trace.failedStepIndex !== undefined"
            type="button"
            class="jump-crash-btn"
            :class="{ active: currentFrameIndex === trace.failedStepIndex }"
            title="Jump directly to the failing operation"
            @click="jumpToCrash"
          >
            <v-icon name="bug_report" small />
            <span>Jump to Crash</span>
          </button>
        </div>
      </div>

      <!-- 2. Interactive Scrubber Timeline Track -->
      <div class="scrubber-wrapper">
        <div class="scrubber-track" @click="onScrubberClick">
          <!-- Filled progress bar -->
          <div class="scrubber-fill" :style="{ width: `${progressPercent}%` }"></div>

          <!-- Milestones along the track -->
          <div
            v-for="(frame, idx) in frames"
            :key="idx"
            :class="[
              'milestone-pin',
              frame.status,
              {
                active: idx === currentFrameIndex,
                past: idx < currentFrameIndex,
              },
            ]"
            :style="{ left: `${totalFrames <= 1 ? 50 : (idx / (totalFrames - 1)) * 100}%` }"
            :title="`${frame.name} (${frame.status.toUpperCase()})`"
            @click.stop="setFrame(idx)"
          >
            <span class="pin-dot"></span>
          </div>
        </div>

        <!-- Scrubber Labels / Milestone Names -->
        <div class="scrubber-legend">
          <span class="legend-start" @click="jumpToFirst">
            <v-icon name="bolt" x-small />
            Trigger
          </span>
          <span class="legend-current">
            {{ currentFrame?.name || 'Step' }}
          </span>
          <span class="legend-end" @click="jumpToLast">
            End
            <v-icon name="flag" x-small />
          </span>
        </div>
      </div>

      <!-- 3. Player Control Bar -->
      <div class="controls-bar">
        <div class="main-transport">
          <!-- Jump to First -->
          <button
            type="button"
            class="ctrl-btn"
            :disabled="currentFrameIndex === 0"
            title="Jump to Start (Home)"
            @click="jumpToFirst"
          >
            <v-icon name="first_page" />
          </button>

          <!-- Step Back -->
          <button
            type="button"
            class="ctrl-btn"
            :disabled="currentFrameIndex === 0"
            title="Step Back 1 frame (Left Arrow)"
            @click="stepBack"
          >
            <v-icon name="skip_previous" />
          </button>

          <!-- Play / Pause -->
          <button
            type="button"
            class="ctrl-btn play-pause-btn"
            :class="{ playing: isPlaying }"
            :title="isPlaying ? 'Pause (Space)' : 'Play (Space)'"
            @click="togglePlay"
          >
            <v-icon :name="isPlaying ? 'pause' : 'play_arrow'" />
          </button>

          <!-- Step Forward -->
          <button
            type="button"
            class="ctrl-btn"
            :disabled="currentFrameIndex >= totalFrames - 1"
            title="Step Forward 1 frame (Right Arrow)"
            @click="stepForward"
          >
            <v-icon name="skip_next" />
          </button>

          <!-- Jump to Last -->
          <button
            type="button"
            class="ctrl-btn"
            :disabled="currentFrameIndex >= totalFrames - 1"
            title="Jump to End (End)"
            @click="jumpToLast"
          >
            <v-icon name="last_page" />
          </button>
        </div>

        <!-- Playback Speed Selector -->
        <div class="speed-selector">
          <span class="speed-label">Speed:</span>
          <div class="speed-chips">
            <button
              v-for="s in availableSpeeds"
              :key="s"
              type="button"
              class="speed-chip"
              :class="{ active: playbackSpeed === s }"
              @click="setSpeed(s)"
            >
              {{ s }}x
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. Active Frame Spotlight Banner -->
    <div v-if="currentFrame" class="frame-banner" :class="[currentFrame.status]">
      <div class="frame-icon-badge" :class="[currentFrame.category]">
        <v-icon :name="currentFrame.icon" />
      </div>

      <div class="frame-info">
        <div class="frame-title-row">
          <span class="frame-step-index">
            {{ currentFrame.index === 0 ? 'START' : `STEP #${currentFrame.index}` }}
          </span>
          <span class="frame-name">{{ currentFrame.name }}</span>
          <code class="frame-key">[{{ currentFrame.stepKey }}]</code>
          <span class="frame-category-pill" :class="currentFrame.category">
            {{ currentFrame.operationType }}
          </span>
        </div>

        <!-- Error Alert if this frame rejected -->
        <div v-if="currentFrame.error" class="frame-error-box">
          <v-icon name="error" class="error-icon" />
          <div class="error-content">
            <div class="error-msg">
              <strong>Execution Halted:</strong> {{ currentFrame.error.message }}
            </div>
          </div>
        </div>
      </div>

      <div class="frame-status-tag" :class="currentFrame.status">
        <v-icon
          :name="
            currentFrame.status === 'resolve'
              ? 'check_circle'
              : currentFrame.status === 'reject'
                ? 'error'
                : 'bolt'
          "
          small
        />
        <span>{{ currentFrame.status.toUpperCase() }}</span>
      </div>
    </div>

    <!-- 5. Multi-Tab State & Memory Inspector -->
    <div v-if="currentFrame" class="inspector-container">
      <div class="inspector-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'delta' }"
          @click="activeTab = 'delta'"
        >
          <v-icon name="difference" small />
          <span>Delta Diff</span>
          <span class="tab-badge" :class="{ highlight: totalDeltaCount > 0 }">
            {{ totalDeltaCount }}
          </span>
        </button>

        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'last' }"
          @click="activeTab = 'last'"
        >
          <v-icon name="transit_enterexit" small />
          <span>$last Context</span>
        </button>

        <button
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'scope' }"
          @click="activeTab = 'scope'"
        >
          <v-icon name="data_object" small />
          <span>Full Scope ($data)</span>
        </button>

        <button
          v-if="currentFrame.options"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === 'options' }"
          @click="activeTab = 'options'"
        >
          <v-icon name="tune" small />
          <span>Operation Config</span>
        </button>
      </div>

      <!-- Tab Content 1: Delta Diff (What changed in this step?) -->
      <div v-if="activeTab === 'delta'" class="tab-pane delta-pane">
        <div class="delta-header">
          <div class="delta-summary">
            <span class="diff-tag added">+{{ currentFrame.delta.added.length }} added</span>
            <span class="diff-tag modified"
              >~{{ currentFrame.delta.modified.length }} modified</span
            >
            <span class="diff-tag removed">-{{ currentFrame.delta.removed.length }} removed</span>
          </div>
          <span class="delta-hint">State changes introduced at this millisecond</span>
        </div>

        <div v-if="totalDeltaCount === 0" class="empty-state">
          <v-icon name="horizontal_rule" class="empty-icon" />
          <div class="empty-title">No scope mutations</div>
          <div class="empty-sub">
            This step did not introduce new keys or alter existing variables in $data.
          </div>
        </div>

        <div v-else class="delta-list">
          <!-- Added items -->
          <div
            v-for="item in currentFrame.delta.added"
            :key="`add_${item.key}`"
            class="delta-item added"
          >
            <div class="delta-item-head">
              <span class="action-badge add">+ ADDED</span>
              <strong class="delta-key">{{ item.key }}</strong>
              <button
                type="button"
                class="copy-mini-btn"
                :title="copySuccessKey === `add_${item.key}` ? 'Copied!' : 'Copy Value'"
                @click="copyText(formatJson(item.value), `add_${item.key}`)"
              >
                <v-icon
                  :name="copySuccessKey === `add_${item.key}` ? 'check' : 'content_copy'"
                  x-small
                />
              </button>
            </div>
            <pre class="delta-code"><code>{{ formatJson(item.value) }}</code></pre>
          </div>

          <!-- Modified items -->
          <div
            v-for="item in currentFrame.delta.modified"
            :key="`mod_${item.key}`"
            class="delta-item modified"
          >
            <div class="delta-item-head">
              <span class="action-badge mod">~ MODIFIED</span>
              <strong class="delta-key">{{ item.key }}</strong>
            </div>
            <div class="diff-split">
              <div class="diff-col from">
                <div class="diff-col-title">Before (Previous Value)</div>
                <pre class="delta-code"><code>{{ formatJson(item.from) }}</code></pre>
              </div>
              <div class="diff-col to">
                <div class="diff-col-title">After (Updated Value)</div>
                <pre class="delta-code"><code>{{ formatJson(item.to) }}</code></pre>
              </div>
            </div>
          </div>

          <!-- Removed items -->
          <div
            v-for="item in currentFrame.delta.removed"
            :key="`rem_${item.key}`"
            class="delta-item removed"
          >
            <div class="delta-item-head">
              <span class="action-badge rem">- REMOVED</span>
              <strong class="delta-key">{{ item.key }}</strong>
            </div>
            <pre class="delta-code"><code>{{ formatJson(item.from) }}</code></pre>
          </div>
        </div>
      </div>

      <!-- Tab Content 2: $last Context -->
      <div v-if="activeTab === 'last'" class="tab-pane last-pane">
        <div class="sub-tab-bar">
          <div class="sub-tab-group">
            <button
              type="button"
              class="sub-tab"
              :class="{ active: lastViewMode === 'split' }"
              @click="lastViewMode = 'split'"
            >
              Side-by-side
            </button>
            <button
              type="button"
              class="sub-tab"
              :class="{ active: lastViewMode === 'output' }"
              @click="lastViewMode = 'output'"
            >
              Output ($last produced)
            </button>
            <button
              type="button"
              class="sub-tab"
              :class="{ active: lastViewMode === 'input' }"
              @click="lastViewMode = 'input'"
            >
              Input ($last received)
            </button>
          </div>
        </div>

        <div class="last-body" :class="[lastViewMode]">
          <!-- Input $last -->
          <div
            v-if="lastViewMode === 'split' || lastViewMode === 'input'"
            class="last-card input-card"
          >
            <div class="last-card-head">
              <div class="head-left">
                <v-icon name="arrow_downward" small />
                <span>Input ($last entering this step)</span>
              </div>
              <button
                type="button"
                class="copy-btn"
                :title="copySuccessKey === 'last_in' ? 'Copied!' : 'Copy JSON'"
                @click="copyText(formatJson(currentFrame.beforeState.last), 'last_in')"
              >
                <v-icon :name="copySuccessKey === 'last_in' ? 'check' : 'content_copy'" x-small />
              </button>
            </div>
            <pre class="code-box"><code>{{ formatJson(currentFrame.beforeState.last) }}</code></pre>
          </div>

          <!-- Output $last -->
          <div
            v-if="lastViewMode === 'split' || lastViewMode === 'output'"
            class="last-card output-card"
          >
            <div class="last-card-head">
              <div class="head-left">
                <v-icon name="arrow_upward" small />
                <span>Output ($last produced by this step)</span>
              </div>
              <button
                type="button"
                class="copy-btn"
                :title="copySuccessKey === 'last_out' ? 'Copied!' : 'Copy JSON'"
                @click="copyText(formatJson(currentFrame.afterState.last), 'last_out')"
              >
                <v-icon :name="copySuccessKey === 'last_out' ? 'check' : 'content_copy'" x-small />
              </button>
            </div>
            <pre class="code-box"><code>{{ formatJson(currentFrame.afterState.last) }}</code></pre>
          </div>
        </div>
      </div>

      <!-- Tab Content 3: Full Memory Scope ($data) -->
      <div v-if="activeTab === 'scope'" class="tab-pane scope-pane">
        <div class="scope-toolbar">
          <div class="search-input-box">
            <v-icon name="search" small class="search-icon" />
            <input
              v-model="scopeSearch"
              type="text"
              placeholder="Search variables in $data scope..."
              class="scope-input"
            />
            <button
              v-if="scopeSearch"
              type="button"
              class="clear-search-btn"
              @click="scopeSearch = ''"
            >
              <v-icon name="close" x-small />
            </button>
          </div>

          <button
            type="button"
            class="copy-full-scope-btn"
            :title="copySuccessKey === 'full_scope' ? 'Copied!' : 'Copy Full Scope'"
            @click="copyText(formatJson(currentFrame.afterState.scope), 'full_scope')"
          >
            <v-icon :name="copySuccessKey === 'full_scope' ? 'check' : 'content_copy'" small />
            <span>Copy Full Scope JSON</span>
          </button>
        </div>

        <div v-if="!filteredScopeKeys.length" class="empty-state">
          <v-icon name="search_off" class="empty-icon" />
          <div class="empty-title">No keys match "{{ scopeSearch }}"</div>
        </div>

        <div v-else class="scope-keys-list">
          <div
            v-for="key in filteredScopeKeys"
            :key="key"
            class="scope-key-block"
            :class="{ highlight: key === currentFrame.stepKey || key === '$last' }"
          >
            <div class="scope-key-head">
              <span class="key-name">{{ key }}</span>
              <span v-if="key === currentFrame.stepKey" class="key-pill current-pill"
                >Active Step</span
              >
              <span v-else-if="key === '$last'" class="key-pill last-pill">$last</span>
              <button
                type="button"
                class="copy-mini-btn"
                :title="copySuccessKey === `scope_${key}` ? 'Copied!' : 'Copy'"
                @click="copyText(formatJson(currentFrame.afterState.scope[key]), `scope_${key}`)"
              >
                <v-icon
                  :name="copySuccessKey === `scope_${key}` ? 'check' : 'content_copy'"
                  x-small
                />
              </button>
            </div>
            <pre
              class="scope-code"
            ><code>{{ formatJson(currentFrame.afterState.scope[key]) }}</code></pre>
          </div>
        </div>
      </div>

      <!-- Tab Content 4: Operation Configuration -->
      <div v-if="activeTab === 'options'" class="tab-pane options-pane">
        <div class="options-head">
          <span class="options-title">Configured Options & Payload Parameters</span>
          <button
            type="button"
            class="copy-btn"
            :title="copySuccessKey === 'op_options' ? 'Copied!' : 'Copy JSON'"
            @click="copyText(formatJson(currentFrame.options), 'op_options')"
          >
            <v-icon :name="copySuccessKey === 'op_options' ? 'check' : 'content_copy'" small />
            <span>Copy Options</span>
          </button>
        </div>
        <pre class="code-box"><code>{{ formatJson(currentFrame.options) }}</code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.time-travel-player {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background-color: var(--theme--background, #ffffff);
  color: var(--theme--foreground, #1e293b);
  border-radius: 8px;
}

/* 1. Deck Container */
.deck-container {
  background: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.deck-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.deck-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.pulse-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--theme--foreground-subdued, #94a3b8);
  transition: all 0.2s ease;

  &.is-playing {
    background-color: var(--theme--primary, #6366f1);
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
    animation: pulse 1.2s infinite;
  }
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5);
  }
  70% {
    transform: scale(1.1);
    box-shadow: 0 0 0 6px rgba(99, 102, 241, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
}

.status-label {
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--theme--foreground-subdued, #64748b);
}

.frame-counter {
  font-weight: 600;
  font-size: 12px;
  padding: 2px 8px;
  background: var(--theme--background-normal, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 12px;
}

.frame-duration {
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
  background: var(--theme--background-normal, #ffffff);
  padding: 2px 6px;
  border-radius: 4px;
}

.deck-quick-actions {
  display: flex;
  gap: 8px;
}

.jump-crash-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(225, 29, 72, 0.08);
  color: var(--theme--danger, #e11d48);
  border: 1px solid rgba(225, 29, 72, 0.25);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(225, 29, 72, 0.15);
  }

  &.active {
    background: var(--theme--danger, #e11d48);
    color: #ffffff;
  }
}

/* 2. Interactive Scrubber */
.scrubber-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scrubber-track {
  position: relative;
  height: 12px;
  background: var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
}

.scrubber-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, var(--theme--primary, #6366f1), #818cf8);
  border-radius: 6px;
  transition: width 0.1s linear;
}

.milestone-pin {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--theme--background-normal, #ffffff);
  border: 2px solid var(--theme--border-color-subdued, #cbd5e1);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  .pin-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--theme--foreground-subdued, #94a3b8);
  }

  &.past {
    border-color: var(--theme--primary, #6366f1);
    .pin-dot {
      background: var(--theme--primary, #6366f1);
    }
  }

  &.trigger {
    border-color: #6366f1;
    .pin-dot {
      background: #6366f1;
    }
  }

  &.resolve {
    &.past,
    &.active {
      border-color: var(--theme--success, #10b981);
      .pin-dot {
        background: var(--theme--success, #10b981);
      }
    }
  }

  &.reject {
    border-color: var(--theme--danger, #e11d48) !important;
    .pin-dot {
      background: var(--theme--danger, #e11d48) !important;
    }
  }

  &.active {
    transform: translate(-50%, -50%) scale(1.35);
    border-color: var(--theme--primary, #6366f1);
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.3);
    z-index: 4;

    &.reject {
      box-shadow: 0 0 0 4px rgba(225, 29, 72, 0.35);
    }
  }

  &:hover {
    transform: translate(-50%, -50%) scale(1.4);
  }
}

.scrubber-legend {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--theme--foreground-subdued, #64748b);
  font-weight: 500;
  padding: 0 4px;

  .legend-start,
  .legend-end {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;

    &:hover {
      color: var(--theme--primary, #6366f1);
    }
  }

  .legend-current {
    font-weight: 700;
    color: var(--theme--foreground, #1e293b);
  }
}

/* 3. Controls Bar */
.controls-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  padding-top: 12px;
}

.main-transport {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ctrl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
  background: var(--theme--background-normal, #ffffff);
  color: var(--theme--foreground, #1e293b);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--theme--background-subdued, #f1f5f9);
    border-color: var(--theme--border-color, #94a3b8);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.play-pause-btn {
    width: 42px;
    height: 42px;
    background: var(--theme--primary, #6366f1);
    color: #ffffff;
    border-color: var(--theme--primary, #6366f1);

    &:hover {
      background: #4f46e5;
    }

    &.playing {
      background: #e11d48;
      border-color: #e11d48;
    }
  }
}

.speed-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
}

.speed-chips {
  display: flex;
  background: var(--theme--background-normal, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
  border-radius: 6px;
  overflow: hidden;
}

.speed-chip {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--theme--foreground-subdued, #64748b);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--theme--background-subdued, #f1f5f9);
  }

  &.active {
    background: var(--theme--primary, #6366f1);
    color: #ffffff;
  }
}

/* 4. Active Frame Spotlight Banner */
.frame-banner {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  transition: all 0.2s ease;

  &.trigger {
    border-left: 4px solid var(--theme--primary, #6366f1);
  }

  &.resolve {
    border-left: 4px solid var(--theme--success, #10b981);
  }

  &.reject {
    border-left: 4px solid var(--theme--danger, #e11d48);
    background: rgba(225, 29, 72, 0.04);
  }
}

.frame-icon-badge {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--theme--background-normal, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  color: var(--theme--primary, #6366f1);

  &.mutation {
    color: #f59e0b;
  }
  &.network {
    color: #3b82f6;
  }
  &.logic {
    color: #8b5cf6;
  }
  &.transform {
    color: #06b6d4;
  }
}

.frame-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.frame-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.frame-step-index {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--theme--foreground-subdued, #64748b);
  background: var(--theme--background-normal, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  padding: 2px 6px;
  border-radius: 4px;
}

.frame-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--theme--foreground, #0f172a);
}

.frame-key {
  font-family: var(--theme--fonts--monospace, monospace);
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
  background: var(--theme--background-normal, #ffffff);
  padding: 2px 6px;
  border-radius: 4px;
}

.frame-category-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 12px;
  background: #e2e8f0;
  color: #334155;
  text-transform: uppercase;

  &.read {
    background: #dcfce7;
    color: #166534;
  }
  &.mutation {
    background: #fef3c7;
    color: #92400e;
  }
  &.network {
    background: #dbeafe;
    color: #1e40af;
  }
  &.logic {
    background: #f3e8ff;
    color: #6b21a8;
  }
  &.transform {
    background: #cffafe;
    color: #155e75;
  }
}

.frame-error-box {
  margin-top: 4px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 6px;
  color: #9f1239;
  font-size: 13px;

  .error-icon {
    color: #e11d48;
    margin-top: 1px;
  }
}

.frame-status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 12px;
  letter-spacing: 0.5px;

  &.trigger {
    background: #e0e7ff;
    color: #3730a3;
  }

  &.resolve {
    background: #dcfce7;
    color: #15803d;
  }

  &.reject {
    background: #ffe4e6;
    color: #be123c;
  }
}

/* 5. Tabbed Inspector */
.inspector-container {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--theme--background-normal, #ffffff);
}

.inspector-tabs {
  display: flex;
  background: var(--theme--background-subdued, #f8fafc);
  border-bottom: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  padding: 0 8px;
  gap: 4px;
  overflow-x: auto;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: none;
  background: transparent;
  color: var(--theme--foreground-subdued, #64748b);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;

  &:hover {
    color: var(--theme--foreground, #0f172a);
  }

  &.active {
    color: var(--theme--primary, #6366f1);
    border-bottom-color: var(--theme--primary, #6366f1);
    background: var(--theme--background-normal, #ffffff);
  }
}

.tab-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  background: #e2e8f0;
  color: #475569;

  &.highlight {
    background: var(--theme--primary, #6366f1);
    color: #ffffff;
  }
}

.tab-pane {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Delta Diff Styles */
.delta-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.delta-summary {
  display: flex;
  gap: 8px;
}

.diff-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;

  &.added {
    background: #dcfce7;
    color: #166534;
  }
  &.modified {
    background: #fef3c7;
    color: #92400e;
  }
  &.removed {
    background: #fee2e2;
    color: #991b1b;
  }
}

.delta-hint {
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
}

.delta-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.delta-item {
  border-radius: 6px;
  padding: 10px 12px;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);

  &.added {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }
  &.modified {
    background: #fffbeb;
    border-color: #fde68a;
  }
  &.removed {
    background: #fef2f2;
    border-color: #fecaca;
  }
}

.delta-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.action-badge {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;

  &.add {
    background: #16a34a;
    color: #ffffff;
  }
  &.mod {
    background: #d97706;
    color: #ffffff;
  }
  &.rem {
    background: #dc2626;
    color: #ffffff;
  }
}

.delta-key {
  font-family: var(--theme--fonts--monospace, monospace);
  font-size: 13px;
  color: #0f172a;
}

.diff-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.diff-col-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--theme--foreground-subdued, #64748b);
  margin-bottom: 4px;
}

.delta-code,
.code-box {
  background: #0f172a;
  color: #f8fafc;
  padding: 12px;
  border-radius: 6px;
  font-family: var(--theme--fonts--monospace, monospace);
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  max-height: 320px;
}

/* $last Pane */
.sub-tab-bar {
  display: flex;
  justify-content: flex-end;
}

.sub-tab-group {
  display: flex;
  background: var(--theme--background-subdued, #f1f5f9);
  border-radius: 6px;
  padding: 2px;
}

.sub-tab {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--theme--foreground-subdued, #64748b);
  cursor: pointer;
  border-radius: 4px;

  &.active {
    background: var(--theme--background-normal, #ffffff);
    color: var(--theme--foreground, #0f172a);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }
}

.last-body {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &.split {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}

.last-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  overflow: hidden;
}

.last-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--theme--background-subdued, #f8fafc);
  border-bottom: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  font-size: 12px;
  font-weight: 600;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Full Scope Pane */
.scope-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.search-input-box {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--theme--foreground-subdued, #94a3b8);
}

.scope-input {
  width: 100%;
  padding: 8px 30px 8px 32px;
  border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
  border-radius: 6px;
  font-size: 13px;
  background: var(--theme--background-normal, #ffffff);
  color: var(--theme--foreground, #1e293b);

  &:focus {
    outline: none;
    border-color: var(--theme--primary, #6366f1);
  }
}

.clear-search-btn {
  position: absolute;
  right: 8px;
  background: transparent;
  border: none;
  color: var(--theme--foreground-subdued, #94a3b8);
  cursor: pointer;
}

.copy-full-scope-btn,
.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--theme--border-color-subdued, #cbd5e1);
  background: var(--theme--background-normal, #ffffff);
  color: var(--theme--foreground, #1e293b);
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: var(--theme--background-subdued, #f1f5f9);
  }
}

.copy-mini-btn {
  background: transparent;
  border: none;
  color: var(--theme--foreground-subdued, #94a3b8);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;

  &:hover {
    color: var(--theme--foreground, #0f172a);
    background: rgba(0, 0, 0, 0.05);
  }
}

.scope-keys-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 450px;
  overflow-y: auto;
}

.scope-key-block {
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  overflow: hidden;

  &.highlight {
    border-color: var(--theme--primary, #6366f1);
  }
}

.scope-key-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--theme--background-subdued, #f8fafc);
  border-bottom: 1px solid var(--theme--border-color-subdued, #e2e8f0);
}

.key-name {
  font-family: var(--theme--fonts--monospace, monospace);
  font-weight: 700;
  font-size: 13px;
  color: var(--theme--primary, #4338ca);
}

.key-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;

  &.current-pill {
    background: #dbeafe;
    color: #1e40af;
  }

  &.last-pill {
    background: #fef3c7;
    color: #92400e;
  }
}

.scope-code {
  background: #0f172a;
  color: #f8fafc;
  padding: 10px 12px;
  font-family: var(--theme--fonts--monospace, monospace);
  font-size: 12px;
  line-height: 1.4;
  overflow-x: auto;
  max-height: 220px;
}

/* Empty States */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}

.empty-icon {
  font-size: 36px;
  color: var(--theme--foreground-subdued, #94a3b8);
  margin-bottom: 8px;
}

.empty-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--theme--foreground, #0f172a);
}

.empty-sub {
  font-size: 12px;
  color: var(--theme--foreground-subdued, #64748b);
  margin-top: 4px;
}

.options-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.options-title {
  font-weight: 600;
  font-size: 13px;
}
</style>

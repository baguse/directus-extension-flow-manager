<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import type { IFlow, IFolder, ICredential } from '../../../types';
import { ENDPOINT_EXTENSION_NAME } from '../../../constants';
import {
  parseScheduledFlows,
  generateConcurrencyHeatmap,
  getTimelinePercent,
  suggestStaggeredCron,
  type ScheduledFlowItem,
  type TimelineBucket,
} from '../../../utils/cron-schedule.util';

interface ServerTimeInfo {
  serverTime: string;
  serverTimestamp: number;
  timezone: string;
  offsetMinutes: number;
  offsetString: string;
  envTz?: string | null;
  isRemote?: boolean;
  hasExtension?: boolean;
  source?: 'local' | 'extension' | 'http-date';
}

const props = withDefaults(
  defineProps<{
    flows: IFlow[];
    flowCategories?: IFolder[];
    flowChildMap?: Record<string, (IFlow | IFolder)[]>;
    parentId?: string | null;
    selectedFlowId?: string | null;
    selectedCredential?: string;
    credentials?: ICredential[];
  }>(),
  {
    flowCategories: () => [],
    flowChildMap: () => ({}),
    parentId: null,
    selectedFlowId: null,
    selectedCredential: 'local',
    credentials: () => [],
  },
);

const emit = defineEmits<{
  (e: 'selectFlow', flow: IFlow): void;
  (e: 'goToFlow', payload: { item: IFlow }): void;
  (e: 'runFlow', flow: IFlow): void;
  (e: 'editFlow', flow: IFlow): void;
  (e: 'simulateFlow', flow: IFlow): void;
}>();

const api = useApi();
const serverTimeInfo = ref<ServerTimeInfo | null>(null);
const isFetchingServerTime = ref(false);
const clockDriftMs = ref<number>(0);

const activeCredential = computed<ICredential | null>(() => {
  if (!props.selectedCredential || props.selectedCredential === 'local') return null;
  return props.credentials?.find((c) => c.id === props.selectedCredential) || null;
});

// Filter & Horizon State
const windowHours = ref<number>(24);
const timezoneMode = ref<'server' | 'local' | 'UTC'>('server');
const filterStatus = ref<'all' | 'active' | 'inactive'>('all');
const filterCategory = ref<string>('all');
const searchQuery = ref<string>('');
const onlyCollisions = ref<boolean>(false);
const activeSelectedFlowId = ref<string | null>(props.selectedFlowId || null);

// Modal state
const showCollisionModal = ref(false);
const hoveredBucket = ref<TimelineBucket | null>(null);

// Clock ticker for live "NOW" line
const currentTime = ref(new Date());
let timerId: ReturnType<typeof setInterval> | null = null;

async function fetchServerTime() {
  isFetchingServerTime.value = true;
  try {
    let res;
    if (activeCredential.value) {
      res = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/server-time`, {
        url: activeCredential.value.url,
        staticToken: activeCredential.value.staticToken,
        timezone: activeCredential.value.timezone,
      });
    } else {
      res = await api.get(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/server-time`);
    }
    if (res?.data) {
      serverTimeInfo.value = res.data;
      if (typeof res.data.serverTimestamp === 'number') {
        clockDriftMs.value = res.data.serverTimestamp - Date.now();
      }
    }
  } catch (err) {
    console.warn('[FLOW MANAGER] Could not fetch server time from endpoint:', err);
  } finally {
    isFetchingServerTime.value = false;
  }
}

watch(
  () => props.selectedCredential,
  () => {
    fetchServerTime();
  },
);

onMounted(() => {
  fetchServerTime();
  timerId = setInterval(() => {
    currentTime.value = new Date();
  }, 1000);
});

onUnmounted(() => {
  if (timerId) clearInterval(timerId);
});

const activeTimezone = computed<string>(() => {
  if (timezoneMode.value === 'UTC') return 'UTC';
  if (timezoneMode.value === 'server') {
    return serverTimeInfo.value?.timezone || 'UTC';
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
});

const activeTimezoneLabel = computed<string>(() => {
  if (timezoneMode.value === 'UTC') return 'UTC';
  if (timezoneMode.value === 'server') {
    if (serverTimeInfo.value) {
      const prefix = activeCredential.value ? `Remote [${activeCredential.value.name}]` : 'Server';
      return `${prefix}: ${serverTimeInfo.value.timezone} (${serverTimeInfo.value.offsetString})`;
    }
    return activeCredential.value
      ? `Remote [${activeCredential.value.name}] (Syncing...)`
      : 'Server (Syncing...)';
  }
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Local (${localTz})`;
});

const currentSynchronizedTime = computed<Date>(() => {
  if (timezoneMode.value === 'server' && clockDriftMs.value) {
    return new Date(currentTime.value.getTime() + clockDriftMs.value);
  }
  return currentTime.value;
});

const serverLiveClock = computed<string>(() => {
  const syncDate = currentSynchronizedTime.value;
  try {
    const tz = activeTimezone.value === 'local' ? undefined : activeTimezone.value;
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return formatter.format(syncDate);
  } catch {
    return syncDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
});

const copiedCron = ref<string | null>(null);

async function copyCron(cronText: string) {
  try {
    await navigator.clipboard.writeText(cronText);
    copiedCron.value = cronText;
    setTimeout(() => {
      if (copiedCron.value === cronText) {
        copiedCron.value = null;
      }
    }, 2000);
  } catch (err) {
    console.error('Failed to copy to clipboard', err);
  }
}

// Compute flows that have children (act as parent folders)
const flowsWithChildren = computed<IFlow[]>(() => {
  const parentIdSet = new Set<string>();

  if (props.flowChildMap && Object.keys(props.flowChildMap).length > 0) {
    for (const [parentId, children] of Object.entries(props.flowChildMap)) {
      if (children && children.length > 0) {
        parentIdSet.add(parentId);
      }
    }
  }

  for (const flow of props.flows) {
    const parentId = flow.flow_manager_metadata_id?.flow_manager_category;
    if (parentId) {
      parentIdSet.add(parentId);
    }
  }
  for (const cat of props.flowCategories || []) {
    const parentId = cat.flow_manager_metadata_id?.flow_manager_category;
    if (parentId) {
      parentIdSet.add(parentId);
    }
  }

  return props.flows
    .filter((flow) => parentIdSet.has(flow.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
});

function getChildrenCount(flowId: string): number {
  if (props.flowChildMap && props.flowChildMap[flowId]) {
    return props.flowChildMap[flowId]!.length;
  }
  let count = 0;
  for (const f of props.flows) {
    if (f.flow_manager_metadata_id?.flow_manager_category === flowId) {
      count++;
    }
  }
  for (const c of props.flowCategories || []) {
    if (c.flow_manager_metadata_id?.flow_manager_category === flowId) {
      count++;
    }
  }
  return count;
}

// Scheduled flows without children
const individualScheduledFlows = computed<IFlow[]>(() => {
  const parentIdSet = new Set(flowsWithChildren.value.map((f) => f.id));
  return props.flows
    .filter((flow) => flow.trigger === 'schedule' && !parentIdSet.has(flow.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
});

let isInternalSelection = false;

watch(
  () => props.parentId,
  (newParentId) => {
    if (newParentId && newParentId !== '__archive__') {
      filterCategory.value = newParentId;
    } else if (!newParentId) {
      filterCategory.value = 'all';
    }
  },
  { immediate: true },
);

watch(
  () => props.selectedFlowId,
  (newId) => {
    if (newId) {
      activeSelectedFlowId.value = newId;
      if (!isInternalSelection && !props.parentId) {
        filterCategory.value = newId;
      }
    }
  },
  { immediate: true },
);

// Parse scheduled flows and calculate occurrences
const scheduleData = computed(() => {
  return parseScheduledFlows(props.flows, {
    windowHours: windowHours.value,
    startDate: currentSynchronizedTime.value,
    timezone: activeTimezone.value,
    flowCategories: props.flowCategories,
    filterStatus: filterStatus.value,
    filterCategory: filterCategory.value,
    searchQuery: searchQuery.value,
  });
});

// Filtered scheduled flows (with onlyCollisions filter applied)
const displayFlows = computed<ScheduledFlowItem[]>(() => {
  let list = scheduleData.value.scheduledFlows;
  if (onlyCollisions.value) {
    list = list.filter((f) => f.collisionCount > 0);
  }
  return list;
});

// Concurrency heatmap buckets
const heatmapBuckets = computed<TimelineBucket[]>(() => {
  return generateConcurrencyHeatmap(
    scheduleData.value.scheduledFlows,
    scheduleData.value.windowStart,
    scheduleData.value.windowEnd,
    30, // 30-minute buckets
    activeTimezone.value,
  );
});

// Max concurrency count across buckets for heatmap scale
const maxBucketCount = computed(() => {
  return Math.max(1, ...heatmapBuckets.value.map((b) => b.count));
});

// Percentage position of current time along timeline
const nowMarkerPercent = computed(() => {
  return getTimelinePercent(
    currentSynchronizedTime.value,
    scheduleData.value.windowStart,
    scheduleData.value.windowEnd,
  );
});

// Overall stats
const totalScheduledCount = computed(() => {
  return props.flows.filter((f) => f.trigger === 'schedule').length;
});

const activeScheduledCount = computed(() => {
  return props.flows.filter((f) => f.trigger === 'schedule' && f.status === 'active').length;
});

const collisionCount = computed(() => {
  return scheduleData.value.collisionIncidents.length;
});

// Time axis markers (every 2, 3, or 4 hours depending on window size)
const timeAxisMarkers = computed(() => {
  const stepHours = windowHours.value <= 12 ? 1 : windowHours.value <= 24 ? 2 : 4;
  const markers: { label: string; percent: number }[] = [];
  const startMs = scheduleData.value.windowStart.getTime();
  const endMs = scheduleData.value.windowEnd.getTime();
  const totalMs = endMs - startMs;

  let current = new Date(scheduleData.value.windowStart);
  // Round up to next step hour
  current.setMinutes(0, 0, 0);

  const tz = activeTimezone.value === 'local' ? undefined : activeTimezone.value;
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  while (current.getTime() <= endMs) {
    if (current.getTime() >= startMs) {
      const pct = ((current.getTime() - startMs) / totalMs) * 100;
      let label = '';
      try {
        label = timeFormatter.format(current);
      } catch {
        if (timezoneMode.value === 'UTC') {
          label = `${String(current.getUTCHours()).padStart(2, '0')}:00`;
        } else {
          label = `${String(current.getHours()).padStart(2, '0')}:00`;
        }
      }
      markers.push({ label, percent: pct });
    }
    current = new Date(current.getTime() + stepHours * 3600 * 1000);
  }

  return markers;
});

function formatCountdown(targetDate: Date | null): string {
  if (!targetDate) return 'Inactive';
  const diffMs = targetDate.getTime() - currentSynchronizedTime.value.getTime();
  if (diffMs <= 0) return 'Executing now';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `In ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  const remMins = diffMins % 60;
  return `In ${diffHours}h ${remMins}m`;
}

function formatExactTime(date: Date): string {
  const tz = activeTimezone.value === 'local' ? undefined : activeTimezone.value;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const tzSuffix =
      timezoneMode.value === 'server' && serverTimeInfo.value
        ? ` (${serverTimeInfo.value.offsetString})`
        : timezoneMode.value === 'UTC'
          ? ' UTC'
          : '';
    return `${formatter.format(date)}${tzSuffix}`;
  } catch {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

function selectFlowRow(flowItem: ScheduledFlowItem) {
  isInternalSelection = true;
  activeSelectedFlowId.value = flowItem.id;
  emit('selectFlow', flowItem.flow);
  setTimeout(() => {
    isInternalSelection = false;
  }, 100);
}

function handleGoToFlow(flowItem: ScheduledFlowItem) {
  emit('goToFlow', { item: flowItem.flow });
}

function handleRunFlow(flowItem: ScheduledFlowItem) {
  emit('runFlow', flowItem.flow);
}

function handleSimulateFlow(flowItem: ScheduledFlowItem) {
  emit('simulateFlow', flowItem.flow);
}
</script>

<template>
  <div class="flow-cron-timeline-container">
    <!-- Top Summary Banner -->
    <div class="cron-summary-banner">
      <div class="banner-stat-card">
        <div class="stat-icon-wrapper">
          <v-icon name="schedule" class="stat-icon" />
        </div>
        <div class="stat-info">
          <div class="stat-val">{{ totalScheduledCount }}</div>
          <div class="stat-lbl">Scheduled Flows ({{ activeScheduledCount }} Active)</div>
        </div>
      </div>

      <div class="banner-stat-card">
        <div class="stat-icon-wrapper blue">
          <v-icon name="timelapse" class="stat-icon" />
        </div>
        <div class="stat-info">
          <div class="stat-val">{{ scheduleData.totalExecutions }}</div>
          <div class="stat-lbl">Planned Runs in Next {{ windowHours }}h</div>
        </div>
      </div>

      <div
        class="banner-stat-card"
        :class="{ danger: collisionCount > 0 }"
        @click="collisionCount > 0 ? (showCollisionModal = true) : undefined"
      >
        <div
          class="stat-icon-wrapper"
          :class="{ red: collisionCount > 0, green: collisionCount === 0 }"
        >
          <v-icon :name="collisionCount > 0 ? 'warning' : 'check_circle'" class="stat-icon" />
        </div>
        <div class="stat-info">
          <div class="stat-val">{{ collisionCount }}</div>
          <div class="stat-lbl">
            {{ collisionCount > 0 ? 'Collision Windows (High Load)' : 'Zero Collisions' }}
          </div>
        </div>
        <v-button
          v-if="collisionCount > 0"
          x-small
          secondary
          class="inspect-collisions-btn"
          @click.stop="showCollisionModal = true"
        >
          View Stagger Plan
        </v-button>
      </div>
    </div>

    <!-- Toolbar Filters -->
    <div class="cron-toolbar">
      <div class="toolbar-left">
        <!-- Search Field -->
        <div class="toolbar-search">
          <v-icon name="search" small class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter scheduled flows..."
            class="search-input"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="clear-search-btn"
            @click="searchQuery = ''"
          >
            <v-icon name="close" x-small />
          </button>
        </div>

        <!-- Status Filter -->
        <div class="filter-pill-group">
          <button
            type="button"
            :class="['filter-pill', { active: filterStatus === 'all' }]"
            @click="filterStatus = 'all'"
          >
            All
          </button>
          <button
            type="button"
            :class="['filter-pill', { active: filterStatus === 'active' }]"
            @click="filterStatus = 'active'"
          >
            Active
          </button>
          <button
            type="button"
            :class="['filter-pill', { active: filterStatus === 'inactive' }]"
            @click="filterStatus = 'inactive'"
          >
            Inactive
          </button>
        </div>

        <!-- Category Dropdown -->
        <div
          v-if="flowCategories.length > 0 || flowsWithChildren.length > 0 || individualScheduledFlows.length > 0"
          class="category-select-wrapper"
        >
          <select v-model="filterCategory" class="native-category-select">
            <option value="all">All Categories</option>

            <optgroup v-if="flowCategories.length" label="Folders / Categories">
              <option v-for="cat in flowCategories" :key="cat.id" :value="cat.id">
                📁 {{ cat.name }}
              </option>
            </optgroup>

            <optgroup v-if="flowsWithChildren.length" label="Flows with Children">
              <option v-for="flow in flowsWithChildren" :key="flow.id" :value="flow.id">
                ⚡ {{ flow.name }} ({{ getChildrenCount(flow.id) }})
              </option>
            </optgroup>

            <optgroup v-if="individualScheduledFlows.length" label="Scheduled Flows">
              <option v-for="flow in individualScheduledFlows" :key="flow.id" :value="flow.id">
                ⏰ {{ flow.name }}
              </option>
            </optgroup>
          </select>
        </div>

        <!-- Collision Filter Toggle -->
        <button
          type="button"
          :class="['filter-pill warning-pill', { active: onlyCollisions }]"
          @click="onlyCollisions = !onlyCollisions"
        >
          <v-icon name="warning" x-small class="mr-1" />
          Collisions Only
        </button>
      </div>

      <div class="toolbar-right">
        <!-- Time Horizon Selector -->
        <div class="horizon-select-wrapper">
          <span class="toolbar-label">Horizon:</span>
          <select v-model="windowHours" class="native-horizon-select">
            <option :value="12">Next 12 Hours</option>
            <option :value="24">Next 24 Hours</option>
            <option :value="48">Next 48 Hours</option>
            <option :value="168">Next 7 Days</option>
          </select>
        </div>

        <!-- Server Live Clock / Timezone Badge -->
        <div class="server-tz-badge" :title="`Directus Server Timezone: ${activeTimezoneLabel}`">
          <span class="server-dot" :class="{ 'is-syncing': isFetchingServerTime }" />
          <span class="server-tz-name">{{ activeTimezoneLabel }}</span>
          <span class="server-live-clock">{{ serverLiveClock }}</span>
        </div>

        <!-- Timezone Toggle -->
        <div class="timezone-toggle">
          <button
            type="button"
            :class="['tz-btn', { active: timezoneMode === 'server' }]"
            :title="`Sync with ${activeCredential ? 'remote instance' : 'Directus server'} timezone (${serverTimeInfo?.timezone || 'Server'})`"
            @click="timezoneMode = 'server'"
          >
            {{ activeCredential ? 'Remote' : 'Server' }}
          </button>
          <button
            type="button"
            :class="['tz-btn', { active: timezoneMode === 'local' }]"
            title="Use browser local timezone"
            @click="timezoneMode = 'local'"
          >
            Local
          </button>
          <button
            type="button"
            :class="['tz-btn', { active: timezoneMode === 'UTC' }]"
            title="Use standard UTC time"
            @click="timezoneMode = 'UTC'"
          >
            UTC
          </button>
        </div>
      </div>
    </div>

    <!-- Concurrency Heatmap Density Bar -->
    <div class="heatmap-section">
      <div class="heatmap-header">
        <div class="heatmap-title">
          <v-icon name="equalizer" small class="mr-1" />
          <span>Concurrency Load Density (Planned executions per 30-min window)</span>
        </div>
        <div class="heatmap-legend">
          <span class="legend-item"><span class="legend-box low" /> 1-2 (Normal)</span>
          <span class="legend-item"><span class="legend-box med" /> 3-4 (Medium)</span>
          <span class="legend-item"><span class="legend-box high" /> 5+ (Peak Bottleneck)</span>
        </div>
      </div>

      <div class="heatmap-bars-container">
        <!-- Current Time Line on Heatmap -->
        <div
          v-if="nowMarkerPercent >= 0 && nowMarkerPercent <= 100"
          class="heatmap-now-line"
          :style="{ left: `${nowMarkerPercent}%` }"
          title="Current Time (Now)"
        >
          <span class="now-badge">NOW</span>
        </div>

        <!-- Bars -->
        <div class="bars-track">
          <div
            v-for="bucket in heatmapBuckets"
            :key="bucket.index"
            class="heatmap-bar-col"
            @mouseenter="hoveredBucket = bucket"
            @mouseleave="hoveredBucket = null"
          >
            <div
              class="heatmap-bar-fill"
              :class="bucket.level"
              :style="{
                height: `${Math.max(12, (bucket.count / maxBucketCount) * 100)}%`,
                opacity: bucket.count > 0 ? 1 : 0.15,
              }"
            >
              <span v-if="bucket.count > 0" class="bar-count-label">{{ bucket.count }}</span>
            </div>
          </div>
        </div>

        <!-- Tooltip for hovered bucket -->
        <div
          v-if="hoveredBucket && hoveredBucket.count > 0"
          class="heatmap-tooltip"
          :style="{ left: `${(hoveredBucket.index / heatmapBuckets.length) * 100}%` }"
        >
          <div class="tooltip-time">{{ hoveredBucket.timeLabel }}</div>
          <div class="tooltip-count">
            <strong>{{ hoveredBucket.count }}</strong> simultaneous execution{{
              hoveredBucket.count > 1 ? 's' : ''
            }}:
          </div>
          <ul class="tooltip-flow-list">
            <li v-for="f in hoveredBucket.flows" :key="f.id">
              {{ f.name }} <code class="mini-cron">{{ f.cron }}</code>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Timeline Swimlanes Container -->
    <div class="timeline-swimlanes-wrapper">
      <!-- Timeline Header / Time Axis -->
      <div class="timeline-header-row">
        <div class="flow-info-col-header">
          <span>Flow Details & Cron Schedule</span>
        </div>
        <div class="timeline-track-col-header">
          <div
            v-for="marker in timeAxisMarkers"
            :key="marker.label"
            class="time-tick-marker"
            :style="{ left: `${marker.percent}%` }"
          >
            <span class="tick-line" />
            <span class="tick-label">{{ marker.label }}</span>
          </div>
        </div>
        <div class="flow-actions-col-header">
          <span>Actions</span>
        </div>
      </div>

      <!-- Swimlane Rows -->
      <div v-if="displayFlows.length > 0" class="swimlane-rows">
        <div
          v-for="flowItem in displayFlows"
          :key="flowItem.id"
          class="swimlane-row"
          :class="{
            selected: activeSelectedFlowId === flowItem.id,
            inactive: flowItem.status !== 'active',
            'has-collision': flowItem.collisionCount > 0,
          }"
          @click="selectFlowRow(flowItem)"
        >
          <!-- Left: Flow Details -->
          <div class="flow-info-col">
            <div
              class="flow-icon-box"
              :style="{
                backgroundColor: flowItem.color
                  ? `${flowItem.color}18`
                  : 'rgba(99, 102, 241, 0.12)',
                color: flowItem.color || 'var(--theme--primary, #6366f1)',
              }"
            >
              <v-icon :name="flowItem.icon || 'bolt'" />
            </div>

            <div class="flow-text-group">
              <div class="flow-name-row">
                <span class="flow-name" :title="flowItem.name">{{ flowItem.name }}</span>
                <span
                  v-if="flowItem.collisionCount > 0"
                  v-tooltip.bottom="
                    `Collides with ${flowItem.collisionCount} other planned execution(s)`
                  "
                  class="collision-badge"
                >
                  <v-icon name="warning" x-small />
                  Overlap
                </span>
              </div>

              <div class="flow-meta-sub">
                <code class="cron-code" :title="flowItem.cron">{{ flowItem.cron }}</code>
                <span class="human-cron">{{ flowItem.humanCron }}</span>
              </div>

              <div class="flow-countdown-row">
                <span class="countdown-chip" :class="{ 'is-active': flowItem.status === 'active' }">
                  <v-icon name="schedule" x-small class="mr-1" />
                  {{ formatCountdown(flowItem.nextRun) }}
                </span>
                <span v-if="flowItem.categoryName" class="cat-chip">
                  {{ flowItem.categoryName }}
                </span>
              </div>
            </div>
          </div>

          <!-- Middle: Timeline Track with Plotted Executions -->
          <div class="timeline-track-col">
            <!-- Grid lines corresponding to ticks -->
            <div
              v-for="marker in timeAxisMarkers"
              :key="`grid_${marker.label}`"
              class="track-grid-line"
              :style="{ left: `${marker.percent}%` }"
            />

            <!-- NOW line through swimlane -->
            <div
              v-if="nowMarkerPercent >= 0 && nowMarkerPercent <= 100"
              class="track-now-line"
              :style="{ left: `${nowMarkerPercent}%` }"
            />

            <!-- High-Frequency Indicator (e.g. every 5 min) -->
            <div
              v-if="flowItem.isHighFrequency"
              class="high-frequency-band"
              :title="`${flowItem.name} runs continuously at high frequency (${flowItem.occurrences.length} executions in ${windowHours}h)`"
            >
              <div class="frequency-pattern" />
              <div class="frequency-label">
                <v-icon name="bolt" x-small />
                <span
                  >High Frequency Schedule • {{ flowItem.occurrences.length }} runs planned</span
                >
              </div>
            </div>

            <!-- Discrete Execution Markers -->
            <template v-else>
              <div
                v-for="(occ, idx) in flowItem.occurrences"
                :key="idx"
                class="execution-marker"
                :class="{ 'in-collision': flowItem.collisionCount > 0 }"
                :style="{
                  left: `${getTimelinePercent(occ, scheduleData.windowStart, scheduleData.windowEnd)}%`,
                }"
              >
                <div class="marker-dot" />
                <div class="marker-tooltip">
                  <div class="marker-time">{{ formatExactTime(occ) }}</div>
                  <div class="marker-sub">{{ flowItem.name }}</div>
                  <div v-if="flowItem.collisionCount > 0" class="marker-warn">
                    ⚠️ Potential concurrent execution bottleneck
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Right: Actions -->
          <div class="flow-actions-col" @click.stop>
            <v-button
              v-tooltip.bottom="'Sandbox Simulation (Dry Run)'"
              rounded
              icon
              secondary
              x-small
              @click="handleSimulateFlow(flowItem)"
            >
              <v-icon name="science" x-small />
            </v-button>

            <v-button
              v-tooltip.bottom="'Run Flow Now'"
              rounded
              icon
              secondary
              x-small
              @click="handleRunFlow(flowItem)"
            >
              <v-icon name="play_arrow" x-small />
            </v-button>

            <v-button
              v-tooltip.bottom="'Open in Directus Flow Editor'"
              rounded
              icon
              secondary
              x-small
              @click="handleGoToFlow(flowItem)"
            >
              <v-icon name="open_in_new" x-small />
            </v-button>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-timeline-state">
        <v-icon name="event_busy" class="empty-icon" />
        <div class="empty-title">No Scheduled Flows Found</div>
        <div class="empty-sub">
          {{
            onlyCollisions
              ? 'No scheduled flows currently have overlapping execution collisions.'
              : 'No flows with trigger type "Schedule" matched your filters.'
          }}
        </div>
        <v-button
          v-if="onlyCollisions || searchQuery || filterStatus !== 'all' || filterCategory !== 'all'"
          small
          secondary
          class="mt-2"
          @click="
            onlyCollisions = false;
            searchQuery = '';
            filterStatus = 'all';
            filterCategory = 'all';
          "
        >
          Reset Filters
        </v-button>
      </div>
    </div>

    <!-- Stagger Suggestions & Collision Resolution Modal -->
    <v-dialog :model-value="showCollisionModal" @update:model-value="showCollisionModal = $event">
      <v-card class="collision-dialog-card">
        <v-card-title class="dialog-title">
          <v-icon name="traffic" class="dialog-title-icon" />
          <span>Peak Concurrency & Stagger Recommendations</span>
        </v-card-title>

        <v-card-text class="dialog-content">
          <p class="dialog-intro">
            Simultaneous cron executions can cause database connection exhaustion and API slowdowns.
            Staggering overlapping flows by 5–15 minutes balances worker load and prevents
            bottlenecks.
          </p>

          <div class="collision-incidents-list">
            <div
              v-for="incident in scheduleData.collisionIncidents"
              :key="incident.timeKey"
              class="incident-card"
            >
              <div class="incident-header">
                <div class="incident-time-badge">
                  <v-icon name="schedule" x-small />
                  <span>{{ incident.timeLabel }}</span>
                </div>
                <div class="incident-severity-badge">{{ incident.count }} Flows Colliding</div>
              </div>

              <!-- Colliding flows list -->
              <div class="colliding-flows">
                <div v-for="(f, i) in incident.flows" :key="f.id" class="colliding-flow-item">
                  <div class="c-flow-left">
                    <v-icon :name="f.icon || 'bolt'" small class="mr-1" />
                    <span class="c-flow-name">{{ f.name }}</span>
                    <code class="c-flow-cron">{{ f.cron }}</code>
                  </div>
                  <div class="c-flow-right">
                    <span v-if="i === 0" class="stagger-status keep"
                      >Keep Primary (:{{ incident.timeLabel.split(':')[1] }})</span
                    >
                    <span
                      v-else-if="suggestStaggeredCron(f.cron, i * 5) !== f.cron"
                      class="stagger-status recommend"
                    >
                      Suggest: <code>{{ suggestStaggeredCron(f.cron, i * 5) }}</code>
                      <button
                        type="button"
                        class="copy-cron-btn"
                        :title="
                          copiedCron === suggestStaggeredCron(f.cron, i * 5)
                            ? 'Copied!'
                            : 'Copy suggested cron'
                        "
                        @click.stop="copyCron(suggestStaggeredCron(f.cron, i * 5))"
                      >
                        <v-icon
                          :name="
                            copiedCron === suggestStaggeredCron(f.cron, i * 5)
                              ? 'check'
                              : 'content_copy'
                          "
                          x-small
                        />
                      </button>
                    </span>
                    <span v-else class="stagger-status warning">
                      Overlapping (:{{ incident.timeLabel.split(':')[1] }}) • manual offset advised
                    </span>
                  </div>
                </div>
              </div>

              <div class="incident-footer">
                <v-icon name="lightbulb" small class="bulb-icon" />
                <span>{{ incident.staggerSuggestion }}</span>
              </div>
            </div>
          </div>
        </v-card-text>

        <v-card-actions class="dialog-actions">
          <v-button secondary @click="showCollisionModal = false">Close</v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped lang="scss">
.flow-cron-timeline-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow-y: auto;
  background: var(--theme--background, #ffffff);
  padding: 16px 20px;
  gap: 16px;
}

/* ==========================================================================
   Summary Banner
   ========================================================================== */

.cron-summary-banner {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.banner-stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  transition: all 0.15s ease;

  &.danger {
    border-color: #fca5a5;
    background: #fef2f2;
    cursor: pointer;

    &:hover {
      background: #fee2e2;
    }
  }

  .stat-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background: rgba(99, 102, 241, 0.12);
    color: var(--theme--primary, #6366f1);
    flex-shrink: 0;

    &.blue {
      background: rgba(59, 130, 246, 0.12);
      color: #3b82f6;
    }

    &.green {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }

    &.red {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
    }
  }

  .stat-info {
    flex: 1;

    .stat-val {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.2;
      color: var(--theme--foreground, #0f172a);
    }

    .stat-lbl {
      font-size: 11px;
      font-weight: 500;
      color: var(--theme--foreground-subdued, #64748b);
      margin-top: 2px;
    }
  }

  .inspect-collisions-btn {
    flex-shrink: 0;
  }
}

/* ==========================================================================
   Toolbar
   ========================================================================== */

.cron-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
}

.toolbar-search {
  display: flex;
  align-items: center;
  background: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  padding: 0 8px;
  height: 32px;
  min-width: 200px;

  .search-icon {
    color: var(--theme--foreground-subdued, #94a3b8);
    margin-right: 6px;
  }

  .search-input {
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    width: 100%;
    color: var(--theme--foreground, #1e293b);

    &::placeholder {
      color: var(--theme--foreground-subdued, #94a3b8);
    }
  }

  .clear-search-btn {
    background: none;
    border: none;
    color: var(--theme--foreground-subdued, #94a3b8);
    cursor: pointer;
    padding: 2px;
  }
}

.filter-pill-group {
  display: inline-flex;
  border-radius: 6px;
  background: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  padding: 2px;
}

.filter-pill {
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--theme--foreground-subdued, #64748b);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: var(--theme--foreground, #0f172a);
  }

  &.active {
    background: var(--theme--primary, #6366f1);
    color: #ffffff;
  }

  &.warning-pill {
    background: var(--theme--background, #ffffff);
    border: 1px solid var(--theme--border-color-subdued, #e2e8f0);

    &.active {
      background: #fee2e2;
      border-color: #ef4444;
      color: #b91c1c;
    }
  }
}

.native-category-select,
.native-horizon-select {
  height: 32px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  padding: 0 10px;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  background: var(--theme--background, #ffffff);
  color: var(--theme--foreground, #1e293b);
  outline: none;
  cursor: pointer;
}

.server-tz-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  border-radius: 6px;
  padding: 0 10px;
  height: 32px;
  font-size: 11px;
  color: var(--theme--foreground, #1e293b);

  .server-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #10b981;
    display: inline-block;

    &.is-syncing {
      background: #f59e0b;
      opacity: 0.6;
    }
  }

  .server-tz-name {
    font-weight: 500;
    color: var(--theme--foreground-subdued, #64748b);
  }

  .server-live-clock {
    font-family: monospace;
    font-weight: 700;
    color: var(--theme--primary, #6366f1);
  }
}

.timezone-toggle {
  display: inline-flex;
  border-radius: 6px;
  background: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  padding: 2px;

  .tz-btn {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    border: none;
    background: transparent;
    color: var(--theme--foreground-subdued, #64748b);
    cursor: pointer;

    &.active {
      background: var(--theme--foreground, #0f172a);
      color: #ffffff;
    }
  }
}

.toolbar-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--theme--foreground-subdued, #64748b);
}

/* ==========================================================================
   Concurrency Heatmap Section
   ========================================================================== */

.heatmap-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--theme--background-subdued, #f8fafc);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
}

.heatmap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;

  .heatmap-title {
    display: flex;
    align-items: center;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--theme--foreground, #334155);
  }

  .heatmap-legend {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 10px;
    font-weight: 500;
    color: var(--theme--foreground-subdued, #64748b);

    .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .legend-box {
      width: 10px;
      height: 10px;
      border-radius: 2px;

      &.low {
        background: #10b981;
      }
      &.med {
        background: #f59e0b;
      }
      &.high {
        background: #ef4444;
      }
    }
  }
}

.heatmap-bars-container {
  position: relative;
  height: 52px;
  background: var(--theme--background, #ffffff);
  border-radius: 6px;
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  overflow: visible;

  .bars-track {
    display: flex;
    align-items: flex-end;
    height: 100%;
    width: 100%;
    padding: 4px 6px;
    gap: 2px;
  }

  .heatmap-bar-col {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: flex-end;
    cursor: pointer;
    position: relative;

    &:hover .heatmap-bar-fill {
      filter: brightness(0.9);
    }
  }

  .heatmap-bar-fill {
    width: 100%;
    border-radius: 2px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    transition: height 0.2s ease;

    &.normal {
      background: #10b981;
    }
    &.medium {
      background: #f59e0b;
    }
    &.danger {
      background: #ef4444;
    }

    .bar-count-label {
      font-size: 8px;
      font-weight: 700;
      color: #ffffff;
      line-height: 1;
      margin-top: 2px;
    }
  }

  .heatmap-now-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #ef4444;
    z-index: 10;
    pointer-events: none;

    .now-badge {
      position: absolute;
      top: -14px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 8px;
      font-weight: 800;
      background: #ef4444;
      color: #ffffff;
      padding: 1px 4px;
      border-radius: 3px;
    }
  }

  .heatmap-tooltip {
    position: absolute;
    bottom: 60px;
    transform: translateX(-50%);
    background: #0f172a;
    color: #ffffff;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    z-index: 20;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    min-width: 180px;
    pointer-events: none;

    .tooltip-time {
      font-weight: 700;
      color: #38bdf8;
      margin-bottom: 2px;
    }

    .tooltip-flow-list {
      margin: 4px 0 0;
      padding-left: 14px;
      font-size: 10px;

      li {
        margin-bottom: 2px;
      }
    }

    .mini-cron {
      color: #fde047;
      background: rgba(255, 255, 255, 0.1);
      padding: 0 2px;
      border-radius: 2px;
    }
  }
}

/* ==========================================================================
   Timeline Swimlanes & Time Axis
   ========================================================================== */

.timeline-swimlanes-wrapper {
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  background: var(--theme--background, #ffffff);
  border: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  overflow-x: auto;
}

.timeline-header-row {
  display: flex;
  align-items: center;
  height: 38px;
  background: var(--theme--background-subdued, #f1f5f9);
  border-bottom: 2px solid var(--theme--border-color-subdued, #e2e8f0);
  position: sticky;
  top: 0;
  z-index: 5;

  .flow-info-col-header {
    width: 300px;
    min-width: 300px;
    padding: 0 14px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--theme--foreground-subdued, #64748b);
    border-right: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  }

  .timeline-track-col-header {
    flex: 1;
    position: relative;
    height: 100%;
    min-width: 600px;

    .time-tick-marker {
      position: absolute;
      top: 0;
      bottom: 0;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      padding-bottom: 4px;

      .tick-line {
        height: 6px;
        width: 1px;
        background: var(--theme--border-color-subdued, #cbd5e1);
        margin-bottom: 2px;
      }

      .tick-label {
        font-size: 10px;
        font-weight: 600;
        font-family: ui-monospace, monospace;
        color: var(--theme--foreground-subdued, #64748b);
      }
    }
  }

  .flow-actions-col-header {
    width: 90px;
    min-width: 90px;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--theme--foreground-subdued, #64748b);
    border-left: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  }
}

.swimlane-rows {
  display: flex;
  flex-direction: column;
}

.swimlane-row {
  display: flex;
  align-items: stretch;
  min-height: 64px;
  border-bottom: 1px solid var(--theme--border-color-subdued, #e2e8f0);
  transition: background-color 0.12s ease;
  cursor: pointer;

  &:hover {
    background-color: var(--theme--background-subdued, #f8fafc);
  }

  &.selected {
    background-color: rgba(99, 102, 241, 0.05);
    border-left: 3px solid var(--theme--primary, #6366f1);
  }

  &.inactive {
    opacity: 0.65;
  }

  &.has-collision {
    border-left: 3px solid #ef4444;
  }
}

.flow-info-col {
  width: 300px;
  min-width: 300px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-right: 1px solid var(--theme--border-color-subdued, #e2e8f0);

  .flow-icon-box {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .flow-text-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow: hidden;
    flex: 1;

    .flow-name-row {
      display: flex;
      align-items: center;
      gap: 6px;

      .flow-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--theme--foreground, #0f172a);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .collision-badge {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: 9px;
        font-weight: 700;
        color: #b91c1c;
        background: #fee2e2;
        padding: 1px 4px;
        border-radius: 4px;
        flex-shrink: 0;
      }
    }

    .flow-meta-sub {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;

      .cron-code {
        font-size: 10px;
        font-family: ui-monospace, monospace;
        color: #4f46e5;
        background: #eef2ff;
        padding: 1px 4px;
        border-radius: 3px;
      }

      .human-cron {
        color: var(--theme--foreground-subdued, #64748b);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .flow-countdown-row {
      display: flex;
      align-items: center;
      gap: 6px;

      .countdown-chip {
        font-size: 10px;
        font-weight: 500;
        color: #64748b;

        &.is-active {
          color: #059669;
        }
      }

      .cat-chip {
        font-size: 10px;
        color: var(--theme--foreground-subdued, #94a3b8);
        background: rgba(0, 0, 0, 0.04);
        padding: 1px 4px;
        border-radius: 3px;
      }
    }
  }
}

.timeline-track-col {
  flex: 1;
  position: relative;
  min-width: 600px;
  overflow: visible;

  .track-grid-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(226, 232, 240, 0.7);
    pointer-events: none;
  }

  .track-now-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1.5px;
    background: #ef4444;
    z-index: 4;
    pointer-events: none;
  }

  .high-frequency-band {
    position: absolute;
    top: 14px;
    bottom: 14px;
    left: 0;
    right: 0;
    background: rgba(99, 102, 241, 0.08);
    border: 1px dashed rgba(99, 102, 241, 0.35);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #4f46e5;
    font-size: 11px;
    font-weight: 600;

    .frequency-pattern {
      position: absolute;
      inset: 0;
      background-image: repeating-linear-gradient(
        45deg,
        rgba(99, 102, 241, 0.06),
        rgba(99, 102, 241, 0.06) 6px,
        transparent 6px,
        transparent 12px
      );
      pointer-events: none;
    }
  }

  .execution-marker {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    cursor: pointer;
    z-index: 3;

    .marker-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--theme--primary, #6366f1);
      border: 2px solid #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
      transition: transform 0.15s ease;
    }

    &:hover {
      z-index: 10;

      .marker-dot {
        transform: scale(1.35);
        background: #4338ca;
      }

      .marker-tooltip {
        opacity: 1;
        visibility: visible;
      }
    }

    &.in-collision .marker-dot {
      background: #ef4444;
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.25);
    }

    .marker-tooltip {
      position: absolute;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      background: #0f172a;
      color: #ffffff;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 11px;
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transition: all 0.15s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      pointer-events: none;

      .marker-time {
        font-weight: 700;
        color: #38bdf8;
      }

      .marker-warn {
        color: #fca5a5;
        font-size: 10px;
        margin-top: 2px;
      }
    }
  }
}

.flow-actions-col {
  width: 90px;
  min-width: 90px;
  padding: 10px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-left: 1px solid var(--theme--border-color-subdued, #e2e8f0);
}

/* ==========================================================================
   Empty State
   ========================================================================== */

.empty-timeline-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
  color: var(--theme--foreground-subdued, #94a3b8);

  .empty-icon {
    font-size: 40px;
    margin-bottom: 10px;
    opacity: 0.6;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--theme--foreground, #334155);
  }

  .empty-sub {
    font-size: 12px;
    margin-top: 4px;
    max-width: 400px;
  }
}

/* ==========================================================================
   Stagger Suggestions Dialog
   ========================================================================== */

.collision-dialog-card {
  max-width: 650px;
  width: 100%;
}

.dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;

  .dialog-title-icon {
    color: #ef4444;
  }
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 480px;
  overflow-y: auto;

  .dialog-intro {
    font-size: 12px;
    line-height: 1.5;
    color: var(--theme--foreground-subdued, #64748b);
  }
}

.collision-incidents-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.incident-card {
  border-radius: 8px;
  border: 1px solid #fecaca;
  background: #fff5f5;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  .incident-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .incident-time-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 700;
      font-family: ui-monospace, monospace;
      color: #991b1b;
      background: #fee2e2;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .incident-severity-badge {
      font-size: 11px;
      font-weight: 700;
      color: #b91c1c;
    }
  }

  .colliding-flows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #ffffff;
    border-radius: 6px;
    padding: 8px 10px;
    border: 1px solid #fee2e2;
  }

  .colliding-flow-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;

    .c-flow-left {
      display: flex;
      align-items: center;
      gap: 6px;

      .c-flow-name {
        font-weight: 600;
        color: #1e293b;
      }

      .c-flow-cron {
        font-size: 11px;
        color: #64748b;
        background: #f1f5f9;
        padding: 1px 4px;
        border-radius: 3px;
      }
    }

    .c-flow-right {
      font-size: 11px;

      .stagger-status.keep {
        color: #059669;
        font-weight: 600;
      }

      .stagger-status.recommend {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: #d97706;
        font-weight: 600;

        code {
          background: #fef3c7;
          color: #92400e;
          padding: 1px 4px;
          border-radius: 3px;
        }

        .copy-cron-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: #fde68a;
          color: #92400e;
          cursor: pointer;
          border-radius: 3px;
          padding: 2px 4px;
          transition: all 0.15s ease;

          &:hover {
            background: #fcd34d;
          }
        }
      }

      .stagger-status.warning {
        color: #b91c1c;
        font-weight: 500;
        font-style: italic;
      }
    }
  }

  .incident-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #991b1b;
    font-style: italic;

    .bulb-icon {
      color: #f59e0b;
    }
  }
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px;
}

.mr-1 {
  margin-right: 4px;
}

.mt-2 {
  margin-top: 8px;
}
</style>

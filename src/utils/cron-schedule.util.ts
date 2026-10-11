import { Cron } from 'croner';
import type { IFlow, IFolder } from '../types';

/* ==========================================================================
   1. Domain Interfaces
   ========================================================================== */

export interface ScheduledFlowItem {
  id: string;
  name: string;
  icon: string;
  color: string | null;
  status: string;
  cron: string;
  humanCron: string;
  category: string | null;
  categoryName: string;
  categoryIcon?: string;
  categoryColor?: string | null;
  nextRun: Date | null;
  occurrences: Date[];
  isHighFrequency: boolean;
  collisionCount: number;
  flow: IFlow;
}

export interface TimelineBucket {
  index: number;
  timestamp: Date;
  timeLabel: string;
  count: number;
  flows: { id: string; name: string; cron: string }[];
  level: 'normal' | 'medium' | 'danger';
}

export interface CollisionIncident {
  timeKey: string;
  timestamp: Date;
  timeLabel: string;
  flows: {
    id: string;
    name: string;
    icon?: string;
    color?: string | null;
    cron: string;
    humanCron: string;
  }[];
  count: number;
  staggerSuggestion: string;
}

export interface ScheduleParseOptions {
  windowHours?: number; // default: 24
  startDate?: Date;
  timezone?: string; // default: undefined (local) or 'UTC'
  flowCategories?: IFolder[];
  filterStatus?: 'all' | 'active' | 'inactive';
  filterCategory?: string;
  searchQuery?: string;
}

/* ==========================================================================
   2. Human-Friendly Cron Expression Formatter
   ========================================================================== */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Validates whether a cron string is syntactically correct.
 */
export function isValidCron(cron?: string | null): boolean {
  if (!cron || typeof cron !== 'string') return false;
  try {
    new Cron(cron.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * Translates a standard 5 or 6 field cron expression into a human-readable English description.
 */
export function formatCronToHuman(cronStr?: string | null): string {
  if (!cronStr || typeof cronStr !== 'string') return 'No schedule configured';
  const clean = cronStr.trim();

  // Common quick shortcuts
  if (clean === '* * * * *') return 'Every minute';
  if (clean === '*/2 * * * *') return 'Every 2 minutes';
  if (clean === '*/5 * * * *') return 'Every 5 minutes';
  if (clean === '*/10 * * * *') return 'Every 10 minutes';
  if (clean === '*/15 * * * *') return 'Every 15 minutes';
  if (clean === '*/20 * * * *') return 'Every 20 minutes';
  if (clean === '*/30 * * * *') return 'Every 30 minutes';
  if (clean === '0 * * * *') return 'Hourly, on the hour (:00)';
  if (clean === '30 * * * *') return 'Hourly, at minute 30 (:30)';
  if (clean === '0 */2 * * *') return 'Every 2 hours';
  if (clean === '0 */3 * * *') return 'Every 3 hours';
  if (clean === '0 */4 * * *') return 'Every 4 hours';
  if (clean === '0 */6 * * *') return 'Every 6 hours';
  if (clean === '0 */12 * * *') return 'Every 12 hours';
  if (clean === '0 0 * * *') return 'Daily at midnight (00:00)';
  if (clean === '0 12 * * *') return 'Daily at noon (12:00)';
  if (clean === '0 0 * * 0') return 'Weekly on Sunday at 00:00';
  if (clean === '0 0 * * 1') return 'Weekly on Monday at 00:00';
  if (clean === '0 9 * * 1-5') return 'Weekdays (Mon-Fri) at 09:00';
  if (clean === '0 0 1 * *') return 'Monthly on the 1st at 00:00';

  // Parse fields
  const parts = clean.split(/\s+/);
  if (parts.length === 5) {
    const [minute, hour, dom, month, dow] = parts;

    // Check step minutes
    if (minute?.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
      return `Every ${minute.slice(2)} minutes`;
    }

    // Check fixed time daily
    if (
      !minute?.includes('*') &&
      !minute?.includes('/') &&
      !hour?.includes('*') &&
      !hour?.includes('/') &&
      dom === '*' &&
      month === '*' &&
      dow === '*'
    ) {
      const padM = minute?.padStart(2, '0');
      const padH = hour?.padStart(2, '0');
      return `Daily at ${padH}:${padM}`;
    }

    // Check weekdays
    if (dow === '1-5' && dom === '*' && month === '*') {
      const padM = (minute ?? '00').padStart(2, '0');
      const padH = (hour ?? '00').padStart(2, '0');
      return `Weekdays (Mon-Fri) at ${padH}:${padM}`;
    }

    // Check specific day of week
    if (dow && dow !== '*' && dom === '*' && month === '*') {
      const dayNum = parseInt(dow, 10);
      const dayName = !isNaN(dayNum) && dayNum >= 0 && dayNum <= 6 ? DAY_NAMES[dayNum] : dow;
      const padM = (minute ?? '00').padStart(2, '0');
      const padH = (hour ?? '00').padStart(2, '0');
      return `Weekly on ${dayName} at ${padH}:${padM}`;
    }

    // Check specific day of month
    if (dom && dom !== '*' && month === '*' && dow === '*') {
      const padM = (minute ?? '00').padStart(2, '0');
      const padH = (hour ?? '00').padStart(2, '0');
      return `Monthly on day ${dom} at ${padH}:${padM}`;
    }

    // Check specific month and day
    if (month && month !== '*' && dom && dom !== '*' && dow === '*') {
      const mNum = parseInt(month, 10);
      const mName = !isNaN(mNum) && mNum >= 1 && mNum <= 12 ? MONTH_NAMES[mNum - 1] : month;
      const padM = (minute ?? '00').padStart(2, '0');
      const padH = (hour ?? '00').padStart(2, '0');
      return `Annually on ${mName} ${dom} at ${padH}:${padM}`;
    }
  }

  return clean;
}

/**
 * Suggests an offset cron expression to stagger execution times and avoid collisions.
 * Supports both 5-field (min hour dom month dow) and 6-field (sec min hour dom month dow) expressions,
 * step intervals (* /15, * /5), fixed minutes, comma-separated lists, and every-minute patterns.
 */
export function suggestStaggeredCron(cronStr: string, flowIndexOrOffset = 1): string {
  if (!cronStr || typeof cronStr !== 'string') return cronStr;
  const clean = cronStr.trim();
  const parts = clean.split(/\s+/);

  // If 5 parts: [min, hour, dom, month, dow] -> minute is index 0
  // If 6 parts: [sec, min, hour, dom, month, dow] -> minute is index 1
  if (parts.length !== 5 && parts.length !== 6) {
    return clean;
  }

  const isSixField = parts.length === 6;
  const minuteIndex = isSixField ? 1 : 0;
  const minutePart = parts[minuteIndex] || '';

  // Determine flowIndex and base offset:
  // If passed value is <= 4, treat as flowIndex (1 -> +5m, 2 -> +10m)
  // If passed value is >= 5, treat as offset minutes (5 -> flowIndex 1, 10 -> flowIndex 2)
  const flowIndex =
    flowIndexOrOffset >= 5
      ? Math.max(1, Math.round(flowIndexOrOffset / 5))
      : Math.max(1, flowIndexOrOffset);
  const offset = flowIndexOrOffset >= 5 ? flowIndexOrOffset : flowIndex * 5;

  // Case 1: Every minute wildcard (* * * * * or 0 * * * * *)
  if (minutePart === '*') {
    // If it runs every minute, staggering by minute is impossible without changing frequency.
    // Suggest running every 2 minutes with alternating offset.
    const newMin = flowIndex % 2 === 1 ? '1-59/2' : '*/2';
    const newParts = [...parts];
    newParts[minuteIndex] = newMin;
    return newParts.join(' ');
  }

  // Case 2: Step expression (e.g. */5, */10, */15, */30, */2)
  if (minutePart.includes('/')) {
    const [, stepStr] = minutePart.split('/');
    const step = parseInt(stepStr || '5', 10);
    if (!isNaN(step) && step > 1) {
      let stepOffset = 1;
      if (step >= 10) {
        const candidate = (flowIndex * 5) % step;
        stepOffset = candidate === 0 ? 5 : candidate;
      } else {
        const candidate = flowIndex % step;
        stepOffset = candidate === 0 ? 1 : candidate;
      }

      const newParts = [...parts];
      newParts[minuteIndex] = `${stepOffset}-59/${step}`;
      return newParts.join(' ');
    }
  }

  // Case 3: Comma-separated list (e.g. 0,30 or 15,45)
  if (minutePart.includes(',')) {
    const list = minutePart.split(',').map((item) => {
      const val = parseInt(item.trim(), 10);
      return !isNaN(val) ? String((val + offset) % 60) : item;
    });
    const newParts = [...parts];
    newParts[minuteIndex] = list.join(',');
    return newParts.join(' ');
  }

  // Case 4: Single fixed minute (e.g. 0 0 * * * -> 5 0 * * * or 0 0 0 * * * -> 0 5 0 * * *)
  const mNum = parseInt(minutePart, 10);
  if (!isNaN(mNum)) {
    const newM = (mNum + offset) % 60;
    const newParts = [...parts];
    newParts[minuteIndex] = String(newM);
    return newParts.join(' ');
  }

  return clean;
}

/* ==========================================================================
   3. Schedule Flow Processing & Horizon Occurrence Expansion
   ========================================================================== */

/**
 * Parses and expands planned executions for all schedule-triggered flows.
 */
export function parseScheduledFlows(
  flows: IFlow[],
  options: ScheduleParseOptions = {},
): {
  scheduledFlows: ScheduledFlowItem[];
  windowStart: Date;
  windowEnd: Date;
  totalExecutions: number;
  collisionIncidents: CollisionIncident[];
} {
  const {
    windowHours = 24,
    startDate = new Date(),
    timezone,
    flowCategories = [],
    filterStatus = 'all',
    filterCategory = 'all',
    searchQuery = '',
  } = options;

  const windowStart = new Date(startDate);
  const windowEnd = new Date(windowStart.getTime() + windowHours * 60 * 60 * 1000);

  // Category map lookup
  const categoryMap = new Map<string, IFolder>();
  for (const cat of flowCategories) {
    categoryMap.set(cat.id, cat);
  }

  // Filter flows with trigger === 'schedule'
  const candidateFlows = flows.filter((flow) => {
    if (flow.trigger !== 'schedule') return false;

    // Status filter
    if (filterStatus !== 'all' && flow.status !== filterStatus) return false;

    // Category filter
    const catId = flow.flow_manager_metadata_id?.flow_manager_category;
    if (filterCategory !== 'all' && catId !== filterCategory) return false;

    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      const matchName = flow.name?.toLowerCase().includes(query);
      const cronStr = String(flow.options?.cron || '').toLowerCase();
      const matchCron = cronStr.includes(query);
      if (!matchName && !matchCron) return false;
    }

    return true;
  });

  const scheduledFlows: ScheduledFlowItem[] = [];
  let totalExecutions = 0;

  // Occurrences by minute key: "YYYY-MM-DDTHH:mm" -> list of flows firing at that minute
  const minuteBuckets = new Map<
    string,
    {
      timestamp: Date;
      flows: {
        id: string;
        name: string;
        icon?: string;
        color?: string | null;
        cron: string;
        humanCron: string;
      }[];
    }
  >();

  for (const flow of candidateFlows) {
    const rawCron = String(flow.options?.cron || '').trim();
    if (!rawCron) continue;

    const catId = flow.flow_manager_metadata_id?.flow_manager_category || null;
    const catFolder = catId ? categoryMap.get(catId) : undefined;
    const humanCron = formatCronToHuman(rawCron);

    let nextRun: Date | null = null;
    const occurrences: Date[] = [];

    // Check if high frequency (e.g., */1, */2, */5)
    const isHighFrequency =
      rawCron.includes('*/1 ') ||
      rawCron.includes('*/2 ') ||
      rawCron.includes('*/3 ') ||
      rawCron.includes('*/4 ') ||
      rawCron.includes('*/5 ') ||
      rawCron.startsWith('* *');

    try {
      const cronOptions: {
        stopAt?: Date;
        timezone?: string;
      } = {
        stopAt: windowEnd,
      };

      if (timezone && timezone !== 'local') {
        cronOptions.timezone = timezone;
      }

      const cronJob = new Cron(rawCron, cronOptions);
      // Max occurrences to track per flow (cap at 288 = every 5 min in 24h)
      const MAX_OCCURRENCES_PER_FLOW = 288;
      const runStart = new Date(windowStart.getTime() - 1000);
      const runs = cronJob.nextRuns(MAX_OCCURRENCES_PER_FLOW, runStart);

      for (const occ of runs) {
        if (occ >= windowStart && occ <= windowEnd) {
          occurrences.push(occ);
          if (!nextRun) {
            nextRun = occ;
          }

          // Register in minute bucket for collision analysis
          const minuteKey = `${occ.getUTCFullYear()}-${String(occ.getUTCMonth() + 1).padStart(2, '0')}-${String(occ.getUTCDate()).padStart(2, '0')}T${String(occ.getUTCHours()).padStart(2, '0')}:${String(occ.getUTCMinutes()).padStart(2, '0')}`;

          let bucket = minuteBuckets.get(minuteKey);
          if (!bucket) {
            bucket = { timestamp: occ, flows: [] };
            minuteBuckets.set(minuteKey, bucket);
          }
          bucket.flows.push({
            id: flow.id,
            name: flow.name,
            icon: flow.icon || 'bolt',
            color: flow.color,
            cron: rawCron,
            humanCron,
          });
        }
      }

      // If nextRun is still null, calculate earliest next run outside window
      if (!nextRun) {
        try {
          const fallbackJob = new Cron(
            rawCron,
            timezone && timezone !== 'local' ? { timezone } : undefined,
          );
          nextRun = fallbackJob.nextRun(runStart);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.warn(`[FLOW MANAGER] Failed to parse cron for flow "${flow.name}":`, err);
    }

    totalExecutions += occurrences.length;

    scheduledFlows.push({
      id: flow.id,
      name: flow.name,
      icon: flow.icon || 'bolt',
      color: flow.color,
      status: flow.status,
      cron: rawCron,
      humanCron,
      category: catId,
      categoryName: catFolder?.name || 'Uncategorized',
      categoryIcon: catFolder?.icon || 'folder',
      categoryColor: catFolder?.color,
      nextRun,
      occurrences,
      isHighFrequency,
      collisionCount: 0,
      flow,
    });
  }

  // Calculate collisions: any minute with 2 or more flows firing
  const collisionIncidents: CollisionIncident[] = [];
  const flowCollisionTallies = new Map<string, number>();

  for (const [key, bucket] of minuteBuckets.entries()) {
    if (bucket.flows.length >= 2) {
      const timeLabel = formatMinuteLabel(bucket.timestamp, timezone);
      const secondFlow = bucket.flows[1];
      const secondCron = secondFlow?.cron || '';
      const suggested = suggestStaggeredCron(secondCron, 1);
      const isDifferent = suggested !== secondCron;
      const staggerMsg = isDifferent
        ? `Stagger ${secondFlow?.name || 'secondary flow'} to "${suggested}" to relieve database load at ${timeLabel}.`
        : `Stagger ${secondFlow?.name || 'secondary flow'} by +5m to relieve database load at ${timeLabel}.`;

      const incident: CollisionIncident = {
        timeKey: key,
        timestamp: bucket.timestamp,
        timeLabel,
        flows: bucket.flows,
        count: bucket.flows.length,
        staggerSuggestion: staggerMsg,
      };
      collisionIncidents.push(incident);

      for (const f of bucket.flows) {
        flowCollisionTallies.set(f.id, (flowCollisionTallies.get(f.id) || 0) + 1);
      }
    }
  }

  // Sort collisions by severity (count descending) then timestamp
  collisionIncidents.sort(
    (a, b) => b.count - a.count || a.timestamp.getTime() - b.timestamp.getTime(),
  );

  // Assign collision counts to flows
  for (const item of scheduledFlows) {
    item.collisionCount = flowCollisionTallies.get(item.id) || 0;
  }

  // Sort scheduled flows: high collision flows first, then by next run, then by name
  scheduledFlows.sort((a, b) => {
    if (b.collisionCount !== a.collisionCount) {
      return b.collisionCount - a.collisionCount;
    }
    if (a.nextRun && b.nextRun) {
      return a.nextRun.getTime() - b.nextRun.getTime();
    }
    return a.name.localeCompare(b.name);
  });

  return {
    scheduledFlows,
    windowStart,
    windowEnd,
    totalExecutions,
    collisionIncidents,
  };
}

/* ==========================================================================
   4. Concurrency Heatmap Generator
   ========================================================================== */

/**
 * Builds discrete time buckets (e.g. 15-minute or 30-minute intervals)
 * representing concurrency load across the time window.
 */
export function generateConcurrencyHeatmap(
  scheduledFlows: ScheduledFlowItem[],
  windowStart: Date,
  windowEnd: Date,
  bucketMinutes = 30,
  timezone?: string,
): TimelineBucket[] {
  const buckets: TimelineBucket[] = [];
  const bucketMs = bucketMinutes * 60 * 1000;
  const totalBuckets = Math.ceil((windowEnd.getTime() - windowStart.getTime()) / bucketMs);

  for (let i = 0; i < totalBuckets; i++) {
    const bucketStart = new Date(windowStart.getTime() + i * bucketMs);
    const bucketEnd = new Date(bucketStart.getTime() + bucketMs);
    const flowsInBucket: { id: string; name: string; cron: string }[] = [];
    const seenFlowIds = new Set<string>();

    for (const flow of scheduledFlows) {
      const hasOccurrence = flow.occurrences.some((occ) => occ >= bucketStart && occ < bucketEnd);
      if (hasOccurrence && !seenFlowIds.has(flow.id)) {
        seenFlowIds.add(flow.id);
        flowsInBucket.push({
          id: flow.id,
          name: flow.name,
          cron: flow.cron,
        });
      }
    }

    const count = flowsInBucket.length;
    let level: 'normal' | 'medium' | 'danger' = 'normal';
    if (count >= 5) {
      level = 'danger';
    } else if (count >= 3) {
      level = 'medium';
    }

    buckets.push({
      index: i,
      timestamp: bucketStart,
      timeLabel: formatMinuteLabel(bucketStart, timezone),
      count,
      flows: flowsInBucket,
      level,
    });
  }

  return buckets;
}

function formatMinuteLabel(date: Date, timezone?: string): string {
  if (timezone === 'UTC') {
    return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  }
  if (timezone && timezone !== 'local') {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return formatter.format(date);
    } catch {
      // fallback
    }
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Calculates a percentage position (0% - 100%) for a given timestamp along the window timeline.
 */
export function getTimelinePercent(date: Date, windowStart: Date, windowEnd: Date): number {
  const total = windowEnd.getTime() - windowStart.getTime();
  if (total <= 0) return 0;
  const current = date.getTime() - windowStart.getTime();
  const pct = (current / total) * 100;
  return Math.max(0, Math.min(100, pct));
}

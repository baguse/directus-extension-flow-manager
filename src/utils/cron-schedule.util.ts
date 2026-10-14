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

function getOrdinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function formatTime12h(h: number, m: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mStr = String(m).padStart(2, '0');
  return `${h12}:${mStr} ${period}`;
}

/**
 * Translates a standard 5 or 6 field cron expression into a human-readable English description.
 */
export function formatCronToHuman(cronStr?: string | null): string {
  if (!cronStr || typeof cronStr !== 'string') return 'No schedule configured';
  const clean = cronStr.trim();
  if (!clean) return 'No schedule configured';

  // Normalize single spaces
  const parts = clean.split(/\s+/);
  const normalized = parts.join(' ');

  // Common quick shortcuts (5-field)
  if (normalized === '* * * * *') return 'Run every minute';
  if (normalized === '*/2 * * * *') return 'Run every 2 minutes';
  if (normalized === '*/5 * * * *') return 'Run every 5 minutes';
  if (normalized === '*/10 * * * *') return 'Run every 10 minutes';
  if (normalized === '*/15 * * * *') return 'Run every 15 minutes';
  if (normalized === '*/20 * * * *') return 'Run every 20 minutes';
  if (normalized === '*/30 * * * *') return 'Run every 30 minutes';
  if (normalized === '0 * * * *') return 'Run every hour on the hour';
  if (normalized === '30 * * * *') return 'Run every hour at minute 30';
  if (normalized === '0 */2 * * *') return 'Run every 2 hours';
  if (normalized === '0 */3 * * *') return 'Run every 3 hours';
  if (normalized === '0 */4 * * *') return 'Run every 4 hours';
  if (normalized === '0 */6 * * *') return 'Run every 6 hours';
  if (normalized === '0 */12 * * *') return 'Run every 12 hours';
  if (normalized === '0 0 * * *') return 'Run daily at midnight (12:00 AM)';
  if (normalized === '0 12 * * *') return 'Run daily at noon (12:00 PM)';
  if (normalized === '0 1 * * *') return 'Run daily at 1:00 AM';
  if (normalized === '0 0 * * 0') return 'Run weekly on Sunday at 12:00 AM';
  if (normalized === '0 0 * * 1') return 'Run weekly on Monday at 12:00 AM';
  if (normalized === '0 9 * * 1-5') return 'Run weekdays (Mon-Fri) at 9:00 AM';
  if (normalized === '0 0 1 * *') return 'Run monthly on the 1st at 12:00 AM';

  // Quick shortcuts (6-field with 0 in seconds)
  if (normalized === '0 * * * * *') return 'Run every minute';
  if (normalized === '0 */2 * * * *') return 'Run every 2 minutes';
  if (normalized === '0 */5 * * * *') return 'Run every 5 minutes';
  if (normalized === '0 */10 * * * *') return 'Run every 10 minutes';
  if (normalized === '0 */15 * * * *') return 'Run every 15 minutes';
  if (normalized === '0 */30 * * * *') return 'Run every 30 minutes';
  if (normalized === '0 0 * * * *') return 'Run every hour on the hour';
  if (normalized === '0 0 0 * * *') return 'Run daily at midnight (12:00 AM)';
  if (normalized === '0 0 1 * * *') return 'Run daily at 1:00 AM';

  // Parse fields
  const isSixField = parts.length === 6;
  if (parts.length === 5 || isSixField) {
    const sec = isSixField ? (parts[0] || '') : '';
    const minute = isSixField ? (parts[1] || '') : (parts[0] || '');
    const hour = isSixField ? (parts[2] || '') : (parts[1] || '');
    const dom = isSixField ? (parts[3] || '') : (parts[2] || '');
    const month = isSixField ? (parts[4] || '') : (parts[3] || '');
    const dow = isSixField ? (parts[5] || '') : (parts[4] || '');

    // Build Time Portion
    let timeDesc = '';

    // If 6-field with active seconds:
    if (sec && sec !== '0') {
      if (sec === '*') {
        if (minute === '*') {
          const hNum = parseInt(hour, 10);
          if (!isNaN(hNum) && hNum >= 0 && hNum <= 23) {
            timeDesc = `every second between ${formatTime12h(hNum, 0)} and ${formatTime12h((hNum + 1) % 24, 0)}`;
          } else {
            timeDesc = 'every second';
          }
        } else {
          timeDesc = `every second at minute ${minute}`;
        }
      } else if (sec.startsWith('*/') || sec.startsWith('0/')) {
        const step = sec.replace(/^[*0]\//, '');
        timeDesc = `every ${step} seconds`;
      } else {
        timeDesc = `at second ${sec}`;
      }
    } else {
      // 5-field or 6-field with sec === 0
      const stepMinMatch = minute.match(/^(\*|0|\d+-\d+)\/(\d+)$/);
      const stepHourMatch = hour.match(/^(\*|0|\d+-\d+)\/(\d+)$/);

      if (minute === '*') {
        const hNum = parseInt(hour, 10);
        if (!isNaN(hNum) && hNum >= 0 && hNum <= 23) {
          timeDesc = `every minute between ${formatTime12h(hNum, 0)} and ${formatTime12h((hNum + 1) % 24, 0)}`;
        } else if (stepHourMatch) {
          timeDesc = `every minute every ${stepHourMatch[2]} hours`;
        } else {
          timeDesc = 'every minute';
        }
      } else if (stepMinMatch) {
        const stepM = stepMinMatch[2];
        const hNum = parseInt(hour, 10);
        if (!isNaN(hNum) && hNum >= 0 && hNum <= 23) {
          timeDesc = `every ${stepM} minutes between ${formatTime12h(hNum, 0)} and ${formatTime12h((hNum + 1) % 24, 0)}`;
        } else if (stepHourMatch) {
          timeDesc = `every ${stepM} minutes every ${stepHourMatch[2]} hours`;
        } else {
          timeDesc = stepM === '1' ? 'every minute' : `every ${stepM} minutes`;
        }
      } else if (minute.includes(',')) {
        const mList = minute.split(',').map((m) => parseInt(m.trim(), 10));
        const hNum = parseInt(hour, 10);
        if (!isNaN(hNum) && hNum >= 0 && hNum <= 23 && mList.every((m) => !isNaN(m) && m >= 0 && m <= 59)) {
          timeDesc = `at ${mList.map((m) => formatTime12h(hNum, m)).join(' and ')}`;
        } else {
          timeDesc = `at minute ${minute}`;
        }
      } else {
        // fixed minute
        const mNum = parseInt(minute, 10);
        if (!isNaN(mNum) && mNum >= 0 && mNum <= 59) {
          if (hour === '*') {
            timeDesc = mNum === 0 ? 'every hour on the hour' : `every hour at minute ${mNum}`;
          } else if (stepHourMatch) {
            timeDesc =
              mNum === 0
                ? `every ${stepHourMatch[2]} hours on the hour`
                : `every ${stepHourMatch[2]} hours at minute ${mNum}`;
          } else if (hour.includes(',')) {
            const hList = hour.split(',').map((h) => parseInt(h.trim(), 10));
            if (hList.every((h) => !isNaN(h) && h >= 0 && h <= 23)) {
              timeDesc = `at ${hList.map((h) => formatTime12h(h, mNum)).join(', ')}`;
            }
          } else {
            const hNum = parseInt(hour, 10);
            if (!isNaN(hNum) && hNum >= 0 && hNum <= 23) {
              timeDesc = `at ${formatTime12h(hNum, mNum)}`;
            }
          }
        }
      }
    }

    if (!timeDesc) {
      timeDesc = `at ${clean}`;
    }

    // Build Calendar Portion (dom, month, dow)
    // Case 1: Every day, every month, every day of week
    if (dom === '*' && month === '*' && dow === '*') {
      if (timeDesc.startsWith('at ')) {
        return `Run daily ${timeDesc}`;
      }
      return `Run ${timeDesc} daily`;
    }

    // Case 2: Weekdays
    if (dow === '1-5' && dom === '*' && month === '*') {
      if (timeDesc.startsWith('at ')) {
        return `Run weekdays (Mon-Fri) ${timeDesc}`;
      }
      return `Run ${timeDesc} on weekdays (Mon-Fri)`;
    }

    // Case 3: Weekends
    if ((dow === '0,6' || dow === '6,0') && dom === '*' && month === '*') {
      if (timeDesc.startsWith('at ')) {
        return `Run weekends (Sat-Sun) ${timeDesc}`;
      }
      return `Run ${timeDesc} on weekends (Sat-Sun)`;
    }

    // Case 4: Specific Day of Week
    if (dow !== '*' && dom === '*' && month === '*') {
      const dNum = parseInt(dow, 10);
      const dName = !isNaN(dNum) && dNum >= 0 && dNum <= 6 ? DAY_NAMES[dNum] : dow;
      if (timeDesc.startsWith('at ')) {
        return `Run weekly on ${dName} ${timeDesc}`;
      }
      return `Run ${timeDesc} weekly on ${dName}`;
    }

    // Case 5: Specific Day of Month
    if (dom !== '*' && dow === '*' && month === '*') {
      const domNum = parseInt(dom, 10);
      const domStr = !isNaN(domNum) && domNum >= 1 && domNum <= 31 ? getOrdinal(domNum) : `day ${dom}`;
      if (timeDesc.startsWith('at ')) {
        return `Run monthly on the ${domStr} ${timeDesc}`;
      }
      return `Run ${timeDesc} on the ${domStr} of every month`;
    }

    // Case 6: Specific Month & Day
    if (month !== '*' && dow === '*') {
      const mNum = parseInt(month, 10);
      const mName = !isNaN(mNum) && mNum >= 1 && mNum <= 12 ? MONTH_NAMES[mNum - 1] : `month ${month}`;
      const domNum = parseInt(dom, 10);
      const domStr = !isNaN(domNum) && domNum >= 1 && domNum <= 31 ? ` ${getOrdinal(domNum)}` : dom !== '*' ? ` day ${dom}` : '';
      if (timeDesc.startsWith('at ')) {
        return `Run annually on ${mName}${domStr} ${timeDesc}`;
      }
      return `Run ${timeDesc} on ${mName}${domStr}`;
    }

    return `Run ${timeDesc}`;
  }

  return `Run on schedule (${clean})`;
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

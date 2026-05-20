// src/js/urgency.js — Smart urgency/importance signals ("The Oracle's Eye")
// Adds visual urgency badges to task cards based on deadlines, aging,
// upcoming events, and context. Helps surface WHAT needs attention NOW.

import { state } from './state.js';
import { URGENCY_KEYWORDS, HEARTH_SECS, WORK_SECS } from './constants.js';

/* ═══ URGENCY LEVELS ═══ */
// Each task gets an urgency assessment with level + reason
// Levels: 'critical' (now!), 'pressing' (soon), 'steady' (normal), 'dormant' (can wait)

const DEADLINE_PATTERNS = [
  { re: /\btoday\b/i, daysOut: 0 },
  { re: /\btonight\b/i, daysOut: 0 },
  { re: /\btomorrow\b/i, daysOut: 1 },
  { re: /\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, fn: matchDayOfWeek },
  { re: /\bdue\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, fn: matchDayOfWeek },
  { re: /\bby (\d{1,2})\/(\d{1,2})\b/, fn: matchDateSlash },
  { re: /\bthis week\b/i, daysOut: 5 },
  { re: /\bnext week\b/i, daysOut: 10 },
  { re: /\bthis month\b/i, daysOut: 25 },
  { re: /\basap\b/i, daysOut: 0 },
  { re: /\burgent\b/i, daysOut: 0 },
  { re: /\bdeadline\b/i, daysOut: 1 },
  { re: /\boverdue\b/i, daysOut: -1 },
];

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function matchDayOfWeek(match) {
  const target = DAY_NAMES.indexOf(match[1].toLowerCase());
  if (target < 0) return null;
  const now = new Date();
  const today = now.getDay();
  let diff = target - today;
  if (diff <= 0) diff += 7; // next occurrence
  return diff;
}

function matchDateSlash(match) {
  const month = parseInt(match[1]) - 1;
  const day = parseInt(match[2]);
  const now = new Date();
  const target = new Date(now.getFullYear(), month, day);
  if (target < now) target.setFullYear(target.getFullYear() + 1);
  return Math.ceil((target - now) / 86400000);
}

/* ═══ DETECT DEADLINE ═══ */
function detectDeadlineDays(task) {
  const text = (task.text || '') + ' ' + (task.notes || '');
  for (const pat of DEADLINE_PATTERNS) {
    const m = text.match(pat.re);
    if (m) {
      if (pat.fn) {
        const days = pat.fn(m);
        if (days !== null) return days;
      } else if (pat.daysOut !== undefined) {
        return pat.daysOut;
      }
    }
  }
  // Check for explicit deadline date stored on task
  if (task.deadline) {
    const dl = new Date(task.deadline);
    return Math.ceil((dl - new Date()) / 86400000);
  }
  return null;
}

/* ═══ CHECK UPCOMING WARDS ═══ */
function getRelatedWard(task) {
  const taskText = (task.text || '').toLowerCase();
  const wards = state.wards || [];
  const now = new Date();

  for (const w of wards) {
    if (!w.datetime || w.dismissed) continue;
    const wardTime = new Date(w.datetime);
    const hoursUntil = (wardTime - now) / 3600000;
    if (hoursUntil < 0 || hoursUntil > 24) continue;

    // Check if ward text relates to task text (simple word overlap)
    const wardWords = (w.text || '').toLowerCase().split(/\s+/);
    const taskWords = taskText.split(/\s+/);
    const overlap = wardWords.filter(w => w.length > 3 && taskWords.some(t => t.includes(w) || w.includes(t)));
    if (overlap.length > 0) {
      return { ward: w, hoursUntil };
    }
  }
  return null;
}

/* ═══ ASSESS URGENCY ═══ */
export function assessUrgency(task) {
  if (task.done) return { level: 'done', reason: '', score: 0 };

  const signals = [];
  let urgencyScore = 0;

  // 1. Deadline proximity
  const deadlineDays = detectDeadlineDays(task);
  if (deadlineDays !== null) {
    if (deadlineDays <= 0) {
      urgencyScore += 100;
      signals.push(deadlineDays < 0 ? 'overdue' : 'due today');
    } else if (deadlineDays === 1) {
      urgencyScore += 70;
      signals.push('due tomorrow');
    } else if (deadlineDays <= 3) {
      urgencyScore += 40;
      signals.push(`due in ${deadlineDays} days`);
    } else if (deadlineDays <= 7) {
      urgencyScore += 15;
      signals.push(`due this week`);
    }
  }

  // 2. Related ward/meeting coming up
  const relatedWard = getRelatedWard(task);
  if (relatedWard) {
    const hrs = Math.round(relatedWard.hoursUntil);
    if (hrs <= 1) {
      urgencyScore += 80;
      signals.push(`related meeting in <1h`);
    } else if (hrs <= 3) {
      urgencyScore += 50;
      signals.push(`meeting in ~${hrs}h`);
    } else {
      urgencyScore += 20;
      signals.push(`meeting later today`);
    }
  }

  // 3. Keyword urgency
  const combined = ((task.text || '') + ' ' + (task.notes || '')).toLowerCase();
  let keywordHits = 0;
  URGENCY_KEYWORDS.forEach(kw => { if (combined.includes(kw)) keywordHits++; });
  if (keywordHits >= 2) {
    urgencyScore += 30;
    if (!signals.length) signals.push('marked urgent');
  } else if (keywordHits === 1) {
    urgencyScore += 10;
    if (!signals.length) signals.push('time-sensitive');
  }

  // 4. Task aging (stale = probably needs attention or should be dropped)
  if (task.createdAt) {
    const ageDays = Math.floor((Date.now() - new Date(task.createdAt).getTime()) / 86400000);
    if (ageDays >= 14) {
      urgencyScore += 15;
      signals.push('lingering ' + ageDays + ' days');
    } else if (ageDays >= 7) {
      urgencyScore += 8;
    }
  }

  // 5. Near-completion momentum (close to a win)
  const cl = task.checklist || [];
  if (cl.length >= 2) {
    const donePct = cl.filter(c => c.done).length / cl.length;
    if (donePct >= 0.7) {
      urgencyScore += 20;
      signals.push('almost done — ' + Math.round(donePct * 100) + '%');
    }
  }

  // 6. Big unstarted task (important but not urgent — needs scaffolding)
  const isUnbound = (!cl.length) && (!task.notes || !task.notes.trim());
  const isComplex = combined.match(/presentation|report|project|analysis|pipeline|clean.*house|deep.?clean|organize/i);
  if (isUnbound && isComplex) {
    urgencyScore += 5;
    signals.push('needs a plan');
  }

  // Determine level
  let level, icon;
  if (urgencyScore >= 60) {
    level = 'critical';
    icon = 'ti-alert-triangle';
  } else if (urgencyScore >= 25) {
    level = 'pressing';
    icon = 'ti-clock-exclamation';
  } else if (urgencyScore >= 8) {
    level = 'steady';
    icon = 'ti-clock';
  } else {
    level = 'dormant';
    icon = '';
  }

  return {
    level,
    score: urgencyScore,
    reason: signals[0] || '',
    allReasons: signals,
    icon,
    deadlineDays,
  };
}

/* ═══ RENDER URGENCY BADGE ═══ */
export function urgencyBadgeHTML(task) {
  const u = assessUrgency(task);
  if (u.level === 'done' || u.level === 'dormant') return '';

  const classes = `urgency-badge urgency-${u.level}`;
  const iconHtml = u.icon ? `<i class="ti ${u.icon}" style="font-size:9px"></i> ` : '';

  return `<span class="${classes}" title="${u.allReasons.join(' · ')}">${iconHtml}${u.reason}</span>`;
}

/* ═══ TIME-OF-DAY CONTEXT ═══ */
export function getTimeContext() {
  const hour = new Date().getHours();
  const isWeekend = [0, 6].includes(new Date().getDay());

  // Weekends: work weight is always 0 — weekends are for hearth only
  if (isWeekend) {
    if (hour < 8) return { phase: 'morning', label: 'weekend morning', workWeight: 0, hearthWeight: 0.8, isWeekend: true };
    if (hour < 12) return { phase: 'forenoon', label: 'weekend morning', workWeight: 0, hearthWeight: 1, isWeekend: true };
    if (hour < 18) return { phase: 'afternoon', label: 'weekend afternoon', workWeight: 0, hearthWeight: 1, isWeekend: true };
    if (hour < 22) return { phase: 'evening', label: 'weekend evening', workWeight: 0, hearthWeight: 0.9, isWeekend: true };
    return { phase: 'late', label: 'weekend night', workWeight: 0, hearthWeight: 0.6, isWeekend: true };
  }

  // Weekdays: work during the day, hearth in the evening
  if (hour < 5) return { phase: 'night', label: 'deep night', workWeight: 0, hearthWeight: 1, isWeekend: false };
  if (hour < 9) return { phase: 'morning', label: 'morning', workWeight: 0.7, hearthWeight: 0.8, isWeekend: false };
  if (hour < 12) return { phase: 'forenoon', label: 'forenoon', workWeight: 1, hearthWeight: 0.4, isWeekend: false };
  if (hour < 14) return { phase: 'midday', label: 'midday', workWeight: 0.9, hearthWeight: 0.5, isWeekend: false };
  if (hour < 17) return { phase: 'afternoon', label: 'afternoon', workWeight: 1, hearthWeight: 0.3, isWeekend: false };
  if (hour < 19) return { phase: 'evening', label: 'evening', workWeight: 0.3, hearthWeight: 1, isWeekend: false };
  if (hour < 22) return { phase: 'night', label: 'night', workWeight: 0.1, hearthWeight: 1, isWeekend: false };
  return { phase: 'late', label: 'late night', workWeight: 0, hearthWeight: 0.8, isWeekend: false };
}

/* ═══ CROSS-TAB WEIGHTED SCORING ═══ */
// Used by Focus panel and Day's Rite to score tasks across both tabs equally
export function weightedScore(task, sec) {
  const ctx = getTimeContext();
  const isWork = WORK_SECS.includes(sec);
  const isHearth = HEARTH_SECS.includes(sec);

  // Base urgency score
  const u = assessUrgency(task);
  let score = u.score;

  // Time-of-day weighting
  if (isWork) score *= ctx.workWeight;
  else if (isHearth) score *= ctx.hearthWeight;

  // Urgency always overrides time-of-day (critical tasks break through)
  if (u.level === 'critical') score = Math.max(score, 60);

  return score;
}

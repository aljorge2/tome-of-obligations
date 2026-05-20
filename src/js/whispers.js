// src/js/whispers.js — Context-aware nudges ("Oracle Whispers")
// Goes beyond idle detection — proactively checks deadlines, self-care,
// upcoming events, and time-of-day to compose relevant, gentle prompts.
// "Taking a shower is just as important as making a PPT."

import { state } from './state.js';
import { ALL_SECTIONS, WORK_SECS, HEARTH_SECS } from './constants.js';
import { assessUrgency, getTimeContext } from './urgency.js';
import { safeStorage } from './storage.js';
import { SELFCARE_KEY } from './state.js';

/* ═══ CONFIG ═══ */
const CHECK_INTERVAL = 5 * 60 * 1000;   // Check every 5 minutes
const WHISPER_COOLDOWN = 20 * 60 * 1000; // Don't whisper more than once per 20min
const DISMISS_KEY = 'tome_whisper_dismissed_v1';

/* ═══ STATE ═══ */
let _lastWhisper = 0;
let _checkTimer = null;
let _whisperEl = null;
let _dismissed = {};

function loadDismissed() {
  try {
    const raw = safeStorage.getItem(DISMISS_KEY);
    if (raw) _dismissed = JSON.parse(raw);
    // Clean old entries (older than 24h)
    const cutoff = Date.now() - 86400000;
    Object.keys(_dismissed).forEach(k => {
      if (_dismissed[k] < cutoff) delete _dismissed[k];
    });
  } catch(e) { _dismissed = {}; }
}
function saveDismissed() {
  try { safeStorage.setItem(DISMISS_KEY, JSON.stringify(_dismissed)); } catch(e) {}
}

/* ═══ WHISPER GENERATORS ═══ */
// Each returns { text, icon, type, priority } or null

function checkDeadlines() {
  const results = [];
  // Weekends: only whisper about hearth tasks, not work
  const isWeekend = [0, 6].includes(new Date().getDay());
  const whisperSecs = isWeekend ? HEARTH_SECS : ALL_SECTIONS;
  whisperSecs.forEach(sec => {
    (state[sec] || []).forEach(task => {
      if (task.done) return;
      const u = assessUrgency(task);
      if (u.level === 'critical' && u.reason) {
        // Check checklist progress
        const cl = task.checklist || [];
        const progress = cl.length ? Math.round(cl.filter(c => c.done).length / cl.length * 100) : 0;
        const progressNote = cl.length ? ` (${progress}% done)` : '';

        results.push({
          text: `"${task.text.slice(0, 40)}" is ${u.reason}${progressNote}`,
          icon: 'ti-alert-triangle',
          type: 'deadline',
          priority: u.score,
          taskId: task.id,
        });
      }
    });
  });

  // Return the most urgent one
  results.sort((a, b) => b.priority - a.priority);
  return results[0] || null;
}

function checkUpcomingWards() {
  const wards = state.wards || [];
  const now = new Date();

  for (const w of wards) {
    if (!w.datetime || w.dismissed) continue;
    const wardTime = new Date(w.datetime);
    const minsUntil = Math.round((wardTime - now) / 60000);

    // Warn 60-90 minutes before (not duplicate of ward's own notification)
    if (minsUntil >= 45 && minsUntil <= 90) {
      const key = 'ward-prep-' + w.id;
      if (_dismissed[key]) continue;

      return {
        text: `"${(w.text || 'Event').slice(0, 35)}" is in ~${minsUntil} min — need to prep?`,
        icon: 'ti-calendar-event',
        type: 'ward-prep',
        priority: 50,
        dismissKey: key,
      };
    }
  }
  return null;
}

function checkSelfCare() {
  const hour = new Date().getHours();
  let selfcare = {};
  try {
    const raw = safeStorage.getItem(SELFCARE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // selfcare data is stored by date
      const todayKey = new Date().toISOString().slice(0, 10);
      selfcare = parsed[todayKey] || parsed || {};
    }
  } catch(e) {}

  const checks = [];

  // Meal reminders
  if (hour >= 12 && hour <= 14 && !selfcare['lunch']) {
    checks.push({
      text: 'It\'s past noon — have you eaten lunch?',
      icon: 'ti-salad',
      type: 'selfcare-meal',
      priority: 35,
      dismissKey: 'lunch-' + new Date().toISOString().slice(0, 10),
    });
  }
  if (hour >= 18 && hour <= 20 && !selfcare['dinner']) {
    checks.push({
      text: 'Evening\'s here — dinner time?',
      icon: 'ti-soup',
      type: 'selfcare-meal',
      priority: 30,
      dismissKey: 'dinner-' + new Date().toISOString().slice(0, 10),
    });
  }
  if (hour >= 9 && hour <= 11 && !selfcare['breakfast']) {
    checks.push({
      text: 'Morning fuel — have you had breakfast?',
      icon: 'ti-egg',
      type: 'selfcare-meal',
      priority: 25,
      dismissKey: 'breakfast-' + new Date().toISOString().slice(0, 10),
    });
  }

  // Water reminder (every 2-3 hours during waking hours)
  if (hour >= 8 && hour <= 22 && !selfcare['water']) {
    checks.push({
      text: 'Hydration check — water yourself, you botanical wonder.',
      icon: 'ti-droplet',
      type: 'selfcare-water',
      priority: 15,
      dismissKey: 'water-' + new Date().getHours(),
    });
  }

  // Medication reminders
  if (hour >= 7 && hour <= 10 && !selfcare['med-am']) {
    checks.push({
      text: 'Dawn elixir — have you taken your morning meds?',
      icon: 'ti-flask-2',
      type: 'selfcare-med',
      priority: 45,
      dismissKey: 'med-am-' + new Date().toISOString().slice(0, 10),
    });
  }
  if (hour >= 12 && hour <= 15 && !selfcare['med-pm']) {
    checks.push({
      text: 'Midday elixir — time for afternoon meds?',
      icon: 'ti-flask-2',
      type: 'selfcare-med',
      priority: 45,
      dismissKey: 'med-pm-' + new Date().toISOString().slice(0, 10),
    });
  }

  // Find one that hasn't been dismissed
  for (const c of checks) {
    if (!_dismissed[c.dismissKey]) return c;
  }
  return null;
}

function checkTimeTransition() {
  const ctx = getTimeContext();
  const key = 'transition-' + ctx.phase + '-' + new Date().toISOString().slice(0, 10);
  if (_dismissed[key]) return null;

  // Only trigger at transition points
  const hour = new Date().getHours();
  const min = new Date().getMinutes();

  // Leaving work transition (4:30-5:15pm) — weekdays only
  const isWeekend = [0, 6].includes(new Date().getDay());
  if (!isWeekend && (hour === 16 && min >= 30 || hour === 17 && min <= 15)) {
    // Check if there are incomplete work tasks with urgency
    const urgentWork = [];
    WORK_SECS.forEach(sec => {
      (state[sec] || []).forEach(t => {
        if (t.done) return;
        const u = assessUrgency(t);
        if (u.level === 'critical' || u.level === 'pressing') {
          urgentWork.push(t.text.slice(0, 30));
        }
      });
    });

    if (urgentWork.length) {
      return {
        text: `Work day ending — ${urgentWork.length} pressing task${urgentWork.length > 1 ? 's' : ''} remain.`,
        icon: 'ti-door-exit',
        type: 'transition',
        priority: 25,
        dismissKey: key,
      };
    }

    // Otherwise, check for hearth tasks waiting
    let hearthCount = 0;
    HEARTH_SECS.forEach(sec => {
      hearthCount += (state[sec] || []).filter(t => !t.done).length;
    });
    if (hearthCount > 0) {
      return {
        text: `Work day winding down — ${hearthCount} hearth task${hearthCount > 1 ? 's' : ''} await at home.`,
        icon: 'ti-home',
        type: 'transition',
        priority: 15,
        dismissKey: key,
      };
    }
  }

  // Morning start (8-9am)
  if (hour >= 8 && hour <= 9 && min <= 30) {
    const sworn = state.swornOaths || [];
    if (!sworn.length) {
      return {
        text: 'A new day dawns — scry the tome to set your oaths.',
        icon: 'ti-sunrise',
        type: 'transition',
        priority: 20,
        dismissKey: key,
      };
    }
  }

  // Wind-down (9:30-10:30pm)
  if (hour >= 21 && hour <= 22 && min <= 30) {
    return {
      text: 'The hour grows late — tomorrow\'s burdens can wait. Rest well.',
      icon: 'ti-moon',
      type: 'transition',
      priority: 10,
      dismissKey: key,
    };
  }

  return null;
}

function checkNeglectedLifeTasks() {
  // Find hearth tasks that have been sitting a while
  const neglected = [];
  HEARTH_SECS.forEach(sec => {
    (state[sec] || []).forEach(t => {
      if (t.done || !t.createdAt) return;
      const ageDays = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000);
      if (ageDays >= 5) {
        neglected.push({ task: t, age: ageDays });
      }
    });
  });

  if (!neglected.length) return null;

  // Pick the oldest one
  neglected.sort((a, b) => b.age - a.age);
  const oldest = neglected[0];
  const key = 'neglect-' + oldest.task.id + '-' + new Date().toISOString().slice(0, 10);
  if (_dismissed[key]) return null;

  // Only show during evening hours (when user can act on hearth tasks)
  const hour = new Date().getHours();
  if (hour < 17 || hour > 21) return null;

  return {
    text: `"${oldest.task.text.slice(0, 35)}" has been waiting ${oldest.age} days — still needed?`,
    icon: 'ti-ghost',
    type: 'neglected',
    priority: 12,
    dismissKey: key,
    taskId: oldest.task.id,
  };
}

/* ═══ PICK BEST WHISPER ═══ */
function pickWhisper() {
  const candidates = [
    checkDeadlines(),
    checkUpcomingWards(),
    checkSelfCare(),
    checkTimeTransition(),
    checkNeglectedLifeTasks(),
  ].filter(Boolean);

  if (!candidates.length) return null;

  // Sort by priority
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

/* ═══ DISPLAY WHISPER ═══ */
function showWhisper(whisper) {
  if (_whisperEl) dismissWhisper();

  _lastWhisper = Date.now();

  _whisperEl = document.createElement('div');
  _whisperEl.className = 'whisper-toast';
  _whisperEl.dataset.type = whisper.type;
  _whisperEl.innerHTML = `
    <div class="whisper-glow"></div>
    <div class="whisper-content">
      <i class="ti ${whisper.icon} whisper-icon"></i>
      <span class="whisper-text">${whisper.text}</span>
    </div>
    <div class="whisper-actions">
      <span class="whisper-action whisper-acknowledge" title="Got it"><i class="ti ti-check" style="font-size:11px"></i></span>
      <span class="whisper-action whisper-snooze" title="Remind me later"><i class="ti ti-clock" style="font-size:11px"></i></span>
    </div>
  `;

  document.body.appendChild(_whisperEl);
  requestAnimationFrame(() => _whisperEl.classList.add('visible'));

  // Acknowledge = dismiss permanently for this period
  _whisperEl.querySelector('.whisper-acknowledge').addEventListener('click', () => {
    if (whisper.dismissKey) {
      _dismissed[whisper.dismissKey] = Date.now();
      saveDismissed();
    }
    dismissWhisper();
  });

  // Snooze = dismiss for 30 min
  _whisperEl.querySelector('.whisper-snooze').addEventListener('click', () => {
    _lastWhisper = Date.now() + 10 * 60 * 1000; // extra 10 min cooldown
    dismissWhisper();
  });

  // Auto-dismiss after 20 seconds
  setTimeout(() => dismissWhisper(), 20000);
}

function dismissWhisper() {
  if (!_whisperEl) return;
  _whisperEl.classList.remove('visible');
  const el = _whisperEl;
  _whisperEl = null;
  setTimeout(() => el.remove(), 400);
}

/* ═══ CHECK LOOP ═══ */
function checkWhispers() {
  // Don't interrupt lock-in mode
  if (document.querySelector('.lockin-active')) return;

  // Cooldown
  if (Date.now() - _lastWhisper < WHISPER_COOLDOWN) return;

  // Already showing
  if (_whisperEl) return;

  const whisper = pickWhisper();
  if (whisper) showWhisper(whisper);
}

/* ═══ INIT ═══ */
export function initWhispers() {
  loadDismissed();

  // Initial check after 2 minutes (let user settle in)
  setTimeout(checkWhispers, 2 * 60 * 1000);

  // Then check periodically
  _checkTimer = setInterval(checkWhispers, CHECK_INTERVAL);

  // Also check on visibility change (user returns to tab)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(checkWhispers, 5000); // 5s after returning
    }
  });
}

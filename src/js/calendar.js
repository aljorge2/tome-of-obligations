// src/js/calendar.js — Grimoire Calendar: Auto-Planner
// Time-block layout with 3-day (default) and 7-day views.
// Weekends = Hearthstone only. Tap-to-move editing.
import { esc, formatDuration } from './utils.js';
import { ALL_SECTIONS, SECTION_COLORS, SECTION_NAMES, WORK_SECS, HEARTH_SECS } from './constants.js';
import { state, saveState, getAvgTime, loadTemplates, loadTally } from './state.js';
import { scoreTask } from './scry.js';
import { openDayRite } from './dayrite.js';
import { emit } from './events.js';

/* ═══ CONFIG ═══ */
const WEEKDAY_CAPACITY = 240;  // 4 hours in minutes
const WEEKEND_CAPACITY = 360;  // 6 hours in minutes
const WEEKDAY_MAX = 6;
const WEEKEND_MAX = 8;

/* ═══ VIEW STATE ═══ */
let viewMode = '3day'; // '3day' | '7day'
let viewStartOffset = 0; // days from today
let movingTaskId = null; // task being moved (tap-to-move)
let movingTaskSec = null;

// Persistent overrides: user moved tasks to specific days
// Map of taskId -> dateKey
const PLAN_OVERRIDES_KEY = 'tome_plan_overrides_v1';

function loadOverrides(){
  try { const r = localStorage.getItem(PLAN_OVERRIDES_KEY); if(r) return JSON.parse(r); } catch(e){}
  return {};
}
function saveOverrides(o){
  try { localStorage.setItem(PLAN_OVERRIDES_KEY, JSON.stringify(o)); } catch(e){}
}

// Manual time-estimate overrides: user tapped an estimate to set it
// Map of taskId -> minutes
const EST_OVERRIDES_KEY = 'tome_est_overrides_v1';

function loadEstOverrides(){
  try { const r = localStorage.getItem(EST_OVERRIDES_KEY); if(r) return JSON.parse(r); } catch(e){}
  return {};
}
function saveEstOverrides(o){
  try { localStorage.setItem(EST_OVERRIDES_KEY, JSON.stringify(o)); } catch(e){}
}

// Planning fallacy buffer — applied to auto-estimates only, not manual overrides
const BUFFER_MULT = 1.3;

// Deferred tasks: pushed off the calendar for 3 days (not deleted)
// Map of taskId -> notBeforeDate (ISO date string)
const DEFER_KEY = 'tome_plan_defers_v1';
const DEFER_DAYS = 3;

function loadDefers(){
  try { const r = localStorage.getItem(DEFER_KEY); if(r) return JSON.parse(r); } catch(e){}
  return {};
}
function saveDefers(o){
  try { localStorage.setItem(DEFER_KEY, JSON.stringify(o)); } catch(e){}
}
function deferTask(taskId){
  const defers = loadDefers();
  const notBefore = new Date();
  notBefore.setDate(notBefore.getDate() + DEFER_DAYS);
  defers[taskId] = notBefore.toISOString().slice(0,10);
  saveDefers(defers);
}
function isDeferred(taskId){
  const defers = loadDefers();
  if(!defers[taskId]) return false;
  const today = new Date().toISOString().slice(0,10);
  if(defers[taskId] <= today){
    // Expired — clean up
    delete defers[taskId];
    saveDefers(defers);
    return false;
  }
  return true;
}

/* ═══ HELPERS ═══ */
const DAY_NAMES_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_NAMES_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dateKey(d){ return new Date(d).toISOString().slice(0,10); }
function isToday(d){ return dateKey(d) === dateKey(new Date()); }
function isWeekend(d){ const dow = new Date(d).getDay(); return dow === 0 || dow === 6; }

function dayCapacity(d){ return isWeekend(d) ? WEEKEND_CAPACITY : WEEKDAY_CAPACITY; }
function dayMaxTasks(d){ return isWeekend(d) ? WEEKEND_MAX : WEEKDAY_MAX; }

// Which sections are allowed on a given day
function allowedSections(d){
  return isWeekend(d) ? HEARTH_SECS : ALL_SECTIONS;
}

function estimateMinutes(t){
  // 1. Manual override — user tapped the estimate and set it themselves
  if(t.id != null){
    const estOv = loadEstOverrides();
    if(estOv[t.id] != null) return { mins: estOv[t.id], manual: true };
  }

  // 2. Auto-estimate from history, heuristics, or default
  let raw;
  const avg = getAvgTime(t.text);
  if(avg){ raw = Math.round(avg / 60000); }
  else {
    const cl = t.checklist || [];
    if(cl.length >= 5) raw = 45;
    else if(cl.length >= 2) raw = 25;
    else {
      const text = (t.text || '').toLowerCase();
      if(text.match(/clean|organize|declutter/)) raw = 30;
      else if(text.match(/call|text|email|reply/)) raw = 10;
      else if(text.match(/appointment|meeting|interview/)) raw = 60;
      else if(text.match(/pipeline|analysis|debug|code/)) raw = 45;
      else raw = 20;
    }
  }

  // 3. Apply planning fallacy buffer, round to nearest 5
  const buffered = Math.round((raw * BUFFER_MULT) / 5) * 5;
  return { mins: buffered, manual: false };
}

/* ═══ BUILD PLAN ═══ */
function buildPlan(){
  const now = new Date();
  now.setHours(0,0,0,0);
  const numDays = viewMode === '7day' ? 7 : 3;
  const overrides = loadOverrides();
  const plan = [];

  // Initialize days
  for(let i = 0; i < numDays; i++){
    const d = new Date(now);
    d.setDate(d.getDate() + viewStartOffset + i);
    const cap = dayCapacity(d);
    plan.push({
      date: new Date(d),
      dateKey: dateKey(d),
      dow: d.getDay(),
      isWeekend: isWeekend(d),
      tasks: [],
      wards: [],
      rituals: [],
      minutesUsed: 0,
      capacity: cap,
      maxTasks: dayMaxTasks(d),
      allowed: allowedSections(d),
    });
  }

  const planStartKey = plan[0].dateKey;
  const planEndKey = plan[plan.length - 1].dateKey;

  // 1. Place wards
  (state.wards || []).forEach(w => {
    const wKey = w.datetime.slice(0,10);
    const dayIdx = plan.findIndex(p => p.dateKey === wKey);
    if(dayIdx >= 0){
      plan[dayIdx].wards.push(w);
      plan[dayIdx].minutesUsed += 15;
    }
  });

  // 2. Place rituals
  const templates = loadTemplates();
  templates.templates.forEach(t => {
    for(let i = 0; i < plan.length; i++){
      const d = plan[i];
      // Only show ritual if its target section is allowed on this day
      if(!d.allowed.includes(t.target)) continue;
      let show = false;
      if(t.cadence === 'daily') show = true;
      else if(t.cadence === 'weekly' && d.dow === 1) show = true;
      else if(t.cadence === 'monthly' && d.date.getDate() === 1) show = true;
      if(show){
        d.rituals.push(t);
        d.minutesUsed += estimateMinutes({ text: t.text }).mins;
      }
    }
  });

  // 3. Gather all open tasks (skip deferred ones)
  const allTasks = [];
  ALL_SECTIONS.forEach(sec => {
    (state[sec] || []).forEach(t => {
      if(t.done || t.delegatedTo) return;
      if(isDeferred(t.id)) return;
      const { score, reason } = scoreTask(t);
      const est = estimateMinutes(t);
      allTasks.push({
        ...t,
        sec,
        _score: score,
        _reason: reason,
        _estMins: est.mins,
        _estManual: est.manual,
      });
    });
  });
  allTasks.sort((a, b) => b._score - a._score);

  // 4. Place tasks with overrides first
  const placed = new Set();

  // Handle overrides — user-pinned tasks go to their chosen day
  for(const [taskId, pinnedDate] of Object.entries(overrides)){
    const task = allTasks.find(t => t.id == taskId);
    if(!task) { delete overrides[taskId]; continue; } // task gone, clean up
    const dayIdx = plan.findIndex(p => p.dateKey === pinnedDate);
    if(dayIdx >= 0 && plan[dayIdx].allowed.includes(task.sec)){
      plan[dayIdx].tasks.push({ ...task, _pinned: true });
      plan[dayIdx].minutesUsed += task._estMins;
      placed.add(task.id);
    } else {
      delete overrides[taskId]; // invalid pin, clean up
    }
  }

  // 5. Auto-distribute remaining tasks
  for(const task of allTasks){
    if(placed.has(task.id)) continue;

    for(let di = 0; di < plan.length; di++){
      const day = plan[di];
      // Check section is allowed on this day
      if(!day.allowed.includes(task.sec)) continue;
      if(day.tasks.length >= day.maxTasks) continue;
      if(day.minutesUsed + task._estMins > day.capacity + 20) continue; // 20min grace

      day.tasks.push(task);
      day.minutesUsed += task._estMins;
      placed.add(task.id);
      break;
    }
  }

  const overflow = allTasks.filter(t => !placed.has(t.id));
  saveOverrides(overrides); // persist cleaned overrides
  return { plan, overflow };
}

/* ═══ RENDER ═══ */
export function renderCalendar(opts){
  const { targetId, forceView } = opts || {};
  if(forceView) viewMode = forceView;
  const container = document.getElementById(targetId || 'calendar-body');
  if(!container) return;

  const { plan, overflow } = buildPlan();
  const totalTasks = plan.reduce((s, d) => s + d.tasks.length, 0) + overflow.length;
  const totalPlanned = plan.reduce((s, d) => s + d.tasks.length, 0);
  const numDays = plan.length;

  // ── Header ──
  let html = `<div class="cal-top-bar">
    <div class="cal-prophecy">
      <i class="ti ti-crystal-ball" style="font-size:13px;color:#d4a855;filter:drop-shadow(0 0 4px rgba(212,168,85,0.3))"></i>
      <span class="cal-prophecy-label">The Tome's Prophecy</span>
      <span class="cal-prophecy-count">${totalPlanned} planned${overflow.length ? ` · ${overflow.length} queued` : ''}</span>
    </div>
    <div class="cal-view-toggle">
      <span class="cal-view-btn${viewMode === '3day' ? ' active' : ''}" data-view="3day">3 Day</span>
      <span class="cal-view-btn${viewMode === '7day' ? ' active' : ''}" data-view="7day">7 Day</span>
    </div>
    <div class="cal-nav-row">
      <span class="cal-nav-btn" id="cal-prev"><i class="ti ti-chevron-left" style="font-size:11px"></i></span>
      <span class="cal-nav-btn" id="cal-today-btn">Today</span>
      <span class="cal-nav-btn" id="cal-next"><i class="ti ti-chevron-right" style="font-size:11px"></i></span>
    </div>
  </div>`;

  // ── Moving-task banner ──
  if(movingTaskId){
    const movingTask = findTask(movingTaskId);
    const movingName = movingTask ? movingTask.text : '';
    html += `<div class="cal-move-banner">
      <span>Moving: <strong>${esc(movingName)}</strong> — tap a day to place it</span>
      <span class="cal-move-cancel" id="cal-move-cancel"><i class="ti ti-x" style="font-size:10px"></i> cancel</span>
    </div>`;
  }

  // ── Day columns ──
  html += `<div class="cal-columns cal-cols-${numDays}">`;

  for(let i = 0; i < plan.length; i++){
    const day = plan[i];
    const today = isToday(day.date);
    const dow = day.dow;
    const dayLabel = today ? 'Today'
      : (viewStartOffset + i === 1) ? 'Tomorrow'
      : DAY_NAMES_SHORT[dow];
    const dateLabel = `${MONTH_NAMES[day.date.getMonth()]} ${day.date.getDate()}`;
    const fillPct = Math.min(100, Math.round((day.minutesUsed / day.capacity) * 100));
    const isMovingTarget = movingTaskId !== null;

    html += `<div class="cal-col${today ? ' today' : ''}${day.isWeekend ? ' weekend' : ''}${isMovingTarget ? ' move-target' : ''}" data-col-date="${day.dateKey}">
      <div class="cal-col-header">
        <div class="cal-col-day">${dayLabel}</div>
        <div class="cal-col-date">${dateLabel}</div>
        <div class="cal-col-load-bar"><div class="cal-col-load-fill${fillPct >= 90 ? ' full' : ''}" style="width:${fillPct}%"></div></div>
        <div class="cal-col-capacity">${Math.round(day.minutesUsed)}m / ${day.capacity}m${day.isWeekend ? ' · hearth' : ''}</div>
      </div>
      <div class="cal-col-body">`;

    // Wards
    day.wards.forEach(w => {
      html += `<div class="cal-block ward-block">
        <div class="cal-block-icon"><i class="ti ti-bell" style="font-size:9px"></i></div>
        <div class="cal-block-content">
          <div class="cal-block-text">${esc(w.text)}</div>
          <div class="cal-block-meta">${w.datetime.slice(11,16)}</div>
        </div>
      </div>`;
    });

    // Rituals
    day.rituals.forEach(r => {
      html += `<div class="cal-block ritual-block" style="border-left-color:${SECTION_COLORS[r.target]||'#888'}">
        <div class="cal-block-icon"><i class="ti ti-repeat" style="font-size:9px"></i></div>
        <div class="cal-block-content">
          <div class="cal-block-text">${esc(r.text)}</div>
          <div class="cal-block-meta">${r.cadence}</div>
        </div>
      </div>`;
    });

    // Task time blocks — sized by estimated duration
    day.tasks.forEach(t => {
      const color = SECTION_COLORS[t.sec] || '#888';
      const secName = SECTION_NAMES[t.sec] || t.sec;
      const cl = t.checklist || [];
      const clDone = cl.filter(c => c.done).length;
      const clStr = cl.length ? ` · ${clDone}/${cl.length}` : '';
      // Height based on estimated time: min 36px, scale 1px per minute, max 120px
      const blockHeight = Math.max(36, Math.min(120, t._estMins * 1.2));
      const isBeingMoved = t.id == movingTaskId;

      html += `<div class="cal-block task-block${t._pinned ? ' pinned' : ''}${isBeingMoved ? ' moving' : ''}" style="border-left-color:${color};min-height:${blockHeight}px" data-task-id="${t.id}" data-task-sec="${t.sec}" data-current-date="${day.dateKey}">
        <div class="cal-block-content">
          <div class="cal-block-text">${esc(t.text)}</div>
          <div class="cal-block-meta">
            <span style="color:${color}">${secName}</span> ·
            <span class="cal-est-tap${t._estManual ? ' manual' : ''}" data-est-id="${t.id}" title="Tap to change estimate">${t._estManual ? '' : '~'}${t._estMins}m</span>${clStr}
            ${t._pinned ? ' · <i class="ti ti-pin" style="font-size:8px"></i>' : ''}
          </div>
          <div class="cal-block-reason">${t._reason}</div>
        </div>
        <div class="cal-block-actions">
          <span class="cal-move-btn" data-move-id="${t.id}" data-move-sec="${t.sec}" title="Move to another day"><i class="ti ti-arrows-move" style="font-size:10px"></i></span>
          <span class="cal-defer-btn" data-defer-id="${t.id}" title="Not now — revisit in 3 days"><i class="ti ti-clock-pause" style="font-size:10px"></i></span>
          ${t._pinned ? `<span class="cal-unpin-btn" data-unpin-id="${t.id}" title="Unpin — let the tome decide"><i class="ti ti-pin-off" style="font-size:10px"></i></span>` : ''}
        </div>
      </div>`;
    });

    // Empty state
    if(!day.tasks.length && !day.wards.length && !day.rituals.length){
      html += `<div class="cal-col-empty">${day.isWeekend ? 'a day of rest' : 'clear skies'}</div>`;
    }

    html += `</div></div>`; // end col-body, col
  }
  html += `</div>`; // end cal-columns

  // ── Overflow ──
  if(overflow.length){
    html += `<div class="cal-overflow">
      <div class="cal-overflow-title"><i class="ti ti-hourglass" style="font-size:10px"></i> Beyond the Horizon <span class="cal-overflow-count">${overflow.length}</span></div>
      <div class="cal-overflow-list">
        ${overflow.slice(0, 6).map(t => `<div class="cal-overflow-item">
          <div class="cal-block-dot" style="background:${SECTION_COLORS[t.sec]||'#888'}"></div>
          <span class="cal-overflow-text">${esc(t.text)}</span>
          <span class="cal-overflow-meta">${SECTION_NAMES[t.sec]||t.sec} · ~${t._estMins}m</span>
        </div>`).join('')}
        ${overflow.length > 6 ? `<div class="cal-overflow-more">+${overflow.length - 6} more waiting</div>` : ''}
      </div>
    </div>`;
  }

  // ── Reassurance ──
  const reassurances = [
    "You don't have to do it all today. The tome knows the way.",
    "One task at a time. The prophecy shifts as you work.",
    "This isn't a deadline — it's a suggestion from a friendly grimoire.",
    "The plan adapts. Finish what you can; the rest will wait.",
    "You've got this. The tome has spoken.",
  ];
  const reassIdx = Math.floor(Date.now() / 3600000) % reassurances.length;
  html += `<div class="cal-reassurance">${reassurances[reassIdx]}</div>`;

  container.innerHTML = html;
  attachHandlers(container);
}

/* ═══ FIND TASK ═══ */
function findTask(taskId){
  for(const sec of ALL_SECTIONS){
    const t = (state[sec]||[]).find(t => t.id == taskId);
    if(t) return t;
  }
  return null;
}

/* ═══ HANDLERS ═══ */
function attachHandlers(container){
  // View toggle
  container.querySelectorAll('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.view;
      viewStartOffset = 0;
      renderCalendar();
    });
  });

  // Nav
  const numDays = viewMode === '7day' ? 7 : 3;
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  const todayBtn = document.getElementById('cal-today-btn');
  if(prevBtn) prevBtn.addEventListener('click', () => { viewStartOffset -= numDays; renderCalendar(); });
  if(nextBtn) nextBtn.addEventListener('click', () => { viewStartOffset += numDays; renderCalendar(); });
  if(todayBtn) todayBtn.addEventListener('click', () => { viewStartOffset = 0; renderCalendar(); });

  // Day column header click → open Day's Rite (only when not moving)
  if(movingTaskId === null){
    container.querySelectorAll('.cal-col-header').forEach(hdr => {
      hdr.style.cursor = 'pointer';
      hdr.addEventListener('click', () => {
        const col = hdr.closest('.cal-col');
        if(!col) return;
        const d = col.dataset.colDate;
        if(d) openDayRite(d);
      });
    });
  }

  // Move buttons
  container.querySelectorAll('.cal-move-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      movingTaskId = parseInt(btn.dataset.moveId);
      movingTaskSec = btn.dataset.moveSec;
      renderCalendar();
    });
  });

  // Defer buttons — push task off calendar for 3 days
  container.querySelectorAll('.cal-defer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deferId;
      deferTask(id);
      // Also clear any pin override since the task is leaving the calendar
      const overrides = loadOverrides();
      delete overrides[id];
      saveOverrides(overrides);
      renderCalendar();
    });
  });

  // Unpin buttons
  container.querySelectorAll('.cal-unpin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.unpinId;
      const overrides = loadOverrides();
      delete overrides[id];
      saveOverrides(overrides);
      renderCalendar();
    });
  });

  // Cancel move
  const cancelBtn = document.getElementById('cal-move-cancel');
  if(cancelBtn){
    cancelBtn.addEventListener('click', () => {
      movingTaskId = null;
      movingTaskSec = null;
      renderCalendar();
    });
  }

  // Estimate tap — open picker
  container.querySelectorAll('.cal-est-tap').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close any open picker first
      container.querySelectorAll('.cal-est-picker').forEach(p => p.remove());

      const taskId = el.dataset.estId;
      const picker = document.createElement('div');
      picker.className = 'cal-est-picker';
      const options = [10, 15, 20, 30, 45, 60, 90, 120, 180];
      options.forEach(mins => {
        const label = mins >= 60 ? `${mins/60}h` : `${mins}m`;
        const opt = document.createElement('span');
        opt.className = 'cal-est-option';
        opt.textContent = label;
        opt.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const overrides = loadEstOverrides();
          overrides[taskId] = mins;
          saveEstOverrides(overrides);
          renderCalendar();
        });
        picker.appendChild(opt);
      });
      // "Auto" option to clear manual override
      const autoOpt = document.createElement('span');
      autoOpt.className = 'cal-est-option cal-est-auto';
      autoOpt.textContent = 'auto';
      autoOpt.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const overrides = loadEstOverrides();
        delete overrides[taskId];
        saveEstOverrides(overrides);
        renderCalendar();
      });
      picker.appendChild(autoOpt);

      el.parentElement.appendChild(picker);

      // Close picker on outside click
      const closeHandler = (ev) => {
        if(!picker.contains(ev.target) && ev.target !== el){
          picker.remove();
          document.removeEventListener('click', closeHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 0);
    });
  });

  // Column click — place moving task
  if(movingTaskId !== null){
    // Prevent clicks on task blocks from bubbling to column during move mode
    container.querySelectorAll('.cal-block').forEach(block => {
      block.addEventListener('click', (e) => { e.stopPropagation(); });
    });

    container.querySelectorAll('.cal-col').forEach(col => {
      col.addEventListener('click', () => {
        const targetDate = col.dataset.colDate;
        if(!targetDate || !movingTaskId) return;

        // Don't "move" to the same day — that's a no-op
        const currentBlock = container.querySelector(`.cal-block[data-task-id="${movingTaskId}"]`);
        if(currentBlock && currentBlock.dataset.currentDate === targetDate) return;

        // Check if the task's section is allowed on this day
        const allowed = allowedSections(new Date(targetDate + 'T00:00:00'));
        if(!allowed.includes(movingTaskSec)){
          col.classList.add('reject');
          setTimeout(() => col.classList.remove('reject'), 600);
          return;
        }

        const overrides = loadOverrides();
        overrides[movingTaskId] = targetDate;
        saveOverrides(overrides);
        movingTaskId = null;
        movingTaskSec = null;
        renderCalendar();
      });
    });
  }
}

export function initCalendar(){
  renderCalendar();
}

// src/js/dayrite.js — "The Day's Rite" — daily planning view
// Two modes: prioritized list (default) and visual timeline.
// Meetings create real wards. Tasks sync completion both ways.
import { esc, uid, formatDuration } from './utils.js';
import { ALL_SECTIONS, SECTION_COLORS, SECTION_NAMES, HEARTH_SECS } from './constants.js';
import { state, saveState, getAvgTime, recordCompletion } from './state.js';
import { scoreTask } from './scry.js';
import { renderSection } from './tasks.js';
import { updateFocusPanel, updateBurdenBars, updateTabBadges } from './focus.js';
import { renderWards } from './wards.js';
import { emit } from './events.js';
import { getEnergyForReorder } from './energy.js';
import { assessUrgency, weightedScore, getTimeContext } from './urgency.js';

// Lazy reference to avoid circular dependency with calendar.js
let _renderCalendar = null;
export function setRenderCalendar(fn){ _renderCalendar = fn; }

/* ═══ CONFIG ═══ */
const WEEKDAY_CAPACITY = 240;
const WEEKEND_CAPACITY = 360;
const BUFFER_MULT = 1.3;

/* ═══ STATE ═══ */
let riteDate = null;       // Date object for the day being planned
let riteView = 'list';     // 'list' | 'timeline'
let riteOrder = [];        // array of taskIds — user's custom ordering
let dragSrcIdx = null;     // drag-reorder tracking

const RITE_ORDER_KEY = 'tome_rite_order_v1';
const EST_OVERRIDES_KEY = 'tome_est_overrides_v1';

function loadRiteOrders(){
  try { const r = localStorage.getItem(RITE_ORDER_KEY); if(r) return JSON.parse(r); } catch(e){}
  return {};
}
function saveRiteOrders(o){
  try { localStorage.setItem(RITE_ORDER_KEY, JSON.stringify(o)); } catch(e){}
}
function loadEstOverrides(){
  try { const r = localStorage.getItem(EST_OVERRIDES_KEY); if(r) return JSON.parse(r); } catch(e){}
  return {};
}

const RITE_EXCLUDED_KEY = 'tome_rite_excluded_v1';
function loadExcluded(){
  try { const r = localStorage.getItem(RITE_EXCLUDED_KEY); if(r) return JSON.parse(r); } catch(e){}
  return {};
}
function saveExcluded(e){
  try { localStorage.setItem(RITE_EXCLUDED_KEY, JSON.stringify(e)); } catch(ex){}
}

// Calendar plan overrides — task pinned to specific dates
const PLAN_OVERRIDES_KEY = 'tome_plan_overrides_v1';
function loadPlanOverrides(){
  try { const r = localStorage.getItem(PLAN_OVERRIDES_KEY); if(r) return JSON.parse(r); } catch(e){}
  return {};
}

// Calendar defer data
const DEFER_KEY = 'tome_plan_defers_v1';
function loadDefers(){
  try { const r = localStorage.getItem(DEFER_KEY); if(r) return JSON.parse(r); } catch(e){}
  return {};
}

/* ═══ HELPERS ═══ */
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dateKey(d){ return new Date(d).toISOString().slice(0,10); }
function isToday(d){ return dateKey(d) === dateKey(new Date()); }
function isWeekend(d){ const dow = new Date(d).getDay(); return dow === 0 || dow === 6; }
function dayCapacity(d){ return isWeekend(d) ? WEEKEND_CAPACITY : WEEKDAY_CAPACITY; }

function allowedSections(d){
  // Weekends: hearth only — no work tasks unless explicitly pinned/placed
  // Weekdays: all sections with time-of-day weighting
  return isWeekend(d) ? HEARTH_SECS : ALL_SECTIONS;
}

function estimateMinutes(t){
  // Manual override
  if(t.id != null){
    const estOv = loadEstOverrides();
    if(estOv[t.id] != null) return { mins: estOv[t.id], manual: true };
  }
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
  const buffered = Math.round((raw * BUFFER_MULT) / 5) * 5;
  return { mins: buffered, manual: false };
}

/* ═══ GATHER DAY DATA ═══ */
function gatherDayData(){
  const dk = dateKey(riteDate);
  const capacity = dayCapacity(riteDate);
  const allowed = allowedSections(riteDate);

  // Wards (meetings) for this day
  const wards = (state.wards || []).filter(w => w.datetime && w.datetime.slice(0,10) === dk);
  // Calculate meeting minutes from ward times
  let meetingMins = 0;
  wards.forEach(w => {
    if(w.endTime){
      // Has end time — calculate duration
      const start = new Date(w.datetime);
      const end = new Date(dk + 'T' + w.endTime);
      meetingMins += Math.max(0, Math.round((end - start) / 60000));
    } else {
      meetingMins += 30; // default ward time
    }
  });

  // Available capacity after meetings
  const availableMins = Math.max(0, capacity - meetingMins);

  // Gather tasks for this day from all allowed sections
  // Respect calendar plan overrides (tasks pinned to specific dates)
  const excluded = loadExcluded();
  const dayExcluded = new Set(excluded[dk] || []);
  const planOverrides = loadPlanOverrides();
  const defers = loadDefers();
  const allTasks = [];
  const seenIds = new Set();
  allowed.forEach(sec => {
    (state[sec] || []).forEach(t => {
      if(t.done || t.delegatedTo) return;
      const tid = String(t.id);
      // If task is pinned to a DIFFERENT date, skip it for this day
      if(planOverrides[tid] && planOverrides[tid] !== dk) return;
      // If task is deferred past this date, skip it
      if(defers[tid] && defers[tid] > dk) return;
      const { score, reason } = scoreTask(t);
      const est = estimateMinutes(t);
      // Boost score if explicitly pinned to this day
      const pinBoost = planOverrides[tid] === dk ? 50 : 0;
      allTasks.push({
        ...t, sec,
        _score: score + pinBoost, _reason: planOverrides[tid] === dk ? 'pinned to today' : reason,
        _estMins: est.mins, _estManual: est.manual,
        _excluded: dayExcluded.has(t.id),
        _pinned: planOverrides[tid] === dk,
      });
      seenIds.add(tid);
    });
  });

  // On weekends: also include work tasks that were explicitly pinned or
  // manually ordered into this day (user placed them here intentionally)
  if(isWeekend(riteDate)){
    const savedOrders0 = loadRiteOrders();
    const manualIds = new Set(savedOrders0[dk] || []);
    WORK_SECS.forEach(sec => {
      (state[sec] || []).forEach(t => {
        if(t.done || t.delegatedTo) return;
        const tid = String(t.id);
        if(seenIds.has(tid)) return;
        const isPinned = planOverrides[tid] === dk;
        const isManual = manualIds.has(t.id);
        if(!isPinned && !isManual) return; // skip — user didn't place it here
        const { score, reason } = scoreTask(t);
        const est = estimateMinutes(t);
        allTasks.push({
          ...t, sec,
          _score: score + 50, _reason: isPinned ? 'pinned to today' : 'you placed this here',
          _estMins: est.mins, _estManual: est.manual,
          _excluded: dayExcluded.has(t.id),
          _pinned: isPinned,
        });
        seenIds.add(tid);
      });
    });
  }

  // Check for saved ordering for this day
  const savedOrders = loadRiteOrders();
  const savedOrder = savedOrders[dk] || [];

  // Sort: saved order first, then by score
  if(savedOrder.length){
    allTasks.sort((a, b) => {
      const ai = savedOrder.indexOf(a.id);
      const bi = savedOrder.indexOf(b.id);
      if(ai >= 0 && bi >= 0) return ai - bi;
      if(ai >= 0) return -1;
      if(bi >= 0) return 1;
      return b._score - a._score;
    });
  } else {
    // Energy-aware sorting when no manual order is set
    const energy = getEnergyForReorder();
    if(energy === 'low'){
      // Low energy: quick wins first (short tasks, then by score)
      allTasks.sort((a, b) => {
        const aDiff = a._estMins - b._estMins;
        if(Math.abs(aDiff) > 10) return aDiff; // significantly shorter first
        return b._score - a._score;
      });
    } else if(energy === 'high'){
      // High energy: hardest/highest-score first
      allTasks.sort((a, b) => b._score - a._score);
    } else {
      // Medium: normal score-based ordering
      allTasks.sort((a, b) => b._score - a._score);
    }
  }

  // Figure out what fits — respect exclusions and manual additions
  let usedMins = 0;
  const fittingTasks = [];
  const overflowTasks = [];

  // Tasks in savedOrder are always included (manually added)
  const inOrder = new Set(savedOrder);

  for(const t of allTasks){
    if(t._excluded){
      overflowTasks.push(t);
    } else if(inOrder.has(t.id) || t._pinned){
      // Manually arranged or calendar-pinned — always include regardless of capacity
      fittingTasks.push(t);
      usedMins += t._estMins;
    } else if(usedMins + t._estMins <= availableMins + 15){ // 15min grace
      fittingTasks.push(t);
      usedMins += t._estMins;
    } else {
      overflowTasks.push(t);
    }
  }

  return {
    dk, capacity, meetingMins, availableMins,
    usedMins: usedMins + meetingMins,
    wards, fittingTasks, overflowTasks,
  };
}

/* ═══ RENDER ═══ */
export function renderDayRite(){
  const container = document.getElementById('dayrite-body');
  if(!container) return;
  if(!riteDate) riteDate = new Date();

  const data = gatherDayData();
  const today = isToday(riteDate);
  const dayName = today ? 'Today' : DAY_NAMES[riteDate.getDay()];
  const dateLabel = `${MONTH_NAMES[riteDate.getMonth()]} ${riteDate.getDate()}`;
  const fillPct = Math.min(100, Math.round((data.usedMins / data.capacity) * 100));
  const isOver = data.usedMins > data.capacity;

  let html = '';

  // ── Header ──
  html += `<div class="rite-header">
    <div class="rite-title-row">
      <i class="ti ti-sun" style="font-size:16px;color:#d4a855;filter:drop-shadow(0 0 6px rgba(212,168,85,0.3))"></i>
      <span class="rite-title">The Day's Rite</span>
    </div>
    <div class="rite-date-row">
      <span class="rite-nav-btn" id="rite-prev"><i class="ti ti-chevron-left" style="font-size:10px"></i></span>
      <span class="rite-date-label">${dayName}, ${dateLabel}</span>
      <span class="rite-nav-btn" id="rite-next"><i class="ti ti-chevron-right" style="font-size:10px"></i></span>
      ${!today ? '<span class="rite-nav-btn" id="rite-today">Today</span>' : ''}
    </div>
  </div>`;

  // ── Capacity bar ──
  html += `<div class="rite-capacity">
    <div class="rite-capacity-bar">
      <div class="rite-capacity-fill${isOver ? ' over' : ''}${fillPct >= 85 ? ' high' : ''}" style="width:${fillPct}%"></div>
    </div>
    <div class="rite-capacity-text">
      <span>${data.usedMins}m used</span>
      <span>${data.capacity}m capacity</span>
      <span>${Math.max(0, data.availableMins - (data.usedMins - data.meetingMins))}m free</span>
    </div>
    ${isOver ? '<div class="rite-over-warning">Your day is overfull — consider deferring some tasks</div>' : ''}
  </div>`;

  // ── View toggle ──
  html += `<div class="rite-view-toggle">
    <span class="rite-view-btn${riteView === 'list' ? ' active' : ''}" data-view="list"><i class="ti ti-list" style="font-size:10px"></i> List</span>
    <span class="rite-view-btn${riteView === 'timeline' ? ' active' : ''}" data-view="timeline"><i class="ti ti-clock" style="font-size:10px"></i> Timeline</span>
  </div>`;

  // ── Add Meeting ──
  html += `<div class="rite-add-meeting">
    <div class="rite-meeting-label"><i class="ti ti-calendar-event" style="font-size:9px"></i> Add Audience</div>
    <div class="rite-meeting-inputs">
      <input type="text" id="rite-meeting-name" class="rite-input" placeholder="Meeting name...">
      <input type="time" id="rite-meeting-start" class="rite-input rite-time-input">
      <span class="rite-quick-dur" data-dur="30" title="30 minutes">30m</span>
      <span class="rite-quick-dur" data-dur="60" title="60 minutes">60m</span>
      <span class="rite-meeting-to">or</span>
      <input type="time" id="rite-meeting-end" class="rite-input rite-time-input" placeholder="end">
      <span class="rite-meeting-add-btn" id="rite-add-meeting-btn"><i class="ti ti-plus" style="font-size:10px"></i></span>
    </div>
  </div>`;

  // ── Meetings / Wards for this day ──
  if(data.wards.length){
    html += `<div class="rite-meetings">`;
    data.wards.forEach(w => {
      const startTime = w.datetime.slice(11,16);
      const endTime = w.endTime || '';
      const timeStr = endTime ? `${startTime} — ${endTime}` : startTime;
      html += `<div class="rite-meeting-block">
        <i class="ti ti-bell" style="font-size:9px;color:#d4a855"></i>
        <span class="rite-meeting-text">${esc(w.text)}</span>
        <span class="rite-meeting-time">${timeStr}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // ── List View ──
  if(riteView === 'list'){
    html += `<div class="rite-task-list" id="rite-task-list">`;

    if(data.fittingTasks.length){
      data.fittingTasks.forEach((t, idx) => {
        const color = SECTION_COLORS[t.sec] || '#888';
        const secName = SECTION_NAMES[t.sec] || t.sec;
        const cl = t.checklist || [];
        const clDone = cl.filter(c => c.done).length;
        const clStr = cl.length ? ` · ${clDone}/${cl.length}` : '';

        html += `<div class="rite-task${t.done ? ' completed' : ''}" data-task-id="${t.id}" data-task-sec="${t.sec}" data-idx="${idx}" draggable="true">
          <div class="rite-task-seq">${idx + 1}</div>
          <div class="rite-task-dot" style="background:${color}"></div>
          <div class="rite-task-body">
            <div class="rite-task-text">${esc(t.text)}</div>
            <div class="rite-task-meta">
              <span style="color:${color}">${secName}</span> ·
              <span class="rite-task-est">${t._estManual ? '' : '~'}${t._estMins}m</span>${clStr}
            </div>
            <div class="rite-task-reason">${t._reason}</div>
          </div>
          <div class="rite-task-actions">
            <span class="rite-remove-btn" data-remove-id="${t.id}" title="Remove from today"><i class="ti ti-x" style="font-size:10px"></i></span>
            <span class="rite-check-btn" data-check-id="${t.id}" data-check-sec="${t.sec}" title="Seal this task"><i class="ti ti-check" style="font-size:11px"></i></span>
          </div>
        </div>`;
      });
    } else {
      html += `<div class="rite-empty">No tasks to plan — the day is yours</div>`;
    }
    html += `</div>`;

    // Overflow
    if(data.overflowTasks.length){
      html += `<div class="rite-overflow">
        <div class="rite-overflow-title"><i class="ti ti-hourglass" style="font-size:9px"></i> Won't fit today <span class="rite-overflow-count">${data.overflowTasks.length}</span></div>
        <div class="rite-overflow-list">`;
      data.overflowTasks.slice(0, 8).forEach(t => {
        const color = SECTION_COLORS[t.sec] || '#888';
        html += `<div class="rite-overflow-item">
          <span class="rite-add-btn" data-add-id="${t.id}" title="Add to today"><i class="ti ti-plus" style="font-size:9px"></i></span>
          <div class="rite-task-dot" style="background:${color}"></div>
          <span class="rite-overflow-text">${esc(t.text)}</span>
          <span class="rite-overflow-est">~${t._estMins}m</span>
        </div>`;
      });
      if(data.overflowTasks.length > 5){
        html += `<div class="rite-overflow-more">+${data.overflowTasks.length - 5} more</div>`;
      }
      html += `</div></div>`;
    }
  }

  // ── Timeline View ──
  if(riteView === 'timeline'){
    html += renderTimeline(data);
  }

  // ── Reassurance ──
  const reassurances = [
    "One rite at a time. The tome guides your hand.",
    "This is your day. The plan bends to you.",
    "Not all tasks must be conquered — some can wait.",
    "The rite is set. Begin when you're ready.",
  ];
  const reassIdx = Math.floor(Date.now() / 7200000) % reassurances.length;
  html += `<div class="rite-reassurance">${reassurances[reassIdx]}</div>`;

  container.innerHTML = html;
  attachRiteHandlers(container, data);
}

/* ═══ TIMELINE RENDER ═══ */
function renderTimeline(data){
  // Build hour slots: start at 9am, but skip to current hour if today and past 9am
  const DAY_START = 9;
  const endHour = 22;
  let startHour = DAY_START;
  if(isToday(riteDate)){
    const nowHour = new Date().getHours();
    if(nowHour > DAY_START) startHour = nowHour;
  }
  let html = `<div class="rite-timeline">`;

  // Place meetings first as fixed blocks
  const placed = []; // { startMin, endMin, type, content }

  data.wards.forEach(w => {
    const startTime = w.datetime.slice(11,16);
    const [sh, sm] = startTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    let endMin = startMin + 30;
    if(w.endTime){
      const [eh, em] = w.endTime.split(':').map(Number);
      endMin = eh * 60 + em;
    }
    placed.push({
      startMin, endMin, type: 'meeting',
      html: `<div class="tl-block tl-meeting">
        <i class="ti ti-bell" style="font-size:8px"></i>
        <span>${esc(w.text)}</span>
        <span class="tl-block-time">${startTime}${w.endTime ? ' — ' + w.endTime : ''}</span>
      </div>`
    });
  });

  // Sort meetings by start time
  placed.sort((a, b) => a.startMin - b.startMin);

  // Place tasks in gaps between meetings — start from current time if today
  let cursor = startHour * 60;
  if(isToday(riteDate)){
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    if(nowMins > cursor) cursor = nowMins;
  }
  const taskBlocks = [];

  data.fittingTasks.forEach((t, idx) => {
    // Find next available slot (skip over meetings)
    for(const m of placed){
      if(cursor >= m.startMin && cursor < m.endMin){
        cursor = m.endMin;
      }
    }
    const color = SECTION_COLORS[t.sec] || '#888';
    taskBlocks.push({
      startMin: cursor,
      endMin: cursor + t._estMins,
      type: 'task',
      html: `<div class="tl-block tl-task tl-task-draggable" style="border-left-color:${color}" draggable="true" data-tl-idx="${idx}" data-task-id="${t.id}">
        <span class="tl-drag-handle"><i class="ti ti-grip-vertical" style="font-size:10px;opacity:0.4"></i></span>
        <span class="tl-block-text">${esc(t.text)}</span>
        <span class="tl-block-time">~${t._estMins}m</span>
      </div>`
    });
    cursor += t._estMins;
  });

  // Merge and sort all blocks
  const allBlocks = [...placed, ...taskBlocks].sort((a, b) => a.startMin - b.startMin);

  // Render hour grid with blocks
  for(let h = startHour; h < endHour; h++){
    const hourMin = h * 60;
    const hourLabel = h <= 12 ? `${h}${h < 12 ? 'am' : 'pm'}` : `${h-12}pm`;
    const blocksInHour = allBlocks.filter(b =>
      b.startMin >= hourMin && b.startMin < hourMin + 60
    );

    html += `<div class="tl-hour">
      <div class="tl-hour-label">${hourLabel}</div>
      <div class="tl-hour-content">`;

    if(blocksInHour.length){
      blocksInHour.forEach(b => { html += b.html; });
    }

    html += `</div></div>`;
  }

  html += `</div>`;
  return html;
}

/* ═══ HANDLERS ═══ */
function attachRiteHandlers(container, data){
  // View toggle
  container.querySelectorAll('.rite-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      riteView = btn.dataset.view;
      renderDayRite();
    });
  });

  // Date nav
  const prevBtn = document.getElementById('rite-prev');
  const nextBtn = document.getElementById('rite-next');
  const todayBtn = document.getElementById('rite-today');
  if(prevBtn) prevBtn.addEventListener('click', () => {
    riteDate.setDate(riteDate.getDate() - 1);
    renderDayRite();
  });
  if(nextBtn) nextBtn.addEventListener('click', () => {
    riteDate.setDate(riteDate.getDate() + 1);
    renderDayRite();
  });
  if(todayBtn) todayBtn.addEventListener('click', () => {
    riteDate = new Date();
    renderDayRite();
  });

  // Quick duration buttons (30m, 60m) — auto-fill end time from start
  container.querySelectorAll('.rite-quick-dur').forEach(btn => {
    btn.addEventListener('click', () => {
      const startInput = document.getElementById('rite-meeting-start');
      const endInput = document.getElementById('rite-meeting-end');
      const dur = parseInt(btn.dataset.dur);
      let startVal = startInput.value;
      // If no start time set, default to next round hour
      if(!startVal){
        const now = new Date();
        const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0);
        startVal = nextHour.toTimeString().slice(0,5);
        startInput.value = startVal;
      }
      // Calculate end time
      const [h, m] = startVal.split(':').map(Number);
      const endMins = h * 60 + m + dur;
      const endH = Math.floor(endMins / 60) % 24;
      const endM = endMins % 60;
      endInput.value = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`;
      // Visual feedback
      container.querySelectorAll('.rite-quick-dur').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Add meeting
  const addMeetingBtn = document.getElementById('rite-add-meeting-btn');
  if(addMeetingBtn){
    addMeetingBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('rite-meeting-name');
      const startInput = document.getElementById('rite-meeting-start');
      const endInput = document.getElementById('rite-meeting-end');
      const name = nameInput.value.trim();
      const startTime = startInput.value;
      const endTime = endInput.value;
      if(!name || !startTime) return;

      // Create a real ward
      const dk = dateKey(riteDate);
      const ward = {
        id: uid(),
        text: name,
        datetime: dk + 'T' + startTime,
        endTime: endTime || null,
        page: 'work',
        notified: false,
      };
      state.wards.push(ward);
      saveState();

      // Clear inputs
      nameInput.value = '';
      startInput.value = '';
      endInput.value = '';

      renderDayRite();
      renderWards();
      if(_renderCalendar) _renderCalendar();
    });
  }

  // Check/complete task
  container.querySelectorAll('.rite-check-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = parseInt(btn.dataset.checkId);
      const sec = btn.dataset.checkSec;
      const taskObj = (state[sec] || []).find(t => t.id === taskId);
      if(!taskObj || taskObj.done) return;

      // Mark done
      taskObj.done = true;
      taskObj.completedAt = new Date().toISOString();
      saveState();
      recordCompletion();

      // Animate fade-out
      const taskEl = btn.closest('.rite-task');
      if(taskEl){
        taskEl.classList.add('sealing');
        setTimeout(() => {
          renderDayRite();
          renderSection(sec);
          updateFocusPanel();
          updateBurdenBars();
          updateTabBadges();
        }, 800);
      }
    });
  });

  // Remove task from day (push to excluded list)
  container.querySelectorAll('.rite-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = parseInt(btn.dataset.removeId);
      const dk = dateKey(riteDate);
      // Add to excluded list for this day
      const excluded = loadExcluded();
      if(!excluded[dk]) excluded[dk] = [];
      if(!excluded[dk].includes(taskId)) excluded[dk].push(taskId);
      saveExcluded(excluded);
      // Also remove from saved order
      const orders = loadRiteOrders();
      if(orders[dk]) orders[dk] = orders[dk].filter(id => id !== taskId);
      saveRiteOrders(orders);
      renderDayRite();
    });
  });

  // Add task from overflow to day (remove from excluded, add to order)
  container.querySelectorAll('.rite-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = parseInt(btn.dataset.addId);
      const dk = dateKey(riteDate);
      // Remove from excluded
      const excluded = loadExcluded();
      if(excluded[dk]) excluded[dk] = excluded[dk].filter(id => id !== taskId);
      saveExcluded(excluded);
      // Add to saved order (at end)
      const orders = loadRiteOrders();
      if(!orders[dk]) orders[dk] = data.fittingTasks.map(t => t.id);
      orders[dk].push(taskId);
      saveRiteOrders(orders);
      renderDayRite();
    });
  });

  // Drag reorder (list view)
  const taskList = document.getElementById('rite-task-list');
  if(taskList){
    taskList.querySelectorAll('.rite-task[draggable]').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        dragSrcIdx = parseInt(el.dataset.idx);
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        dragSrcIdx = null;
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const dropIdx = parseInt(el.dataset.idx);
        if(dragSrcIdx === null || dragSrcIdx === dropIdx) return;

        // Reorder the fitting tasks
        const dk = dateKey(riteDate);
        const data = gatherDayData();
        const ids = data.fittingTasks.map(t => t.id);

        // Move dragSrcIdx to dropIdx
        const [moved] = ids.splice(dragSrcIdx, 1);
        ids.splice(dropIdx, 0, moved);

        // Save custom order
        const orders = loadRiteOrders();
        orders[dk] = ids;
        saveRiteOrders(orders);

        renderDayRite();
      });
    });
  }

  // Timeline view: drag-to-reorder tasks
  const timelineEl = container.querySelector('.rite-timeline');
  if(timelineEl){
    timelineEl.querySelectorAll('.tl-task-draggable').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        dragSrcIdx = parseInt(el.dataset.tlIdx);
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        dragSrcIdx = null;
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const dropIdx = parseInt(el.dataset.tlIdx);
        if(dragSrcIdx === null || dragSrcIdx === dropIdx) return;

        // Reorder using same order system as list view
        const dk = dateKey(riteDate);
        const freshData = gatherDayData();
        const ids = freshData.fittingTasks.map(t => t.id);

        const [moved] = ids.splice(dragSrcIdx, 1);
        ids.splice(dropIdx, 0, moved);

        const orders = loadRiteOrders();
        orders[dk] = ids;
        saveRiteOrders(orders);

        renderDayRite();
      });
    });
  }
}

/* ═══ PUBLIC: open Day's Rite for a specific date ═══ */
export function openDayRite(date){
  riteDate = new Date(date);
  // Switch to the dayrite tab
  const { switchPage } = require_switchPage();
  switchPage('dayrite');
  renderDayRite();
}

// Lazy import to avoid circular dependency
let _switchPage = null;
function require_switchPage(){
  if(!_switchPage){
    // Will be set by initDayRite
  }
  return { switchPage: _switchPage || (() => {}) };
}

export function setSwitchPage(fn){ _switchPage = fn; }

/* ═══ INIT ═══ */
export function initDayRite(){
  riteDate = new Date();
  renderDayRite();
}

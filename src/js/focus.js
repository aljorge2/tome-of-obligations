// src/js/focus.js — Focus panel and lock-in mode
import { esc, formatDuration } from './utils.js';
import { ALL_SECTIONS, SECTION_COLORS, SECTION_NAMES, WORK_SECS, HEARTH_SECS } from './constants.js';
import {
  state, saveState, recordCompletion, logTaskTime,
  lockedInTaskId, setLockedInTaskId,
  lockinStartTime, setLockinStartTime,
  lockinTimerInterval, setLockinTimerInterval,
  focusPeekMode, setFocusPeekMode,
  pomodoroPhase, setPomodoroPhase, pomodoroPhaseStart, setPomodoroPhaseStart,
  pomodoroWorkMs, pomodoroBreakMs, setPomodoroWorkMs, setPomodoroBreakMs,
  pomodoroCount, setPomodoroCount,
  pomodoroEnabled, setPomodoroEnabled,
  bodyDoublingEnabled, setBodyDoublingEnabled
} from './state.js';
import { miniSparkBurst, spellSealBurst, pomodoroBurst } from './canvas/index.js';
import { on } from './events.js';
import { renderSection, checkSectionCleared } from './tasks.js';
import { generateRecommendations, scoreTask } from './scry.js';

export function updateFocusPanel(){
  const body = document.getElementById('focus-body');
  const activePage = state.activePage || 'work';
  const pageSecs = activePage === 'hearth' ? HEARTH_SECS
                 : (activePage === 'calendar' || activePage === 'dayrite') ? ALL_SECTIONS
                 : WORK_SECS;

  const allTasks = [];
  pageSecs.forEach(sec => {
    (state[sec]||[]).forEach(t => {
      if(!t.done) allTasks.push({...t, sec});
    });
  });

  if(!allTasks.length){
    body.innerHTML = '<div class="focus-empty">all obligations fulfilled — the tome rests</div>';
    return;
  }

  // Check for sworn oaths — filter to current page only
  const sworn = state.swornOaths || [];
  const pageSecSet = new Set(pageSecs);
  const swornTasks = [];
  if(sworn.length){
    sworn.forEach(id => {
      const t = allTasks.find(t => t.id === id);
      if(t && pageSecSet.has(t.sec)) swornTasks.push(t);
    });
  }

  // Use sworn oaths if we have them, otherwise fall back to auto-scoring
  let top;
  let isSworn = false;
  if(swornTasks.length > 0){
    top = swornTasks;
    isSworn = true;
    // Attach saved reasons/order
    const orderMap = {};
    (state.swornOrder||[]).forEach(o => { orderMap[o.id] = o; });
    top.forEach(t => {
      const info = orderMap[t.id];
      if(info) t._reason = info.reason;
    });
  } else {
    allTasks.forEach(t => {
      const s = scoreTask(t);
      t._score = s.score;
      t._reason = s.reason;
    });
    allTasks.sort((a,b) => b._score - a._score);
    top = allTasks.slice(0, 5);
  }

  const _lockedInTaskId = lockedInTaskId;
  const _focusPeekMode = focusPeekMode;

  const headerLabel = isSworn
    ? '<div style="text-align:center;font-family:Cinzel,serif;font-size:8px;letter-spacing:0.12em;color:#d06888;text-transform:uppercase;margin-bottom:4px;opacity:0.7">sworn oaths — in order</div>'
    : '<div style="text-align:center;font-family:Crimson Text,serif;font-size:11px;color:#6a4a55;font-style:italic;margin-bottom:4px">auto-ranked — scry to set your oaths</div>';

  body.innerHTML = headerLabel + top.map((t, idx) => {
    const color = SECTION_COLORS[t.sec] || '#888';
    const name = SECTION_NAMES[t.sec] || t.sec;
    let ageStr = '';
    if(t.createdAt){
      const d = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000);
      if(d >= 1) ageStr = `<span class="focus-item-age">${d}d</span>`;
    }
    const isUnbound = (!t.checklist || !t.checklist.length) && (!t.notes || !t.notes.trim());
    const unboundDot = isUnbound ? ' <span style="color:#e0a040;font-size:8px" title="unbound">⚠</span>' : '';
    const reason = t._reason ? `<span style="font-family:Crimson Text,serif;font-size:10px;font-style:italic;color:rgba(208,104,136,0.6);margin-left:4px">${t._reason}</span>` : '';
    // One-at-a-time: only show first uncompleted, hide rest unless peeking
    const isCurrentFocus = (idx === 0);
    const hiddenClass = (!_focusPeekMode && !isCurrentFocus) ? ' style="display:none"' : '';
    const beginBtn = isCurrentFocus && !_lockedInTaskId
      ? `<span class="focus-begin-btn" data-focus-id="${t.id}">begin</span>`
      : (_lockedInTaskId === t.id ? `<span class="focus-release-btn" data-focus-id="${t.id}">release</span>` : '');
    return `<div class="focus-item${_lockedInTaskId === t.id ? ' locked-active' : (_lockedInTaskId ? ' locked-dim' : '')}" data-focus-task="${t.id}"${hiddenClass}>
      <span class="focus-seq">${idx + 1}</span>
      <div class="focus-section-dot" style="background:${color}"></div>
      <span class="focus-item-text">${esc(t.text)}${unboundDot}</span>
      ${beginBtn}
      <span class="focus-item-source">${name}</span>
      ${ageStr}
    </div>${isSworn && t._reason && (_focusPeekMode || isCurrentFocus) ? `<div style="padding:0 8px 3px 36px${!_focusPeekMode && !isCurrentFocus ? ';display:none' : ''}">${reason}</div>` : ''}`;
  }).join('');

  // Add peek toggle if there are more than 1 task
  if(top.length > 1 && !_lockedInTaskId){
    body.innerHTML += `<div class="focus-peek-btn" id="focus-peek-toggle">${_focusPeekMode ? '▲ show less' : '▼ see all ' + top.length + ' oaths'}</div>`;
  }

  // Attach begin/release click handlers
  body.querySelectorAll('.focus-begin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); enterLockIn(parseInt(btn.dataset.focusId)); });
  });
  body.querySelectorAll('.focus-release-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); exitLockIn(); });
  });
  // Peek toggle
  const peekBtn = document.getElementById('focus-peek-toggle');
  if(peekBtn){
    peekBtn.addEventListener('click', () => { setFocusPeekMode(!focusPeekMode); updateFocusPanel(); });
  }
}

/* ═══ BURDEN BARS ═══ */
export function updateBurdenBars(){
  ALL_SECTIONS.forEach(sec => {
    const bar = document.getElementById(sec + '-burden');
    if(!bar) return;
    const open = (state[sec]||[]).filter(t => !t.done).length;
    bar.className = 'burden-bar';
    if(open >= 8) bar.classList.add('heavy');
    else if(open >= 6) bar.classList.add('hot');
    else if(open >= 4) bar.classList.add('warm');
    else bar.classList.add('calm');
  });
}

/* ═══ TAB BADGES ═══ */
export function updateTabBadges(){
  const workSecs = ['lab','bio','time'];
  const hearthSecs = ['hearth','scrolls','forge','bonds'];
  const workOpen = workSecs.reduce((s, sec) => s + (state[sec]||[]).filter(t=>!t.done).length, 0);
  const hearthOpen = hearthSecs.reduce((s, sec) => s + (state[sec]||[]).filter(t=>!t.done).length, 0);
  const bw = document.getElementById('badge-work');
  const bh = document.getElementById('badge-hearth');
  if(bw) bw.textContent = workOpen > 0 ? `(${workOpen})` : '';
  if(bh) bh.textContent = hearthOpen > 0 ? `(${hearthOpen})` : '';
}

/* ═══ BODY DOUBLING — ambient presence via enhanced canvas ═══ */
// No text messages — body doubling is pure atmosphere.
// The canvas layers (embers, fog, candle) read bodyDoublingEnabled
// and boost their effects to create a warm "someone is here" feeling.

/* ═══ POMODORO PHASE MANAGEMENT ═══ */
function startPomodoroPhase(phase){
  setPomodoroPhase(phase);
  setPomodoroPhaseStart(Date.now());
  updatePomodoroDisplay();
}

function updatePomodoroDisplay(){
  const timerEl = document.getElementById('lockin-timer');
  const breakOverlay = document.getElementById('pomo-break-overlay');
  if(!timerEl) return;

  if(!pomodoroEnabled || !lockedInTaskId){
    if(breakOverlay) breakOverlay.classList.remove('visible');
    return;
  }

  const elapsed = Date.now() - (pomodoroPhaseStart || Date.now());
  const phaseMs = pomodoroPhase === 'work' ? pomodoroWorkMs : pomodoroBreakMs;
  const remaining = Math.max(0, phaseMs - elapsed);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  if(pomodoroPhase === 'work'){
    const pct = Math.min(1, elapsed / phaseMs);
    const burnBar = document.getElementById('pomo-burn');
    if(burnBar) burnBar.style.width = (100 - pct * 100) + '%';
    if(breakOverlay) breakOverlay.classList.remove('visible');

    if(remaining <= 0){
      // Time's up — trigger break with celebration
      setPomodoroCount(pomodoroCount + 1);
      pomodoroBurst('work'); // fire celebration for completing a work session
      startPomodoroPhase('break');
      if(breakOverlay) breakOverlay.classList.add('visible');
    }
  } else {
    // Break phase
    if(breakOverlay) breakOverlay.classList.add('visible');
    const breakEl = document.getElementById('pomo-break-timer');
    if(breakEl) breakEl.textContent = `${mins}m ${String(secs).padStart(2,'0')}s`;

    if(remaining <= 0){
      // Break over — cool refreshing burst, back to work
      pomodoroBurst('break');
      startPomodoroPhase('work');
      if(breakOverlay) breakOverlay.classList.remove('visible');
    }
  }
}

/* ═══ LOCK-IN MODE ═══ */
export function enterLockIn(taskId){
  setLockedInTaskId(taskId);
  setLockinStartTime(Date.now());
  document.querySelector('.grimoire').classList.add('locked-in');
  document.getElementById('thought-catcher').classList.add('always-on');
  setFocusPeekMode(false);

  // Start pomodoro
  if(pomodoroEnabled){
    startPomodoroPhase('work');
  }

  // Body doubling is handled by canvas layers reading bodyDoublingEnabled directly

  // Get accumulated time on this task
  let task = null;
  ALL_SECTIONS.forEach(sec => {
    const t = (state[sec]||[]).find(t => t.id === taskId);
    if(t) task = t;
  });
  const priorMs = (task && task.focusedMs) || 0;

  // Start timer showing accumulated + current session + pomodoro
  const timerEl = document.getElementById('lockin-timer');
  if(lockinTimerInterval) clearInterval(lockinTimerInterval);
  const interval = setInterval(() => {
    const sessionMs = Date.now() - lockinStartTime;
    const totalMs = priorMs + sessionMs;
    const mins = Math.floor(totalMs / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);

    if(pomodoroEnabled && pomodoroPhaseStart && pomodoroPhase === 'work'){
      const elapsed = Date.now() - pomodoroPhaseStart;
      const remaining = Math.max(0, pomodoroWorkMs - elapsed);
      const rMins = Math.floor(remaining / 60000);
      const rSecs = Math.floor((remaining % 60000) / 1000);
      const pomoLabel = pomodoroCount > 0 ? ` • pomodoro #${pomodoroCount + 1}` : '';
      timerEl.textContent = `🕯 ${rMins}:${String(rSecs).padStart(2,'0')} remaining • ${mins}m total${pomoLabel}`;
    } else if(pomodoroEnabled && pomodoroPhase === 'break'){
      timerEl.textContent = `☕ break time • ${mins}m total focused`;
    } else {
      timerEl.textContent = `⏱ ${mins}m ${String(secs).padStart(2,'0')}s focused`;
    }

    // Update pomodoro display
    updatePomodoroDisplay();
  }, 1000);
  setLockinTimerInterval(interval);
  const initMins = Math.floor(priorMs / 60000);
  const initSecs = Math.floor((priorMs % 60000) / 1000);
  timerEl.textContent = `⏱ ${initMins}m ${String(initSecs).padStart(2,'0')}s focused`;

  // Populate expanded card
  populateLockinCard(taskId);
  updateFocusPanel();

  // Scroll to focus panel so user can see it
  const focusPanel = document.getElementById('focus-panel');
  if(focusPanel) focusPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function populateLockinCard(taskId){
  const card = document.getElementById('lockin-card');
  // Find the task across all sections
  let task = null, taskSec = null;
  ALL_SECTIONS.forEach(sec => {
    const t = (state[sec]||[]).find(t => t.id === taskId);
    if(t){ task = t; taskSec = sec; }
  });
  if(!task){ card.innerHTML = ''; return; }

  const color = SECTION_COLORS[taskSec] || '#888';
  const name = SECTION_NAMES[taskSec] || taskSec;
  const cl = task.checklist || [];

  let html = `<div class="lockin-card-title">${esc(task.text)}</div>`;
  html += `<div class="lockin-card-source" style="color:${color}">${name}</div>`;

  // Notes
  if(task.notes && task.notes.trim()){
    html += `<div class="lockin-card-note">${esc(task.notes)}</div>`;
  }

  // Checklist
  if(cl.length){
    html += `<div class="lockin-card-checklist">`;
    cl.forEach((c, ci) => {
      html += `<div class="lockin-check-row${c.done ? ' done' : ''}" data-lockin-ci="${ci}">
        <div class="lockin-check-box"><i class="ti ti-sparkles" style="font-size:8px"></i></div>
        <span class="lockin-check-label">${esc(c.text)}</span>
      </div>`;
    });
    html += `</div>`;
  }

  // Pomodoro burn bar + preset picker
  const workMins = Math.round(pomodoroWorkMs / 60000);
  const breakMins = Math.round(pomodoroBreakMs / 60000);
  const presets = [{w:30,b:5},{w:60,b:10},{w:90,b:15},{w:120,b:20}];

  html += `<div class="pomo-section">
    <div class="pomo-burn-track"><div class="pomo-burn-fill" id="pomo-burn" style="width:100%"></div></div>
    <div class="pomo-presets">
      ${presets.map(p => `<span class="pomo-preset${p.w === workMins && p.b === breakMins ? ' active' : ''}" data-pomo-w="${p.w}" data-pomo-b="${p.b}">${p.w}/${p.b}</span>`).join('')}
    </div>
    <div class="pomo-controls">
      <span class="pomo-toggle${pomodoroEnabled ? ' active' : ''}" id="pomo-toggle" title="Toggle pomodoro timer">
        <i class="ti ti-flame" style="font-size:11px"></i> ${pomodoroEnabled ? 'ON' : 'OFF'}
      </span>
      <span class="pomo-toggle${bodyDoublingEnabled ? ' active' : ''}" id="bd-toggle" title="Toggle body doubling companion">
        <i class="ti ti-campfire" style="font-size:11px"></i> companion ${bodyDoublingEnabled ? 'ON' : 'OFF'}
      </span>
      ${pomodoroCount > 0 ? `<span style="font-family:Cinzel,serif;font-size:8px;color:var(--gold-dim);letter-spacing:0.08em">${pomodoroCount} pomodoro${pomodoroCount > 1 ? 's' : ''}</span>` : ''}
    </div>
  </div>`;

  // Pomodoro break overlay
  html += `<div class="pomo-break-overlay" id="pomo-break-overlay">
    <div class="pomo-break-icon"><i class="ti ti-coffee" style="font-size:18px"></i></div>
    <div class="pomo-break-title">Rest, keeper</div>
    <div class="pomo-break-text">You've earned a break. Stretch, hydrate, breathe.</div>
    <div class="pomo-break-countdown" id="pomo-break-timer">5:00</div>
    <span class="pomo-skip-break" id="pomo-skip-break">skip break</span>
  </div>`;

  // Seal (complete) button
  html += `<div class="lockin-card-seal">
    <span id="lockin-release-btn" style="font-family:Cinzel,serif;font-size:9px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;padding:6px 16px;border-radius:2px;cursor:pointer;border:1px solid rgba(140,60,80,0.3);color:var(--text-muted);background:rgba(20,5,10,0.3);transition:all 0.2s">Release</span>
    <span class="lockin-seal-btn" id="lockin-seal-btn"><i class="ti ti-sparkles" style="font-size:10px"></i> Seal This Oath</span>
  </div>`;

  card.innerHTML = html;

  // Checklist click handlers
  card.querySelectorAll('.lockin-check-row').forEach(row => {
    row.addEventListener('click', () => {
      const ci = parseInt(row.dataset.lockinCi);
      const wasDone = task.checklist[ci].done;
      task.checklist[ci].done = !task.checklist[ci].done;
      saveState();
      // Mini burst
      if(!wasDone && task.checklist[ci].done){
        const box = row.querySelector('.lockin-check-box');
        if(box){
          const rect = box.getBoundingClientRect();
          miniSparkBurst(rect.left + rect.width/2, rect.top + rect.height/2, taskSec);
        }
      }
      populateLockinCard(taskId);
      renderSection(taskSec);
    });
  });

  // Seal button
  const sealBtn = document.getElementById('lockin-seal-btn');
  if(sealBtn){
    sealBtn.addEventListener('click', () => {
      // Accumulate current session time before sealing
      if(lockinStartTime){
        const sessionMs = Date.now() - lockinStartTime;
        task.focusedMs = (task.focusedMs || 0) + sessionMs;
      }
      task.done = true;
      // Log total focused time for averages
      if(task.focusedMs > 0){
        logTaskTime(task.text, taskSec, task.focusedMs);
      }
      saveState();
      // Fire big burst from the seal button
      const rect = sealBtn.getBoundingClientRect();
      spellSealBurst(rect.left + rect.width/2, rect.top + rect.height/2, taskSec);
      recordCompletion();
      checkSectionCleared(taskSec);
      renderSection(taskSec);
      // exitLockIn will be called by the sectionRendered listener
    });
  }

  // Release button
  const releaseBtn = document.getElementById('lockin-release-btn');
  if(releaseBtn){
    releaseBtn.addEventListener('click', () => exitLockIn());
  }

  // Pomodoro toggle
  const pomoToggle = document.getElementById('pomo-toggle');
  if(pomoToggle){
    pomoToggle.addEventListener('click', () => {
      setPomodoroEnabled(!pomodoroEnabled);
      if(pomodoroEnabled && lockedInTaskId){
        startPomodoroPhase('work');
      }
      populateLockinCard(taskId);
    });
  }

  // Pomodoro preset buttons
  card.querySelectorAll('.pomo-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = parseInt(btn.dataset.pomoW);
      const b = parseInt(btn.dataset.pomoB);
      setPomodoroWorkMs(w * 60 * 1000);
      setPomodoroBreakMs(b * 60 * 1000);
      // Restart current phase with new duration
      if(pomodoroEnabled && lockedInTaskId){
        startPomodoroPhase(pomodoroPhase);
      }
      populateLockinCard(taskId);
    });
  });

  // Body doubling toggle — canvas layers read this flag directly
  const bdToggle = document.getElementById('bd-toggle');
  if(bdToggle){
    bdToggle.addEventListener('click', () => {
      setBodyDoublingEnabled(!bodyDoublingEnabled);
      populateLockinCard(taskId);
    });
  }

  // Skip break
  const skipBreak = document.getElementById('pomo-skip-break');
  if(skipBreak){
    skipBreak.addEventListener('click', () => {
      startPomodoroPhase('work');
      const breakOverlay = document.getElementById('pomo-break-overlay');
      if(breakOverlay) breakOverlay.classList.remove('visible');
    });
  }
}

export function exitLockIn(){
  // Save this session's focused time to the task
  if(lockedInTaskId && lockinStartTime){
    const sessionMs = Date.now() - lockinStartTime;
    ALL_SECTIONS.forEach(sec => {
      const t = (state[sec]||[]).find(t => t.id === lockedInTaskId);
      if(t){
        t.focusedMs = (t.focusedMs || 0) + sessionMs;
      }
    });
    saveState();
  }

  setLockedInTaskId(null);
  setLockinStartTime(null);
  document.querySelector('.grimoire').classList.remove('locked-in');
  document.getElementById('thought-catcher').classList.remove('always-on');
  document.getElementById('lockin-card').innerHTML = '';

  if(lockinTimerInterval){ clearInterval(lockinTimerInterval); setLockinTimerInterval(null); }
  document.getElementById('lockin-timer').textContent = '';

  // Reset pomodoro
  setPomodoroPhase('work');
  setPomodoroPhaseStart(null);
  setPomodoroCount(0);

  // Reset body doubling (canvas layers will stop boosting)
  setBodyDoublingEnabled(false);

  updateFocusPanel();
}

export function initFocus(){
  // Focus panel collapse
  document.getElementById('focus-header').addEventListener('click', (e) => {
    if(e.target.closest('#rescry-btn')) return; // don't collapse when clicking re-scry
    document.getElementById('focus-panel').classList.toggle('collapsed');
  });

  document.getElementById('rescry-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    // Jump straight to the commit step with fresh recommendations
    const scryOverlayEl = document.getElementById('scry-overlay');
    document.getElementById('scry-step-1').classList.remove('active');
    document.getElementById('scry-step-dump').classList.remove('active');
    document.getElementById('scry-step-checkin').classList.remove('active');
    document.getElementById('scry-step-energy').classList.remove('active');
    document.getElementById('scry-step-2').classList.add('active');
    generateRecommendations();
    scryOverlayEl.classList.add('open');
  });

  // Listen for sectionRendered to update focus panel, burden bars, tab badges
  on('sectionRendered', (sec) => {
    updateFocusPanel();
    updateBurdenBars();
    updateTabBadges();

    // Auto-exit lock-in if the locked task gets completed
    if(lockedInTaskId){
      let found = false;
      ALL_SECTIONS.forEach(s => {
        const t = (state[s]||[]).find(t => t.id === lockedInTaskId);
        if(t && !t.done) found = true;
      });
      if(!found) exitLockIn();
    }
  });

  // Initial renders
  updateFocusPanel();
  updateBurdenBars();
  updateTabBadges();
}

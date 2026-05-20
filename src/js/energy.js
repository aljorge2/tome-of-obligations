// src/js/energy.js — Energy check-in overlay + energy-aware day building
import { uid } from './utils.js';
import { state, saveState } from './state.js';
import { renderDayRite } from './dayrite.js';
import { renderSection } from './tasks.js';
import { enterLockIn } from './focus.js';
import { isCareChecked, toggleCare, CARE_ITEMS, CARE_LABELS } from './selfcare.js';
import { spellSealBurst } from './canvas/index.js';

const ENERGY_KEY = 'tome_energy';
const PAYTON_VOICE_KEY = 'tome_payton_voice';

const DEFAULT_PAYTON_MESSAGES = [
  "Hey love, just thinking about you. Hope your day is going well 💛",
  "Hi babe — sending you a little love in the middle of the day. You've got this.",
  "Just wanted to say I love you and I hope today is being kind to you.",
  "Thinking of you right now. Hope you're having a good one 🖤",
  "Hey — I love you. That's all. Hope your day is treating you right.",
];

/**
 * Get Payton message suggestions — prefers user's own voice when available.
 * Returns array of 3-5 messages, mixing user's past messages with defaults.
 */
export function getPaytonSuggestions(count = 3){
  const saved = loadPaytonVoice();
  if(saved.length >= count){
    // Enough saved messages — pull exclusively from user's voice
    const shuffled = [...saved].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }
  if(saved.length > 0){
    // Mix saved and defaults
    const all = [...saved, ...DEFAULT_PAYTON_MESSAGES];
    const unique = [...new Set(all)];
    return unique.sort(() => Math.random() - 0.5).slice(0, count);
  }
  // No saved messages — use defaults
  return [...DEFAULT_PAYTON_MESSAGES].sort(() => Math.random() - 0.5).slice(0, count);
}

export function savePaytonMessage(msg){
  const trimmed = msg.trim();
  if(!trimmed || trimmed.length < 3) return;
  const saved = loadPaytonVoice();
  // Avoid exact duplicates
  if(saved.some(m => m.toLowerCase() === trimmed.toLowerCase())) return;
  saved.push(trimmed);
  // Keep last 20 messages max
  while(saved.length > 20) saved.shift();
  try { localStorage.setItem(PAYTON_VOICE_KEY, JSON.stringify(saved)); } catch(e){}
}

function loadPaytonVoice(){
  try {
    const raw = localStorage.getItem(PAYTON_VOICE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e){ return []; }
}

// Keep for backwards compat — internal use
const PAYTON_MESSAGES = DEFAULT_PAYTON_MESSAGES;
const CHECK_TIMES = [
  { hour: 10, min: 0, label: 'morning', prompt: 'How does your energy feel this morning?', allowRebuild: false },
  { hour: 13, min: 0, label: 'midday', prompt: 'How is your energy holding up?', allowRebuild: true },
  { hour: 16, min: 0, label: 'dusk', prompt: 'The day turns toward dusk. How fares your strength?', allowRebuild: true, bigTransition: true },
];

let _energyData = loadEnergy();
let _checkInterval = null;
let _overlayEl = null;
let _paytonPendingEnergy = false;

function loadEnergy(){
  try {
    const raw = localStorage.getItem(ENERGY_KEY);
    return raw ? JSON.parse(raw) : { days: {} };
  } catch(e){ return { days: {} }; }
}

function saveEnergy(){
  try { localStorage.setItem(ENERGY_KEY, JSON.stringify(_energyData)); } catch(e){}
}

function todayKey(){
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function getTodayChecks(){
  const key = todayKey();
  if(!_energyData.days[key]) _energyData.days[key] = {};
  return _energyData.days[key];
}

export function getCurrentEnergy(){
  const checks = getTodayChecks();
  // Return most recent energy level
  if(checks.dusk) return checks.dusk;
  if(checks.midday) return checks.midday;
  if(checks.morning) return checks.morning;
  return null;
}

export function getEnergyForReorder(){
  // Get current energy level for day builder reordering
  const level = getCurrentEnergy();
  if(!level) return 'medium';
  if(level <= 2) return 'low';
  if(level >= 4) return 'high';
  return 'medium';
}

/**
 * Returns true if there's an energy check-in that's due (on-time or missed).
 * Used by opening ritual to decide whether to force an energy check.
 */
export function getExpectedChecks(){
  const now = new Date();
  const hour = now.getHours();
  const min = now.getMinutes();
  const nowMins = hour * 60 + min;
  const checks = getTodayChecks();

  for(const check of CHECK_TIMES){
    const checkMins = check.hour * 60 + check.min;
    const diffMins = nowMins - checkMins;
    // Due if: past the check time (up to 4 hours) and not answered
    if(diffMins >= 0 && diffMins <= 240 && !checks[check.label]){
      return true;
    }
  }
  return false;
}

function shouldShowCheck(){
  const now = new Date();
  const hour = now.getHours();
  const min = now.getMinutes();
  const checks = getTodayChecks();

  for(const check of CHECK_TIMES){
    // Within 15 minutes of check time
    const diffMins = (hour * 60 + min) - (check.hour * 60 + check.min);
    if(diffMins >= 0 && diffMins <= 15 && !checks[check.label]){
      return check;
    }
  }
  return null;
}

/**
 * Find the most recent missed check-in (past its time but not answered).
 * Used on app open to catch up if user wasn't around.
 */
function getMissedCheck(){
  const now = new Date();
  const hour = now.getHours();
  const min = now.getMinutes();
  const nowMins = hour * 60 + min;
  const checks = getTodayChecks();

  // Walk backwards through check times to find most recent missed one
  for(let i = CHECK_TIMES.length - 1; i >= 0; i--){
    const check = CHECK_TIMES[i];
    const checkMins = check.hour * 60 + check.min;
    // Past the check time (but not more than 4 hours ago) and not yet answered
    const diffMins = nowMins - checkMins;
    if(diffMins > 15 && diffMins <= 240 && !checks[check.label]){
      return {
        ...check,
        missed: true,
        prompt: check.bigTransition
          ? 'You missed the dusk passage. How does your energy feel now?'
          : `You missed the ${check.label} check-in. How is your energy?`,
      };
    }
  }
  return null;
}

function createOverlay(check){
  if(_overlayEl) return; // Already showing

  _overlayEl = document.createElement('div');
  _overlayEl.className = 'energy-overlay';
  _overlayEl.innerHTML = `
    <div class="energy-panel">
      <div class="energy-sigil">${check.bigTransition ? '<i class="ti ti-sunset-2"></i>' : '<i class="ti ti-flame"></i>'}</div>
      <div class="energy-title">${check.bigTransition ? 'The Great Transition' : 'Energy Divination'}</div>
      <div class="energy-prompt">${check.prompt}</div>
      <div class="energy-scale">
        ${[1,2,3,4,5].map(n => {
          const labels = ['spent','waning','steady','kindled','blazing'];
          const descs = [
            'Running on fumes — survival mode only',
            'Low flame — simple tasks, be gentle',
            'Holding steady — a normal rhythm',
            'Spark lit — good focus energy today',
            'Full blaze — bring on the hard stuff'
          ];
          return `
          <button class="energy-btn" data-level="${n}">
            <span class="energy-btn-num">${n}</span>
            <span class="energy-btn-label">${labels[n-1]}</span>
            <span class="energy-btn-desc">${descs[n-1]}</span>
          </button>`;
        }).join('')}
      </div>
      ${check.bigTransition ? '<div class="energy-transition-note">This marks your passage from work to hearth.</div>' : ''}
      <div class="energy-dismiss">
        <span class="energy-dismiss-btn">not now</span>
      </div>
    </div>
  `;

  document.body.appendChild(_overlayEl);

  // Animate in
  requestAnimationFrame(() => _overlayEl.classList.add('visible'));

  // Button handlers
  _overlayEl.querySelectorAll('.energy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const level = parseInt(btn.dataset.level);
      recordEnergy(check, level);
    });
  });

  _overlayEl.querySelector('.energy-dismiss-btn').addEventListener('click', () => {
    dismissOverlay(check);
  });
}

function recordEnergy(check, level){
  const checks = getTodayChecks();
  checks[check.label] = level;
  saveEnergy();

  if(check.allowRebuild){
    showRebuildOption(check, level);
  } else {
    showBondsAndCare();
  }
}

function showRebuildOption(check, level){
  const panel = _overlayEl.querySelector('.energy-panel');
  const label = ['spent','waning','steady','kindled','blazing'][level - 1];

  panel.innerHTML = `
    <div class="energy-sigil"><i class="ti ti-${level <= 2 ? 'moon-stars' : level >= 4 ? 'flame' : 'equal'}"></i></div>
    <div class="energy-title">Energy: ${label}</div>
    <div class="energy-prompt">${level <= 2
      ? 'Your flame burns low. Shall I reorder your remaining oaths — easier tasks first?'
      : level >= 4
        ? 'Your strength surges. Shall I put your hardest tasks within reach?'
        : 'A steady flame. Your current order seems fitting.'
    }</div>
    ${check.bigTransition ? `<div class="energy-transition-note" style="margin-bottom:12px">
      ${level <= 2 ? 'Consider resting. The hearth awaits.' : 'If hearth-tasks remain, you have the strength.'}
    </div>` : ''}
    <div class="energy-rebuild-row">
      <button class="energy-rebuild-btn" id="energy-rebuild-yes">Rebuild the day</button>
      <button class="energy-rebuild-btn energy-rebuild-no" id="energy-rebuild-no">Keep as is</button>
    </div>
  `;

  panel.querySelector('#energy-rebuild-yes').addEventListener('click', () => {
    rebuildDay(level);
    showBondsAndCare();
  });
  panel.querySelector('#energy-rebuild-no').addEventListener('click', () => {
    showBondsAndCare();
  });
}

function rebuildDay(energyLevel){
  // Trigger Day's Rite re-render with energy awareness
  // The dayrite module will check getEnergyForReorder() during its scoring
  if(typeof renderDayRite === 'function'){
    renderDayRite();
  }
}

function showBondsAndCare(){
  if(!_overlayEl) return;
  const panel = _overlayEl.querySelector('.energy-panel');

  // Build self-care items HTML
  let careHtml = '';
  CARE_ITEMS.forEach(item => {
    const info = CARE_LABELS[item];
    const done = isCareChecked(item);
    careHtml += `<div class="energy-care-item${done ? ' done' : ''}" data-care="${item}">
      <i class="ti ${info.icon}" style="font-size:14px;color:${done ? '#d4a855' : '#3a2530'}"></i>
      <span class="energy-care-label">${info.label}</span>
      <span class="energy-care-status">${done ? '✓' : ''}</span>
    </div>`;
  });

  panel.innerHTML = `
    <div class="energy-sigil"><i class="ti ti-heart-handshake"></i></div>
    <div class="energy-title">Bonds & Care</div>

    <div class="energy-payton-section">
      <div class="energy-payton-question" id="payton-question-text">Have you checked in with Payton?</div>
      <div class="energy-payton-row">
        <button class="energy-payton-btn energy-payton-yes" id="payton-yes">
          <i class="ti ti-check"></i> Yes
        </button>
        <button class="energy-payton-btn energy-payton-no" id="payton-no">
          <i class="ti ti-x"></i> Not yet
        </button>
      </div>
      <div class="energy-payton-msg" id="payton-msg" style="display:none"></div>
    </div>

    <div class="energy-care-section">
      <div class="energy-care-title">Self-Care Check</div>
      <div class="energy-care-grid">${careHtml}</div>
    </div>

    <div class="energy-dismiss" style="margin-top:14px">
      <button class="energy-rebuild-btn" id="energy-checkin-done">Done</button>
    </div>
  `;

  // Payton handlers
  // Determine if this is AM or PM check-in
  const _hour = new Date().getHours();
  const _paytonSlot = _hour < 14 ? 'payton-am' : 'payton-pm';
  const _slotLabel = _hour < 14 ? 'morning' : 'evening';
  const _questionEl = panel.querySelector('#payton-question-text');
  if(_questionEl){
    const amDone = isCareChecked('payton-am');
    const pmDone = isCareChecked('payton-pm');
    if(amDone && !pmDone) _questionEl.textContent = 'Have you checked in with Payton this evening?';
    else if(!amDone) _questionEl.textContent = 'Have you checked in with Payton this morning?';
    else _questionEl.textContent = 'Both Payton check-ins done today!';
    if(amDone && pmDone){
      panel.querySelector('.energy-payton-row').style.display = 'none';
      panel.querySelector('#payton-msg').style.display = 'block';
      panel.querySelector('#payton-msg').innerHTML = '<span style="color:#d4a855;font-style:italic">Both bonds strengthened today.</span>';
    }
  }

  panel.querySelector('#payton-yes').addEventListener('click', () => {
    const msgEl = panel.querySelector('#payton-msg');
    // Toggle the appropriate Payton care slot
    if(!isCareChecked(_paytonSlot)) toggleCare(_paytonSlot);
    msgEl.style.display = 'block';
    msgEl.innerHTML = '<span style="color:#d4a855;font-style:italic">The ' + _slotLabel + ' bond strengthens.</span>';
    // Fire celebration sparks from the button
    const btn = panel.querySelector('#payton-yes');
    const rect = btn.getBoundingClientRect();
    spellSealBurst(rect.left + rect.width/2, rect.top + rect.height/2, 'bonds');
    // Hide the buttons
    panel.querySelector('.energy-payton-row').style.display = 'none';
  });

  panel.querySelector('#payton-no').addEventListener('click', () => {
    _paytonPendingEnergy = true;
    const msgEl = panel.querySelector('#payton-msg');
    const suggestions = getPaytonSuggestions(1);
    const msg = suggestions[0] || PAYTON_MESSAGES[Math.floor(Math.random() * PAYTON_MESSAGES.length)];
    msgEl.style.display = 'block';
    msgEl.innerHTML = `
      <div class="energy-payton-suggest-label">A message for Payton:</div>
      <div class="energy-payton-suggest-text">"${msg}"</div>
      <div class="energy-payton-suggest-hint">copy & send when you're ready</div>
    `;
    // Hide the buttons
    panel.querySelector('.energy-payton-row').style.display = 'none';
    // Make the message copyable
    msgEl.querySelector('.energy-payton-suggest-text').addEventListener('click', () => {
      navigator.clipboard?.writeText(msg).then(() => {
        msgEl.querySelector('.energy-payton-suggest-hint').textContent = 'copied ✓';
      });
    });
  });

  // Self-care toggle handlers
  panel.querySelectorAll('.energy-care-item').forEach(el => {
    el.addEventListener('click', () => {
      const item = el.dataset.care;
      toggleCare(item);
      const done = isCareChecked(item);
      el.classList.toggle('done', done);
      el.querySelector('.energy-care-status').textContent = done ? '✓' : '';
      el.querySelector('i').style.color = done ? '#d4a855' : '#3a2530';
      if(done){
        const rect = el.getBoundingClientRect();
        spellSealBurst(rect.left + rect.width/2, rect.top + rect.height/2, 'complete');
      }
    });
  });

  // Done button
  panel.querySelector('#energy-checkin-done').addEventListener('click', () => {
    closeOverlay();
    if(_paytonPendingEnergy){
      _paytonPendingEnergy = false;
      createPaytonFocusTask();
    }
  });
}

function dismissOverlay(check){
  // Mark as dismissed so it doesn't show again this window
  const checks = getTodayChecks();
  checks[check.label] = 0; // 0 = dismissed without answering
  saveEnergy();
  closeOverlay();
}

function createPaytonFocusTask(){
  // Generate 3 message suggestions — uses user's own voice when available
  const shuffled = getPaytonSuggestions(3);
  const notes = "Pick one to send:\n\n" + shuffled.map((m, i) => `${i+1}. "${m}"`).join('\n\n');

  const taskId = uid();
  const task = {
    id: taskId,
    text: 'Send message to Payton',
    done: false,
    priority: 2,
    checklist: [],
    showChecklist: false,
    notes: notes,
    createdAt: new Date().toISOString(),
    estimate: 5,
  };

  state.bonds.push(task);
  saveState();
  renderSection('bonds');

  // Enter focus mode after overlay animation finishes
  setTimeout(() => {
    enterLockIn(taskId);
  }, 500);
}

function closeOverlay(){
  if(!_overlayEl) return;
  _overlayEl.classList.remove('visible');
  setTimeout(() => {
    _overlayEl?.remove();
    _overlayEl = null;
  }, 300);
}

function checkLoop(){
  const check = shouldShowCheck();
  if(check){
    createOverlay(check);
  }
}

export function initEnergy(){
  // Check every 30 seconds for on-time check-ins
  _checkInterval = setInterval(checkLoop, 30000);
  // Note: initial check-in is handled by the opening ritual popup now
}

/**
 * Force show an energy check-in overlay (called from opening popup).
 * Uses the most relevant check time or a generic one.
 */
export function forceEnergyCheck(){
  const onTime = shouldShowCheck();
  if(onTime){ createOverlay(onTime); return; }
  const missed = getMissedCheck();
  if(missed){ createOverlay(missed); return; }
  // No scheduled check — show a generic one
  const now = new Date();
  const hour = now.getHours();
  const generic = {
    hour, min: 0,
    label: hour < 12 ? 'morning' : hour < 17 ? 'midday' : 'dusk',
    prompt: 'How does your energy feel right now?',
    allowRebuild: true,
    bigTransition: false,
  };
  createOverlay(generic);
}

export function getEnergyHistory(days = 7){
  const result = [];
  const now = new Date();
  for(let i = 0; i < days; i++){
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const day = _energyData.days[key];
    if(day){
      const values = [day.morning, day.midday, day.dusk].filter(v => v && v > 0);
      const avg = values.length ? values.reduce((a,b)=>a+b,0) / values.length : null;
      result.push({ date: key, morning: day.morning, midday: day.midday, dusk: day.dusk, avg });
    } else {
      result.push({ date: key, avg: null });
    }
  }
  return result;
}

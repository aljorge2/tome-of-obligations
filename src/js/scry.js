// src/js/scry.js — The Scry overlay system
import { esc, uid, formatDuration } from './utils.js';
import { ALL_SECTIONS, SECTION_COLORS, SECTION_NAMES, WORK_SECS, HEARTH_SECS, URGENCY_KEYWORDS, SEC_KEYWORDS } from './constants.js';
import {
  state, saveState, loadTally, loadAddLog, getAvgTime,
  loadSwapMemory, saveSwapMemory, recordSwap, getSwapAdjustment,
  loadTemplates, saveTemplates, logTaskAddition,
} from './state.js';
import { getCurrentEnergy, getEnergyHistory as getEnergyHistoryData, getPaytonSuggestions, savePaytonMessage } from './energy.js';
import { renderSection } from './tasks.js';
import { updateFocusPanel, enterLockIn } from './focus.js';
import { renderTemplates } from './templates.js';
import { populateScryCheckin } from './selfcare.js';
import { saveStrugglesEntry } from './struggles.js';
import { parseQuickAdd } from './quickadd.js';
import { spellSealBurst } from './canvas/index.js';

const scryOverlay = document.getElementById('scry-overlay');
let scryWorkPicks = new Set();
let scryHearthPicks = new Set();
let currentWorkRecs = [];
let currentHearthRecs = [];
let _paytonPending = false; // set true when user says "not yet" to Payton check-in

export function scoreTask(t){
  let score = 5;
  let reasons = [];

  // ── Keyword urgency (replaces manual priority) ──
  const textLower = (t.text || '').toLowerCase();
  const notesLower = (t.notes || '').toLowerCase();
  const combined = textLower + ' ' + notesLower;
  let urgencyHits = 0;
  URGENCY_KEYWORDS.forEach(kw => {
    if(combined.includes(kw)) urgencyHits++;
  });
  if(urgencyHits >= 2){ score += 40; reasons.push('urgent'); }
  else if(urgencyHits === 1){ score += 20; reasons.push('time-sensitive'); }

  // ── Age bonus ──
  if(t.createdAt){
    const ageDays = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000);
    score += Math.min(ageDays * 1.5, 25);
    if(ageDays >= 7) reasons.push('aging — ' + ageDays + ' days old');
    else if(ageDays >= 3) reasons.push('been waiting ' + ageDays + ' days');
  }

  // ── Checklist near-completion bonus ──
  const cl = t.checklist || [];
  if(cl.length >= 2){
    const done = cl.filter(c => c.done).length;
    const pct = done / cl.length;
    if(pct >= 0.5){
      score += 12 + pct * 10;
      reasons.push(Math.round(pct * 100) + '% complete — close to a win');
    }
  }

  // ── Energy-aware scoring (numeric 1-5 scale) ──
  const energy = getCurrentEnergy();
  if(energy && energy > 0){
    const est = t.estimate || 30;
    if(energy <= 2){
      // Low energy — prefer short/easy tasks
      if(est <= 15) { score += 10; if(!reasons.length) reasons.push('quick win for low energy'); }
      else if(est >= 60) { score -= 15; }
    } else if(energy >= 4){
      // High energy — prefer deep/complex tasks
      if(est >= 60) { score += 10; if(!reasons.length) reasons.push('deep work — ride the energy'); }
      if(cl.length >= 3 && cl.filter(c=>c.done).length === 0) { score += 8; }
    }
  }

  // ── Focused time momentum ──
  if(t.focusedMs && t.focusedMs > 60000 && !t.done){
    score += 8;
    if(!reasons.length) reasons.push('you\'ve already invested time');
  }

  // ── Unbound penalty ──
  const isUnbound = (!cl.length) && (!t.notes || !t.notes.trim());
  if(isUnbound){
    score -= 20;
    reasons.push('needs breaking down');
  }

  // ── Swap memory adjustment ──
  if(t.id){
    const swapAdj = getSwapAdjustment(t.id);
    score += swapAdj;
    if(swapAdj > 0) reasons.unshift('you chose this before');
  }

  // ── Delegation status ──
  if(t.delegatedTo){
    score -= 30; // Delegated tasks should not be recommended
  }

  // Default reason
  if(!reasons.length) reasons.push('ready to work on');

  return { score, reason: reasons[0] };
}

export function recommendTasks(secs, count){
  const tasks = [];
  secs.forEach(sec => {
    (state[sec]||[]).forEach(t => {
      if(!t.done) tasks.push({...t, sec});
    });
  });

  // Score all tasks
  tasks.forEach(t => {
    const s = scoreTask(t);
    t._score = s.score;
    t._reason = s.reason;
  });

  // Sort by score
  tasks.sort((a,b) => b._score - a._score);

  // Pick top tasks with section balance:
  const recs = [];
  const used = new Set();
  const bestPerSec = [];
  secs.forEach(sec => {
    const best = tasks.find(t => t.sec === sec);
    if(best) bestPerSec.push(best);
  });
  bestPerSec.sort((a,b) => b._score - a._score);

  // First pass: pick top-scored section representatives (up to count)
  for(const t of bestPerSec){
    if(recs.length >= count) break;
    recs.push(t);
    used.add(t.id);
  }

  // Second pass: fill remaining from top-scored across all tasks
  for(const t of tasks){
    if(recs.length >= count) break;
    if(!used.has(t.id)){ recs.push(t); used.add(t.id); }
  }

  // Re-sort final picks by score
  recs.sort((a,b) => b._score - a._score);
  return recs;
}

export function renderRecCards(recs, containerId, allTasks){
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if(!recs.length){
    container.innerHTML = '<div style="color:#5a4030;font-style:italic;font-size:13px;padding:4px 0">no open tasks on this page</div>';
    return;
  }
  recs.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'scry-rec';
    card.dataset.idx = i;
    card.innerHTML = `
      <div class="scry-rec-num">${i + 1}</div>
      <div class="scry-rec-body">
        <div class="scry-rec-text">${esc(t.text)}</div>
        <div class="scry-rec-meta">
          <span class="scry-rec-reason">${t._reason}</span>
          <span class="scry-rec-source" style="color:${SECTION_COLORS[t.sec]||'#888'}">${SECTION_NAMES[t.sec]||t.sec}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;margin-right:4px">
        <span class="scry-rec-move" data-dir="up" style="cursor:pointer;font-size:10px;color:var(--text-muted);opacity:${i===0?'0.2':'0.6'};transition:opacity 0.2s"><i class="ti ti-chevron-up"></i></span>
        <span class="scry-rec-move" data-dir="down" style="cursor:pointer;font-size:10px;color:var(--text-muted);opacity:${i===recs.length-1?'0.2':'0.6'};transition:opacity 0.2s"><i class="ti ti-chevron-down"></i></span>
      </div>
      <span class="scry-rec-swap" data-task-id="${t.id}">swap</span>
    `;

    // Reorder arrows
    card.querySelectorAll('.scry-rec-move').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(card.dataset.idx);
        const dir = btn.dataset.dir;
        if(dir === 'up' && idx > 0){
          [recs[idx], recs[idx-1]] = [recs[idx-1], recs[idx]];
        } else if(dir === 'down' && idx < recs.length - 1){
          [recs[idx], recs[idx+1]] = [recs[idx+1], recs[idx]];
        } else return;
        if(containerId === 'scry-rec-work') currentWorkRecs = [...recs];
        else currentHearthRecs = [...recs];
        renderRecCards(recs, containerId, allTasks);
      });
    });

    // Swap button
    const swapBtn = card.querySelector('.scry-rec-swap');
    let swapList = null;
    swapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if(swapList && swapList.classList.contains('open')){
        swapList.classList.remove('open');
        return;
      }
      // Build swap list: all tasks not already in recs, from ALL sections on this page
      const recIds = new Set(recs.map(r => r.id));
      const alternatives = allTasks.filter(at => !at.done && !recIds.has(at.id));
      if(!swapList){
        swapList = document.createElement('div');
        swapList.className = 'scry-swap-list';
        card.querySelector('.scry-rec-body').appendChild(swapList);
      }
      swapList.innerHTML = alternatives.length ? '' : '<div style="color:#5a4030;font-style:italic;font-size:12px;padding:2px 6px">no other tasks available</div>';
      alternatives.slice(0, 12).forEach(alt => {
        const opt = document.createElement('div');
        opt.className = 'scry-swap-option';
        opt.innerHTML = `<span style="color:${SECTION_COLORS[alt.sec]||'#888'};font-size:8px;margin-right:4px">●</span>${esc(alt.text)} <span style="font-size:9px;color:var(--text-muted);margin-left:auto;white-space:nowrap;padding-left:8px">${(SECTION_NAMES[alt.sec]||alt.sec).split(' ')[0]}</span>`;
        opt.addEventListener('click', () => {
          const idx = parseInt(card.dataset.idx);
          const oldTask = recs[idx];
          recordSwap(oldTask, {...alt, sec: alt.sec});
          const scored = scoreTask(alt);
          alt._score = scored.score;
          alt._reason = scored.reason;
          recs[idx] = alt;
          if(containerId === 'scry-rec-work') currentWorkRecs = [...recs];
          else currentHearthRecs = [...recs];
          renderRecCards(recs, containerId, allTasks);
        });
        swapList.appendChild(opt);
      });
      swapList.classList.add('open');
    });
    container.appendChild(card);
  });
}

export function generateRecommendations(){
  const workTasks = [];
  WORK_SECS.forEach(s => (state[s]||[]).forEach(t => { if(!t.done) workTasks.push({...t, sec:s}); }));
  const hearthTasks = [];
  HEARTH_SECS.forEach(s => (state[s]||[]).forEach(t => { if(!t.done) hearthTasks.push({...t, sec:s}); }));

  currentWorkRecs = recommendTasks(WORK_SECS, 3);
  currentHearthRecs = recommendTasks(HEARTH_SECS, 4);

  renderRecCards(currentWorkRecs, 'scry-rec-work', workTasks);
  renderRecCards(currentHearthRecs, 'scry-rec-hearth', hearthTasks);
}

export function commitOaths(){
  const oaths = [...currentWorkRecs.map(t=>t.id), ...currentHearthRecs.map(t=>t.id)];
  state.swornOaths = oaths;
  state.swornOrder = [...currentWorkRecs, ...currentHearthRecs].map(t => ({
    id: t.id, reason: t._reason, sec: t.sec
  }));
  state.lastScryTime = new Date().toISOString();
  saveState();
  scryOverlay.classList.remove('open');
  updateFocusPanel();
  checkScryNudge(); // hide nudge after scrying

  // If user said "not yet" to Payton, create a bonds task and enter focus
  if(_paytonPending){
    _paytonPending = false;
    createPaytonTask();
  }
}

function createPaytonTask(){
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

  // Enter focus mode on this task after a brief delay
  setTimeout(() => {
    enterLockIn(taskId);
  }, 500);
}

/* ═══ SCRY NUDGE SYSTEM ═══ */
export function checkScryNudge(){
  const nudge = document.getElementById('scry-nudge');
  const nudgeText = document.getElementById('scry-nudge-text');
  const lastScry = state.lastScryTime ? new Date(state.lastScryTime) : null;
  const now = new Date();
  const hour = now.getHours();

  // Don't nudge if scried in the last 12 hours
  if(lastScry && (now - lastScry) < 12 * 3600000){
    nudge.classList.remove('visible');
    return;
  }

  // Don't nudge if dismissed this session
  if(nudge.dataset.dismissed === 'true'){
    nudge.classList.remove('visible');
    return;
  }

  let message = '';

  // Morning nudge (before 11am) — set your oaths for the day
  if(hour >= 5 && hour < 11){
    if(!lastScry || (now - lastScry) > 18 * 3600000){
      message = 'the tome stirs — set your oaths for the day';
    }
  }
  // Afternoon nudge (2-5pm) — mid-day check-in
  else if(hour >= 14 && hour < 17){
    if(!lastScry || (now - lastScry) > 20 * 3600000){
      message = 'the afternoon wanes — how fare your oaths?';
    }
  }
  // Evening nudge (5-9pm) — reflect and plan tomorrow
  else if(hour >= 17 && hour < 21){
    if(!lastScry || (now - lastScry) > 20 * 3600000){
      message = 'the day draws close — reflect and plan your morrow';
    }
  }

  // Also nudge if there are no sworn oaths set at all
  if(!message && (!state.swornOaths || !state.swornOaths.length)){
    const allOpen = ALL_SECTIONS.some(s => (state[s]||[]).some(t => !t.done));
    if(allOpen){
      message = 'you have tasks but no sworn oaths — scry to focus your will';
    }
  }

  if(message){
    nudgeText.textContent = message;
    nudge.classList.add('visible');
  } else {
    nudge.classList.remove('visible');
  }
}

/* ═══ AVOIDANCE DETECTION (Lingering Shadows) ═══ */
export function detectAvoidance(){
  const shadows = [];
  ALL_SECTIONS.forEach(sec => {
    (state[sec]||[]).forEach(t => {
      if(t.done) return;
      if(!t.createdAt) return;
      const ageDays = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000);
      if(ageDays < 5) return;
      // Check if untouched: no focused time, no checklist progress
      const hasProgress = (t.focusedMs && t.focusedMs > 0) ||
        (t.checklist && t.checklist.length && t.checklist.some(c => c.done));
      if(!hasProgress){
        shadows.push({...t, sec, ageDays});
      }
    });
  });
  shadows.sort((a,b) => b.ageDays - a.ageDays);
  return shadows;
}

/* ═══ ENERGY ORACLE ═══ */
function populateEnergyOracle(){
  const choices = document.getElementById('energy-choices');
  const current = getCurrentEnergy(); // numeric 1-5 or null

  // Highlight current selection
  choices.querySelectorAll('.energy-choice').forEach(el => {
    const level = parseInt(el.dataset.energy);
    el.classList.toggle('selected', level === current);
    el.onclick = () => {
      // Record into energy.js system — store as the current time-of-day check
      const hour = new Date().getHours();
      const label = hour < 12 ? 'morning' : hour < 17 ? 'midday' : 'dusk';
      try {
        const raw = localStorage.getItem('tome_energy');
        const data = raw ? JSON.parse(raw) : { days: {} };
        const key = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
        if(!data.days[key]) data.days[key] = {};
        data.days[key][label] = level;
        localStorage.setItem('tome_energy', JSON.stringify(data));
      } catch(e){}
      choices.querySelectorAll('.energy-choice').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
    };
  });

  // Show energy history (last 7 days) using energy.js data
  const historyEl = document.getElementById('energy-history');
  const history = getEnergyHistoryData(7);
  const now = new Date();
  let histHTML = '<div style="margin-top:12px;padding-top:8px;border-top:1px solid rgba(212,168,85,0.1)">';
  histHTML += '<div style="font-family:Cinzel,serif;font-size:8px;letter-spacing:0.1em;color:var(--gold-dim);text-transform:uppercase;margin-bottom:6px">Recent energy</div>';
  histHTML += '<div style="display:flex;gap:6px;align-items:flex-end">';
  for(let i = 6; i >= 0; i--){
    const entry = history[i] || { avg: null };
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(now.getTime() - i * 86400000).getDay()];
    const avg = entry.avg;
    const h = avg ? Math.round(avg * 5.5 + 2) : 3; // scale 1-5 to ~7-30px
    const color = avg >= 4 ? '#e08040' : avg >= 3 ? '#d4a855' : avg >= 1 ? '#8a6050' : 'rgba(80,40,50,0.3)';
    const isToday = i === 0;
    histHTML += `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1">
      <div style="width:100%;height:${h}px;background:${color};border-radius:2px;transition:height 0.3s${isToday ? ';box-shadow:0 0 6px '+color : ''}"></div>
      <span style="font-size:8px;color:${isToday ? '#d4a855' : '#5a3a45'};font-family:Cinzel,serif">${dayName}</span>
    </div>`;
  }
  histHTML += '</div></div>';
  historyEl.innerHTML = histHTML;
}

export var openScry = function(){
  scryWorkPicks.clear();
  scryHearthPicks.clear();

  // Populate Step 1: Reflect
  const tally = loadTally();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).toISOString();
  document.getElementById('scry-today').textContent = tally.completions.filter(d => d >= todayStart).length;
  document.getElementById('scry-week').textContent = tally.completions.filter(d => d >= weekStart).length;

  // Burden stats
  const burdenEl = document.getElementById('scry-burden-stats');
  let burdenHTML = '';
  ALL_SECTIONS.forEach(sec => {
    const open = (state[sec]||[]).filter(t=>!t.done).length;
    if(open === 0) return;
    const cls = open >= 8 ? 'scry-stat-bad' : open >= 5 ? 'scry-stat-warn' : '';
    burdenHTML += `<div class="scry-stat"><span>${SECTION_NAMES[sec]||sec}</span><span class="scry-stat-num ${cls}">${open} open</span></div>`;
  });
  burdenEl.innerHTML = burdenHTML || '<div style="color:#5a4030;font-style:italic;font-size:13px">no open tasks</div>';

  // Oldest tasks
  const oldestEl = document.getElementById('scry-oldest');
  const allOpen = [];
  ALL_SECTIONS.forEach(sec => {
    (state[sec]||[]).forEach(t => { if(!t.done && t.createdAt) allOpen.push({...t, sec}); });
  });
  allOpen.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  const oldest5 = allOpen.slice(0, 5);
  oldestEl.innerHTML = oldest5.length ? oldest5.map(t => {
    const d = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000);
    return `<div class="scry-task"><span style="color:${SECTION_COLORS[t.sec]||'#888'}">●</span> ${esc(t.text)} <span style="color:#6a4a55;font-style:italic;margin-left:auto">${d}d</span></div>`;
  }).join('') : '<div style="color:#5a4030;font-style:italic;font-size:13px">nothing aged</div>';

  // Unbound tasks
  const unboundEl = document.getElementById('scry-unbound');
  const unbound = allOpen.filter(t => (!t.checklist || !t.checklist.length) && (!t.notes || !t.notes.trim()));
  unboundEl.innerHTML = unbound.length ? unbound.slice(0,8).map(t => {
    return `<div class="scry-task"><span style="color:#e0a040">⚠</span> ${esc(t.text)} <span style="color:#6a4a55;font-style:italic;margin-left:auto">${SECTION_NAMES[t.sec]||t.sec}</span></div>`;
  }).join('') : '<div style="color:#5a4030;font-style:italic;font-size:13px">all tasks are well-defined — impressive</div>';

  // Pattern detection — find repeated task texts
  const patternsSection = document.getElementById('scry-patterns-section');
  const patternsEl = document.getElementById('scry-patterns');
  const addLog = loadAddLog();
  const cutoff14 = new Date(Date.now() - 14 * 86400000).toISOString();
  const recent = addLog.filter(e => e.date >= cutoff14);
  // Count occurrences of each text
  const textCounts = {};
  recent.forEach(e => {
    const key = e.text;
    if(!textCounts[key]) textCounts[key] = { text: e.text, sec: e.sec, count: 0 };
    textCounts[key].count++;
    textCounts[key].sec = e.sec; // use last section
  });
  // Filter for 3+ occurrences, exclude texts that are already rituals
  const tData = loadTemplates();
  const existingRituals = new Set(tData.templates.map(t => t.text.toLowerCase().trim()));
  const patterns = Object.values(textCounts)
    .filter(p => p.count >= 3 && !existingRituals.has(p.text))
    .sort((a,b) => b.count - a.count);

  if(patterns.length){
    patternsSection.style.display = '';
    patternsEl.innerHTML = patterns.map(p => {
      const avg = getAvgTime(p.text);
      const avgStr = avg ? ` • avg ${formatDuration(avg)}` : '';
      return `<div class="pattern-card" data-pattern-text="${esc(p.text)}" data-pattern-sec="${p.sec}">
        <span class="pattern-text">${esc(p.text)}</span>
        <span class="pattern-count">${p.count}x in 14d${avgStr}</span>
        <span class="pattern-create-btn" data-p-text="${esc(p.text)}" data-p-sec="${p.sec}">make ritual</span>
      </div>`;
    }).join('');
    // Attach create-ritual handlers
    patternsEl.querySelectorAll('.pattern-create-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.pText;
        const sec = btn.dataset.pSec;
        const avg = getAvgTime(text);
        const tData = loadTemplates();
        const notes = avg ? `Avg time: ${formatDuration(avg)}` : '';
        tData.templates.push({ text, cadence: 'weekly', target: sec });
        saveTemplates(tData);
        renderTemplates();
        // If avg time exists, find any current task with that text and add to its notes
        if(avg){
          ALL_SECTIONS.forEach(s => {
            (state[s]||[]).forEach(t => {
              if(t.text.toLowerCase().trim() === text.toLowerCase().trim() && !t.notes){
                t.notes = notes;
              }
            });
          });
          saveState();
        }
        // Update UI
        btn.replaceWith(Object.assign(document.createElement('span'), {
          className: 'pattern-created', textContent: '✓ ritual created (weekly)'
        }));
      });
    });
  } else {
    patternsSection.style.display = 'none';
  }

  // Populate shadows (avoidance detection)
  const shadowsEl = document.getElementById('scry-shadows');
  const shadowsSection = document.getElementById('scry-shadows-section');
  const shadows = detectAvoidance();
  if(shadows.length){
    shadowsSection.style.display = '';
    shadowsEl.innerHTML = shadows.slice(0, 8).map(t => {
      return `<div class="shadow-item">
        <span style="color:#d04060">●</span>
        ${esc(t.text)}
        <span class="shadow-days">${t.ageDays}d untouched • ${SECTION_NAMES[t.sec]||t.sec}</span>
      </div>`;
    }).join('');
  } else {
    shadowsSection.style.display = 'none';
  }

  // Populate Step 2: Recommendations
  generateRecommendations();

  // Show step 1
  document.getElementById('scry-step-1').classList.add('active');
  document.getElementById('scry-step-dump').classList.remove('active');
  document.getElementById('scry-step-checkin').classList.remove('active');
  document.getElementById('scry-step-energy').classList.remove('active');
  document.getElementById('scry-step-2').classList.remove('active');
  // Clear smart dump input
  const dumpSmartInput = document.getElementById('dump-smart-input');
  if(dumpSmartInput) dumpSmartInput.value = '';
  const dumpSmartLog = document.getElementById('dump-smart-log');
  if(dumpSmartLog) dumpSmartLog.innerHTML = '';
  // Reset Payton check-in
  const paytonRow = document.getElementById('scry-payton-row');
  if(paytonRow) paytonRow.style.display = '';
  const paytonMsg = document.getElementById('scry-payton-msg');
  if(paytonMsg){ paytonMsg.style.display = 'none'; paytonMsg.innerHTML = ''; }
  scryOverlay.classList.add('open');
};

export function initScry(){
  // Scry navigation
  document.getElementById('scry-trigger').addEventListener('click', () => openScry());
  document.getElementById('scry-close-1').addEventListener('click', () => scryOverlay.classList.remove('open'));
  document.getElementById('scry-next-1').addEventListener('click', () => {
    document.getElementById('scry-step-1').classList.remove('active');
    document.getElementById('scry-step-dump').classList.add('active');
  });
  document.getElementById('scry-back-dump').addEventListener('click', () => {
    document.getElementById('scry-step-dump').classList.remove('active');
    document.getElementById('scry-step-1').classList.add('active');
  });
  document.getElementById('scry-next-dump').addEventListener('click', () => {
    document.getElementById('scry-step-dump').classList.remove('active');
    document.getElementById('scry-step-checkin').classList.add('active');
    populateScryCheckin();
  });
  document.getElementById('scry-back-checkin').addEventListener('click', () => {
    document.getElementById('scry-step-checkin').classList.remove('active');
    document.getElementById('scry-step-dump').classList.add('active');
  });
  // Payton check-in handlers (in Body & Spirit step)
  const PAYTON_MSGS = [
    "Hey love, just thinking about you. Hope your day is going well 💛",
    "Hi babe — sending you a little love in the middle of the day. You've got this.",
    "Just wanted to say I love you and I hope today is being kind to you.",
    "Thinking of you right now. Hope you're having a good one 🖤",
    "Hey — I love you. That's all. Hope your day is treating you right.",
  ];
  document.getElementById('scry-payton-yes').addEventListener('click', () => {
    const msgEl = document.getElementById('scry-payton-msg');
    msgEl.style.display = 'block';
    msgEl.innerHTML = '<span style="color:#d4a855;font-style:italic">The bond strengthens.</span>';
    document.getElementById('scry-payton-row').style.display = 'none';
    const btn = document.getElementById('scry-payton-yes');
    const rect = btn.getBoundingClientRect();
    spellSealBurst(rect.left + rect.width/2, rect.top + rect.height/2, 'bonds');
  });
  document.getElementById('scry-payton-no').addEventListener('click', () => {
    _paytonPending = true;
    const msgEl = document.getElementById('scry-payton-msg');
    const suggestions = getPaytonSuggestions(1);
    const msg = suggestions[0];
    msgEl.style.display = 'block';
    msgEl.innerHTML = `
      <div style="font-family:'Crimson Text',serif;font-size:10px;color:#6a5a4a;margin-bottom:4px;font-style:italic">A message for Payton:</div>
      <div class="scry-payton-suggest-text" style="font-family:'Crimson Text',serif;font-size:13px;color:var(--text-secondary);cursor:pointer;padding:6px 8px;background:rgba(212,168,85,0.04);border:1px solid rgba(212,168,85,0.1);border-radius:2px">"${msg}"</div>
      <div class="scry-payton-suggest-hint" style="font-family:'Crimson Text',serif;font-size:9px;color:#5a4a3a;font-style:italic;margin-top:3px">tap to copy</div>
    `;
    document.getElementById('scry-payton-row').style.display = 'none';
    msgEl.querySelector('.scry-payton-suggest-text').addEventListener('click', () => {
      navigator.clipboard?.writeText(msg).then(() => {
        msgEl.querySelector('.scry-payton-suggest-hint').textContent = 'copied ✓';
      });
    });
  });

  document.getElementById('scry-next-checkin').addEventListener('click', () => {
    saveStrugglesEntry();
    document.getElementById('scry-step-checkin').classList.remove('active');
    document.getElementById('scry-step-energy').classList.add('active');
    populateEnergyOracle();
  });
  document.getElementById('scry-back-energy').addEventListener('click', () => {
    document.getElementById('scry-step-energy').classList.remove('active');
    document.getElementById('scry-step-checkin').classList.add('active');
  });
  document.getElementById('scry-next-energy').addEventListener('click', () => {
    document.getElementById('scry-step-energy').classList.remove('active');
    document.getElementById('scry-step-2').classList.add('active');
    generateRecommendations(); // Re-generate with energy level applied
  });
  document.getElementById('scry-back-2').addEventListener('click', () => {
    document.getElementById('scry-step-2').classList.remove('active');
    document.getElementById('scry-step-energy').classList.add('active');
  });
  document.getElementById('scry-commit-2').addEventListener('click', commitOaths);
  document.getElementById('scry-reshuffle').addEventListener('click', generateRecommendations);

  // Smart brain dump input — single input with auto-routing
  const dumpInput = document.getElementById('dump-smart-input');
  const dumpLog = document.getElementById('dump-smart-log');
  if(dumpInput){
    dumpInput.addEventListener('keydown', e => {
      if(e.key !== 'Enter') return;
      const raw = dumpInput.value.trim();
      if(!raw) return;

      // Parse with quick-add for metadata
      const parsed = parseQuickAdd(raw);

      // Determine section: explicit @tag > keyword detection > active page default
      let sec = parsed.suggestedSection;
      if(!sec){
        // Keyword detection (same as thought catcher)
        const lower = parsed.text.toLowerCase();
        let bestSec = null, bestScore = 0;
        for(const [s, keywords] of Object.entries(SEC_KEYWORDS)){
          for(const kw of keywords){
            if(lower.includes(kw) && kw.length > bestScore){
              bestSec = s; bestScore = kw.length;
            }
          }
        }
        sec = bestSec || (state.activePage === 'hearth' ? 'hearth' : 'lab');
      }

      // Create the task
      const task = {
        id: uid(), text: parsed.text, done: false,
        priority: parsed.priority, checklist: [], showChecklist: false,
        notes: '', createdAt: new Date().toISOString(),
      };
      if(parsed.estimate) task.estimate = parsed.estimate;
      if(parsed.dueDate) task.dueDate = parsed.dueDate;

      state[sec].push(task);
      logTaskAddition(parsed.text, sec);
      saveState();
      renderSection(sec);

      // Add to visible log
      const secName = SECTION_NAMES[sec] || sec;
      const secColor = SECTION_COLORS[sec] || '#888';
      const entry = document.createElement('div');
      entry.className = 'dump-smart-entry';
      entry.innerHTML = `<span class="dump-smart-check">✓</span>
        <span class="dump-smart-text">${esc(parsed.text)}</span>
        <span class="dump-smart-sec" style="color:${secColor}">${secName.split(' ')[0]}</span>`;
      dumpLog.prepend(entry);
      requestAnimationFrame(() => entry.classList.add('show'));

      dumpInput.value = '';
      dumpInput.focus();
    });
  }

  // Nudge click opens scry
  document.getElementById('scry-nudge').addEventListener('click', (e) => {
    if(e.target.closest('.scry-nudge-dismiss')) return;
    openScry();
  });

  // Dismiss nudge for this session
  document.getElementById('scry-nudge-dismiss').addEventListener('click', (e) => {
    e.stopPropagation();
    const nudge = document.getElementById('scry-nudge');
    nudge.classList.remove('visible');
    nudge.dataset.dismissed = 'true';
  });

  // Check nudge on load
  checkScryNudge();
}

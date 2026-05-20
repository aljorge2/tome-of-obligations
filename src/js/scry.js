// src/js/scry.js — The Scry overlay system
import { esc, uid, formatDuration } from './utils.js';
import { ALL_SECTIONS, SECTION_COLORS, SECTION_NAMES, WORK_SECS, HEARTH_SECS } from './constants.js';
import {
  state, saveState, loadTally, loadAddLog, getAvgTime,
  loadSwapMemory, saveSwapMemory, recordSwap, getSwapAdjustment,
  loadTemplates, saveTemplates, logTaskAddition
} from './state.js';
import { renderSection } from './tasks.js';
import { updateFocusPanel } from './focus.js';
import { renderTemplates } from './templates.js';
import { populateScryCheckin } from './selfcare.js';
import { saveStrugglesEntry } from './struggles.js';

const scryOverlay = document.getElementById('scry-overlay');
let scryWorkPicks = new Set();
let scryHearthPicks = new Set();
let currentWorkRecs = [];
let currentHearthRecs = [];

export function scoreTask(t){
  const prioScore = { critical:50, high:35, medium:20, low:10 };
  let score = prioScore[t.priority] || 5;
  let reasons = [];

  // Age bonus
  if(t.createdAt){
    const ageDays = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000);
    score += Math.min(ageDays * 1.5, 20);
    if(ageDays >= 7) reasons.push('aging — ' + ageDays + ' days old');
    else if(ageDays >= 3) reasons.push('been waiting ' + ageDays + ' days');
  }

  // Priority reason
  if(t.priority === 'critical') reasons.push('critical priority');
  else if(t.priority === 'high') reasons.push('high priority');

  // Checklist near-completion bonus
  const cl = t.checklist || [];
  if(cl.length >= 2){
    const done = cl.filter(c => c.done).length;
    const pct = done / cl.length;
    if(pct >= 0.5){
      score += 12 + pct * 10;
      reasons.push(Math.round(pct * 100) + '% complete — close to a win');
    }
  }

  // Unbound penalty
  const isUnbound = (!cl.length) && (!t.notes || !t.notes.trim());
  if(isUnbound){
    score -= 20;
    reasons.push('needs breaking down');
  }

  // Swap memory adjustment — learn from past swaps
  if(t.id){
    const swapAdj = getSwapAdjustment(t.id);
    score += swapAdj;
    if(swapAdj > 0) reasons.unshift('you chose this before');
    // Note: negative adjustment happens silently (task just ranks lower)
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
  document.getElementById('scry-step-2').classList.remove('active');
  // Clear dump inputs
  document.querySelectorAll('.dump-input').forEach(i => i.value = '');
  document.querySelectorAll('.dump-added').forEach(m => m.classList.remove('show'));
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
  document.getElementById('scry-next-checkin').addEventListener('click', () => {
    saveStrugglesEntry();
    document.getElementById('scry-step-checkin').classList.remove('active');
    document.getElementById('scry-step-2').classList.add('active');
    generateRecommendations();
  });
  document.getElementById('scry-back-2').addEventListener('click', () => {
    document.getElementById('scry-step-2').classList.remove('active');
    document.getElementById('scry-step-checkin').classList.add('active');
  });
  document.getElementById('scry-commit-2').addEventListener('click', commitOaths);
  document.getElementById('scry-reshuffle').addEventListener('click', generateRecommendations);

  // Brain dump inputs — enter to add task to section
  document.querySelectorAll('.dump-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if(e.key !== 'Enter') return;
      const val = input.value.trim();
      if(!val) return;
      const sec = input.dataset.dumpSec;
      if(!state[sec]) return;
      state[sec].push({id:uid(), text:val, done:false, priority:null, checklist:[], showChecklist:false, notes:'', createdAt:new Date().toISOString()});
      logTaskAddition(val, sec);
      saveState(); renderSection(sec);
      const msg = document.querySelector(`[data-dump-msg="${sec}"]`);
      if(msg){
        msg.textContent = `✓ "${val}" added`;
        msg.classList.add('show');
        setTimeout(() => msg.classList.remove('show'), 2000);
      }
      input.value = '';
    });
  });

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

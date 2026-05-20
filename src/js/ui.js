// src/js/ui.js — General UI: tabs, export/import, thought catcher, breakdown modal, radar
import { esc, uid } from './utils.js';
import { ALL_SECTIONS, SECTION_NAMES, SEC_KEYWORDS, RADAR_PROMPTS } from './constants.js';
import {
  state, saveState, loadTally, saveTally, logTaskAddition,
  updateTallyDisplay
} from './state.js';
import { renderSection } from './tasks.js';
import { updateFocusPanel, updateBurdenBars, updateTabBadges, exitLockIn } from './focus.js';
import { renderCalendar } from './calendar.js';
import { renderDayRite, setSwitchPage } from './dayrite.js';
import { lockedInTaskId } from './state.js';

/* ═══ TAB NAVIGATION ═══ */
export function switchPage(page){
  state.activePage = page;
  document.querySelectorAll('.tome-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  saveState();
  updateFocusPanel();
  // Refresh views when switching to them
  if(page === 'calendar') renderCalendar();
  if(page === 'dayrite') renderDayRite();
}

/* ═══ THOUGHT CATCHER ═══ */
function detectSection(text){
  const lower = text.toLowerCase();
  let bestSec = null;
  let bestScore = 0;
  for(const [sec, keywords] of Object.entries(SEC_KEYWORDS)){
    for(const kw of keywords){
      if(lower.includes(kw) && kw.length > bestScore){
        bestSec = sec;
        bestScore = kw.length;
      }
    }
  }
  // Default based on active page
  if(!bestSec){
    bestSec = (state.activePage === 'hearth') ? 'hearth' : 'lab';
  }
  return bestSec;
}

/* ═══ BREAKDOWN MODAL ═══ */
let _bdSec = null, _bdTaskId = null;

export function openBreakdownModal(sec, taskId){
  _bdSec = sec;
  _bdTaskId = taskId;
  const bdOverlay = document.getElementById('breakdown-overlay');
  const bdInput = document.getElementById('bd-input');
  const bdQuestion = document.getElementById('bd-question');
  const taskObj = state[sec].find(t => t.id == taskId);
  if(!taskObj) return;
  document.getElementById('bd-task-name').textContent = taskObj.text;
  bdQuestion.textContent = (taskObj.checklist && taskObj.checklist.length)
    ? 'What comes next?'
    : "What's the very first step you'd take?";
  renderBdSteps(taskObj);
  bdOverlay.classList.add('open');
  setTimeout(() => bdInput.focus(), 100);
}

function renderBdSteps(taskObj){
  const bdSteps = document.getElementById('bd-steps');
  const cl = taskObj.checklist || [];
  if(cl.length){
    bdSteps.innerHTML = cl.map(c =>
      `<div class="breakdown-step"><span class="breakdown-step-dot">✓</span> ${esc(c.text)}</div>`
    ).join('');
  } else {
    bdSteps.innerHTML = '';
  }
}

function closeBreakdownModal(){
  const bdOverlay = document.getElementById('breakdown-overlay');
  const bdInput = document.getElementById('bd-input');
  bdOverlay.classList.remove('open');
  bdInput.value = '';
  if(_bdSec) renderSection(_bdSec);
  _bdSec = null; _bdTaskId = null;
}

/* ═══ RADAR ═══ */
function updateRadar(){
  const el = document.getElementById('radar-text');
  if(!el) return;
  // Pick based on day so it's stable within a day but rotates daily
  const dayNum = Math.floor(Date.now() / 86400000);
  const idx = dayNum % RADAR_PROMPTS.length;
  el.textContent = RADAR_PROMPTS[idx];
}

/* ═══ INIT ═══ */
export function initUI(){
  // Tab clicks
  document.querySelectorAll('.tome-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPage(tab.dataset.page));
  });
  // Give Day's Rite access to switchPage
  setSwitchPage(switchPage);
  // Restore active page
  switchPage(state.activePage || 'work');

  // Collapsible sections
  if(!state.collapsed) state.collapsed = {};

  // Apply saved collapsed state
  document.querySelectorAll('.section[data-sec]').forEach(sec => {
    const key = sec.dataset.sec;
    if(state.collapsed[key]) sec.classList.add('collapsed');
  });

  // Toggle on header click (but not on buttons inside header)
  document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if(e.target.closest('.clear-done-btn') || e.target.closest('.section-count')) return;
      const section = header.closest('.section[data-sec]');
      if(!section) return;
      section.classList.toggle('collapsed');
      state.collapsed[section.dataset.sec] = section.classList.contains('collapsed');
      saveState();
    });
  });

  // Export
  document.getElementById('btn-export').addEventListener('click', () => {
    const data = {
      state: state,
      tally: loadTally(),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tome_backup_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if(data.state){
          Object.assign(state, data.state);
          saveState();
          if(data.tally) saveTally(data.tally);
          ALL_SECTIONS.forEach(renderSection);
          updateFocusPanel(); updateBurdenBars(); updateTabBadges(); updateTallyDisplay();
          alert('Tome restored successfully.');
        }
      } catch(err){ alert('Failed to restore: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Thought catcher
  const tcToggle = document.getElementById('tc-toggle');
  const tcPanel = document.getElementById('tc-panel');
  const tcInput = document.getElementById('tc-input');
  const tcConfirm = document.getElementById('tc-confirm');

  tcToggle.addEventListener('click', () => {
    tcPanel.classList.toggle('open');
    if(tcPanel.classList.contains('open')) tcInput.focus();
  });

  tcInput.addEventListener('keydown', e => {
    if(e.key !== 'Enter') return;
    const val = tcInput.value.trim();
    if(!val) return;
    const sec = detectSection(val);
    state[sec].push({id:uid(), text:val, done:false, priority:null, checklist:[], showChecklist:false, notes:'', createdAt:new Date().toISOString()});
    logTaskAddition(val, sec);
    saveState(); renderSection(sec);
    tcConfirm.textContent = `✓ captured → ${SECTION_NAMES[sec]||sec}`;
    tcConfirm.classList.add('show');
    setTimeout(() => tcConfirm.classList.remove('show'), 2500);
    tcInput.value = '';
  });

  // Close thought catcher when clicking outside
  document.addEventListener('click', e => {
    if(!e.target.closest('.thought-catcher') && tcPanel.classList.contains('open')){
      tcPanel.classList.remove('open');
    }
  });

  // Breakdown modal
  const bdOverlay = document.getElementById('breakdown-overlay');
  const bdInput = document.getElementById('bd-input');
  const bdQuestion = document.getElementById('bd-question');

  bdInput.addEventListener('keydown', e => {
    if(e.key === 'Enter'){
      e.preventDefault();
      const val = bdInput.value.trim();
      if(!val || !_bdSec || !_bdTaskId) return;
      const taskObj = state[_bdSec].find(t => t.id == _bdTaskId);
      if(!taskObj) return;
      if(!taskObj.checklist) taskObj.checklist = [];
      taskObj.checklist.push({text: val, done: false});
      taskObj.showChecklist = true;
      saveState();
      bdInput.value = '';
      bdQuestion.textContent = 'What comes next?';
      renderBdSteps(taskObj);
      bdInput.focus();
    } else if(e.key === 'Escape'){
      closeBreakdownModal();
    }
  });

  document.getElementById('bd-done').addEventListener('click', closeBreakdownModal);
  bdOverlay.addEventListener('click', e => {
    if(e.target === bdOverlay) closeBreakdownModal();
  });

  // Radar
  updateRadar();

  // Escape key exits lock-in
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && lockedInTaskId){
      exitLockIn();
    }
  });
}

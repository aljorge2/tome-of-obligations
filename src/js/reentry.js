// src/js/reentry.js — Re-entry flow after 3+ day gap
// Shows simplified "here's what matters" instead of full overwhelm.
// Welcome back, not guilt.

import { state, saveState } from './state.js';
import { ALL_SECTIONS, SECTION_NAMES, SECTION_COLORS, HEARTH_SECS } from './constants.js';
import { scoreTask } from './scry.js';

const LAST_VISIT_KEY = 'tome_last_visit';

function loadLastVisit(){
  try { return parseInt(localStorage.getItem(LAST_VISIT_KEY)) || 0; } catch(e){ return 0; }
}

export function recordVisit(){
  try { localStorage.setItem(LAST_VISIT_KEY, Date.now().toString()); } catch(e){}
}

function getDaysAway(){
  const last = loadLastVisit();
  if(!last) return 0;
  return Math.floor((Date.now() - last) / 86400000);
}

function getTopTasks(count = 5){
  const all = [];
  ALL_SECTIONS.forEach(sec => {
    (state[sec]||[]).forEach(t => {
      if(!t.done && !t.released){
        const s = scoreTask(t);
        all.push({ ...t, sec, _score: s.score, _reason: s.reason });
      }
    });
  });
  return all.sort((a,b) => b._score - a._score).slice(0, count);
}

function getStats(){
  let totalOpen = 0, totalDone = 0, stale = 0;
  ALL_SECTIONS.forEach(sec => {
    (state[sec]||[]).forEach(t => {
      if(t.done) totalDone++;
      else {
        totalOpen++;
        // Stale = older than 14 days and untouched
        if(t.createdAt){
          const age = (Date.now() - new Date(t.createdAt).getTime()) / 86400000;
          if(age > 14 && !t.focusedMs) stale++;
        }
      }
    });
  });
  return { totalOpen, totalDone, stale };
}

export function shouldShowReentry(){
  const days = getDaysAway();
  return days >= 3;
}

export function showReentry(){
  const days = getDaysAway();
  const stats = getStats();
  const top = getTopTasks(5);
  
  // Clear stale sworn oaths
  state.swornOaths = [];
  state.swornOrder = [];
  saveState();
  
  const greeting = days >= 14 ? "It's been a while. The tome waited patiently."
    : days >= 7 ? "A week has passed. Welcome back — no judgment here."
    : "A few days away. The tome is glad to see you.";
  
  const topTasksHtml = top.map(t => {
    const color = SECTION_COLORS[t.sec] || '#8a6a30';
    const secName = SECTION_NAMES[t.sec];
    return `<div class="reentry-task">
      <span class="reentry-task-dot" style="background:${color}"></span>
      <span class="reentry-task-text">${escHtml(t.text)}</span>
      <span class="reentry-task-sec" style="color:${color}">${secName}</span>
    </div>`;
  }).join('');
  
  const staleNote = stats.stale > 0 
    ? `<div class="reentry-stale">${stats.stale} task${stats.stale > 1 ? 's have' : ' has'} been untouched for 2+ weeks. You can release them during your next Scry.</div>`
    : '';
  
  const overlay = document.createElement('div');
  overlay.className = 'reentry-overlay';
  overlay.innerHTML = `
    <div class="reentry-panel">
      <div class="reentry-sigil"><i class="ti ti-book-2"></i></div>
      <div class="reentry-title">Welcome Back</div>
      <div class="reentry-greeting">${greeting}</div>
      <div class="reentry-days">${days} days since your last visit</div>
      
      <div class="reentry-section">
        <div class="reentry-section-title">What Matters Now</div>
        <div class="reentry-summary">${stats.totalOpen} open task${stats.totalOpen !== 1 ? 's' : ''} across the tome</div>
        ${topTasksHtml}
      </div>
      
      ${staleNote}
      
      <div class="reentry-actions">
        <button class="reentry-btn reentry-btn-primary" id="reentry-scry">
          <i class="ti ti-eye"></i> Scry & Set Oaths
        </button>
        <button class="reentry-btn" id="reentry-birdseye">
          <i class="ti ti-layout-list"></i> Bird's Eye View
        </button>
        <button class="reentry-btn" id="reentry-enter">
          <i class="ti ti-door-enter"></i> Enter the Tome
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
  
  function close(){
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
    recordVisit();
  }
  
  overlay.querySelector('#reentry-scry').addEventListener('click', () => {
    close();
    setTimeout(() => document.getElementById('scry-trigger')?.click(), 350);
  });
  
  overlay.querySelector('#reentry-birdseye').addEventListener('click', () => {
    close();
    setTimeout(() => document.getElementById('birdseye-toggle')?.click(), 200);
  });
  
  overlay.querySelector('#reentry-enter').addEventListener('click', close);
}

function escHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function initReentry(){
  // Record visit on every load (after checking if we need re-entry)
  // The actual check happens in opening.js
}

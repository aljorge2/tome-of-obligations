// src/js/timeanchor.js — Passive elapsed time display on active task
// Fights time blindness: shows a subtle growing timer on working/locked-in tasks
// Non-intrusive — no alarms, just a gentle visual anchor

import { lockedInTaskId, lockinStartTime } from './state.js';

const WORKING_KEY = 'tome_working_on';
let _interval = null;

function getWorkingSet(){
  try { return JSON.parse(localStorage.getItem(WORKING_KEY)) || {}; } catch(e){ return {}; }
}

function getStartTime(taskId){
  const set = getWorkingSet();
  return set._startTimes?.[taskId] || null;
}

function formatElapsed(ms){
  const mins = Math.floor(ms / 60000);
  if(mins < 1) return '<1m';
  if(mins < 60) return mins + 'm';
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return hrs + 'h' + (rem > 0 ? rem + 'm' : '');
}

function getElapsedColor(mins){
  // Subtle color shift as time grows — not alarming, just informative
  if(mins < 15) return 'rgba(60,168,85,0.4)';   // soft green — just started
  if(mins < 30) return 'rgba(60,168,85,0.5)';   // green
  if(mins < 45) return 'rgba(212,168,85,0.5)';  // gold — noticeable
  if(mins < 60) return 'rgba(208,136,56,0.5)';  // amber
  if(mins < 90) return 'rgba(208,104,136,0.5)';  // pink — maybe take a break
  return 'rgba(160,50,70,0.5)';                   // crimson — definitely take a break
}

function updateAnchors(){
  // Update lock-in timer anchor
  if(lockedInTaskId && lockinStartTime){
    const el = document.querySelector('.lockin-elapsed-anchor');
    if(el){
      const elapsed = Date.now() - lockinStartTime;
      const mins = Math.floor(elapsed / 60000);
      el.textContent = formatElapsed(elapsed);
      el.style.color = getElapsedColor(mins);
    }
  }
  
  // Update working-on task anchors
  document.querySelectorAll('.task-item.working-on').forEach(taskEl => {
    const taskId = taskEl.dataset.id;
    const startTime = getStartTime(taskId);
    if(!startTime) return;
    
    let anchor = taskEl.querySelector('.time-anchor');
    if(!anchor){
      anchor = document.createElement('span');
      anchor.className = 'time-anchor';
      // Insert into the task-row, after task-main
      const row = taskEl.querySelector('.task-row');
      if(row) row.appendChild(anchor);
    }
    
    const elapsed = Date.now() - startTime;
    const mins = Math.floor(elapsed / 60000);
    anchor.textContent = formatElapsed(elapsed);
    anchor.style.color = getElapsedColor(mins);
    anchor.title = `Working for ${formatElapsed(elapsed)}`;
  });
  
  // Clean up anchors on tasks no longer working
  document.querySelectorAll('.time-anchor').forEach(anchor => {
    const taskEl = anchor.closest('.task-item');
    if(taskEl && !taskEl.classList.contains('working-on')){
      anchor.remove();
    }
  });
}

export function initTimeAnchor(){
  // Update every 15 seconds — frequent enough to feel alive, not enough to distract
  _interval = setInterval(updateAnchors, 15000);
  // Initial update
  setTimeout(updateAnchors, 2000);
}

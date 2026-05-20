// src/js/archive.js — Sealed archive
import { esc, formatDuration } from './utils.js';
import { SECTION_COLORS } from './constants.js';
import { loadArchive, saveArchive } from './state.js';

export function archiveTask(task, sec){
  const archive = loadArchive();
  archive.push({
    text: task.text, sec, sealedAt: new Date().toISOString(),
    focusedMs: task.focusedMs || 0, priority: task.priority,
    checklistCount: (task.checklist||[]).length
  });
  saveArchive(archive);
}

export function renderArchive(){
  const archive = loadArchive();
  const body = document.getElementById('archive-body');
  if(!archive.length){ body.innerHTML = '<div style="color:#4a2a35;font-style:italic;font-size:12px;padding:4px 0">no sealed tasks yet</div>'; return; }
  // Group by date
  const groups = {};
  archive.slice().reverse().forEach(a => {
    const day = a.sealedAt ? a.sealedAt.slice(0,10) : 'unknown';
    if(!groups[day]) groups[day] = [];
    groups[day].push(a);
  });
  const days = Object.keys(groups).slice(0, 7); // last 7 days
  body.innerHTML = days.map(day => {
    const items = groups[day];
    const label = day === new Date().toISOString().slice(0,10) ? 'Today' : new Date(day+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    return `<div class="archive-day-label">${label} (${items.length})</div>` +
      items.map(a => {
        const time = a.focusedMs > 0 ? `<span class="archive-time">${formatDuration(a.focusedMs)}</span>` : '';
        return `<div class="archive-item"><span style="color:${SECTION_COLORS[a.sec]||'#888'}">●</span> ${esc(a.text)} ${time}</div>`;
      }).join('');
  }).join('');
}

export function initArchive(){
  document.getElementById('archive-header').addEventListener('click', () => {
    document.getElementById('archive-panel').classList.toggle('open');
    renderArchive();
  });
}

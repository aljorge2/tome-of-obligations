// src/js/templates.js — Recurring rituals
import { esc, uid, formatDuration } from './utils.js';
import { ALL_SECTIONS, SECTION_COLORS } from './constants.js';
import { state, saveState, loadTemplates, saveTemplates, getAvgTime } from './state.js';
import { renderSection } from './tasks.js';

export function renderTemplates(){
  const data = loadTemplates();
  const list = document.getElementById('templates-list');
  if(!list) return;
  list.innerHTML = '';
  if(!data.templates.length){
    list.innerHTML = '<div style="font-family:Crimson Text,serif;font-size:12px;color:#5a4030;font-style:italic;padding:2px 4px">no rituals set — add recurring tasks below</div>';
    return;
  }
  data.templates.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'template-row';
    row.innerHTML = `<span class="template-cadence">${t.cadence}</span><span>${esc(t.text)}</span><span style="color:${SECTION_COLORS[t.target]||'#888'};font-size:10px;margin-left:4px">●</span><span class="template-remove" data-idx="${i}"><i class="ti ti-x" style="font-size:10px"></i></span>`;
    row.querySelector('.template-remove').addEventListener('click', () => {
      data.templates.splice(i, 1);
      saveTemplates(data); renderTemplates();
    });
    list.appendChild(row);
  });
}

export function spawnRecurring(){
  const data = loadTemplates();
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const weekKey = 'w' + Math.floor(now.getTime() / (7*86400000));
  const biweekKey = 'bw' + Math.floor(now.getTime() / (14*86400000));
  const monthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  let changed = false;

  data.templates.forEach((t, i) => {
    const key = 'tmpl_' + i;
    let periodKey;
    if(t.cadence === 'daily') periodKey = todayKey;
    else if(t.cadence === 'weekly') periodKey = weekKey;
    else if(t.cadence === 'biweekly') periodKey = biweekKey;
    else if(t.cadence === 'monthly') periodKey = monthKey;

    if(data.lastSpawned[key] !== periodKey){
      // Check if a matching undone task already exists
      const sec = t.target;
      const exists = (state[sec]||[]).some(task => !task.done && task.text === t.text);
      if(!exists){
        const avg = getAvgTime(t.text);
        const noteText = avg ? `Avg time: ${formatDuration(avg)}` : '';
        state[sec].push({id:uid(), text:t.text, done:false, priority:null, checklist:[], showChecklist:false, notes:noteText, createdAt:new Date().toISOString()});
        changed = true;
      }
      data.lastSpawned[key] = periodKey;
    }
  });

  if(changed){
    saveState();
    saveTemplates(data);
    ALL_SECTIONS.forEach(renderSection);
  } else {
    saveTemplates(data); // save updated lastSpawned keys
  }
}

export function initTemplates(){
  // Add button
  document.getElementById('template-add-btn').addEventListener('click', () => {
    const textEl = document.getElementById('template-text');
    const cadenceEl = document.getElementById('template-cadence');
    const targetEl = document.getElementById('template-target');
    const text = textEl.value.trim();
    if(!text) return;
    const data = loadTemplates();
    data.templates.push({ text, cadence: cadenceEl.value, target: targetEl.value });
    saveTemplates(data);
    textEl.value = '';
    renderTemplates();
  });
  document.getElementById('template-text').addEventListener('keydown', e => {
    if(e.key === 'Enter') document.getElementById('template-add-btn').click();
  });

  // Templates header toggle
  document.getElementById('templates-header').addEventListener('click', () => {
    document.getElementById('templates-section').classList.toggle('open');
  });

  // Initial render + spawn
  renderTemplates();
  spawnRecurring();
}

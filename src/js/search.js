// src/js/search.js — Non-distracting search across all sections
// Cmd+K / Ctrl+K trigger, overlay with results, click to jump

import { esc } from './utils.js';
import { ALL_SECTIONS, SECTION_NAMES, SECTION_COLORS } from './constants.js';
import { state } from './state.js';
import { switchPage } from './ui.js';

let _overlay = null;
let _input = null;
let _results = null;
let _selectedIdx = -1;
let _flatResults = [];

function getAllTasks(){
  const tasks = [];
  ALL_SECTIONS.forEach(sec => {
    (state[sec]||[]).forEach(t => {
      tasks.push({ ...t, sec });
    });
  });
  return tasks;
}

function search(query){
  if(!query.trim()) return [];
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  const all = getAllTasks();
  
  return all.filter(t => {
    const hay = (t.text + ' ' + (t.notes||'') + ' ' + (t.checklist||[]).map(c=>c.text).join(' ')).toLowerCase();
    return words.every(w => hay.includes(w));
  }).map(t => {
    // Score: exact match > starts with > contains. Undone > done.
    let score = 0;
    const lower = t.text.toLowerCase();
    if(lower === q) score += 100;
    else if(lower.startsWith(q)) score += 50;
    else if(lower.includes(q)) score += 25;
    if(!t.done) score += 10;
    return { ...t, _searchScore: score };
  }).sort((a,b) => b._searchScore - a._searchScore).slice(0, 12);
}

function renderResults(results){
  _flatResults = results;
  _selectedIdx = -1;
  if(!results.length){
    _results.innerHTML = '<div class="search-empty">no inscriptions match</div>';
    return;
  }
  _results.innerHTML = results.map((t, i) => {
    const secColor = SECTION_COLORS[t.sec] || '#8a6a30';
    const secName = SECTION_NAMES[t.sec] || t.sec;
    const checkCount = (t.checklist||[]).length;
    const checkDone = (t.checklist||[]).filter(c=>c.done).length;
    const checkInfo = checkCount ? `<span class="search-check">[${checkDone}/${checkCount}]</span>` : '';
    return `<div class="search-result${t.done ? ' done' : ''}" data-idx="${i}">
      <span class="search-sec-dot" style="background:${secColor}"></span>
      <span class="search-text">${esc(t.text)}</span>
      ${checkInfo}
      <span class="search-sec-label" style="color:${secColor}">${secName}</span>
    </div>`;
  }).join('');
}

function jumpToTask(task){
  // Switch to the correct page
  const workSecs = ['lab','bio'];
  const hearthSecs = ['hearth','scrolls','forge','bonds'];
  if(workSecs.includes(task.sec)) switchPage('work');
  else if(hearthSecs.includes(task.sec)) switchPage('hearth');

  closeSearch();

  // Scroll to and highlight the task
  setTimeout(() => {
    // Uncollapse the section if needed
    const secEl = document.querySelector(`.section[data-sec="${task.sec}"]`);
    if(secEl && secEl.classList.contains('collapsed')){
      secEl.classList.remove('collapsed');
      state.collapsed[task.sec] = false;
    }
    
    const taskEl = document.querySelector(`.task-item[data-id="${task.id}"]`);
    if(taskEl){
      taskEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      taskEl.classList.add('search-highlight');
      setTimeout(() => taskEl.classList.remove('search-highlight'), 2000);
    }
  }, 150);
}

function updateSelection(){
  _results.querySelectorAll('.search-result').forEach((el, i) => {
    el.classList.toggle('selected', i === _selectedIdx);
  });
  if(_selectedIdx >= 0){
    const sel = _results.querySelector('.search-result.selected');
    if(sel) sel.scrollIntoView({ block: 'nearest' });
  }
}

export function openSearch(){
  if(_overlay) return;

  _overlay = document.createElement('div');
  _overlay.className = 'search-overlay';
  _overlay.innerHTML = `
    <div class="search-panel">
      <div class="search-bar">
        <i class="ti ti-search search-icon"></i>
        <input class="search-input" id="tome-search-input" placeholder="search the tome…" autocomplete="off" />
        <span class="search-shortcut">esc</span>
      </div>
      <div class="search-results" id="tome-search-results"></div>
    </div>
  `;

  document.body.appendChild(_overlay);
  _input = document.getElementById('tome-search-input');
  _results = document.getElementById('tome-search-results');

  requestAnimationFrame(() => {
    _overlay.classList.add('visible');
    _input.focus();
  });

  // Input handler
  _input.addEventListener('input', () => {
    const results = search(_input.value);
    renderResults(results);
  });

  // Keyboard navigation
  _input.addEventListener('keydown', (e) => {
    if(e.key === 'ArrowDown'){
      e.preventDefault();
      _selectedIdx = Math.min(_selectedIdx + 1, _flatResults.length - 1);
      updateSelection();
    } else if(e.key === 'ArrowUp'){
      e.preventDefault();
      _selectedIdx = Math.max(_selectedIdx - 1, -1);
      updateSelection();
    } else if(e.key === 'Enter'){
      e.preventDefault();
      if(_selectedIdx >= 0 && _flatResults[_selectedIdx]){
        jumpToTask(_flatResults[_selectedIdx]);
      }
    } else if(e.key === 'Escape'){
      closeSearch();
    }
  });

  // Click on result
  _results.addEventListener('click', (e) => {
    const resultEl = e.target.closest('.search-result');
    if(resultEl){
      const idx = parseInt(resultEl.dataset.idx);
      if(_flatResults[idx]) jumpToTask(_flatResults[idx]);
    }
  });

  // Click backdrop to close
  _overlay.addEventListener('click', (e) => {
    if(e.target === _overlay) closeSearch();
  });
}

function closeSearch(){
  if(!_overlay) return;
  _overlay.classList.remove('visible');
  setTimeout(() => { _overlay?.remove(); _overlay = null; _input = null; _results = null; }, 200);
}

export function initSearch(){
  // Cmd+K / Ctrl+K to open
  document.addEventListener('keydown', (e) => {
    if((e.metaKey || e.ctrlKey) && e.key === 'k'){
      e.preventDefault();
      if(_overlay) closeSearch();
      else openSearch();
    }
  });

  // Search trigger button
  document.getElementById('search-trigger')?.addEventListener('click', openSearch);
}

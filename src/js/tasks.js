// src/js/tasks.js — Core task CRUD and rendering
import { esc, uid, formatDuration } from './utils.js';
import { PRIORITIES, ALL_SECTIONS, SECTION_COLORS, SECTION_NAMES, ESTIMATE_OPTIONS } from './constants.js';
import {
  state, saveState, recordCompletion, logTaskAddition, getAvgTime,
  loadChecklistMemory, saveChecklistMemory, rememberChecklist, recallChecklist,
  lockedInTaskId, focusPeekMode
} from './state.js';
import { miniSparkBurst, spellSealBurst } from './canvas/index.js';
import { emit } from './events.js';
import { enterLockIn } from './focus.js';
import { archiveTask } from './archive.js';
import { openBreakdownModal } from './ui.js';

/* ═══ CLARITY SCORING ═══ */
export function getClarity(task){
  if(task.done) return { score: 3, level: 'done' };
  let score = 0;
  const cl = task.checklist || [];
  const notes = task.notes || '';
  // Has checklist with 2+ items
  if(cl.length >= 3) score += 1.5;
  else if(cl.length >= 1) score += 0.75;
  // Has substantive notes (10+ chars)
  if(notes.trim().length >= 10) score += 0.75;
  else if(notes.trim().length >= 3) score += 0.25;
  // Has estimate
  if(task.estimate) score += 0.5;
  // Has priority
  if(task.priority) score += 0.25;
  // Cap at 3
  score = Math.min(score, 3);
  const level = score >= 2 ? 'clear' : score >= 1 ? 'partial' : 'vague';
  return { score, level };
}

export function clarityHTML(task){
  const c = getClarity(task);
  if(task.done) return '';
  const pips = [0,1,2].map(i => {
    const filled = c.score >= (i+1);
    const half = !filled && c.score >= (i+0.5);
    const cls = c.level === 'vague' ? 'bad' : c.level === 'partial' ? 'warn' : 'filled';
    return `<div class="clarity-pip${filled || half ? ' '+cls : ''}"></div>`;
  }).join('');
  return `<span class="clarity-bar" title="Clarity: ${c.level}">${pips}</span>`;
}

/* ═══ TIME ESTIMATES ═══ */
export function getSmartEstimate(text){
  // Check time log for average
  const avg = getAvgTime(text);
  if(avg){
    const mins = Math.round(avg / 60000);
    return mins;
  }
  return 30; // default
}

/* ═══ SECTION-CLEARED DETECTION ═══ */
export function checkSectionCleared(sec){
  const tasks = state[sec];
  if(!tasks || tasks.length === 0) return;
  const allDone = tasks.every(t => t.done);
  if(allDone){
    const secEl = document.querySelector(`.section[data-sec="${sec}"]`);
    if(secEl && !secEl.classList.contains('all-cleared')){
      secEl.classList.add('all-cleared');
      setTimeout(() => secEl.classList.remove('all-cleared'), 2100);
    }
  }
}

/* ═══ COUNT ═══ */
export function updateCount(sec){
  const tasks = state[sec];
  const el = document.getElementById(sec+'-count');
  const clearBtn = document.getElementById(sec+'-clear');
  if(!tasks.length){ el.textContent=''; if(clearBtn) clearBtn.classList.remove('visible'); return; }
  const done = tasks.filter(t=>t.done).length;
  el.textContent = done+' / '+tasks.length+' bound';
  if(clearBtn){
    if(done > 0) clearBtn.classList.add('visible');
    else clearBtn.classList.remove('visible');
  }
}

/* ═══ ARCHIVE TRACKING ═══ */
let _prevDoneStates = {};
function snapshotDoneStates(){
  const snap = {};
  ALL_SECTIONS.forEach(sec => {
    (state[sec]||[]).forEach(t => { snap[t.id] = t.done; });
  });
  return snap;
}

/* ═══ RENDER SECTION ═══ */
export function renderSection(sec){
  // Check if any task just got completed (for archive)
  (state[sec]||[]).forEach(t => {
    if(t.done && _prevDoneStates[t.id] === false){
      archiveTask(t, sec);
      rememberChecklist(t.text, t.checklist);
    }
  });
  _prevDoneStates = snapshotDoneStates();

  const c = document.getElementById(sec+'-tasks');
  c.innerHTML='';
  state[sec].forEach(task => c.appendChild(buildTaskEl(sec, task)));
  updateCount(sec);

  // Emit event so other modules can react (replaces monkey-patching)
  emit('sectionRendered', sec);
}

/* ═══ BUILD TASK ELEMENT ═══ */
export function buildTaskEl(sec, task){
  const item = document.createElement('div');
  item.className = 'task-item'+(task.done?' done':'');
  item.dataset.id = task.id;
  const prioInfo = PRIORITIES.find(p=>p.key===task.priority);
  const prioBadge = prioInfo
    ? `<span class="priority-badge ${prioInfo.cls}" data-action="toggle-prio">${prioInfo.label}</span>`
    : `<span class="priority-badge pp-none" data-action="toggle-prio" style="opacity:0.4;font-size:7px">✦ priority</span>`;
  const cl = task.checklist||[];
  const checkSummary = cl.length
    ? `<span style="font-size:11px;color:#6a4050;margin-left:8px;font-style:italic;letter-spacing:0.05em">[${cl.filter(c=>c.done).length}/${cl.length}]</span>` : '';

  // Age badge
  let ageBadge = '';
  if(task.createdAt && !task.done){
    const ageMs = Date.now() - new Date(task.createdAt).getTime();
    const ageDays = Math.floor(ageMs / 86400000);
    if(ageDays >= 1){
      let cls = 'age-fresh', label = ageDays + 'd';
      if(ageDays >= 7) { cls = 'age-old'; }
      else if(ageDays >= 4) { cls = 'age-stale'; }
      else if(ageDays >= 2) { cls = 'age-warm'; }
      ageBadge = `<span class="age-badge ${cls}">${label}</span>`;
    }
  }

  // Unbound (vague) indicator — no checklist AND no notes AND not done
  const isUnbound = !task.done && (!cl.length) && (!task.notes || !task.notes.trim());
  const unboundBadge = isUnbound ? `<span class="unbound-badge" title="This task needs breaking down — add a checklist or notes to clarify">unbound</span>` : '';

  // Notes
  const noteContent = task.notes ? `<div class="task-note-text">${esc(task.notes)}</div>` : `<div class="task-note-text" style="color:#4a2a35;font-size:12px">no notes yet — click edit to add</div>`;

  item.innerHTML = `
    <div class="task-row" data-action="toggle-done">
      <div class="rune-box"><i class="ti ti-sparkles" style="font-size:10px"></i></div>
      <div class="task-main">
        <span class="task-text">${esc(task.text)}</span>${prioBadge}${checkSummary}${ageBadge}${unboundBadge}
      </div>
    </div>
    <div class="task-actions">
      <span class="action-btn" data-action="begin-focus" style="color:rgba(208,104,136,0.5);border-color:rgba(208,104,136,0.2)"><i class="ti ti-focus-2"></i>focus</span>
      <span class="action-btn" data-action="edit-text"><i class="ti ti-pencil"></i>edit</span>
      <span class="action-btn" data-action="toggle-notes"><i class="ti ti-note"></i>notes</span>
      <span class="action-btn" data-action="toggle-prio"><i class="ti ti-flag-3"></i>priority</span>
      <span class="action-btn" data-action="toggle-list"><i class="ti ti-list-check"></i>checklist</span>
      <span class="task-delete action-btn" data-action="delete"><i class="ti ti-skull"></i>banish</span>
    </div>
    <div class="task-note${task.showNotes?' visible':''}" id="note-${task.id}">
      ${noteContent}
    </div>
    <div class="priority-picker" id="pp-${task.id}">
      ${PRIORITIES.map(p=>`<span class="pp-opt ${p.cls}" data-action="set-prio" data-prio="${p.key}">${p.label}</span>`).join('')}
      <span class="pp-opt pp-none" data-action="set-prio" data-prio="">None</span>
    </div>
    <div class="checklist" id="cl-${task.id}" style="${task.showChecklist?'':'display:none'}">
      ${cl.map((c,ci)=>`
        <div class="check-row${c.done?' done':''}" data-action="toggle-check" data-ci="${ci}">
          <div class="check-box"><i class="ti ti-sparkles" style="font-size:8px"></i></div>
          <span class="check-label">${esc(c.text)}</span>
          <span class="check-delete" data-action="del-check" data-ci="${ci}"><i class="ti ti-x" style="font-size:10px"></i></span>
        </div>`).join('')}
      <div class="add-subitem">
        <span class="add-subitem-plus"><i class="ti ti-corner-down-right" style="font-size:11px;color:rgba(140,60,80,0.4)"></i></span>
        <input placeholder="add sub-task…" data-action="add-check" />
      </div>
    </div>`;

  // --- Enhanced task rendering: clarity, estimate badge, estimate picker, breakdown, promote ---
  if(!task.done){
    // Add clarity indicator after unbound badge (or where it would be)
    const mainEl = item.querySelector('.task-main');
    if(mainEl){
      const oldUnbound = mainEl.querySelector('.unbound-badge');
      const clarityEl = document.createElement('span');
      clarityEl.innerHTML = clarityHTML(task);
      if(oldUnbound) oldUnbound.replaceWith(clarityEl);
      else mainEl.appendChild(clarityEl);
    }

    // Add estimate badge
    if(task.estimate){
      const mainEl2 = item.querySelector('.task-main');
      if(mainEl2){
        const badge = document.createElement('span');
        badge.className = 'estimate-badge';
        badge.textContent = '~' + task.estimate + 'm';
        badge.dataset.action = 'toggle-estimate';
        mainEl2.appendChild(badge);
      }
    }
  }

  // Add estimate button and breakdown prompt to action row
  const actionsRow = item.querySelector('.task-actions');
  if(actionsRow && !task.done){
    // Estimate button
    const estBtn = document.createElement('span');
    estBtn.className = 'action-btn';
    estBtn.dataset.action = 'toggle-estimate';
    estBtn.innerHTML = '<i class="ti ti-clock"></i>time';
    actionsRow.insertBefore(estBtn, actionsRow.querySelector('.task-delete'));

    // Breakdown button (only if low clarity)
    const c = getClarity(task);
    if(c.level === 'vague'){
      const bdBtn = document.createElement('span');
      bdBtn.className = 'action-btn';
      bdBtn.dataset.action = 'toggle-breakdown';
      bdBtn.style.color = 'rgba(200,140,40,0.6)';
      bdBtn.style.borderColor = 'rgba(200,140,40,0.2)';
      bdBtn.innerHTML = '<i class="ti ti-puzzle"></i>break down';
      actionsRow.insertBefore(bdBtn, actionsRow.querySelector('[data-action="toggle-prio"]'));
    }
  }

  // Add estimate picker
  const estPicker = document.createElement('div');
  estPicker.className = 'estimate-picker';
  estPicker.id = 'est-' + task.id;
  estPicker.innerHTML = ESTIMATE_OPTIONS.map(o =>
    `<span class="estimate-chip${task.estimate === o.mins ? ' active' : ''}" data-action="set-estimate" data-mins="${o.mins}">${o.label}</span>`
  ).join('');
  const ppEl = item.querySelector('.priority-picker');
  if(ppEl) ppEl.after(estPicker);

  // Add promote buttons to checklist items
  const checkRows = item.querySelectorAll('.check-row');
  checkRows.forEach(row => {
    const promoteBtn = document.createElement('span');
    promoteBtn.className = 'check-promote';
    promoteBtn.dataset.action = 'promote-check';
    promoteBtn.dataset.ci = row.dataset.ci || row.getAttribute('data-ci');
    promoteBtn.title = 'Promote to task';
    promoteBtn.innerHTML = '<i class="ti ti-arrow-up-right" style="font-size:10px"></i>';
    const deleteBtn = row.querySelector('.check-delete');
    if(deleteBtn) row.insertBefore(promoteBtn, deleteBtn);
  });

  // --- Original event delegation ---
  item.addEventListener('click', e => {
    const action = e.target.closest('[data-action]');
    if(!action) return;
    const act = action.dataset.action;
    const taskObj = state[sec].find(t=>t.id==task.id);
    if(act==='toggle-done'){
      const wasDone = taskObj.done;
      taskObj.done=!taskObj.done;
      // Fire celebration burst when completing (not uncompleting)
      if(!wasDone && taskObj.done){
        const runeBox = item.querySelector('.rune-box');
        if(runeBox){
          const rect = runeBox.getBoundingClientRect();
          spellSealBurst(rect.left + rect.width/2, rect.top + rect.height/2, sec);
        }
      }
      renderSection(sec); saveState();
      if(!wasDone && taskObj.done){
        recordCompletion();
        checkSectionCleared(sec);
      }
    }
    else if(act==='toggle-prio'){ document.getElementById('pp-'+task.id).classList.toggle('open'); e.stopPropagation(); }
    else if(act==='begin-focus'){ enterLockIn(task.id); e.stopPropagation(); }
    else if(act==='set-prio'){ taskObj.priority=action.dataset.prio||null; document.getElementById('pp-'+task.id).classList.remove('open'); renderSection(sec); saveState(); e.stopPropagation(); }
    else if(act==='toggle-list'){ taskObj.showChecklist=!taskObj.showChecklist; document.getElementById('cl-'+task.id).style.display=taskObj.showChecklist?'':'none'; saveState(); e.stopPropagation(); }
    else if(act==='toggle-notes'){
      e.stopPropagation();
      taskObj.showNotes = !taskObj.showNotes;
      const noteEl = document.getElementById('note-'+task.id);
      if(noteEl) noteEl.classList.toggle('visible', taskObj.showNotes);
      // If opening and no notes yet, auto-open editor
      if(taskObj.showNotes && (!taskObj.notes || !taskObj.notes.trim())){
        const noteTextEl = noteEl.querySelector('.task-note-text');
        if(noteTextEl){
          const textarea = document.createElement('textarea');
          textarea.className = 'task-note-edit';
          textarea.value = taskObj.notes || '';
          textarea.placeholder = 'add context, details, links…';
          noteTextEl.replaceWith(textarea);
          textarea.focus();
          function commitNote(){
            taskObj.notes = textarea.value.trim();
            saveState(); renderSection(sec);
          }
          textarea.addEventListener('blur', commitNote);
          textarea.addEventListener('keydown', ev => {
            if(ev.key === 'Escape'){ textarea.removeEventListener('blur', commitNote); renderSection(sec); }
          });
        }
      }
      saveState(); e.stopPropagation();
    }
    else if(act==='edit-note'){
      e.stopPropagation();
      const noteEl = document.getElementById('note-'+task.id);
      const noteTextEl = noteEl ? noteEl.querySelector('.task-note-text') : null;
      if(!noteTextEl) return;
      const textarea = document.createElement('textarea');
      textarea.className = 'task-note-edit';
      textarea.value = taskObj.notes || '';
      textarea.placeholder = 'add context, details, links…';
      noteTextEl.replaceWith(textarea);
      textarea.focus();
      function commitNote2(){
        taskObj.notes = textarea.value.trim();
        saveState(); renderSection(sec);
      }
      textarea.addEventListener('blur', commitNote2);
      textarea.addEventListener('keydown', ev => {
        if(ev.key === 'Escape'){ textarea.removeEventListener('blur', commitNote2); renderSection(sec); }
      });
    }
    else if(act==='toggle-check'){
      const ci = parseInt(action.dataset.ci);
      const wasDone = taskObj.checklist[ci].done;
      taskObj.checklist[ci].done = !taskObj.checklist[ci].done;
      // Mini sparkle burst when checking off (not unchecking)
      if(!wasDone && taskObj.checklist[ci].done){
        const checkBox = action.querySelector('.check-box');
        if(checkBox){
          const rect = checkBox.getBoundingClientRect();
          miniSparkBurst(rect.left + rect.width/2, rect.top + rect.height/2, sec);
        }
      }
      renderSection(sec); saveState(); e.stopPropagation();
    }
    else if(act==='del-check'){ taskObj.checklist.splice(parseInt(action.dataset.ci),1); renderSection(sec); saveState(); e.stopPropagation(); }
    else if(act==='delete'){ state[sec]=state[sec].filter(t=>t.id!=task.id); renderSection(sec); saveState(); e.stopPropagation(); }
    else if(act==='edit-text'){
      e.stopPropagation();
      const taskObj2 = state[sec].find(t=>t.id==task.id);
      if(!taskObj2 || taskObj2.done) return;
      const textSpan = item.querySelector('.task-text');
      if(!textSpan) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'task-text-edit';
      input.value = taskObj2.text;
      textSpan.replaceWith(input);
      input.focus();
      input.select();
      function commitEdit(){
        const val = input.value.trim();
        if(val && val !== taskObj2.text){
          taskObj2.text = val;
          saveState();
        }
        renderSection(sec);
      }
      input.addEventListener('blur', commitEdit);
      input.addEventListener('keydown', ev => {
        if(ev.key === 'Enter'){ input.removeEventListener('blur', commitEdit); commitEdit(); }
        if(ev.key === 'Escape'){ input.removeEventListener('blur', commitEdit); renderSection(sec); }
      });
    }
    // Enhanced actions: estimate, breakdown, promote
    else if(act === 'toggle-estimate'){
      document.getElementById('est-'+task.id).classList.toggle('open');
      e.stopPropagation();
    } else if(act === 'set-estimate'){
      taskObj.estimate = parseInt(action.dataset.mins);
      renderSection(sec); saveState();
      e.stopPropagation();
    } else if(act === 'toggle-breakdown'){
      openBreakdownModal(sec, task.id);
      e.stopPropagation();
    } else if(act === 'promote-check'){
      const ci = parseInt(action.dataset.ci);
      const checkItem = taskObj.checklist[ci];
      if(!checkItem) return;
      state[sec].push({id:uid(), text:checkItem.text, done:false, priority:null, checklist:[], showChecklist:false, notes:'Promoted from: '+taskObj.text, createdAt:new Date().toISOString(), estimate: getSmartEstimate(checkItem.text)});
      taskObj.checklist.splice(ci, 1);
      logTaskAddition(checkItem.text, sec);
      renderSection(sec); saveState();
      e.stopPropagation();
    }
  });

  item.addEventListener('keydown', e => {
    const inp = e.target.closest('[data-action="add-check"]');
    if(!inp||e.key!=='Enter') return;
    const val=inp.value.trim(); if(!val) return;
    const taskObj=state[sec].find(t=>t.id==task.id);
    taskObj.checklist.push({text:val,done:false}); taskObj.showChecklist=true; renderSection(sec); saveState();
  });

  return item;
}

/* ═══ INIT: add-input and clear-done handlers ═══ */
export function initTasks(){
  // Add-input keydown handlers
  document.querySelectorAll('.add-input').forEach(input=>{
    input.addEventListener('keydown', e=>{
      if(e.key!=='Enter') return;
      const val=input.value.trim(); if(!val) return;
      const sec=input.dataset.section;
      state[sec].push({id:uid(),text:val,done:false,priority:null,checklist:[],showChecklist:false,notes:'',createdAt:new Date().toISOString()});
      logTaskAddition(val, sec);
      input.value=''; renderSection(sec); saveState();
    });
  });

  // Default estimate + checklist memory for new tasks
  document.querySelectorAll('.add-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if(e.key !== 'Enter') return;
      const val = input.value.trim();
      if(!val) return;
      const sec = input.dataset.section;
      // Find the just-added task and set default estimate
      setTimeout(() => {
        const tasks = state[sec];
        if(tasks.length){
          const last = tasks[tasks.length - 1];
          if(last.text === val && !last.estimate){
            last.estimate = getSmartEstimate(val);
            // Check for remembered checklist
            const remembered = recallChecklist(val);
            if(remembered && !last.checklist.length){
              last.checklist = remembered.map(t => ({text:t, done:false}));
              last.showChecklist = true;
            }
            saveState();
            renderSection(sec);
          }
        }
      }, 50);
    });
  });

  // Purge sealed (clear completed) handlers
  document.querySelectorAll('.clear-done-btn').forEach(btn => {
    // Archive tasks before purge (capture phase)
    btn.addEventListener('click', () => {
      const sec = btn.dataset.section;
      if(!state[sec]) return;
      const doneTasks = state[sec].filter(t => t.done);
      doneTasks.forEach(t => {
        archiveTask(t, sec);
        rememberChecklist(t.text, t.checklist);
      });
    }, true); // capture phase — runs before the purge handler

    btn.addEventListener('click', e => {
      const sec = btn.dataset.section;
      if(!state[sec]) return;
      const doneTasks = state[sec].filter(t => t.done);
      if(!doneTasks.length) return;
      const container = document.getElementById(sec + '-tasks');
      const doneEls = container.querySelectorAll('.task-item.done');
      if(doneEls.length === 0){
        state[sec] = state[sec].filter(t => !t.done);
        renderSection(sec); saveState();
        return;
      }
      doneEls.forEach(el => el.classList.add('dissolving'));
      setTimeout(() => {
        state[sec] = state[sec].filter(t => !t.done);
        renderSection(sec); saveState();
      }, 620);
    });
  });

  // Initial snapshot of done states
  _prevDoneStates = snapshotDoneStates();

  // Render all sections
  ['lab','bio','time','hearth','scrolls','forge','bonds'].forEach(renderSection);
}

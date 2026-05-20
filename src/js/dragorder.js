// src/js/dragorder.js — Drag-to-reorder tasks within sections
// Uses HTML5 drag and drop. Saves new order to state.
import { state, saveState } from './state.js';
import { renderSection } from './tasks.js';
import { updateFocusPanel } from './focus.js';

let _dragSec = null;
let _dragIdx = null;
let _dragEl = null;

function getTaskContainer(sec){
  return document.getElementById(sec + '-tasks');
}

function handleDragStart(e){
  const item = e.target.closest('.task-item');
  if(!item) return;
  const container = item.closest('.tasks');
  if(!container) return;
  
  // Find section
  const secEl = container.closest('.section[data-sec]');
  if(!secEl) return;
  _dragSec = secEl.dataset.sec;
  
  // Find index
  const items = [...container.querySelectorAll('.task-item')];
  _dragIdx = items.indexOf(item);
  _dragEl = item;
  
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', ''); // Required for Firefox
}

function handleDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  const item = e.target.closest('.task-item');
  if(!item || item === _dragEl) return;
  
  const container = item.closest('.tasks');
  if(!container) return;
  
  // Determine position
  const rect = item.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  
  // Remove existing indicators
  container.querySelectorAll('.task-item').forEach(el => {
    el.classList.remove('drag-above', 'drag-below');
  });
  
  if(e.clientY < midY){
    item.classList.add('drag-above');
  } else {
    item.classList.add('drag-below');
  }
}

function handleDragEnd(e){
  if(_dragEl) _dragEl.classList.remove('dragging');
  // Clean up indicators
  document.querySelectorAll('.drag-above, .drag-below').forEach(el => {
    el.classList.remove('drag-above', 'drag-below');
  });
  _dragEl = null;
  _dragSec = null;
  _dragIdx = null;
}

function handleDrop(e){
  e.preventDefault();
  
  const item = e.target.closest('.task-item');
  if(!item || !_dragSec || _dragIdx === null) return;
  
  const container = item.closest('.tasks');
  if(!container) return;
  
  const secEl = container.closest('.section[data-sec]');
  if(!secEl || secEl.dataset.sec !== _dragSec) return;
  
  const items = [...container.querySelectorAll('.task-item')];
  let dropIdx = items.indexOf(item);
  
  // Adjust for drop position (above/below midpoint)
  const rect = item.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  if(e.clientY > midY) dropIdx++;
  
  // Reorder in state
  const tasks = state[_dragSec];
  if(!tasks || _dragIdx >= tasks.length) return;
  
  const [moved] = tasks.splice(_dragIdx, 1);
  // Adjust drop index if needed
  if(dropIdx > _dragIdx) dropIdx--;
  dropIdx = Math.max(0, Math.min(dropIdx, tasks.length));
  tasks.splice(dropIdx, 0, moved);
  
  saveState();
  renderSection(_dragSec);
  updateFocusPanel();
  
  handleDragEnd(e);
}

export function initDragOrder(){
  // Delegate events on document for dynamic task elements
  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('dragend', handleDragEnd);
  document.addEventListener('drop', handleDrop);
}

/**
 * Make a task element draggable.
 * Called from buildTaskEl in tasks.js — adds the drag handle and draggable attribute.
 */
export function makeDraggable(taskEl){
  taskEl.setAttribute('draggable', 'true');
}

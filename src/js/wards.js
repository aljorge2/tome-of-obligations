// src/js/wards.js — Wards & reminders
import { esc, uid, formatCountdown, formatDateTime } from './utils.js';
import { state, saveState } from './state.js';
import { spellSealBurst } from './canvas/index.js';

let wardPageTag = 'work';
let selectedTime = null;
let notifPermission = (typeof Notification !== 'undefined') ? Notification.permission || 'default' : 'default';
const firedSet = new Set(); // track already-burst wards this session

function requestNotifPermission(){
  if('Notification' in window && notifPermission === 'default'){
    Notification.requestPermission().then(p => { notifPermission = p; });
  }
}

export function renderWards(){
  const wardsContainer = document.getElementById('wards-list');
  const wardsCountEl = document.getElementById('wards-count');
  wardsContainer.innerHTML = '';
  if(!state.wards.length){
    wardsContainer.innerHTML = '<div class="no-wards">no active wards — the silence is uneasy</div>';
    wardsCountEl.textContent = '';
    return;
  }
  // Sort: firing first, then by soonest
  const sorted = [...state.wards].sort((a,b) => {
    const aFiring = new Date(a.datetime) <= new Date();
    const bFiring = new Date(b.datetime) <= new Date();
    if(aFiring !== bFiring) return aFiring ? -1 : 1;
    return new Date(a.datetime) - new Date(b.datetime);
  });
  sorted.forEach(ward => {
    const now = new Date();
    const target = new Date(ward.datetime);
    const isFiring = target <= now;
    const el = document.createElement('div');
    el.className = 'reminder-item' + (isFiring ? ' firing' : '');
    el.dataset.id = ward.id;
    const countdown = isFiring ? 'overdue' : formatCountdown(target - now);
    el.innerHTML = `
      <div class="reminder-icon"><i class="ti ti-${isFiring ? 'bell-ringing' : 'bell'}"></i></div>
      <div class="reminder-main">
        <div class="reminder-text">${esc(ward.text)}${ward.page ? `<span class="ward-tag ward-tag-${ward.page}">${ward.page}</span>` : ''}</div>
        <div class="reminder-time">
          <span>${formatDateTime(ward.datetime)}</span>
          <span class="reminder-countdown">• ${countdown}</span>
        </div>
      </div>
      <span class="reminder-edit" data-ward-id="${ward.id}"><i class="ti ti-pencil" style="font-size:12px"></i></span>
      <span class="reminder-time-edit" data-ward-id="${ward.id}"><i class="ti ti-clock-edit" style="font-size:12px"></i></span>
      <span class="reminder-dismiss" data-ward-id="${ward.id}"><i class="ti ti-x" style="font-size:12px"></i></span>
    `;
    // Dismiss handler
    el.querySelector('.reminder-dismiss').addEventListener('click', (e) => {
      e.stopPropagation();
      state.wards = state.wards.filter(w => w.id !== ward.id);
      saveState(); renderWards();
    });
    // Time edit handler
    el.querySelector('.reminder-time-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      const timeRow = el.querySelector('.reminder-time');
      if(!timeRow) return;
      const dtInput = document.createElement('input');
      dtInput.type = 'datetime-local';
      dtInput.className = 'task-text-edit';
      dtInput.style.fontSize = '12px';
      dtInput.style.colorScheme = 'dark';
      dtInput.value = ward.datetime;
      timeRow.replaceWith(dtInput);
      dtInput.focus();
      function commitTimeEdit(){
        const val = dtInput.value;
        if(val){
          const wardObj = state.wards.find(w => w.id === ward.id);
          if(wardObj){
            wardObj.datetime = val;
            wardObj.notified = false; // reset so it can fire again at new time
            firedSet.delete(ward.id);
            saveState();
          }
        }
        renderWards();
      }
      dtInput.addEventListener('blur', commitTimeEdit);
      dtInput.addEventListener('keydown', ev => {
        if(ev.key === 'Enter'){ dtInput.removeEventListener('blur', commitTimeEdit); commitTimeEdit(); }
        if(ev.key === 'Escape'){ dtInput.removeEventListener('blur', commitTimeEdit); renderWards(); }
      });
    });
    // Text edit handler
    el.querySelector('.reminder-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      const textEl = el.querySelector('.reminder-text');
      if(!textEl) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'task-text-edit';
      input.value = ward.text;
      textEl.replaceWith(input);
      input.focus();
      input.select();
      function commitWardEdit(){
        const val = input.value.trim();
        if(val && val !== ward.text){
          const wardObj = state.wards.find(w => w.id === ward.id);
          if(wardObj) wardObj.text = val;
          saveState();
        }
        renderWards();
      }
      input.addEventListener('blur', commitWardEdit);
      input.addEventListener('keydown', ev => {
        if(ev.key === 'Enter'){ input.removeEventListener('blur', commitWardEdit); commitWardEdit(); }
        if(ev.key === 'Escape'){ input.removeEventListener('blur', commitWardEdit); renderWards(); }
      });
    });
    wardsContainer.appendChild(el);
  });
  const active = state.wards.filter(w => new Date(w.datetime) > new Date()).length;
  const firing = state.wards.length - active;
  if(firing > 0){
    wardsCountEl.textContent = `${firing} firing • ${state.wards.length} total`;
  } else {
    wardsCountEl.textContent = `${state.wards.length} ward${state.wards.length !== 1 ? 's' : ''}`;
  }
}

export function addWard(){
  const textInput = document.getElementById('ward-text');
  const text = textInput.value.trim();
  if(!text) return;

  const dtInput = document.getElementById('ward-datetime');
  const customWrap = document.getElementById('custom-dt-wrap');
  let datetime;
  const activeBtn = document.querySelector('.quick-time-btn.active');
  if(activeBtn && activeBtn.dataset.mins === 'custom'){
    if(!dtInput.value) return;
    datetime = dtInput.value;
  } else if(selectedTime){
    datetime = selectedTime.toISOString().slice(0, 16);
  } else {
    // Default: 1 hour from now if nothing selected
    datetime = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
  }

  const wardPageToggle = document.getElementById('ward-page-toggle');
  state.wards.push({
    id: uid(),
    text: text,
    datetime: datetime,
    notified: false,
    page: wardPageTag,
  });
  textInput.value = '';
  selectedTime = null;
  wardPageTag = 'work';
  wardPageToggle.textContent = 'work';
  document.querySelectorAll('.quick-time-btn').forEach(b => b.classList.remove('active'));
  customWrap.classList.remove('visible');
  saveState(); renderWards();
}

export function checkWards(){
  const wardsContainer = document.getElementById('wards-list');
  const now = new Date();
  let anyChanged = false;
  state.wards.forEach(ward => {
    const target = new Date(ward.datetime);
    if(target <= now && !ward.notified){
      ward.notified = true;
      anyChanged = true;
      // Send browser notification
      if('Notification' in window && notifPermission === 'granted'){
        try {
          new Notification('⚠️ Ward Triggered', { body: ward.text, icon: '' });
        } catch(e){}
      }
      // Fire a visual burst from the ward section
      if(!firedSet.has(ward.id)){
        firedSet.add(ward.id);
        const wardsSection = document.querySelector('.section-wards');
        if(wardsSection){
          const rect = wardsSection.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          // Gold burst for wards
          spellSealBurst(cx, cy, 'wards');
        }
      }
    }
  });
  if(anyChanged){ saveState(); }
  // Don't re-render if user is editing a ward
  if(!wardsContainer.querySelector('.task-text-edit')){
    renderWards(); // update countdowns
  }
}

export function initWards(){
  // Request notification permission on first interaction
  document.addEventListener('click', requestNotifPermission, { once: true });

  // Ward page toggle
  const wardPageToggle = document.getElementById('ward-page-toggle');
  wardPageToggle.addEventListener('click', () => {
    wardPageTag = wardPageTag === 'work' ? 'hearth' : 'work';
    wardPageToggle.textContent = wardPageTag;
    wardPageToggle.classList.toggle('active', true);
  });

  // Quick-time buttons
  const customWrap = document.getElementById('custom-dt-wrap');
  const dtInput = document.getElementById('ward-datetime');

  document.querySelectorAll('.quick-time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle active state
      document.querySelectorAll('.quick-time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const val = btn.dataset.mins;
      if(val === 'custom'){
        customWrap.classList.add('visible');
        // Default custom to +1 hour
        const def = new Date(Date.now() + 3600000);
        dtInput.value = def.toISOString().slice(0, 16);
        selectedTime = null; // will use dtInput value
      } else {
        customWrap.classList.remove('visible');
        if(val === 'tomorrow'){
          const tom = new Date();
          tom.setDate(tom.getDate() + 1);
          tom.setHours(9, 0, 0, 0);
          selectedTime = tom;
        } else {
          selectedTime = new Date(Date.now() + parseInt(val) * 60000);
        }
      }
    });
  });

  // Add ward button and enter key
  document.getElementById('ward-add-btn').addEventListener('click', addWard);
  document.getElementById('ward-text').addEventListener('keydown', e => {
    if(e.key === 'Enter') addWard();
  });

  // Start the 15-second check interval
  setInterval(checkWards, 15000);

  // Initial render + check
  renderWards();
  checkWards();
}

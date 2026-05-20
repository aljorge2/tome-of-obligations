// src/js/selfcare.js — Self-care strip and scry check-in
import { loadSelfCare, saveSelfCare } from './state.js';
import { showStrugglesPatterns } from './struggles.js';

const CARE_ITEMS = ['water','breakfast','lunch','dinner','sleep'];
const CARE_LABELS = {
  water: { icon: 'ti-droplet', label: 'Drank enough water' },
  breakfast: { icon: 'ti-egg', label: 'Ate breakfast' },
  lunch: { icon: 'ti-salad', label: 'Ate lunch' },
  dinner: { icon: 'ti-soup', label: 'Ate dinner' },
  sleep: { icon: 'ti-moon', label: 'Got enough sleep' },
};

// Load once into memory, work from memory, sync to storage
let _selfCareData = loadSelfCare();

function todayKey(){ return new Date().toISOString().slice(0,10); }

function saveSelfCareData(){
  saveSelfCare(_selfCareData);
}

export function isCareChecked(item){
  const day = _selfCareData.days[todayKey()];
  return !!(day && day[item]);
}

export function toggleCare(item){
  const key = todayKey();
  if(!_selfCareData.days[key]) _selfCareData.days[key] = {};
  _selfCareData.days[key][item] = !_selfCareData.days[key][item];
  saveSelfCareData();
  renderSelfCareStrip();
}

export function renderSelfCareStrip(){
  CARE_ITEMS.forEach(item => {
    const icon = document.getElementById('care-'+item+'-icon');
    if(icon){
      const on = isCareChecked(item);
      icon.classList.toggle('on', on);
      icon.classList.toggle('off', !on);
    }
  });
  const streakEl = document.getElementById('care-water-streak');
  if(streakEl){
    let streak = 0;
    const d = new Date();
    for(let i = 0; i < 30; i++){
      const key = new Date(d.getTime() - i*86400000).toISOString().slice(0,10);
      if(_selfCareData.days[key] && _selfCareData.days[key].water) streak++;
      else break;
    }
    streakEl.textContent = streak > 1 ? streak + 'd' : '';
  }
}

export function populateScryCheckin(){
  const container = document.getElementById('scry-selfcare-checkin');
  // Build HTML
  let html = '';
  CARE_ITEMS.forEach(item => {
    const info = CARE_LABELS[item];
    const done = isCareChecked(item);
    html += `<div style="display:flex;align-items:center;gap:10px;cursor:pointer;border-radius:3px;padding:8px 10px;transition:background 0.15s;margin-bottom:2px" id="scry-care-${item}">
      <i class="ti ${info.icon}" style="font-size:16px;color:${done ? '#3da855' : '#4a2a35'}"></i>
      <span style="font-family:Crimson Text,serif;font-size:14px;color:var(--text-secondary);flex:1">${info.label}</span>
      <span style="font-family:Cinzel,serif;font-size:8px;letter-spacing:0.08em;padding:2px 7px;border-radius:2px;border:1px solid;${done ? 'color:#3da855;border-color:rgba(60,168,85,0.3);background:rgba(60,168,85,0.08)' : 'color:#c07060;border-color:rgba(200,80,60,0.3);background:rgba(200,80,60,0.08)'}">${done ? 'YES' : 'NO'}</span>
    </div>`;
  });

  // Weekly summary
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  let weekMeals = 0, weekWater = 0, weekSleep = 0, weekDays = 0;
  for(let i = 0; i <= dayOfWeek; i++){
    const key = new Date(now.getTime() - i*86400000).toISOString().slice(0,10);
    const day = _selfCareData.days[key];
    if(!day) continue;
    weekDays++;
    if(day.water) weekWater++;
    if(day.sleep) weekSleep++;
    weekMeals += (day.breakfast?1:0)+(day.lunch?1:0)+(day.dinner?1:0);
  }
  if(weekDays > 0){
    html += `<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(60,168,85,0.1);font-family:Crimson Text,serif;font-size:12px;color:#6a6040;font-style:italic">
      This week: ${weekWater}/${weekDays} days hydrated • ${weekMeals}/${weekDays*3} meals • ${weekSleep}/${weekDays} nights rested
    </div>`;
  }

  container.innerHTML = html;

  // Attach click handlers AFTER setting innerHTML
  CARE_ITEMS.forEach(item => {
    const row = document.getElementById('scry-care-' + item);
    if(row){
      row.onclick = function(e){
        e.stopPropagation();
        toggleCare(item);
        populateScryCheckin();
      };
    }
  });

  showStrugglesPatterns();
}

export function initSelfCare(){
  // Click handlers for the main strip
  document.querySelectorAll('.selfcare-item').forEach(el => {
    el.addEventListener('click', () => toggleCare(el.dataset.care));
  });
  renderSelfCareStrip();
}

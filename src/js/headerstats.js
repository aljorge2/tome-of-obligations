// src/js/headerstats.js — Subtle expandable stats row near the tally bar
// Shows enchantment levels, streaks, energy trends. Collapsed by default.
import { ALL_SECTIONS, SECTION_NAMES, SECTION_COLORS } from './constants.js';
import { getSectionLevel, getWeekProgress } from './enchantments.js';
import { getEnergyHistory } from './energy.js';
import { loadSelfCare } from './state.js';
import { on } from './events.js';

let _expanded = false;

function getSelfCareStreak(){
  const data = loadSelfCare();
  // Count consecutive days with at least 4 care items checked
  let streak = 0;
  const d = new Date();
  for(let i = 0; i < 60; i++){
    const key = new Date(d.getTime() - i * 86400000).toISOString().slice(0,10);
    const day = data.days?.[key];
    if(!day) break;
    const checked = Object.values(day).filter(Boolean).length;
    if(checked >= 4) streak++;
    else break;
  }
  return streak;
}

function getCompletionStreak(){
  // Count consecutive days with at least 1 task completed
  const tallyRaw = localStorage.getItem('tome_tally_v1');
  if(!tallyRaw) return 0;
  try {
    const tally = JSON.parse(tallyRaw);
    const completions = tally.completions || [];
    if(!completions.length) return 0;
    
    let streak = 0;
    const d = new Date();
    for(let i = 0; i < 60; i++){
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i + 1);
      const dayCompletions = completions.filter(c => {
        const cd = new Date(c);
        return cd >= dayStart && cd < dayEnd;
      });
      if(dayCompletions.length > 0) streak++;
      else if(i > 0) break; // Don't break on today if nothing done yet
    }
    return streak;
  } catch(e){ return 0; }
}

function renderStats(){
  const body = document.getElementById('stats-body');
  if(!body) return;
  
  // Enchantment levels
  const enchantHTML = ALL_SECTIONS.map(sec => {
    const level = getSectionLevel(sec);
    const color = SECTION_COLORS[sec];
    const name = SECTION_NAMES[sec];
    const pips = Array.from({length: 5}, (_, i) => 
      `<span class="stat-pip${i < level ? ' filled' : ''}" style="${i < level ? `background:${color};box-shadow:0 0 4px ${color}` : ''}"></span>`
    ).join('');
    return `<div class="stat-enchant-row">
      <span class="stat-enchant-name" style="color:${color}">${name}</span>
      <span class="stat-enchant-pips">${pips}</span>
    </div>`;
  }).join('');
  
  // Streaks
  const taskStreak = getCompletionStreak();
  const careStreak = getSelfCareStreak();
  
  // Energy trend (last 5 days) — flame bar sparkline
  const energyHist = getEnergyHistory(5);
  const dayLabels = ['','S','M','T','W','T','F','S'];
  const energyBars = energyHist.reverse().map(d => {
    const dayName = d.date ? dayLabels[new Date(d.date + 'T12:00:00').getDay()] : '';
    if(!d.avg) return '<div class="stat-energy-bar-wrap"><div class="stat-energy-bar empty"></div><span class="stat-energy-day">${dayName}</span></div>'.replace('${dayName}', dayName);
    const pct = Math.round((d.avg / 5) * 100);
    const labels = ['','spent','waning','steady','kindled','blazing'];
    const colors = ['','#4a3040','#8a5040','#a08030','#d08838','#d04060'];
    const color = colors[Math.round(d.avg)];
    const label = labels[Math.round(d.avg)];
    return '<div class="stat-energy-bar-wrap" title="' + label + '"><div class="stat-energy-bar" style="height:' + pct + '%;background:' + color + ';box-shadow:0 0 4px ' + color + '40"></div><span class="stat-energy-day">' + dayName + '</span></div>';
  }).join('');
  
  body.innerHTML = `
    <div class="stats-grid">
      <div class="stats-col">
        <div class="stats-label">Enchantments</div>
        ${enchantHTML}
      </div>
      <div class="stats-col">
        <div class="stats-label">Streaks</div>
        <div class="stat-streak-row">
          <i class="ti ti-flame" style="font-size:11px;color:#d08838"></i>
          <span>${taskStreak}d task streak</span>
        </div>
        <div class="stat-streak-row">
          <i class="ti ti-heart" style="font-size:11px;color:#d06888"></i>
          <span>${careStreak}d self-care streak</span>
        </div>
        <div class="stats-label" style="margin-top:8px">Energy (5d)</div>
        <div class="stat-energy-bars">${energyBars}</div>
      </div>
    </div>
  `;
}

export function initHeaderStats(){
  const trigger = document.getElementById('stats-trigger');
  const body = document.getElementById('stats-body');
  if(!trigger || !body) return;
  
  trigger.addEventListener('click', () => {
    _expanded = !_expanded;
    body.classList.toggle('open', _expanded);
    trigger.classList.toggle('active', _expanded);
    if(_expanded) renderStats();
  });
  
  // Refresh when sections re-render
  on('sectionRendered', () => {
    if(_expanded) renderStats();
  });
}

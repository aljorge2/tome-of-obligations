// src/js/monthly.js — Monthly Grimoire Review
import { esc, formatDuration } from './utils.js';
import { ALL_SECTIONS, SECTION_COLORS, SECTION_NAMES } from './constants.js';
import { state, loadTally, loadArchive, loadSelfCare } from './state.js';
import { getEnergyHistory } from './energy.js';
import { getWeekProgress } from './enchantments.js';

const MONTHLY_KEY = 'tome_last_monthly';

function monthStart(){
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export function shouldShowMonthly(){
  // Show on the 1st of each month (or first open after the 1st)
  const now = new Date();
  if(now.getDate() > 3) return false; // Only prompt in first 3 days
  try {
    const last = localStorage.getItem(MONTHLY_KEY);
    if(last){
      const lastMonth = new Date(last).getMonth();
      if(lastMonth === now.getMonth()) return false; // Already shown this month
    }
  } catch(e){}
  return true;
}

export function openMonthlyGrimoire(){
  try { localStorage.setItem(MONTHLY_KEY, new Date().toISOString()); } catch(e){}

  const now = new Date();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const prevMonthStartISO = prevMonthStart.toISOString();
  const prevMonthEndISO = prevMonthEnd.toISOString();
  const monthName = prevMonthStart.toLocaleString('default', { month: 'long' });

  // Gather stats
  const tally = loadTally();
  const archive = loadArchive();
  const selfCare = loadSelfCare();

  const monthCompletions = tally.completions.filter(d => d >= prevMonthStartISO && d <= prevMonthEndISO).length;
  const monthArchive = archive.filter(a => a.sealedAt && a.sealedAt >= prevMonthStartISO && a.sealedAt <= prevMonthEndISO);
  const totalFocusMs = monthArchive.reduce((s,a) => s + (a.focusedMs||0), 0);

  // Section breakdown
  const secBreakdown = {};
  monthArchive.forEach(a => {
    if(!secBreakdown[a.sec]) secBreakdown[a.sec] = 0;
    secBreakdown[a.sec]++;
  });

  // Best section
  const bestSection = Object.entries(secBreakdown).sort((a,b)=>b[1]-a[1])[0];

  // Self-care stats for the month
  let careTotal = 0, careDays = 0;
  const daysInMonth = prevMonthEnd.getDate();
  for(let i = 1; i <= daysInMonth; i++){
    const key = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth()+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
    const day = selfCare.days[key];
    if(day){
      careDays++;
      if(day.water) careTotal++;
      if(day.breakfast) careTotal++;
      if(day.lunch) careTotal++;
      if(day.dinner) careTotal++;
      if(day.sleep) careTotal++;
    }
  }
  const careAvg = careDays > 0 ? (careTotal / (careDays * 5) * 100).toFixed(0) : 0;

  // Daily completions for chart
  const dailyCounts = [];
  for(let i = 1; i <= daysInMonth; i++){
    const d = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), i);
    const dStart = d.toISOString();
    const dEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
    dailyCounts.push(tally.completions.filter(c => c >= dStart && c < dEnd).length);
  }
  const maxDaily = Math.max(...dailyCounts, 1);

  // Build overlay
  const overlay = document.createElement('div');
  overlay.className = 'monthly-overlay';
  overlay.innerHTML = `
    <div class="monthly-panel">
      <div class="monthly-header">
        <div class="monthly-icon"><i class="ti ti-book-2"></i></div>
        <div class="monthly-title">The ${monthName} Grimoire</div>
        <div class="monthly-subtitle">A moon's passage, recorded in ink and starlight.</div>
      </div>

      <div class="monthly-stats">
        <div class="monthly-stat"><span class="monthly-stat-val">${monthCompletions}</span><span class="monthly-stat-label">Oaths Sealed</span></div>
        <div class="monthly-stat"><span class="monthly-stat-val">${totalFocusMs > 0 ? formatDuration(totalFocusMs) : '—'}</span><span class="monthly-stat-label">Focus Time</span></div>
        <div class="monthly-stat"><span class="monthly-stat-val">${careAvg}%</span><span class="monthly-stat-label">Self-Care</span></div>
        <div class="monthly-stat"><span class="monthly-stat-val">${daysInMonth}</span><span class="monthly-stat-label">Days Tracked</span></div>
      </div>

      ${bestSection ? `<div class="monthly-highlight">
        <span class="monthly-highlight-label">Strongest Domain:</span>
        <span style="color:${SECTION_COLORS[bestSection[0]]||'#d4a855'}">${SECTION_NAMES[bestSection[0]]||bestSection[0]}</span>
        <span class="monthly-highlight-count">(${bestSection[1]} sealed)</span>
      </div>` : ''}

      <div class="monthly-chart">
        <div class="monthly-chart-title">Daily Sealings</div>
        <div class="monthly-chart-bars">
          ${dailyCounts.map((c, i) => {
            const pct = Math.round((c / maxDaily) * 100);
            return `<div class="monthly-bar" style="height:${Math.max(pct, 3)}%" title="Day ${i+1}: ${c}"></div>`;
          }).join('')}
        </div>
      </div>

      <div class="monthly-sections">
        <div class="monthly-chart-title">By Section</div>
        ${ALL_SECTIONS.map(sec => {
          const count = secBreakdown[sec] || 0;
          const pct = monthCompletions > 0 ? Math.round(count / monthCompletions * 100) : 0;
          return `<div class="monthly-sec-row">
            <span class="monthly-sec-dot" style="color:${SECTION_COLORS[sec]}">●</span>
            <span class="monthly-sec-name">${SECTION_NAMES[sec]||sec}</span>
            <span class="monthly-sec-bar"><span class="monthly-sec-fill" style="width:${pct}%;background:${SECTION_COLORS[sec]}"></span></span>
            <span class="monthly-sec-count">${count}</span>
          </div>`;
        }).join('')}
      </div>

      <div class="monthly-close">
        <button class="monthly-close-btn">Close the grimoire</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  overlay.querySelector('.monthly-close-btn').addEventListener('click', () => {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  });
}

export function initMonthly(){
  // Check on load with a delay
  setTimeout(() => {
    if(shouldShowMonthly()){
      openMonthlyGrimoire();
    }
  }, 5000);
}

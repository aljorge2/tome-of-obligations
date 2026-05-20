// src/js/review.js — Weekly review
import { esc, formatDuration } from './utils.js';
import { ALL_SECTIONS, SECTION_COLORS, SECTION_NAMES } from './constants.js';
import { state, loadTally, loadArchive } from './state.js';
import { scoreTask, detectAvoidance } from './scry.js';

function generateWeeklyPlan(){
  // Get all open tasks with estimates, sorted by score
  const allTasks = [];
  ALL_SECTIONS.forEach(sec => {
    (state[sec]||[]).forEach(t => {
      if(!t.done) allTasks.push({...t, sec});
    });
  });

  // Score them
  allTasks.forEach(t => {
    const s = scoreTask(t);
    t._score = s.score;
    t._reason = s.reason;
  });
  allTasks.sort((a,b) => b._score - a._score);

  // Distribute across weekdays (Mon-Fri, 3 per day, lighter on weekends)
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const plan = {};
  const perDay = [3,3,3,3,3,2,2]; // Mon-Sun task counts

  let taskIdx = 0;
  for(let d = 0; d < 7; d++){
    const dayOffset = d - dayOfWeek;
    const date = new Date(now.getTime() + dayOffset * 86400000);
    const key = dayNames[d];
    const dateStr = date.toISOString().slice(0,10);
    plan[key] = { date: dateStr, tasks: [], isToday: dayOffset === 0, isPast: dayOffset < 0 };

    // Assign tasks (skip past days for new assignments)
    if(dayOffset >= 0){
      const count = perDay[d];
      for(let j = 0; j < count && taskIdx < allTasks.length; j++){
        plan[key].tasks.push(allTasks[taskIdx]);
        taskIdx++;
      }
    }
  }

  return plan;
}

function renderWeeklyPlan(containerId){
  const plan = generateWeeklyPlan();
  const container = document.getElementById(containerId);
  if(!container) return;

  let html = '<div class="weekplan-section">';
  Object.entries(plan).forEach(([day, info]) => {
    const todayCls = info.isToday ? ' today' : '';
    html += `<div class="weekplan-day">
      <span class="weekplan-dayname${todayCls}">${day}</span>
      <div class="weekplan-tasks">`;
    if(info.tasks.length){
      info.tasks.forEach(t => {
        const est = t.estimate ? `<span class="weekplan-est">~${t.estimate}m</span>` : '';
        const dot = `<span style="color:${SECTION_COLORS[t.sec]||'#888'};font-size:8px">●</span>`;
        html += `<div class="weekplan-task">${dot} ${esc(t.text)} ${est}</div>`;
      });
    } else {
      html += `<div class="weekplan-task" style="color:#4a2a35;font-style:italic">${info.isPast ? 'past' : 'rest'}</div>`;
    }
    html += '</div></div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

export function openWeeklyReview(){
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  const weekStartISO = weekStart.toISOString();

  // Stats from tally
  const tally = loadTally();
  const weekCompletions = tally.completions.filter(d => d >= weekStartISO).length;

  // Stats from archive
  const archive = loadArchive();
  const weekArchive = archive.filter(a => a.sealedAt && a.sealedAt >= weekStartISO);
  const totalFocusMs = weekArchive.reduce((s,a) => s + (a.focusedMs||0), 0);

  // Open tasks
  let totalOpen = 0;
  ALL_SECTIONS.forEach(sec => { totalOpen += (state[sec]||[]).filter(t => !t.done).length; });

  // Avoidance count
  const shadows = detectAvoidance();

  // Section breakdown
  const secBreakdown = {};
  weekArchive.forEach(a => {
    if(!secBreakdown[a.sec]) secBreakdown[a.sec] = 0;
    secBreakdown[a.sec]++;
  });

  // Oath fulfillment
  const oathCount = (state.swornOaths||[]).length;
  const oathsDone = (state.swornOaths||[]).filter(id => {
    let done = false;
    ALL_SECTIONS.forEach(sec => {
      const t = (state[sec]||[]).find(t => t.id === id);
      if(t && t.done) done = true;
    });
    return done;
  }).length;

  // Populate stats
  const statsEl = document.getElementById('review-stats');
  statsEl.innerHTML = `
    <div class="review-stat-card"><div class="review-stat-val">${weekCompletions}</div><div class="review-stat-label">Sealed This Week</div></div>
    <div class="review-stat-card"><div class="review-stat-val">${totalFocusMs > 0 ? formatDuration(totalFocusMs) : '0m'}</div><div class="review-stat-label">Focus Time</div></div>
    <div class="review-stat-card"><div class="review-stat-val">${totalOpen}</div><div class="review-stat-label">Still Open</div></div>
    <div class="review-stat-card"><div class="review-stat-val">${shadows.length}</div><div class="review-stat-label">Lingering Shadows</div></div>
  `;

  // Body content
  const bodyEl = document.getElementById('review-body');
  let html = '';

  // Section breakdown
  html += '<div class="scry-section"><div class="scry-section-title">Sealed by Section</div>';
  if(Object.keys(secBreakdown).length){
    html += Object.entries(secBreakdown).sort((a,b)=>b[1]-a[1]).map(([sec, count]) => {
      return `<div class="scry-stat"><span style="color:${SECTION_COLORS[sec]||'#888'}">● ${SECTION_NAMES[sec]||sec}</span><span class="scry-stat-num">${count}</span></div>`;
    }).join('');
    // Neglected sections
    const neglected = ALL_SECTIONS.filter(s => !secBreakdown[s] && (state[s]||[]).some(t=>!t.done));
    if(neglected.length){
      html += '<div style="margin-top:6px;font-family:Crimson Text,serif;font-size:12px;color:#c07060;font-style:italic">⚠ No progress this week in: ' + neglected.map(s => SECTION_NAMES[s]||s).join(', ') + '</div>';
    }
  } else {
    html += '<div style="color:#5a4030;font-style:italic;font-size:13px">no tasks sealed this week yet</div>';
  }
  html += '</div>';

  // Top completed tasks
  if(weekArchive.length){
    html += '<div class="scry-section"><div class="scry-section-title">What You Accomplished</div><div class="scry-task-list">';
    html += weekArchive.slice(0, 10).map(a => {
      const time = a.focusedMs > 0 ? ` <span style="color:#4a2a35;font-style:italic">${formatDuration(a.focusedMs)}</span>` : '';
      return `<div class="scry-task"><span style="color:${SECTION_COLORS[a.sec]||'#888'}">●</span> ${esc(a.text)}${time}</div>`;
    }).join('');
    html += '</div></div>';
  }

  // Oath fulfillment
  if(oathCount){
    html += `<div class="scry-section"><div class="scry-section-title">Oath Fulfillment</div>
      <div class="scry-stat"><span>Oaths sealed</span><span class="scry-stat-num">${oathsDone} / ${oathCount}</span></div>
    </div>`;
  }

  // Weekly plan section
  html += '<div class="scry-section"><div class="scry-section-title">This Week\'s Plan</div><div id="review-weekplan"></div></div>';

  bodyEl.innerHTML = html;
  renderWeeklyPlan('review-weekplan');

  document.getElementById('review-overlay').classList.add('open');
}

export function initReview(){
  document.getElementById('btn-review').addEventListener('click', () => openWeeklyReview());
  document.getElementById('review-close').addEventListener('click', () => {
    document.getElementById('review-overlay').classList.remove('open');
  });
}

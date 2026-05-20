// src/js/review.js — Weekly review
import { esc, formatDuration } from './utils.js';
import { ALL_SECTIONS, SECTION_COLORS, SECTION_NAMES } from './constants.js';
import { state, loadTally, loadArchive, loadStruggles } from './state.js';
import { scoreTask, detectAvoidance } from './scry.js';
import { renderCalendar } from './calendar.js';

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

  // ── Daily Completion Trend (past 7 days) ──
  html += '<div class="scry-section"><div class="scry-section-title">Daily Sealing Trend</div>';
  const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const dayCounts = [];
  for(let i = 6; i >= 0; i--){
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dayStart = d.toISOString();
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
    const count = tally.completions.filter(c => c >= dayStart && c < dayEnd).length;
    dayCounts.push(count);
  }
  const maxCount = Math.max(...dayCounts, 1);
  html += '<div class="insight-trend">';
  dayCounts.forEach((c, i) => {
    const pct = Math.round((c / maxCount) * 100);
    const dayIdx = (now.getDay() + 6 - (6 - i)) % 7; // map to Mon-Sun
    const label = dayLabels[dayIdx < 0 ? dayIdx + 7 : dayIdx] || '';
    html += `<div class="insight-bar-col">
      <div class="insight-bar" style="height:${Math.max(pct, 4)}%"></div>
      <div class="insight-bar-val">${c}</div>
      <div class="insight-bar-label">${label}</div>
    </div>`;
  });
  html += '</div></div>';

  // ── Productive Hours ──
  if(weekArchive.length){
    html += '<div class="scry-section"><div class="scry-section-title">Most Productive Hours</div>';
    const hourBuckets = {};
    weekArchive.forEach(a => {
      if(a.sealedAt){
        const h = new Date(a.sealedAt).getHours();
        hourBuckets[h] = (hourBuckets[h] || 0) + 1;
      }
    });
    const topHours = Object.entries(hourBuckets).sort((a,b) => b[1] - a[1]).slice(0, 3);
    if(topHours.length){
      html += topHours.map(([h, c]) => {
        const hr = parseInt(h);
        const label = hr === 0 ? '12am' : hr < 12 ? `${hr}am` : hr === 12 ? '12pm' : `${hr-12}pm`;
        return `<div class="scry-stat"><span>${label}</span><span class="scry-stat-num">${c} seals</span></div>`;
      }).join('');
    }
    html += '</div>';
  }

  // ── Struggle Patterns ──
  const struggles = loadStruggles();
  const recentStruggles = struggles.filter(s => s.date && s.date >= weekStartISO);
  if(recentStruggles.length){
    // Find common words
    const wordCounts = {};
    recentStruggles.forEach(s => {
      (s.text || '').toLowerCase().split(/\W+/).filter(w => w.length > 3).forEach(w => {
        wordCounts[w] = (wordCounts[w] || 0) + 1;
      });
    });
    const topWords = Object.entries(wordCounts).sort((a,b) => b[1] - a[1]).slice(0, 5).filter(([,c]) => c > 1);
    if(topWords.length){
      html += '<div class="scry-section"><div class="scry-section-title">Recurring Struggle Patterns</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px">';
      topWords.forEach(([word, count]) => {
        html += `<span style="font-family:Crimson Text,serif;font-size:11px;padding:2px 8px;border-radius:2px;background:rgba(200,80,60,0.1);border:1px solid rgba(200,80,60,0.2);color:#c07060">${word} (${count}×)</span>`;
      });
      html += '</div></div>';
    }
  }

  // Weekly plan section — render the actual calendar
  html += '<div class="scry-section"><div class="scry-section-title">This Week\'s Prophecy</div><div id="review-weekplan" class="cal-panel"></div></div>';

  bodyEl.innerHTML = html;
  renderCalendar({ targetId: 'review-weekplan', forceView: '7day' });

  document.getElementById('review-overlay').classList.add('open');
}

export function initReview(){
  document.getElementById('btn-review').addEventListener('click', () => openWeeklyReview());
  document.getElementById('review-close').addEventListener('click', () => {
    document.getElementById('review-overlay').classList.remove('open');
  });
}

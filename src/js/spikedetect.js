// src/js/spikedetect.js — Task-creation spike detection
// Tracks tasks created per hour. Nudges when exceeding 2x rolling average.
// Bipolar-aware: gentle, non-judgmental, no shame.

const SPIKE_KEY = 'tome_creation_log';
const SPIKE_NUDGE_KEY = 'tome_spike_nudge';

function loadCreationLog(){
  try { const r = localStorage.getItem(SPIKE_KEY); if(r) return JSON.parse(r); } catch(e){}
  return [];
}

function saveCreationLog(log){
  try { localStorage.setItem(SPIKE_KEY, JSON.stringify(log)); } catch(e){}
}

/**
 * Record a task creation timestamp.
 * Called from the task add handlers.
 */
export function recordTaskCreation(){
  const log = loadCreationLog();
  log.push(Date.now());
  // Keep last 14 days
  const cutoff = Date.now() - 14 * 86400000;
  const pruned = log.filter(t => t > cutoff);
  saveCreationLog(pruned);
  checkForSpike(pruned);
}

function getHourlyAverage(log){
  if(log.length < 5) return null; // Not enough data
  
  // Group by hour-long windows over the last 14 days
  // Only count hours where at least 1 task was created
  const hourBuckets = {};
  log.forEach(t => {
    const hourKey = Math.floor(t / 3600000);
    hourBuckets[hourKey] = (hourBuckets[hourKey] || 0) + 1;
  });
  
  const counts = Object.values(hourBuckets);
  if(counts.length < 3) return null;
  return counts.reduce((a,b) => a + b, 0) / counts.length;
}

function getCurrentHourCount(log){
  const hourAgo = Date.now() - 3600000;
  return log.filter(t => t > hourAgo).length;
}

function getLast15MinCount(log){
  const cutoff = Date.now() - 15 * 60000;
  return log.filter(t => t > cutoff).length;
}

function hasRecentNudge(){
  try {
    const last = localStorage.getItem(SPIKE_NUDGE_KEY);
    if(!last) return false;
    // Don't nudge more than once per 2 hours
    return (Date.now() - parseInt(last)) < 2 * 3600000;
  } catch(e){ return false; }
}

function markNudgeShown(){
  try { localStorage.setItem(SPIKE_NUDGE_KEY, Date.now().toString()); } catch(e){}
}

function checkForSpike(log){
  if(hasRecentNudge()) return;
  
  const avg = getHourlyAverage(log);
  if(!avg) return; // Not enough history
  
  const currentHour = getCurrentHourCount(log);
  const last15 = getLast15MinCount(log);
  
  // Spike: current hour exceeds 2x average, OR 6+ tasks in 15 min
  const isSpike = (currentHour > avg * 2 && currentHour >= 5) || last15 >= 6;
  
  if(isSpike){
    showSpikeNudge(currentHour, last15);
    markNudgeShown();
  }
}

const NUDGE_MESSAGES = [
  { text: "You're on a creative surge — {count} inscriptions in the last hour. Want to pause and prioritize what you've captured?", icon: 'ti-sparkles' },
  { text: "The tome has received many inscriptions quickly. Sometimes it helps to step back and see what you've gathered.", icon: 'ti-book' },
  { text: "You've been capturing a lot — {count} tasks recently. That energy is valuable. Want to organize before adding more?", icon: 'ti-flame' },
  { text: "A burst of inspiration — {count} new tasks. The tome suggests a breath before the next inscription.", icon: 'ti-wind' },
];

function showSpikeNudge(hourCount, recentCount){
  const existing = document.querySelector('.spike-nudge');
  if(existing) existing.remove();
  
  const count = Math.max(hourCount, recentCount);
  const msg = NUDGE_MESSAGES[Math.floor(Math.random() * NUDGE_MESSAGES.length)];
  
  const el = document.createElement('div');
  el.className = 'spike-nudge';
  el.innerHTML = `
    <div class="spike-nudge-inner">
      <i class="ti ${msg.icon} spike-nudge-icon"></i>
      <span class="spike-nudge-text">${msg.text.replace('{count}', count)}</span>
      <span class="spike-nudge-dismiss"><i class="ti ti-x"></i></span>
    </div>
  `;
  
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  
  el.querySelector('.spike-nudge-dismiss').addEventListener('click', () => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  });
  
  // Auto-dismiss after 20 seconds
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  }, 20000);
}

export function initSpikeDetect(){
  // No periodic check needed — runs on each task creation
}

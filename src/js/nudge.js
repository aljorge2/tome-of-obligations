// src/js/nudge.js — Gentle re-engage nudge
// Shows a soft, themed nudge after ~20 minutes of inactivity

const IDLE_MS = 20 * 60 * 1000; // 20 minutes
const NUDGE_COOLDOWN = 45 * 60 * 1000; // Don't nudge more than once per 45min

const NUDGE_MESSAGES = [
  { text: 'The tome awaits your hand…', icon: 'ti-book' },
  { text: 'The sigils grow restless.', icon: 'ti-ripple' },
  { text: 'A candle flickers — still here?', icon: 'ti-flame' },
  { text: 'The ink has not yet dried…', icon: 'ti-writing' },
  { text: 'Your oaths remember you.', icon: 'ti-feather' },
  { text: 'The tome stirs in the quiet.', icon: 'ti-wind' },
];

let _lastActivity = Date.now();
let _nudgeEl = null;
let _checkInterval = null;
let _lastNudge = 0;

function resetTimer(){
  _lastActivity = Date.now();
  // If nudge is showing, dismiss it on any activity
  if(_nudgeEl){
    dismissNudge();
  }
}

function showNudge(){
  if(_nudgeEl) return;
  if(Date.now() - _lastNudge < NUDGE_COOLDOWN) return;

  // Don't nudge if user is in lock-in mode
  if(document.querySelector('.lockin-active')) return;

  _lastNudge = Date.now();
  const msg = NUDGE_MESSAGES[Math.floor(Math.random() * NUDGE_MESSAGES.length)];

  _nudgeEl = document.createElement('div');
  _nudgeEl.className = 'nudge-toast';
  _nudgeEl.innerHTML = `
    <i class="ti ${msg.icon} nudge-icon"></i>
    <span class="nudge-text">${msg.text}</span>
    <span class="nudge-dismiss"><i class="ti ti-x"></i></span>
  `;

  document.body.appendChild(_nudgeEl);
  requestAnimationFrame(() => _nudgeEl.classList.add('visible'));

  _nudgeEl.querySelector('.nudge-dismiss').addEventListener('click', (e) => {
    e.stopPropagation();
    dismissNudge();
  });

  // Auto-dismiss after 15 seconds
  setTimeout(() => dismissNudge(), 15000);
}

function dismissNudge(){
  if(!_nudgeEl) return;
  _nudgeEl.classList.remove('visible');
  setTimeout(() => {
    _nudgeEl?.remove();
    _nudgeEl = null;
  }, 300);
}

function checkIdle(){
  if(Date.now() - _lastActivity >= IDLE_MS){
    showNudge();
  }
}

export function initNudge(){
  // Track activity
  const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
  events.forEach(ev => document.addEventListener(ev, resetTimer, { passive: true }));

  // Check every 60 seconds
  _checkInterval = setInterval(checkIdle, 60000);
}

// src/js/transitions.js — Transition rituals between tasks + big 4PM shift
import { spellSealBurst } from './canvas/index.js';

const TASK_TRANSITIONS = [
  'Oath sealed. The next binding awaits.',
  'One thread cut. Another pulls taut.',
  'The ink dries. Turn the page.',
  'Sealed with intent. What comes next?',
  'A rune fades. Another glows.',
];

const BIG_TRANSITION_MESSAGES = [
  'The work-day wanes. The hearth calls you home.',
  'The forge cools. Time to tend the softer flames.',
  'Your labors rest. The evening is yours.',
];

let _transitionEl = null;

/**
 * Show a brief transition between completing one oath and starting the next.
 * Called from focus.js momentum mode.
 */
export function showTaskTransition(completedText, nextText, anchorEl){
  if(_transitionEl) _transitionEl.remove();

  // Fire celebration burst
  if(anchorEl){
    const rect = anchorEl.getBoundingClientRect();
    spellSealBurst(rect.left + rect.width/2, rect.top + rect.height/2, 'complete');
  }

  const msg = TASK_TRANSITIONS[Math.floor(Math.random() * TASK_TRANSITIONS.length)];

  _transitionEl = document.createElement('div');
  _transitionEl.className = 'transition-ritual';
  _transitionEl.innerHTML = `
    <div class="transition-sigil"><i class="ti ti-sparkles"></i></div>
    <div class="transition-sealed">${msg}</div>
    <div class="transition-next">
      <span class="transition-next-label">next oath:</span>
      <span class="transition-next-text">${escHtml(nextText)}</span>
    </div>
    <div class="transition-progress">
      <div class="transition-progress-fill"></div>
    </div>
  `;

  document.body.appendChild(_transitionEl);
  requestAnimationFrame(() => _transitionEl.classList.add('visible'));

  // Auto-dismiss after 3 seconds (progress bar fills)
  setTimeout(() => {
    _transitionEl?.classList.remove('visible');
    setTimeout(() => { _transitionEl?.remove(); _transitionEl = null; }, 300);
  }, 3000);
}

/**
 * Show the big 4PM work→hearth transition.
 * This is purely visual/motivational — energy check is handled by energy.js
 */
export function showBigTransition(){
  if(_transitionEl) _transitionEl.remove();

  const msg = BIG_TRANSITION_MESSAGES[Math.floor(Math.random() * BIG_TRANSITION_MESSAGES.length)];

  _transitionEl = document.createElement('div');
  _transitionEl.className = 'transition-ritual transition-big';
  _transitionEl.innerHTML = `
    <div class="transition-sigil transition-sigil-big"><i class="ti ti-sunset-2"></i></div>
    <div class="transition-sealed">${msg}</div>
    <div class="transition-dismiss">
      <span class="transition-dismiss-btn">I hear the call</span>
    </div>
  `;

  document.body.appendChild(_transitionEl);
  requestAnimationFrame(() => _transitionEl.classList.add('visible'));

  _transitionEl.querySelector('.transition-dismiss-btn').addEventListener('click', () => {
    _transitionEl.classList.remove('visible');
    setTimeout(() => { _transitionEl?.remove(); _transitionEl = null; }, 300);
  });

  // Fire a big gold burst from center
  spellSealBurst(window.innerWidth / 2, window.innerHeight / 2, 'transition');
}

function escHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

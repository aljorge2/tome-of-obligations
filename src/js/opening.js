// src/js/opening.js — Opening ritual popup on app launch
// Always shows on open with options: Scry, Log Energy, Change Sworn Oaths

import { state } from './state.js';
import { getCurrentEnergy, forceEnergyCheck, getExpectedChecks } from './energy.js';
import { isCareChecked, CARE_ITEMS, CARE_LABELS } from './selfcare.js';
import { shouldShowReentry, showReentry, recordVisit } from './reentry.js';

const SESSION_KEY = 'tome_opening_shown';

function hasShownThisSession(){
  try {
    const val = sessionStorage.getItem(SESSION_KEY);
    return val === 'true';
  } catch(e){ return false; }
}

function markShown(){
  try { sessionStorage.setItem(SESSION_KEY, 'true'); } catch(e){}
}

function buildGreeting(){
  const hour = new Date().getHours();
  if(hour < 12) return 'The morning awaits.';
  if(hour < 17) return 'The day is underway.';
  return 'The evening draws near.';
}

function buildSummary(){
  // Count open tasks
  const sections = ['lab','bio','hearth','scrolls','forge','bonds'];
  let totalOpen = 0;
  sections.forEach(s => { totalOpen += (state[s]||[]).filter(t => !t.done).length; });

  const oathCount = (state.swornOaths || []).length;
  const energy = getCurrentEnergy();
  const energyLabel = energy ? ['spent','waning','steady','kindled','blazing'][energy - 1] : null;

  // Self-care summary
  const careChecked = CARE_ITEMS.filter(item => isCareChecked(item)).length;

  let lines = [];
  lines.push(`${totalOpen} task${totalOpen !== 1 ? 's' : ''} inscribed`);
  if(oathCount > 0) lines.push(`${oathCount} oath${oathCount !== 1 ? 's' : ''} sworn`);
  else lines.push('no oaths sworn yet');
  if(energyLabel) lines.push(`energy: ${energyLabel}`);
  if(careChecked > 0) lines.push(`${careChecked}/${CARE_ITEMS.length} self-care checked`);

  return lines.join(' · ');
}

export function showOpeningRitual(){
  if(hasShownThisSession()) return;
  markShown();

  // Check for extended absence — show re-entry flow instead of normal opening
  if(shouldShowReentry()){
    setTimeout(() => showReentry(), 800);
    return;
  }
  // Record visit for future gap detection
  recordVisit();

  const hasOaths = (state.swornOaths || []).length > 0;
  const missedEnergy = getExpectedChecks(); // returns true if there's a check-in due

  // If no sworn oaths, force scry immediately — no choices
  if(!hasOaths){
    setTimeout(() => {
      document.getElementById('scry-trigger')?.click();
    }, 800);
    return;
  }

  // If oaths exist but energy is due, force energy check
  if(missedEnergy){
    setTimeout(() => {
      forceEnergyCheck();
    }, 800);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'opening-overlay';

  overlay.innerHTML = `
    <div class="opening-panel">
      <div class="opening-sigil"><i class="ti ti-book-2"></i></div>
      <div class="opening-title">The Tome Stirs</div>
      <div class="opening-greeting">${buildGreeting()}</div>
      <div class="opening-summary">${buildSummary()}</div>

      <div class="opening-actions">
        <button class="opening-btn opening-btn-primary" id="opening-scry">
          <i class="ti ti-eye"></i>
          <span class="opening-btn-text">Scry the Tome</span>
          <span class="opening-btn-sub">choose your oaths for the day</span>
        </button>
        <button class="opening-btn" id="opening-energy">
          <i class="ti ti-flame"></i>
          <span class="opening-btn-text">Log Energy</span>
          <span class="opening-btn-sub">how are you feeling right now?</span>
        </button>
        <button class="opening-btn" id="opening-reoath">
          <i class="ti ti-refresh"></i>
          <span class="opening-btn-text">Change Sworn Oaths</span>
          <span class="opening-btn-sub">re-scry to pick different tasks</span>
        </button>
      </div>

      <div class="opening-exit">
        <span class="opening-exit-btn" id="opening-dismiss">enter the tome</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  function close(){
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 300);
  }

  // Scry button — triggers the scry overlay
  overlay.querySelector('#opening-scry').addEventListener('click', () => {
    close();
    setTimeout(() => {
      document.getElementById('scry-trigger')?.click();
    }, 350);
  });

  // Energy button — triggers the energy check-in
  overlay.querySelector('#opening-energy').addEventListener('click', () => {
    close();
    setTimeout(() => {
      // Import dynamically to avoid circular deps
      import('./energy.js').then(mod => {
        mod.forceEnergyCheck();
      });
    }, 350);
  });

  // Re-oath button (only if oaths exist)
  const reoathBtn = overlay.querySelector('#opening-reoath');
  if(reoathBtn){
    reoathBtn.addEventListener('click', () => {
      close();
      setTimeout(() => {
        document.getElementById('scry-trigger')?.click();
      }, 350);
    });
  }

  // Exit button
  overlay.querySelector('#opening-dismiss').addEventListener('click', close);
}

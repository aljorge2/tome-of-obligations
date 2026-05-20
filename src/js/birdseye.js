// src/js/birdseye.js — Quick view / bird's eye mode
// Collapses all sections to headers + counts for overwhelm relief
import { state, saveState } from './state.js';
import { ALL_SECTIONS, SECTION_NAMES } from './constants.js';

let _active = false;

export function toggleBirdsEye(){
  _active = !_active;
  const content = document.querySelector('.content');
  const btn = document.getElementById('birdseye-toggle');
  
  if(_active){
    content.classList.add('birdseye-mode');
    if(btn) btn.classList.add('active');
    
    // Add summary counts to each section header
    ALL_SECTIONS.forEach(sec => {
      const secEl = document.querySelector(`.section[data-sec="${sec}"]`);
      if(!secEl) return;
      const tasks = state[sec] || [];
      const open = tasks.filter(t => !t.done).length;
      const done = tasks.filter(t => t.done).length;
      
      // Add or update bird's eye summary
      let summary = secEl.querySelector('.birdseye-summary');
      if(!summary){
        summary = document.createElement('div');
        summary.className = 'birdseye-summary';
        secEl.querySelector('.section-header')?.appendChild(summary);
      }
      
      if(open === 0 && done === 0){
        summary.innerHTML = '<span class="be-empty">empty</span>';
      } else {
        const oldest = tasks.filter(t => !t.done && t.createdAt)
          .sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
        const oldestAge = oldest ? Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / 86400000) : 0;
        const oldestNote = oldestAge > 3 ? ` · oldest: ${oldestAge}d` : '';
        
        summary.innerHTML = `<span class="be-open">${open} open</span><span class="be-done">${done} sealed</span>${oldestNote ? `<span class="be-oldest">${oldestNote}</span>` : ''}`;
      }
    });
    
    // Also show ward count
    const wardsSec = document.querySelector('.section-wards');
    if(wardsSec){
      const wards = state.wards || [];
      const activeWards = wards.filter(w => !w.done).length;
      let summary = wardsSec.querySelector('.birdseye-summary');
      if(!summary){
        summary = document.createElement('div');
        summary.className = 'birdseye-summary';
        wardsSec.querySelector('.section-header')?.appendChild(summary);
      }
      summary.innerHTML = activeWards ? `<span class="be-open">${activeWards} active</span>` : '<span class="be-empty">none set</span>';
    }
  } else {
    content.classList.remove('birdseye-mode');
    if(btn) btn.classList.remove('active');
    // Remove summaries
    document.querySelectorAll('.birdseye-summary').forEach(el => el.remove());
  }
}

export function isBirdsEye(){ return _active; }

export function initBirdsEye(){
  document.getElementById('birdseye-toggle')?.addEventListener('click', toggleBirdsEye);
}

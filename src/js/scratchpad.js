// src/js/scratchpad.js — Freeform scratchpad inside the Thought Catcher
// Tabbed interface: Quick Capture | Scratchpad

const SCRATCH_KEY = 'tome_scratchpad_v1';

function loadNotes(){
  try { const r = localStorage.getItem(SCRATCH_KEY); if(r) return JSON.parse(r); } catch(e){}
  return { text: '', lastEdited: null };
}

function saveNotes(data){
  try { localStorage.setItem(SCRATCH_KEY, JSON.stringify(data)); } catch(e){}
}

export function initScratchpad(){
  const panel = document.getElementById('tc-panel');
  if(!panel) return;

  // Wrap existing content as tab 1, add tab 2
  const existingLabel = panel.querySelector('.tc-label');
  const existingInput = panel.querySelector('.tc-input');
  const existingHint = panel.querySelector('.tc-hint');
  const existingConfirm = panel.querySelector('.tc-confirm');

  // Create tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'tc-tabs';
  tabBar.innerHTML = `
    <span class="tc-tab active" data-tc-tab="capture"><i class="ti ti-feather" style="font-size:10px"></i> Capture</span>
    <span class="tc-tab" data-tc-tab="scratch"><i class="ti ti-notebook" style="font-size:10px"></i> Scratchpad</span>
  `;

  // Create capture pane (wrap existing elements)
  const capturePane = document.createElement('div');
  capturePane.className = 'tc-pane active';
  capturePane.dataset.tcPane = 'capture';
  if(existingLabel) capturePane.appendChild(existingLabel);
  if(existingInput) capturePane.appendChild(existingInput);
  if(existingHint) capturePane.appendChild(existingHint);
  if(existingConfirm) capturePane.appendChild(existingConfirm);

  // Create scratchpad pane
  const notes = loadNotes();
  const scratchPane = document.createElement('div');
  scratchPane.className = 'tc-pane';
  scratchPane.dataset.tcPane = 'scratch';
  scratchPane.innerHTML = `
    <div class="tc-label">Scratchpad</div>
    <textarea class="tc-scratch-area" id="tc-scratch-area" placeholder="jot anything here — ideas, links, reminders, brain dump…">${notes.text || ''}</textarea>
    <div class="tc-scratch-footer">
      <span class="tc-scratch-saved" id="tc-scratch-saved">${notes.lastEdited ? 'saved' : ''}</span>
      <span class="tc-scratch-clear" id="tc-scratch-clear">clear</span>
    </div>
  `;

  // Insert tab bar and panes
  panel.innerHTML = '';
  panel.appendChild(tabBar);
  panel.appendChild(capturePane);
  panel.appendChild(scratchPane);

  // Tab switching
  tabBar.querySelectorAll('.tc-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = tab.dataset.tcTab;
      tabBar.querySelectorAll('.tc-tab').forEach(t => t.classList.toggle('active', t.dataset.tcTab === target));
      panel.querySelectorAll('.tc-pane').forEach(p => p.classList.toggle('active', p.dataset.tcPane === target));
      if(target === 'scratch'){
        document.getElementById('tc-scratch-area')?.focus();
      } else {
        panel.querySelector('.tc-input')?.focus();
      }
    });
  });

  // Scratchpad auto-save (debounced)
  let _saveTimer = null;
  const area = document.getElementById('tc-scratch-area');
  const savedEl = document.getElementById('tc-scratch-saved');
  if(area){
    area.addEventListener('input', () => {
      clearTimeout(_saveTimer);
      if(savedEl) savedEl.textContent = '';
      _saveTimer = setTimeout(() => {
        saveNotes({ text: area.value, lastEdited: new Date().toISOString() });
        if(savedEl) savedEl.textContent = 'saved';
      }, 600);
    });
    // Prevent thought catcher from closing when clicking inside textarea
    area.addEventListener('click', e => e.stopPropagation());
  }

  // Clear button
  document.getElementById('tc-scratch-clear')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if(area) area.value = '';
    saveNotes({ text: '', lastEdited: null });
    if(savedEl) savedEl.textContent = 'cleared';
    setTimeout(() => { if(savedEl) savedEl.textContent = ''; }, 1500);
  });
}

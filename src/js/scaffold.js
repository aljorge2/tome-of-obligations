// src/js/scaffold.js — Automatic task scaffolding ("The Tome's Counsel")
// When a task is added that looks complex, auto-suggest a breakdown
// with pre-populated checklist items. Reduces the barrier to starting.

import { state, saveState, loadChecklistMemory } from './state.js';
import { renderSection } from './tasks.js';
import { esc } from './utils.js';

/* ═══ SCAFFOLD TEMPLATES ═══ */
// Pattern → suggested checklist items
// These are starting points — the user can modify/dismiss
const SCAFFOLDS = [
  {
    patterns: [/\b(presentation|ppt|powerpoint|slide.?deck|slides)\b/i],
    label: 'Presentation',
    icon: 'ti-presentation',
    steps: [
      'Outline key points / message',
      'Gather data & references',
      'Draft slides structure',
      'Create visuals / charts',
      'Write speaker notes',
      'Review & rehearse',
    ]
  },
  {
    patterns: [/\b(report|write.?up|manuscript|paper|document)\b/i],
    label: 'Report / Write-up',
    icon: 'ti-file-text',
    steps: [
      'Outline sections & main points',
      'Gather data / figures',
      'Draft first version',
      'Add citations / references',
      'Review & edit',
      'Final formatting & submit',
    ]
  },
  {
    patterns: [/\b(deep.?clean|clean.*house|clean.*apartment|spring.?clean)\b/i],
    label: 'Deep Clean',
    icon: 'ti-spray',
    steps: [
      'Clear surfaces & declutter',
      'Kitchen — counters, stove, fridge',
      'Bathroom — scrub, mop, mirrors',
      'Vacuum / mop floors',
      'Dust shelves & furniture',
      'Take out trash & recycling',
    ]
  },
  {
    patterns: [/\b(grocery|groceries|food.?shop|meal.?prep)\b/i],
    label: 'Groceries / Meal Prep',
    icon: 'ti-shopping-cart',
    steps: [
      'Check what\'s in the fridge / pantry',
      'Plan meals for the week',
      'Make shopping list',
      'Go shopping',
      'Put away groceries',
    ]
  },
  {
    patterns: [/\b(pipeline|analysis|bioinformatics|rnaseq|scrnaseq|scenic)\b/i],
    label: 'Analysis Pipeline',
    icon: 'ti-dna',
    steps: [
      'Define input data & parameters',
      'Set up environment / config',
      'Run initial test on subset',
      'Review QC / intermediate output',
      'Full run',
      'Analyze results & document',
    ]
  },
  {
    patterns: [/\b(experiment|protocol|assay)\b/i],
    label: 'Lab Experiment',
    icon: 'ti-flask',
    steps: [
      'Review / write protocol',
      'Check reagents & materials',
      'Set up workspace',
      'Run experiment',
      'Record observations',
      'Clean up & store samples',
    ]
  },
  {
    patterns: [/\b(move|moving|pack|packing)\b/i],
    label: 'Moving / Packing',
    icon: 'ti-box',
    steps: [
      'Sort items — keep / donate / toss',
      'Get boxes & packing supplies',
      'Pack room by room',
      'Label all boxes',
      'Arrange transport',
      'Unpack essentials first',
    ]
  },
  {
    patterns: [/\b(budget|finances|financial.?review|tax|taxes)\b/i],
    label: 'Financial Task',
    icon: 'ti-cash',
    steps: [
      'Gather statements & documents',
      'Review income & expenses',
      'Categorize transactions',
      'Identify action items',
      'File / submit as needed',
    ]
  },
  {
    patterns: [/\b(party|birthday.?party|gathering|event.?plan|host)\b/i],
    label: 'Event Planning',
    icon: 'ti-confetti',
    steps: [
      'Set date & guest list',
      'Plan food / drinks',
      'Decorations & supplies',
      'Send invites',
      'Prep day-of checklist',
    ]
  },
  {
    patterns: [/\b(appointment|doctor|dentist|vet|checkup)\b/i],
    label: 'Appointment',
    icon: 'ti-calendar-event',
    steps: [
      'Call & schedule',
      'Note date / time / location',
      'Prep questions or documents',
      'Set a reminder ward',
    ]
  },
  {
    patterns: [/\b(travel|trip|vacation|flight|hotel)\b/i],
    label: 'Trip Planning',
    icon: 'ti-plane',
    steps: [
      'Book transport',
      'Book accommodation',
      'Plan itinerary',
      'Pack essentials',
      'Arrange pet care / mail hold',
    ]
  },
];

/* ═══ MATCH SCAFFOLD ═══ */
export function findScaffold(taskText) {
  const text = (taskText || '').toLowerCase();

  // First check if we have a memorized checklist for this task name
  // (checklist memory takes precedence over generic scaffolds)
  // This is handled by the caller — we just return template matches

  for (const scaffold of SCAFFOLDS) {
    for (const pat of scaffold.patterns) {
      if (pat.test(text)) {
        return scaffold;
      }
    }
  }
  return null;
}

/* ═══ SCAFFOLD SUGGESTION UI ═══ */
// Returns HTML for the suggestion prompt + attaches handlers
export function showScaffoldSuggestion(taskId, sec, scaffold, containerEl) {
  // Check if we already showed this
  if (containerEl.querySelector('.scaffold-suggestion')) return;

  const suggEl = document.createElement('div');
  suggEl.className = 'scaffold-suggestion';
  suggEl.innerHTML = `
    <div class="scaffold-header">
      <i class="ti ${scaffold.icon} scaffold-icon"></i>
      <span class="scaffold-title">The Tome suggests a path</span>
      <span class="scaffold-dismiss" title="Dismiss"><i class="ti ti-x" style="font-size:10px"></i></span>
    </div>
    <div class="scaffold-desc">This looks like a <em>${scaffold.label}</em> task. Want a starting checklist?</div>
    <div class="scaffold-steps">
      ${scaffold.steps.map((s, i) => `
        <label class="scaffold-step">
          <input type="checkbox" checked data-idx="${i}" />
          <span>${esc(s)}</span>
        </label>
      `).join('')}
    </div>
    <div class="scaffold-actions">
      <span class="scaffold-btn scaffold-accept"><i class="ti ti-check" style="font-size:10px"></i> Apply</span>
      <span class="scaffold-btn scaffold-skip">Not this time</span>
    </div>
  `;

  // Insert after the task item
  containerEl.after(suggEl);

  // Handlers
  suggEl.querySelector('.scaffold-dismiss').addEventListener('click', () => {
    suggEl.classList.add('dismissing');
    setTimeout(() => suggEl.remove(), 300);
  });

  suggEl.querySelector('.scaffold-skip').addEventListener('click', () => {
    suggEl.classList.add('dismissing');
    setTimeout(() => suggEl.remove(), 300);
  });

  suggEl.querySelector('.scaffold-accept').addEventListener('click', () => {
    const task = state[sec].find(t => t.id == taskId);
    if (!task) return;

    // Get checked steps
    const checks = suggEl.querySelectorAll('.scaffold-step input:checked');
    const steps = [];
    checks.forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      steps.push({ text: scaffold.steps[idx], done: false });
    });

    // Apply checklist (merge with existing if any)
    if (!task.checklist) task.checklist = [];
    task.checklist = [...steps, ...task.checklist];
    task.showChecklist = true;

    saveState();
    renderSection(sec);

    suggEl.classList.add('dismissing');
    setTimeout(() => suggEl.remove(), 300);
  });

  // Animate in
  requestAnimationFrame(() => suggEl.classList.add('visible'));
}

/* ═══ CHECK ON TASK ADD ═══ */
// Call this after a new task is added to check if we should suggest scaffolding
export function checkScaffold(taskId, sec) {
  const task = state[sec].find(t => t.id == taskId);
  if (!task) return;

  // Don't suggest if task already has checklist
  if (task.checklist && task.checklist.length > 0) return;

  const scaffold = findScaffold(task.text);
  if (!scaffold) return;

  // Find the task element in the DOM
  setTimeout(() => {
    const taskEl = document.querySelector(`.task-item[data-id="${taskId}"]`);
    if (taskEl) {
      showScaffoldSuggestion(taskId, sec, scaffold, taskEl);
    }
  }, 100);
}

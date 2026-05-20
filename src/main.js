// Import styles
import './css/main.css';

// Import modules
import { showPersistenceWarning } from './js/storage.js';
import { initState, updateTallyDisplay, checkDayChange, startDayChangeTimer } from './js/state.js';
import { renderSection, initTasks } from './js/tasks.js';
import { initFocus, updateFocusPanel } from './js/focus.js';
import { initScry } from './js/scry.js';
import { initWards } from './js/wards.js';
import { initSelfCare } from './js/selfcare.js';
import { initTemplates } from './js/templates.js';
import { initArchive } from './js/archive.js';
import { initReview } from './js/review.js';
import { initUI } from './js/ui.js';
import { initCalendar, renderCalendar } from './js/calendar.js';
import { initDayRite, setRenderCalendar } from './js/dayrite.js';
import { initCanvas } from './js/canvas/index.js';
import { initEnergy } from './js/energy.js';
import { initNudge } from './js/nudge.js';
import { initEnchantments, enchantmentDayDecay } from './js/enchantments.js';
import { initMonthly } from './js/monthly.js';
import { showOpeningRitual } from './js/opening.js';
import { ALL_SECTIONS } from './js/constants.js';
import { initScratchpad } from './js/scratchpad.js';
import { initSearch } from './js/search.js';
import { initDragOrder } from './js/dragorder.js';
import { initBirdsEye } from './js/birdseye.js';
import { initHeaderStats } from './js/headerstats.js';
import { initGCal } from './js/gcal.js';
import { initTimeAnchor } from './js/timeanchor.js';
import { initSpikeDetect } from './js/spikedetect.js';
import { initWhispers } from './js/whispers.js';

// Initialize state from localStorage
initState();

// Check for day change — resets sworn oaths + self-care at midnight PDT
checkDayChange();

// Render all sections
ALL_SECTIONS.forEach(renderSection);

// Initialize all feature modules
initTasks();
initFocus();
initScry();
initWards();
initSelfCare();
initTemplates();
initArchive();
initReview();
initCalendar();
initDayRite();
setRenderCalendar(renderCalendar);
initUI();


// Initialize new feature modules
initScratchpad();
initSearch();
initDragOrder();
initBirdsEye();
initHeaderStats();
initTimeAnchor();
initSpikeDetect();

// Google Calendar (async — fetches events in background)
initGCal();

// Update displays
updateTallyDisplay();
updateFocusPanel();

// Start canvas animations
initCanvas();

// Start energy check-in system
initEnergy();

// Start gentle re-engage nudge
initNudge();

// Start Oracle Whispers (context-aware nudges)
initWhispers();

// Initialize enchantment system
initEnchantments();

// Monthly grimoire review (shows on first days of month)
initMonthly();

// Opening ritual — shows on every app open
// Priority: no oaths → force scry, missed energy → force energy, else → choice popup
setTimeout(showOpeningRitual, 1200);

// Start day-change timer — triggers at midnight PDT while app is open
startDayChangeTimer(() => {
  ALL_SECTIONS.forEach(renderSection);
  updateFocusPanel();
  updateTallyDisplay();
  initSelfCare(); // re-renders self-care strip for new day
  enchantmentDayDecay(); // gentle glow fade
});

// Show persistence warning if needed
showPersistenceWarning();

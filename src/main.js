// Import styles
import './css/main.css';

// Import modules
import { showPersistenceWarning } from './js/storage.js';
import { initState, updateTallyDisplay } from './js/state.js';
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
import { ALL_SECTIONS } from './js/constants.js';

// Initialize state from localStorage
initState();

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

// Update displays
updateTallyDisplay();
updateFocusPanel();

// Start canvas animations
initCanvas();

// Show persistence warning if needed
showPersistenceWarning();

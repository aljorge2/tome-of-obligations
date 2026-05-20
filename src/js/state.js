import { safeStorage } from './storage.js';
import { setIdCounter, getIdCounter } from './utils.js';

/* ═══ STORAGE KEYS ═══ */
export const STORAGE_KEY    = 'tome_of_obligations_v1';
export const TALLY_KEY      = 'tome_tally_v1';
export const ADDLOG_KEY     = 'tome_addlog_v1';
export const TIMELOG_KEY    = 'tome_timelog_v1';
export const TEMPLATES_KEY  = 'tome_templates_v1';
export const SWAPMEM_KEY    = 'tome_swapmem_v1';
export const CLMEM_KEY      = 'tome_clmem_v1';
export const ARCHIVE_KEY    = 'tome_archive_v1';
export const SELFCARE_KEY   = 'tome_selfcare_v1';
export const STRUGGLES_KEY  = 'tome_struggles_v1';

/* ═══ REACTIVE STATE ═══ */
export const state = {
  lab: [],
  bio: [],
  time: [],
  hearth: [],
  scrolls: [],
  forge: [],
  bonds: [],
  wards: [],
  activePage: 'work',
  swornOaths: [],
  swornOrder: [],
  lastScryTime: null,
  collapsed: {},
};

/* ═══ LOCK-IN STATE ═══ */
export let lockedInTaskId = null;
export let lockinStartTime = null;
export let lockinTimerInterval = null;
export let focusPeekMode = false;

export function setLockedInTaskId(val) { lockedInTaskId = val; }
export function setLockinStartTime(val) { lockinStartTime = val; }
export function setLockinTimerInterval(val) { lockinTimerInterval = val; }
export function setFocusPeekMode(val) { focusPeekMode = val; }

/* ═══ PERSISTENCE ═══ */
export function loadState() {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        lab: saved.lab || [],
        bio: saved.bio || [],
        time: saved.time || [],
        hearth: saved.hearth || [],
        scrolls: saved.scrolls || [],
        forge: saved.forge || [],
        bonds: saved.bonds || [],
        wards: saved.wards || [],
        nextId: saved.nextId || 0,
        activePage: saved.activePage || 'work',
        swornOaths: saved.swornOaths || [],
        swornOrder: saved.swornOrder || [],
        lastScryTime: saved.lastScryTime || null,
        collapsed: saved.collapsed || {},
      };
    }
  } catch (e) { console.warn('Failed to load saved state:', e); }
  return { lab: [], bio: [], time: [], hearth: [], scrolls: [], forge: [], bonds: [], wards: [], nextId: 0, activePage: 'work', swornOaths: [], swornOrder: [], lastScryTime: null, collapsed: {} };
}

export function saveState() {
  try {
    safeStorage.setItem(STORAGE_KEY, JSON.stringify({
      lab: state.lab,
      bio: state.bio,
      time: state.time,
      hearth: state.hearth,
      scrolls: state.scrolls,
      forge: state.forge,
      bonds: state.bonds,
      wards: state.wards,
      nextId: getIdCounter(),
      activePage: state.activePage,
      swornOaths: state.swornOaths || [],
      swornOrder: state.swornOrder || [],
      lastScryTime: state.lastScryTime || null,
      collapsed: state.collapsed || {},
    }));
  } catch (e) { console.warn('Failed to save state:', e); }
}

export function initState() {
  const loaded = loadState();
  state.lab = loaded.lab;
  state.bio = loaded.bio;
  state.time = loaded.time;
  state.hearth = loaded.hearth;
  state.scrolls = loaded.scrolls;
  state.forge = loaded.forge;
  state.bonds = loaded.bonds;
  state.wards = loaded.wards;
  state.activePage = loaded.activePage;
  state.swornOaths = loaded.swornOaths || [];
  state.swornOrder = loaded.swornOrder || [];
  state.lastScryTime = loaded.lastScryTime || null;
  state.collapsed = loaded.collapsed || {};
  setIdCounter(loaded.nextId);
}

/* ═══ TALLY SYSTEM ═══ */
export function loadTally() {
  try {
    const raw = safeStorage.getItem(TALLY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { completions: [] };
}

export function saveTally(tally) {
  try { safeStorage.setItem(TALLY_KEY, JSON.stringify(tally)); } catch (e) {}
}

export function recordCompletion() {
  const tally = loadTally();
  tally.completions.push(new Date().toISOString());
  // Prune entries older than 8 days
  const cutoff = new Date(Date.now() - 8 * 86400000).toISOString();
  tally.completions = tally.completions.filter(d => d >= cutoff);
  saveTally(tally);
  updateTallyDisplay();
}

export function updateTallyDisplay() {
  const tally = loadTally();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  // Week: Monday-based
  const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).toISOString();
  const today = tally.completions.filter(d => d >= todayStart).length;
  const week = tally.completions.filter(d => d >= weekStart).length;
  const todayEl = document.getElementById('tally-today');
  const weekEl = document.getElementById('tally-week');
  if (todayEl) todayEl.textContent = today;
  if (weekEl) weekEl.textContent = week;
}

/* ═══ TASK ADDITION LOG ═══ */
export function loadAddLog() {
  try {
    const raw = safeStorage.getItem(ADDLOG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export function saveAddLog(log) {
  try { safeStorage.setItem(ADDLOG_KEY, JSON.stringify(log)); } catch (e) {}
}

export function logTaskAddition(text, sec) {
  const log = loadAddLog();
  log.push({ text: text.toLowerCase().trim(), sec, date: new Date().toISOString() });
  // Prune entries older than 30 days
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const pruned = log.filter(e => e.date >= cutoff);
  saveAddLog(pruned);
}

/* ═══ TIME TRACKING ═══ */
export function loadTimeLog() {
  try {
    const raw = safeStorage.getItem(TIMELOG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export function saveTimeLog(log) {
  try { safeStorage.setItem(TIMELOG_KEY, JSON.stringify(log)); } catch (e) {}
}

export function logTaskTime(text, sec, focusedMs) {
  const log = loadTimeLog();
  log.push({ text: text.toLowerCase().trim(), sec, focusedMs, completedAt: new Date().toISOString() });
  const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
  const pruned = log.filter(e => e.completedAt >= cutoff);
  saveTimeLog(pruned);
}

export function getAvgTime(text) {
  const log = loadTimeLog();
  const key = text.toLowerCase().trim();
  const matches = log.filter(e => e.text === key && e.focusedMs > 0);
  if (!matches.length) return null;
  return matches.reduce((s, e) => s + e.focusedMs, 0) / matches.length;
}

/* ═══ RECURRING TEMPLATES ═══ */
export function loadTemplates() {
  try {
    const raw = safeStorage.getItem(TEMPLATES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { templates: [], lastSpawned: {} };
}

export function saveTemplates(data) {
  try { safeStorage.setItem(TEMPLATES_KEY, JSON.stringify(data)); } catch (e) {}
}

/* ═══ SWAP MEMORY ═══ */
export function loadSwapMemory() {
  try {
    const raw = safeStorage.getItem(SWAPMEM_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { swappedOut: [], swappedIn: [] };
}

export function saveSwapMemory(mem) {
  try { safeStorage.setItem(SWAPMEM_KEY, JSON.stringify(mem)); } catch (e) {}
}

export function recordSwap(swappedOutTask, swappedInTask) {
  const mem = loadSwapMemory();
  const now = new Date().toISOString();
  mem.swappedOut.push({ taskId: swappedOutTask.id, text: swappedOutTask.text, sec: swappedOutTask.sec, date: now });
  mem.swappedIn.push({ taskId: swappedInTask.id, text: swappedInTask.text, sec: swappedInTask.sec, date: now });
  // Prune older than 30 days
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  mem.swappedOut = mem.swappedOut.filter(e => e.date >= cutoff);
  mem.swappedIn = mem.swappedIn.filter(e => e.date >= cutoff);
  saveSwapMemory(mem);
}

export function getSwapAdjustment(taskId) {
  const mem = loadSwapMemory();
  // Count how many times this task was swapped OUT (penalize -- user doesn't want it)
  const outCount = mem.swappedOut.filter(e => e.taskId === taskId).length;
  // Count how many times swapped IN (bonus -- user specifically chose it)
  const inCount = mem.swappedIn.filter(e => e.taskId === taskId).length;
  return (inCount * 8) - (outCount * 12);
}

/* ═══ SEALED ARCHIVE ═══ */
export function loadArchive() {
  try { const r = safeStorage.getItem(ARCHIVE_KEY); if (r) return JSON.parse(r); } catch (e) {}
  return [];
}

export function saveArchive(a) {
  try {
    // Keep last 200 entries
    if (a.length > 200) a = a.slice(a.length - 200);
    safeStorage.setItem(ARCHIVE_KEY, JSON.stringify(a));
  } catch (e) {}
}

/* ═══ CHECKLIST MEMORY ═══ */
export function loadChecklistMemory() {
  try { const r = safeStorage.getItem(CLMEM_KEY); if (r) return JSON.parse(r); } catch (e) {}
  return {};
}

export function saveChecklistMemory(m) {
  try { safeStorage.setItem(CLMEM_KEY, JSON.stringify(m)); } catch (e) {}
}

export function rememberChecklist(text, checklist) {
  if (!checklist || !checklist.length) return;
  const mem = loadChecklistMemory();
  const key = text.toLowerCase().trim();
  mem[key] = checklist.map(c => c.text); // just save the text, not done state
  saveChecklistMemory(mem);
}

export function recallChecklist(text) {
  const mem = loadChecklistMemory();
  const key = text.toLowerCase().trim();
  return mem[key] || null;
}

/* ═══ SELF-CARE ═══ */
export function loadSelfCare() {
  try {
    const raw = safeStorage.getItem(SELFCARE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { days: {} };
}

export function saveSelfCare(data) {
  try { safeStorage.setItem(SELFCARE_KEY, JSON.stringify(data)); } catch (e) {}
}

/* ═══ STRUGGLES JOURNAL ═══ */
export function loadStruggles() {
  try { const r = safeStorage.getItem(STRUGGLES_KEY); if (r) return JSON.parse(r); } catch (e) {}
  return [];
}

export function saveStruggles(data) {
  try { safeStorage.setItem(STRUGGLES_KEY, JSON.stringify(data)); } catch (e) {}
}

// src/js/enchantments.js — Section enchantment/level-up system
// Sections glow more intensely as tasks are completed. Weekly reset, non-punishing decay.
import { ALL_SECTIONS } from './constants.js';
import { state } from './state.js';
import { on } from './events.js';

const ENCHANT_KEY = 'tome_enchantments';
const MAX_LEVEL = 5; // Levels 0-5
const TASKS_PER_LEVEL = 3; // Complete 3 tasks to gain a level in that section

let _data = loadEnchantments();

function loadEnchantments(){
  try {
    const raw = localStorage.getItem(ENCHANT_KEY);
    if(raw){
      const d = JSON.parse(raw);
      // Check for weekly reset (Monday)
      if(shouldReset(d.weekStart)){
        return freshWeek();
      }
      return d;
    }
  } catch(e){}
  return freshWeek();
}

function freshWeek(){
  const now = new Date();
  // Start of this week (Monday)
  const day = now.getDay();
  const diff = (day === 0 ? 6 : day - 1); // days since Monday
  const monday = new Date(now);
  monday.setDate(monday.getDate() - diff);
  monday.setHours(0,0,0,0);

  const sections = {};
  ALL_SECTIONS.forEach(s => {
    sections[s] = { completed: 0, level: 0 };
  });
  return { weekStart: monday.toISOString(), sections };
}

function shouldReset(weekStartStr){
  if(!weekStartStr) return true;
  const ws = new Date(weekStartStr);
  const now = new Date();
  // If it's been 7+ days since weekStart, reset
  return (now - ws) >= 7 * 86400000;
}

function saveEnchantments(){
  try { localStorage.setItem(ENCHANT_KEY, JSON.stringify(_data)); } catch(e){}
}

export function recordSectionCompletion(section){
  if(!_data.sections[section]) return;
  _data.sections[section].completed++;
  const newLevel = Math.min(MAX_LEVEL, Math.floor(_data.sections[section].completed / TASKS_PER_LEVEL));
  _data.sections[section].level = newLevel;
  saveEnchantments();
  applyEnchantmentStyles();
}

export function getSectionLevel(section){
  return _data.sections[section]?.level || 0;
}

export function getWeekProgress(){
  return { ..._data };
}

/**
 * Apply enchantment CSS classes to section elements.
 * Called on init and after each completion.
 */
export function applyEnchantmentStyles(){
  ALL_SECTIONS.forEach(sec => {
    const el = document.querySelector(`.section-${sec}`);
    if(!el) return;
    const level = getSectionLevel(sec);
    // Remove old levels
    for(let i = 0; i <= MAX_LEVEL; i++){
      el.classList.remove(`enchant-${i}`);
    }
    // Apply current level
    if(level > 0){
      el.classList.add(`enchant-${level}`);
    }
  });
}

/**
 * Gentle decay: reduce levels by 1 each day if no tasks completed that day.
 * Called on day change.
 */
export function enchantmentDayDecay(){
  // Just reduce by 0.5 — levels only drop if you miss multiple days
  // (non-punishing: we don't touch it, the weekly reset handles clearing)
  // Actually — per user request, non-punishing decay means glow just
  // fades slowly. We do this by subtracting 1 from completed count daily
  // but never below the floor for current level - 1.
  ALL_SECTIONS.forEach(sec => {
    if(!_data.sections[sec]) return;
    const s = _data.sections[sec];
    if(s.completed > 0){
      s.completed = Math.max(0, s.completed - 1);
      s.level = Math.min(MAX_LEVEL, Math.floor(s.completed / TASKS_PER_LEVEL));
    }
  });
  saveEnchantments();
  applyEnchantmentStyles();
}

export function initEnchantments(){
  // Listen for task completions
  on('sectionRendered', (sec) => {
    // We don't increment here — that's done by recordSectionCompletion
    // This is just for re-applying styles after re-renders
    applyEnchantmentStyles();
  });

  // Apply styles on load
  applyEnchantmentStyles();
}

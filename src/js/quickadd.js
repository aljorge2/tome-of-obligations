// src/js/quickadd.js — Smart quick-add natural language parsing
// Detects: time estimates, priority, due dates, tags

/**
 * Parse a task string for embedded metadata.
 * Returns { text, estimate, priority, dueDate, tags }
 * Examples:
 *   "write report ~45m" → { text: "write report", estimate: 45 }
 *   "fix bug !! by friday" → { text: "fix bug", priority: 3, dueDate: "2026-05-22" }
 *   "email sara @bonds 20m" → { text: "email sara", estimate: 20, suggestedSection: "bonds" }
 */
export function parseQuickAdd(raw){
  let text = raw.trim();
  let estimate = null;
  let priority = null;
  let dueDate = null;
  let suggestedSection = null;

  // Extract time estimates: ~30m, 30m, 30min, 1h, 1.5h, 90min
  const timeRx = /(?:~?\s*)(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hours)\b/i;
  const timeMatch = text.match(timeRx);
  if(timeMatch){
    const num = parseFloat(timeMatch[1]);
    const unit = timeMatch[2].toLowerCase();
    estimate = unit.startsWith('h') ? Math.round(num * 60) : Math.round(num);
    text = text.replace(timeMatch[0], '').trim();
  }

  // Extract priority: !!! = 3 (critical), !! = 2 (high), ! = 1 (normal+)
  const prioRx = /(!{1,3})/;
  const prioMatch = text.match(prioRx);
  if(prioMatch){
    priority = prioMatch[1].length; // 1, 2, or 3
    text = text.replace(prioMatch[0], '').trim();
  }

  // Extract "urgent" / "critical" keywords as priority
  if(!priority){
    if(/\b(critical|asap)\b/i.test(text)){
      priority = 3;
      text = text.replace(/\b(critical|asap)\b/i, '').trim();
    } else if(/\b(urgent)\b/i.test(text)){
      priority = 2;
      text = text.replace(/\b(urgent)\b/i, '').trim();
    }
  }

  // Extract section tags: @lab, @bio, @hearth, @scrolls, @forge, @bonds
  const tagRx = /@(lab|bio|hearth|scrolls|forge|bonds)\b/i;
  const tagMatch = text.match(tagRx);
  if(tagMatch){
    suggestedSection = tagMatch[1].toLowerCase();
    text = text.replace(tagMatch[0], '').trim();
  }

  // Extract due dates: "by friday", "by tomorrow", "due monday", "by 5/25"
  const dueRx = /\b(?:by|due|before)\s+(\w+(?:\s+\w+)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;
  const dueMatch = text.match(dueRx);
  if(dueMatch){
    const parsed = parseDatePhrase(dueMatch[1]);
    if(parsed){
      dueDate = parsed;
      text = text.replace(dueMatch[0], '').trim();
    }
  }

  // Clean up double spaces
  text = text.replace(/\s{2,}/g, ' ').trim();

  return { text, estimate, priority, dueDate, suggestedSection };
}

function parseDatePhrase(phrase){
  const lower = phrase.toLowerCase().trim();
  const now = new Date();

  if(lower === 'today'){
    return toDateStr(now);
  }
  if(lower === 'tomorrow'){
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toDateStr(d);
  }

  // Day names: "monday", "tuesday", etc.
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dayIdx = days.indexOf(lower);
  if(dayIdx >= 0){
    const d = new Date(now);
    const currentDay = d.getDay();
    let diff = dayIdx - currentDay;
    if(diff <= 0) diff += 7; // next occurrence
    d.setDate(d.getDate() + diff);
    return toDateStr(d);
  }

  // "next week"
  if(lower === 'next week'){
    const d = new Date(now);
    d.setDate(d.getDate() + 7 - d.getDay() + 1); // next Monday
    return toDateStr(d);
  }

  // M/D or M/D/YY format
  const slashRx = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;
  const slashMatch = lower.match(slashRx);
  if(slashMatch){
    const month = parseInt(slashMatch[1]) - 1;
    const day = parseInt(slashMatch[2]);
    let year = slashMatch[3] ? parseInt(slashMatch[3]) : now.getFullYear();
    if(year < 100) year += 2000;
    return toDateStr(new Date(year, month, day));
  }

  return null;
}

function toDateStr(d){
  return d.toISOString().slice(0, 10);
}

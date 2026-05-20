// src/js/struggles.js — Struggles journal
import { loadStruggles, saveStruggles } from './state.js';

export function saveStrugglesEntry(){
  const input = document.getElementById('scry-struggles');
  const text = input.value.trim();
  if(!text) return;
  const log = loadStruggles();
  log.push({ text, date: new Date().toISOString() });
  // Keep last 90 days
  const cutoff = new Date(Date.now() - 90*86400000).toISOString();
  const pruned = log.filter(e => e.date >= cutoff);
  saveStruggles(pruned);
  input.value = '';
}

export function showStrugglesPatterns(){
  const container = document.getElementById('scry-struggles-patterns');
  const log = loadStruggles();
  if(log.length < 3){ container.innerHTML = ''; return; }

  // Extract common words/phrases (simple keyword frequency)
  const stopWords = new Set(['i','the','a','an','to','and','of','it','was','is','in','my','me','that','this','with','for','on','at','but','so','just','not','had','have','been','from','really','very','about','too','all','get','got','like','feel','felt','did','do','can','could','would','should']);
  const wordCounts = {};
  const cutoff14 = new Date(Date.now() - 14*86400000).toISOString();
  const recent = log.filter(e => e.date >= cutoff14);

  recent.forEach(entry => {
    const words = entry.text.toLowerCase().replace(/[^\w\s]/g,'').split(/\s+/);
    // Extract 2-word phrases and individual words
    const seen = new Set();
    for(let i = 0; i < words.length; i++){
      const w = words[i];
      if(w.length < 3 || stopWords.has(w)) continue;
      if(!seen.has(w)){ wordCounts[w] = (wordCounts[w]||0) + 1; seen.add(w); }
      // 2-word phrases
      if(i < words.length-1){
        const w2 = words[i+1];
        if(w2.length >= 3 && !stopWords.has(w2)){
          const phrase = w + ' ' + w2;
          if(!seen.has(phrase)){ wordCounts[phrase] = (wordCounts[phrase]||0) + 1; seen.add(phrase); }
        }
      }
    }
  });

  // Find recurring themes (3+ mentions)
  const patterns = Object.entries(wordCounts)
    .filter(([k,v]) => v >= 3)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 5);

  if(patterns.length){
    container.innerHTML = `<div class="struggles-pattern">
      <strong style="color:#d04060;font-size:11px;font-family:Cinzel,serif;letter-spacing:0.1em">⚠ RECURRING THEMES:</strong>
      ${patterns.map(([word, count]) => `<span style="margin-left:8px">"${word}" (${count}x)</span>`).join('')}
    </div>`;
  } else {
    container.innerHTML = '';
  }
}

export function initStruggles(){
  // No additional init needed — struggles are populated during scry check-in
  // The saveStrugglesEntry is called from scry navigation
}

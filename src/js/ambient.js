// src/js/ambient.js — Ambient sound system for lock-in mode
// Uses Web Audio API with procedural synthesis (no external files)

const SOUNDS = [
  { id: 'rain', label: 'Wind Chimes', icon: 'ti-wand' },
  { id: 'fire', label: 'Fire', icon: 'ti-flame' },
  { id: 'dark', label: 'Dark Noise', icon: 'ti-sparkles' },
  { id: 'wind', label: 'Wind', icon: 'ti-wind' },
];

let audioCtx = null;
const activeNodes = {}; // { soundId: { nodes[], intervals[], master } }
const AMBIENT_KEY = 'tome_ambient_prefs';

function getCtx(){
  if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if(audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function loadPrefs(){
  try {
    const raw = localStorage.getItem(AMBIENT_KEY);
    if(raw) return JSON.parse(raw);
  } catch(e){}
  return {};
}
function savePrefs(prefs){
  try { localStorage.setItem(AMBIENT_KEY, JSON.stringify(prefs)); } catch(e){}
}

/* ─── Utility: white noise buffer ─── */
function noiseBuffer(ctx, sec = 2){
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * sec, sr);
  const d = buf.getChannelData(0);
  for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/* ════════════════════════════════════════
   RAIN — layered: a soft noise bed for
   steady patter + randomized click bursts
   for individual droplets
   ════════════════════════════════════════ */
function startRain(ctx, master){
  const nodes = [];
  const intervals = [];

  // Layer 1: gentle noise bed (distant rain)
  const bed = ctx.createBufferSource();
  bed.buffer = noiseBuffer(ctx, 3);
  bed.loop = true;
  const bedFilt = ctx.createBiquadFilter();
  bedFilt.type = 'bandpass';
  bedFilt.frequency.value = 1200;
  bedFilt.Q.value = 0.4;
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.04;
  bed.connect(bedFilt); bedFilt.connect(bedGain); bedGain.connect(master);
  bed.start();
  nodes.push(bed);

  // Layer 2: random droplet clicks
  function droplet(){
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    // random pitch for each drop
    osc.frequency.value = 2000 + Math.random() * 4000;
    osc.type = 'sine';
    f.type = 'highpass';
    f.frequency.value = 1500;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.02 + Math.random() * 0.03, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.02 + Math.random() * 0.03);
    osc.connect(f); f.connect(g); g.connect(master);
    osc.start(now);
    osc.stop(now + 0.06);
  }
  // Schedule clusters of drops at random intervals
  const iv = setInterval(() => {
    const count = 1 + Math.floor(Math.random() * 4);
    for(let i = 0; i < count; i++){
      setTimeout(droplet, Math.random() * 120);
    }
  }, 60 + Math.random() * 80);
  intervals.push(iv);

  return { nodes, intervals };
}

/* ════════════════════════════════════════
   FIRE — crackling pops + low rumble
   ════════════════════════════════════════ */
function startFire(ctx, master){
  const nodes = [];
  const intervals = [];

  // Layer 1: low rumble
  const rumble = ctx.createBufferSource();
  rumble.buffer = noiseBuffer(ctx, 3);
  rumble.loop = true;
  const rumbleFilt = ctx.createBiquadFilter();
  rumbleFilt.type = 'lowpass';
  rumbleFilt.frequency.value = 150;
  rumbleFilt.Q.value = 0.5;
  const rumbleG = ctx.createGain();
  rumbleG.gain.value = 0.10;
  rumble.connect(rumbleFilt); rumbleFilt.connect(rumbleG); rumbleG.connect(master);
  rumble.start();
  nodes.push(rumble);

  // Layer 2: crackle pops
  function crackle(){
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // sparse random impulses
    for(let i = 0; i < d.length; i++){
      d[i] = Math.random() < 0.15 ? (Math.random() * 2 - 1) * 0.8 : 0;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 800 + Math.random() * 2000;
    f.Q.value = 1.5;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.10 + Math.random() * 0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.03 + Math.random() * 0.04);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(now);
  }
  const iv = setInterval(() => {
    const count = 1 + Math.floor(Math.random() * 3);
    for(let i = 0; i < count; i++){
      setTimeout(crackle, Math.random() * 200);
    }
  }, 100 + Math.random() * 150);
  intervals.push(iv);

  return { nodes, intervals };
}

/* ════════════════════════════════════════
   DARK NOISE — smooth, steady brown noise
   Matches Apple's Background Sounds "Dark Noise":
   continuous brown noise, no pulsing, no LFO.
   Deep low-frequency blanket, ~100-500Hz range,
   warm and flat. Uses longer buffer for seamless loop.
   ════════════════════════════════════════ */
function startDark(ctx, master){
  const nodes = [];
  const intervals = [];

  // Generate brown noise buffer (integrated white noise)
  // Use a long buffer (8s) to avoid audible loop points
  const sec = 8;
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(2, sr * sec, sr); // stereo for fullness

  for(let ch = 0; ch < 2; ch++){
    const d = buf.getChannelData(ch);
    let last = 0;
    for(let i = 0; i < d.length; i++){
      const white = Math.random() * 2 - 1;
      last = (last + (0.02 * white)) / 1.02;
      d[i] = last;
    }
    // Normalize
    let peak = 0;
    for(let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if(peak > 0) for(let i = 0; i < d.length; i++) d[i] /= peak;
    // Crossfade the loop seam (last 0.1s blends into first 0.1s)
    const fade = Math.floor(sr * 0.1);
    for(let i = 0; i < fade; i++){
      const t = i / fade;
      d[d.length - fade + i] = d[d.length - fade + i] * (1 - t) + d[i] * t;
    }
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  // Shape the spectrum: low-shelf boost + gentle lowpass rolloff
  // This gives it that full, warm, dark character
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'lowshelf';
  shelf.frequency.value = 150;
  shelf.gain.value = 6; // boost the lows

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500; // cut highs — keeps it dark, not hissy
  lp.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.value = 0.22; // steady volume, no modulation

  src.connect(shelf);
  shelf.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start();
  nodes.push(src);

  return { nodes, intervals };
}

/* ════════════════════════════════════════
   WIND — slowly modulated filtered noise
   with LFO sweeping the cutoff frequency
   ════════════════════════════════════════ */
function startWind(ctx, master){
  const nodes = [];
  const intervals = [];

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 4);
  noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  filter.Q.value = 1.5;

  // LFO sweeps the filter cutoff for that howling swell
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.12 + Math.random() * 0.08; // very slow
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 350; // sweep range: 400 ± 350 Hz
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();
  nodes.push(lfo);

  // Second slower LFO for volume swell
  const lfo2 = ctx.createOscillator();
  lfo2.type = 'sine';
  lfo2.frequency.value = 0.06 + Math.random() * 0.04;
  const lfo2Gain = ctx.createGain();
  lfo2Gain.gain.value = 0.03;

  const g = ctx.createGain();
  g.gain.value = 0.07;
  lfo2.connect(lfo2Gain);
  lfo2Gain.connect(g.gain);
  lfo2.start();
  nodes.push(lfo2);

  noise.connect(filter);
  filter.connect(g);
  g.connect(master);
  noise.start();
  nodes.push(noise);

  return { nodes, intervals };
}

/* ─── Start / Stop dispatcher ─── */
function startSound(id){
  if(activeNodes[id]) return;
  const ctx = getCtx();

  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  let result;
  switch(id){
    case 'rain':  result = startRain(ctx, master); break;
    case 'fire':  result = startFire(ctx, master); break;
    case 'dark':  result = startDark(ctx, master); break;
    case 'wind':  result = startWind(ctx, master); break;
    default: return;
  }

  activeNodes[id] = { ...result, master };
}

function stopSound(id){
  const entry = activeNodes[id];
  if(!entry) return;
  // Fade master out
  const ctx = getCtx();
  entry.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  // Clean up after fade
  setTimeout(() => {
    (entry.intervals || []).forEach(clearInterval);
    (entry.nodes || []).forEach(n => { try { n.stop(); } catch(e){} });
    try { entry.master.disconnect(); } catch(e){}
  }, 700);
  delete activeNodes[id];
}

export function stopAllAmbient(){
  Object.keys(activeNodes).forEach(stopSound);
}

export function toggleAmbient(id){
  const prefs = loadPrefs();
  if(activeNodes[id]){
    stopSound(id);
    prefs[id] = false;
  } else {
    startSound(id);
    prefs[id] = true;
  }
  savePrefs(prefs);
}

export function resumeAmbient(){
  const prefs = loadPrefs();
  Object.entries(prefs).forEach(([id, on]) => {
    if(on && !activeNodes[id]) startSound(id);
  });
}

export function ambientHTML(){
  const prefs = loadPrefs();
  const btns = SOUNDS.map(s => {
    const on = prefs[s.id] || false;
    return `<span class="ambient-btn${on ? ' active' : ''}" data-ambient="${s.id}" title="${s.label}">
      <i class="ti ${s.icon}" style="font-size:11px"></i>
    </span>`;
  }).join('');
  return `<div class="ambient-row">
    <span class="ambient-label"><i class="ti ti-volume" style="font-size:9px"></i> Ambience</span>
    ${btns}
  </div>`;
}

export function attachAmbientHandlers(container){
  container.querySelectorAll('.ambient-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.ambient;
      toggleAmbient(id);
      btn.classList.toggle('active');
    });
  });
}

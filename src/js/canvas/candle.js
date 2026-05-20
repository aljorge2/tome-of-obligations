/* ═══════════════════════════════════════════════
   LAYER 4 — CANDLELIGHT FLICKER
   A warm radial glow that dances like firelight.
   Body doubling intensifies the hearth glow.
   ═══════════════════════════════════════════════ */
import { bodyDoublingEnabled } from '../state.js';

let candleEl;
let candleTime = Math.random() * 100;

export function initCandle(){
  candleEl = document.getElementById('candlelight');
}

export function updateCandle(){
  candleTime += 0.016;
  const f1 = Math.sin(candleTime * 1.7) * 0.3;
  const f2 = Math.sin(candleTime * 3.3 + 1.2) * 0.2;
  const f3 = Math.sin(candleTime * 0.4 + 0.8) * 0.5;

  // Body doubling: brighter, warmer, wider glow
  const bd = bodyDoublingEnabled;
  const baseIntensity = bd ? 0.08 : 0.04;
  const flickerAmp = bd ? 0.032 : 0.022;
  const intensity = baseIntensity + (f1 + f2 + f3 + 1) * flickerAmp;

  const cx = 50 + Math.sin(candleTime * 0.3) * 10;
  const cy = 30 + Math.sin(candleTime * 0.2 + 1) * 8;
  const r = (bd ? 70 : 55) + Math.sin(candleTime * 0.7) * 10;

  // Warmer inner color when body doubling
  const innerR = bd ? 200 : 180, innerG = bd ? 120 : 100, innerB = bd ? 50 : 40;
  const innerA = bd ? 0.7 : 0.55;
  const midR = bd ? 140 : 120, midG = bd ? 55 : 40, midB = bd ? 25 : 20;
  const midA = bd ? 0.18 : 0.12;

  candleEl.style.opacity = intensity;
  candleEl.style.background = `radial-gradient(ellipse ${r}% ${r*0.7}% at ${cx}% ${cy}%, rgba(${innerR},${innerG},${innerB},${innerA}) 0%, rgba(${midR},${midG},${midB},${midA}) 45%, transparent 75%)`;
}

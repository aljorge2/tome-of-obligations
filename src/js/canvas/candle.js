/* ═══════════════════════════════════════════════
   LAYER 4 — CANDLELIGHT FLICKER
   A warm radial glow that dances like firelight.
   ═══════════════════════════════════════════════ */
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
  const intensity = 0.04 + (f1 + f2 + f3 + 1) * 0.022;
  const cx = 50 + Math.sin(candleTime * 0.3) * 10;
  const cy = 30 + Math.sin(candleTime * 0.2 + 1) * 8;
  const r = 55 + Math.sin(candleTime * 0.7) * 10;
  candleEl.style.opacity = intensity;
  candleEl.style.background = `radial-gradient(ellipse ${r}% ${r*0.7}% at ${cx}% ${cy}%, rgba(180,100,40,0.55) 0%, rgba(120,40,20,0.12) 45%, transparent 75%)`;
}

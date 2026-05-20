/* ═══════════════════════════════════════════════
   LAYER 1 — DRIFTING FOG
   Large translucent elliptical blobs that crawl
   across the viewport. Crimson & violet hues.
   ═══════════════════════════════════════════════ */
import { bodyDoublingEnabled } from '../state.js';

let fogCanvas, fogCtx, fogW, fogH;
const fogBlobs = [];

export function initFog(){
  fogCanvas = document.getElementById('fog');
  fogCtx = fogCanvas.getContext('2d');
  fogW = fogCanvas.width = window.innerWidth;
  fogH = fogCanvas.height = window.innerHeight;
  fogBlobs.length = 0;
  const count = Math.max(8, Math.floor((fogW * fogH) / 80000));
  for(let i = 0; i < count; i++){
    fogBlobs.push({
      x: Math.random() * fogW,
      y: Math.random() * fogH,
      rx: 120 + Math.random() * 280,
      ry: 60 + Math.random() * 140,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.15,
      alpha: 0.025 + Math.random() * 0.045,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.003 + Math.random() * 0.006,
      hue: Math.random() < 0.55 ? (340 + Math.random()*30) : (260 + Math.random()*30),
      sat: 20 + Math.random() * 25,
      light: 12 + Math.random() * 18,
    });
  }
}

export function drawFog(){
  fogCtx.clearRect(0, 0, fogW, fogH);
  // Body doubling: warmer, denser fog — hearth presence
  const bdAlphaBoost = bodyDoublingEnabled ? 1.5 : 1;
  const bdHueWarm = bodyDoublingEnabled ? -15 : 0; // push toward warmer reds/ambers

  for(const b of fogBlobs){
    b.phase += b.phaseSpeed;
    const breathe = 0.65 + 0.35 * Math.sin(b.phase);
    const a = Math.min(0.12, b.alpha * breathe * bdAlphaBoost);
    const h = b.hue + bdHueWarm;
    const grad = fogCtx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rx);
    grad.addColorStop(0, `hsla(${h},${b.sat}%,${b.light}%,${a})`);
    grad.addColorStop(0.5, `hsla(${h},${b.sat}%,${b.light}%,${a * 0.35})`);
    grad.addColorStop(1, `hsla(${h},${b.sat}%,${b.light}%,0)`);
    fogCtx.save();
    fogCtx.translate(b.x, b.y);
    fogCtx.scale(1, b.ry / b.rx);
    fogCtx.translate(-b.x, -b.y);
    fogCtx.fillStyle = grad;
    fogCtx.beginPath();
    fogCtx.arc(b.x, b.y, b.rx, 0, Math.PI * 2);
    fogCtx.fill();
    fogCtx.restore();
    b.x += b.dx; b.y += b.dy;
    if(b.x < -b.rx*2) b.x = fogW + b.rx;
    if(b.x > fogW + b.rx*2) b.x = -b.rx;
    if(b.y < -b.ry*2) b.y = fogH + b.ry;
    if(b.y > fogH + b.ry*2) b.y = -b.ry;
  }
}

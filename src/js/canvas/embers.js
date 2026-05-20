/* ═══════════════════════════════════════════════
   LAYER 2 — EMBER PARTICLES with glow + trails
   ═══════════════════════════════════════════════ */
import { bodyDoublingEnabled } from '../state.js';

let partCanvas, partCtx, pW, pH;
const embers = [];

export function initEmbers(){
  partCanvas = document.getElementById('particles');
  partCtx = partCanvas.getContext('2d');
  pW = partCanvas.width = window.innerWidth;
  pH = partCanvas.height = window.innerHeight;
  embers.length = 0;
  const count = Math.floor((pW * pH) / 3500);
  for(let i = 0; i < count; i++){
    const type = Math.random();
    let hue, sat, light, baseAlpha, size;
    if(type < 0.4){
      // crimson embers
      hue=348+Math.random()*22; sat=75+Math.random()*25; light=48+Math.random()*22;
      baseAlpha=Math.random()*0.6+0.15; size=Math.random()*2.5+0.5;
    } else if(type < 0.62){
      // gold sparks
      hue=33+Math.random()*16; sat=75+Math.random()*25; light=58+Math.random()*16;
      baseAlpha=Math.random()*0.5+0.12; size=Math.random()*2+0.4;
    } else if(type < 0.8){
      // violet wisps
      hue=268+Math.random()*24; sat=55+Math.random()*30; light=52+Math.random()*22;
      baseAlpha=Math.random()*0.45+0.1; size=Math.random()*1.8+0.4;
    } else {
      // pale ghost motes
      hue=338+Math.random()*32; sat=12+Math.random()*18; light=76+Math.random()*18;
      baseAlpha=Math.random()*0.25+0.06; size=Math.random()*1.4+0.3;
    }
    embers.push({
      x: Math.random()*pW, y: Math.random()*pH,
      r: size,
      dx: (Math.random()-0.5)*0.35,
      dy: -Math.random()*0.4-0.1,
      alpha: baseAlpha,
      flicker: Math.random()*Math.PI*2,
      flickerSpeed: Math.random()*0.025+0.006,
      hue, sat, light,
      trail: [],
      trailLen: type < 0.4 ? 8 : 5,
    });
  }
}

export function drawEmbers(){
  partCtx.clearRect(0, 0, pW, pH);
  // Body doubling boost: warmer, brighter, more visible
  const bdBoost = bodyDoublingEnabled ? 1.6 : 1;
  const bdHueShift = bodyDoublingEnabled ? -12 : 0; // shift toward warmer tones

  for(const p of embers){
    p.flicker += p.flickerSpeed;
    const a = Math.min(1, p.alpha * (0.5 + 0.5 * Math.sin(p.flicker)) * bdBoost);
    if(a < 0.008) continue;

    // Trail
    p.trail.push({x: p.x, y: p.y});
    if(p.trail.length > p.trailLen) p.trail.shift();
    const h = p.hue + bdHueShift;
    if(p.trail.length > 1 && a > 0.06){
      for(let ti = 0; ti < p.trail.length - 1; ti++){
        const t = p.trail[ti];
        const ta = a * 0.18 * (ti / p.trail.length);
        partCtx.beginPath();
        partCtx.arc(t.x, t.y, p.r * 0.55, 0, Math.PI * 2);
        partCtx.fillStyle = `hsla(${h},${p.sat}%,${p.light}%,${ta})`;
        partCtx.fill();
      }
    }

    // Main dot
    partCtx.beginPath();
    partCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    partCtx.fillStyle = `hsla(${h},${p.sat}%,${p.light}%,${a})`;
    partCtx.fill();

    // Glow halo
    if(a > 0.08 && p.r > 0.45){
      partCtx.beginPath();
      partCtx.arc(p.x, p.y, p.r * (bodyDoublingEnabled ? 6 : 4.5), 0, Math.PI * 2);
      partCtx.fillStyle = `hsla(${h},${p.sat}%,${p.light}%,${a * (bodyDoublingEnabled ? 0.18 : 0.12)})`;
      partCtx.fill();
    }

    p.x += p.dx; p.y += p.dy;
    p.x += Math.sin(p.flicker * 0.6) * 0.25; // organic wobble

    if(p.y < -8){ p.y = pH + 8; p.x = Math.random() * pW; p.trail = []; }
    if(p.x < -8) p.x = pW + 8;
    if(p.x > pW + 8) p.x = -8;
  }
}

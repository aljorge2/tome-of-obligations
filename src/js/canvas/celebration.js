/* ═══ CELEBRATION BURST — "SPELL SEALED" ═══ */
import { RUNE_SHAPES } from './sigils.js';

let celebCanvas, celebCtx, celebW, celebH;
let spellFlash;
const celebParticles = [];
const celebRings = [];
const celebRunes = [];

// Section color map
export const SEC_COLORS = {
  lab:    { h: 270, s: 65, l: 60 }, // purple
  bio:    { h: 135, s: 55, l: 55 }, // green
  time:   { h: 190, s: 55, l: 55 }, // teal
  wards:  { h: 40,  s: 75, l: 60 }, // gold
  hearth: { h: 270, s: 65, l: 60 }, // purple
  scrolls:{ h: 135, s: 55, l: 55 }, // green
  forge:  { h: 190, s: 55, l: 55 }, // teal
  bonds:  { h: 30,  s: 65, l: 55 }, // orange
};

export function initCeleb(){
  celebCanvas = document.getElementById('celebration');
  celebCtx = celebCanvas.getContext('2d');
  spellFlash = document.getElementById('spell-flash');
  celebW = celebCanvas.width = window.innerWidth;
  celebH = celebCanvas.height = window.innerHeight;
}

export function miniSparkBurst(cx, cy, sec){
  const col = SEC_COLORS[sec] || { h: 40, s: 70, l: 60 };

  // Small ring
  celebRings.push({
    x: cx, y: cy,
    radius: 3,
    maxRadius: 35,
    speed: 2.5,
    alpha: 0.45,
    lineWidth: 1.5,
    hue: col.h,
    sat: col.s,
    light: col.l + 15,
  });

  // 15-25 tiny sparks
  const count = 15 + Math.floor(Math.random() * 10);
  for(let i = 0; i < count; i++){
    const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.5;
    const speed = 0.8 + Math.random() * 2.5;
    const isGold = Math.random() < 0.3;
    celebParticles.push({
      x: cx, y: cy,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      r: 0.5 + Math.random() * 1.5,
      alpha: 0.7 + Math.random() * 0.3,
      decay: 0.025 + Math.random() * 0.02,
      hue: isGold ? (35 + Math.random() * 15) : (col.h + (Math.random()-0.5) * 25),
      sat: isGold ? 80 : col.s + 10,
      light: isGold ? 68 : col.l + 20,
      gravity: 0.015 + Math.random() * 0.02,
      trail: [],
      trailLen: 2,
    });
  }

  // Tiny center glow
  celebParticles.push({
    x: cx, y: cy,
    dx: 0, dy: 0,
    r: 4,
    alpha: 0.8,
    decay: 0.03,
    hue: col.h,
    sat: col.s,
    light: col.l + 30,
    gravity: 0,
    trail: [],
    trailLen: 0,
    isCore: true,
    expandRate: 0.8,
  });
}

export function spellSealBurst(cx, cy, sec){
  const col = SEC_COLORS[sec] || { h: 40, s: 70, l: 60 };

  // Screen flash
  const flashH = col.h;
  spellFlash.style.background = `radial-gradient(circle at ${cx}px ${cy}px, hsla(${flashH},80%,70%,0.35) 0%, hsla(${flashH},60%,40%,0.1) 40%, transparent 70%)`;
  spellFlash.style.opacity = '1';
  setTimeout(()=>{ spellFlash.style.opacity = '0'; }, 200);

  // Expanding rings (3 staggered)
  for(let i = 0; i < 3; i++){
    celebRings.push({
      x: cx, y: cy,
      radius: 5,
      maxRadius: 120 + i * 60,
      speed: 3.5 + i * 0.8,
      alpha: 0.6 - i * 0.12,
      lineWidth: 3 - i * 0.5,
      hue: col.h + i * 15,
      sat: col.s,
      light: col.l + 10,
    });
  }

  // Spark particles (big burst — 80+ sparks)
  const sparkCount = 80 + Math.floor(Math.random() * 30);
  for(let i = 0; i < sparkCount; i++){
    const angle = (Math.PI * 2 * i / sparkCount) + (Math.random() - 0.5) * 0.3;
    const speed = 1.5 + Math.random() * 5;
    const isGold = Math.random() < 0.35;
    const hue = isGold ? (35 + Math.random() * 15) : (col.h + (Math.random()-0.5) * 30);
    const size = 1 + Math.random() * 3;
    celebParticles.push({
      x: cx, y: cy,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      r: size,
      alpha: 0.8 + Math.random() * 0.2,
      decay: 0.012 + Math.random() * 0.012,
      hue: hue,
      sat: isGold ? 80 : col.s + 10,
      light: isGold ? 65 : col.l + 15,
      gravity: 0.02 + Math.random() * 0.03,
      trail: [],
      trailLen: Math.floor(3 + Math.random() * 5),
    });
  }

  // Floating rune fragments (12-18 symbols that spiral outward)
  const runeCount = 12 + Math.floor(Math.random() * 7);
  for(let i = 0; i < runeCount; i++){
    const angle = (Math.PI * 2 * i / runeCount) + (Math.random() - 0.5) * 0.4;
    const speed = 0.6 + Math.random() * 2;
    celebRunes.push({
      x: cx, y: cy,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed - 0.5,
      alpha: 0.7 + Math.random() * 0.3,
      decay: 0.006 + Math.random() * 0.006,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.08,
      size: 8 + Math.random() * 14,
      shape: RUNE_SHAPES[Math.floor(Math.random() * RUNE_SHAPES.length)],
      hue: col.h,
      sat: col.s,
      light: col.l + 20,
    });
  }

  // Large central "seal complete" glow — a single big particle that expands and fades
  celebParticles.push({
    x: cx, y: cy,
    dx: 0, dy: 0,
    r: 8,
    alpha: 1,
    decay: 0.015,
    hue: col.h,
    sat: col.s - 10,
    light: col.l + 30,
    gravity: 0,
    trail: [],
    trailLen: 0,
    isCore: true,
    expandRate: 1.8,
  });
}

/* ═══ POMODORO BURST — work session / break completed ═══ */
export function pomodoroBurst(type){
  // type: 'work' = completed a work session, 'break' = break ended
  const cx = celebW / 2;
  const cy = celebH * 0.35;

  if(type === 'work'){
    // Work session done — warm celebratory burst (fire + gold tones)
    // Screen flash — warm amber
    spellFlash.style.background = `radial-gradient(circle at ${cx}px ${cy}px, hsla(35,85%,65%,0.3) 0%, hsla(20,70%,45%,0.08) 45%, transparent 70%)`;
    spellFlash.style.opacity = '1';
    setTimeout(()=>{ spellFlash.style.opacity = '0'; }, 250);

    // Two expanding rings — fire colors
    for(let i = 0; i < 2; i++){
      celebRings.push({
        x: cx, y: cy,
        radius: 8,
        maxRadius: 180 + i * 80,
        speed: 3 + i * 0.6,
        alpha: 0.5 - i * 0.1,
        lineWidth: 2.5 - i * 0.5,
        hue: 25 + i * 15,
        sat: 80,
        light: 60,
      });
    }

    // 60 fire sparks spiraling outward
    const sparkCount = 60 + Math.floor(Math.random() * 20);
    for(let i = 0; i < sparkCount; i++){
      const angle = (Math.PI * 2 * i / sparkCount) + (Math.random() - 0.5) * 0.4;
      const speed = 1 + Math.random() * 4;
      const hue = 15 + Math.random() * 40; // oranges to golds
      celebParticles.push({
        x: cx, y: cy,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed - 0.5,
        r: 1 + Math.random() * 2.5,
        alpha: 0.8 + Math.random() * 0.2,
        decay: 0.01 + Math.random() * 0.01,
        hue, sat: 75 + Math.random() * 20, light: 55 + Math.random() * 20,
        gravity: 0.015 + Math.random() * 0.02,
        trail: [], trailLen: 4 + Math.floor(Math.random() * 4),
      });
    }

    // Rising flame runes
    const runeCount = 8 + Math.floor(Math.random() * 5);
    for(let i = 0; i < runeCount; i++){
      const angle = (Math.PI * 2 * i / runeCount) + (Math.random() - 0.5) * 0.3;
      celebRunes.push({
        x: cx + (Math.random() - 0.5) * 60,
        y: cy + (Math.random() - 0.5) * 30,
        dx: Math.cos(angle) * 0.8,
        dy: -0.8 - Math.random() * 1.5, // rise upward like heat
        alpha: 0.65 + Math.random() * 0.3,
        decay: 0.005 + Math.random() * 0.004,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.06,
        size: 10 + Math.random() * 12,
        shape: RUNE_SHAPES[Math.floor(Math.random() * RUNE_SHAPES.length)],
        hue: 30 + Math.random() * 20,
        sat: 75, light: 65,
      });
    }

    // Central warm glow
    celebParticles.push({
      x: cx, y: cy, dx: 0, dy: 0, r: 12,
      alpha: 0.9, decay: 0.012,
      hue: 30, sat: 80, light: 65,
      gravity: 0, trail: [], trailLen: 0,
      isCore: true, expandRate: 2.2,
    });

  } else {
    // Break ended — cool refreshing burst (teal + silver)
    spellFlash.style.background = `radial-gradient(circle at ${cx}px ${cy}px, hsla(190,70%,65%,0.25) 0%, hsla(200,50%,40%,0.06) 45%, transparent 70%)`;
    spellFlash.style.opacity = '1';
    setTimeout(()=>{ spellFlash.style.opacity = '0'; }, 200);

    // Single crisp ring
    celebRings.push({
      x: cx, y: cy,
      radius: 5,
      maxRadius: 140,
      speed: 4,
      alpha: 0.45,
      lineWidth: 2,
      hue: 195,
      sat: 60,
      light: 65,
    });

    // 35 cool sparks — like morning dew catching light
    for(let i = 0; i < 35; i++){
      const angle = (Math.PI * 2 * i / 35) + (Math.random() - 0.5) * 0.5;
      const speed = 0.8 + Math.random() * 2.5;
      const isSilver = Math.random() < 0.4;
      celebParticles.push({
        x: cx, y: cy,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed - 0.3,
        r: 0.8 + Math.random() * 1.5,
        alpha: 0.6 + Math.random() * 0.3,
        decay: 0.015 + Math.random() * 0.012,
        hue: isSilver ? 210 : 190 + Math.random() * 20,
        sat: isSilver ? 15 : 55,
        light: isSilver ? 80 : 60,
        gravity: 0.01,
        trail: [], trailLen: 3,
      });
    }
  }
}

export function drawCelebration(){
  celebCtx.clearRect(0, 0, celebW, celebH);
  let hasActivity = false;

  // Draw rings
  for(let i = celebRings.length - 1; i >= 0; i--){
    const r = celebRings[i];
    r.radius += r.speed;
    r.alpha -= 0.008;
    if(r.alpha <= 0 || r.radius > r.maxRadius){ celebRings.splice(i, 1); continue; }
    hasActivity = true;
    celebCtx.beginPath();
    celebCtx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    celebCtx.strokeStyle = `hsla(${r.hue},${r.sat}%,${r.light}%,${r.alpha})`;
    celebCtx.lineWidth = r.lineWidth * (1 - r.radius / r.maxRadius);
    celebCtx.shadowColor = `hsla(${r.hue},${r.sat}%,${r.light}%,${r.alpha * 0.5})`;
    celebCtx.shadowBlur = 15;
    celebCtx.stroke();
    celebCtx.shadowBlur = 0;
  }

  // Draw spark particles
  for(let i = celebParticles.length - 1; i >= 0; i--){
    const p = celebParticles[i];
    p.alpha -= p.decay;
    if(p.alpha <= 0){ celebParticles.splice(i, 1); continue; }
    hasActivity = true;

    if(p.isCore){
      // Central seal glow — expand and fade
      p.r += p.expandRate;
      p.expandRate *= 0.97;
      const grad = celebCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      grad.addColorStop(0, `hsla(${p.hue},${p.sat}%,${p.light}%,${p.alpha * 0.5})`);
      grad.addColorStop(0.4, `hsla(${p.hue},${p.sat}%,${p.light}%,${p.alpha * 0.2})`);
      grad.addColorStop(1, `hsla(${p.hue},${p.sat}%,${p.light}%,0)`);
      celebCtx.fillStyle = grad;
      celebCtx.beginPath();
      celebCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      celebCtx.fill();
      continue;
    }

    // Trail
    p.trail.push({x: p.x, y: p.y});
    if(p.trail.length > p.trailLen) p.trail.shift();
    for(let ti = 0; ti < p.trail.length; ti++){
      const t = p.trail[ti];
      const ta = p.alpha * 0.3 * (ti / p.trail.length);
      celebCtx.beginPath();
      celebCtx.arc(t.x, t.y, p.r * 0.5, 0, Math.PI * 2);
      celebCtx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${ta})`;
      celebCtx.fill();
    }

    // Main spark
    celebCtx.beginPath();
    celebCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    celebCtx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${p.alpha})`;
    celebCtx.fill();

    // Glow
    if(p.r > 1){
      celebCtx.beginPath();
      celebCtx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
      celebCtx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${p.alpha * 0.15})`;
      celebCtx.fill();
    }

    p.x += p.dx;
    p.y += p.dy;
    p.dy += p.gravity; // slight gravity pull
    p.dx *= 0.985; // air friction
    p.dy *= 0.985;
  }

  // Draw rune fragments
  for(let i = celebRunes.length - 1; i >= 0; i--){
    const r = celebRunes[i];
    r.alpha -= r.decay;
    if(r.alpha <= 0){ celebRunes.splice(i, 1); continue; }
    hasActivity = true;
    r.rotation += r.rotSpeed;
    r.x += r.dx;
    r.y += r.dy;
    r.dy += 0.008; // gentle gravity
    r.dx *= 0.99;
    r.dy *= 0.99;

    celebCtx.save();
    celebCtx.translate(r.x, r.y);
    celebCtx.rotate(r.rotation);
    celebCtx.scale(r.size, r.size);
    celebCtx.strokeStyle = `hsla(${r.hue},${r.sat}%,${r.light}%,${r.alpha})`;
    celebCtx.lineWidth = 1.5 / r.size;
    celebCtx.lineCap = 'round';
    celebCtx.shadowColor = `hsla(${r.hue},${r.sat}%,${r.light}%,${r.alpha * 0.6})`;
    celebCtx.shadowBlur = 12;
    celebCtx.beginPath();
    for(const cmd of r.shape){
      if(cmd[0]==='m') celebCtx.moveTo(cmd[1], cmd[2]);
      else if(cmd[0]==='l') celebCtx.lineTo(cmd[1], cmd[2]);
      else if(cmd[0]==='c'){ celebCtx.moveTo(cmd[1]+cmd[3], cmd[2]); celebCtx.arc(cmd[1], cmd[2], cmd[3], 0, Math.PI*2); }
    }
    celebCtx.stroke();
    celebCtx.shadowBlur = 0;
    celebCtx.restore();
  }

  return hasActivity;
}

/* ═══════════════════════════════════════════════
   LAYER 5 — FLOATING SOUL ORBS
   Large, luminous spheres that drift across the
   viewport with pulsing glow halos. These are the
   unmissable "alive" element.
   ═══════════════════════════════════════════════ */
let orbCanvas, orbCtx, oW, oH;
const soulOrbs = [];

export function initOrbs(){
  orbCanvas = document.getElementById('orbs');
  orbCtx = orbCanvas.getContext('2d');
  oW = orbCanvas.width = window.innerWidth;
  oH = orbCanvas.height = window.innerHeight;
  soulOrbs.length = 0;
  const count = Math.max(3, Math.floor((oW * oH) / 350000));
  const orbTypes = [
    { hue: 350, sat: 60, light: 55, name: 'crimson' },   // crimson soul
    { hue: 275, sat: 55, light: 55, name: 'violet' },    // violet spirit
    { hue: 40,  sat: 70, light: 55, name: 'gold' },      // gold wisp
    { hue: 190, sat: 40, light: 50, name: 'teal' },      // teal ghost
  ];
  for(let i = 0; i < count; i++){
    const t = orbTypes[i % orbTypes.length];
    soulOrbs.push({
      x: Math.random() * oW,
      y: Math.random() * oH,
      radius: 4 + Math.random() * 6,
      dx: (Math.random() - 0.5) * 0.35,
      dy: (Math.random() - 0.5) * 0.25,
      hue: t.hue + (Math.random()-0.5)*15,
      sat: t.sat + (Math.random()-0.5)*10,
      light: t.light + (Math.random()-0.5)*10,
      alpha: 0.15 + Math.random() * 0.2,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.008 + Math.random() * 0.012,
      wobbleX: Math.random() * Math.PI * 2,
      wobbleY: Math.random() * Math.PI * 2,
    });
  }
}

export function drawOrbs(){
  orbCtx.clearRect(0, 0, oW, oH);
  for(const o of soulOrbs){
    o.phase += o.phaseSpeed;
    o.wobbleX += 0.005 + Math.sin(o.phase * 0.3) * 0.002;
    o.wobbleY += 0.004 + Math.cos(o.phase * 0.4) * 0.002;

    const pulse = 0.6 + 0.4 * Math.sin(o.phase);
    const a = o.alpha * pulse;
    const r = o.radius * (0.9 + 0.1 * Math.sin(o.phase * 1.3));

    // Drift with organic wobble
    o.x += o.dx + Math.sin(o.wobbleX) * 0.3;
    o.y += o.dy + Math.cos(o.wobbleY) * 0.2;

    // Wrap
    if(o.x < -60) o.x = oW + 60;
    if(o.x > oW + 60) o.x = -60;
    if(o.y < -60) o.y = oH + 60;
    if(o.y > oH + 60) o.y = -60;

    // Outer glow halo (large, soft)
    const haloR = r * 8;
    const haloGrad = orbCtx.createRadialGradient(o.x, o.y, 0, o.x, o.y, haloR);
    haloGrad.addColorStop(0, `hsla(${o.hue},${o.sat}%,${o.light}%,${a * 0.2})`);
    haloGrad.addColorStop(0.3, `hsla(${o.hue},${o.sat}%,${o.light}%,${a * 0.08})`);
    haloGrad.addColorStop(1, `hsla(${o.hue},${o.sat}%,${o.light}%,0)`);
    orbCtx.fillStyle = haloGrad;
    orbCtx.beginPath();
    orbCtx.arc(o.x, o.y, haloR, 0, Math.PI * 2);
    orbCtx.fill();

    // Inner glow (medium, brighter)
    const innerR = r * 3;
    const innerGrad = orbCtx.createRadialGradient(o.x, o.y, 0, o.x, o.y, innerR);
    innerGrad.addColorStop(0, `hsla(${o.hue},${o.sat}%,${o.light+15}%,${a * 0.5})`);
    innerGrad.addColorStop(0.5, `hsla(${o.hue},${o.sat}%,${o.light}%,${a * 0.15})`);
    innerGrad.addColorStop(1, `hsla(${o.hue},${o.sat}%,${o.light}%,0)`);
    orbCtx.fillStyle = innerGrad;
    orbCtx.beginPath();
    orbCtx.arc(o.x, o.y, innerR, 0, Math.PI * 2);
    orbCtx.fill();

    // Core (bright center dot)
    orbCtx.beginPath();
    orbCtx.arc(o.x, o.y, r, 0, Math.PI * 2);
    orbCtx.fillStyle = `hsla(${o.hue},${o.sat-10}%,${o.light+25}%,${a * 0.7})`;
    orbCtx.fill();
  }
}

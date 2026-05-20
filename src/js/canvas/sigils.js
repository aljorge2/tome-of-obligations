/* ═══════════════════════════════════════════════
   LAYER 3 — FLOATING RUNE SIGILS
   Faint arcane glyphs that materialize, drift,
   rotate, and dissolve back into darkness.
   ═══════════════════════════════════════════════ */
let runeCanvas, runeCtx, rW, rH;
const sigils = [];

export const RUNE_SHAPES = [
  [['m',0,-1],['l',0,1],['m',-0.6,-0.4],['l',0.6,-0.4],['m',-0.4,0.5],['l',0.4,0.5]],
  [['m',0,-1],['l',0.6,0],['l',0,1],['l',-0.6,0],['l',0,-1]],
  [['m',0,-1],['l',0,0.6],['m',-0.5,-0.3],['l',0,-1],['l',0.5,-0.3],['m',0,0.6],['l',-0.3,1],['m',0.3,1],['l',0,0.6]],
  [['c',0,0,0.6],['m',0,-0.9],['l',0,0.9]],
  [['m',0,-1],['l',0,1],['m',0,-0.3],['l',0.5,0.4],['m',0,-0.3],['l',-0.5,0.4]],
  [['m',0,-0.9],['l',0.7,0.7],['l',-0.7,0.7],['l',0,-0.9]],
  [['c',0,0,0.7],['m',-0.5,-0.5],['l',0.5,0.5],['m',0.5,-0.5],['l',-0.5,0.5]], // X in circle
  [['m',0,-1],['l',0,1],['m',-0.7,0],['l',0.7,0],['c',0,0,0.35]], // cross with center dot
];

export function drawRuneShape(ctx, shape, x, y, size, rotation, alpha){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(size, size);
  // Choose between violet and gold runes
  const isGold = Math.sin(rotation * 10) > 0.5;
  const col = isGold ? `rgba(212,168,85,${alpha})` : `rgba(180,120,255,${alpha})`;
  const glow = isGold ? `rgba(180,130,50,${alpha*0.5})` : `rgba(150,80,255,${alpha*0.5})`;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5 / size;
  ctx.lineCap = 'round';
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  for(const cmd of shape){
    if(cmd[0]==='m') ctx.moveTo(cmd[1], cmd[2]);
    else if(cmd[0]==='l') ctx.lineTo(cmd[1], cmd[2]);
    else if(cmd[0]==='c'){ ctx.moveTo(cmd[1]+cmd[3], cmd[2]); ctx.arc(cmd[1], cmd[2], cmd[3], 0, Math.PI*2); }
  }
  ctx.stroke();
  ctx.restore();
}

export function initSigils(){
  runeCanvas = document.getElementById('runes');
  runeCtx = runeCanvas.getContext('2d');
  rW = runeCanvas.width = window.innerWidth;
  rH = runeCanvas.height = window.innerHeight;
  sigils.length = 0;
  const count = Math.max(8, Math.floor((rW * rH) / 100000));
  for(let i = 0; i < count; i++){
    sigils.push({
      x: Math.random() * rW,
      y: Math.random() * rH,
      size: 14 + Math.random() * 24,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.006,
      dx: (Math.random() - 0.5) * 0.18,
      dy: (Math.random() - 0.5) * 0.15,
      alpha: 0,
      targetAlpha: 0.08 + Math.random() * 0.16,
      fadeSpeed: 0.0008 + Math.random() * 0.0015,
      fadeDir: 1,
      shape: RUNE_SHAPES[Math.floor(Math.random() * RUNE_SHAPES.length)],
    });
  }
}

export function drawSigils(){
  runeCtx.clearRect(0, 0, rW, rH);
  for(const s of sigils){
    s.alpha += s.fadeSpeed * s.fadeDir;
    if(s.alpha >= s.targetAlpha){ s.alpha = s.targetAlpha; s.fadeDir = -1; }
    if(s.alpha <= 0){
      s.alpha = 0; s.fadeDir = 1;
      s.x = Math.random() * rW; s.y = Math.random() * rH;
      s.targetAlpha = 0.08 + Math.random() * 0.16;
      s.shape = RUNE_SHAPES[Math.floor(Math.random() * RUNE_SHAPES.length)];
    }
    s.rotation += s.rotSpeed;
    s.x += s.dx; s.y += s.dy;
    if(s.x < -40) s.x = rW + 40;
    if(s.x > rW + 40) s.x = -40;
    if(s.y < -40) s.y = rH + 40;
    if(s.y > rH + 40) s.y = -40;
    if(s.alpha > 0.004) drawRuneShape(runeCtx, s.shape, s.x, s.y, s.size, s.rotation, s.alpha);
  }
}

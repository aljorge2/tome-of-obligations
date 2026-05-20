import { initFog, drawFog } from './fog.js';
import { initEmbers, drawEmbers } from './embers.js';
import { initSigils, drawSigils } from './sigils.js';
import { initOrbs, drawOrbs } from './orbs.js';
import { initCandle, updateCandle } from './candle.js';
import { initCeleb, drawCelebration } from './celebration.js';

export { miniSparkBurst, spellSealBurst } from './celebration.js';

function onResize() {
  initFog(); initEmbers(); initSigils(); initOrbs(); initCeleb();
}

function animate() {
  drawFog();
  drawEmbers();
  drawSigils();
  drawOrbs();
  drawCelebration();
  updateCandle();
  requestAnimationFrame(animate);
}

export function initCanvas() {
  window.addEventListener('resize', onResize);
  onResize();
  initCandle();
  animate();
}

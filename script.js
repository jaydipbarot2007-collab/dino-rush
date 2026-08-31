/* =========================================================
   DINO RUSH
   An original endless-runner game.
   No external libraries, no external assets — everything
   (graphics + sound) is generated in code.
   ========================================================= */

// ---------- Canvas setup ----------
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameWrap = document.getElementById('gameWrap');

// ---------- UI elements ----------
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const muteBtn = document.getElementById('muteBtn');
const scoreValueEl = document.getElementById('scoreValue');
const highScoreValueEl = document.getElementById('highScoreValue');
const finalScoreText = document.getElementById('finalScoreText');
const newHighScoreText = document.getElementById('newHighScoreText');
const tapHint = document.getElementById('tapHint');
const diffRow = document.getElementById('diffRow');
const duckBtn = document.getElementById('duckBtn');
const installBtn = document.getElementById('installBtn');

// ---------- Mobile viewport height fix ----------
// Mobile Android/iOS browsers change the visible viewport height as the
// address bar shows/hides, which can make a plain `height:100%` layout
// overflow or collapse unpredictably. We measure the *real* visible height
// with JS and expose it as a CSS custom property so layout is always
// correct, instead of relying solely on CSS height:100%/vh units.
function setAppHeight() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--app-height', h + 'px');
}

// ---------- Logical canvas size (CSS pixels) ----------
let W = 0, H = 0, DPR = 1;

function resizeCanvas() {
  setAppHeight();
  const rect = gameWrap.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = rect.width;
  H = rect.height;
  // Safety net: if the wrapper somehow reports zero size (e.g. a browser
  // with partial/buggy support for the CSS `aspect-ratio` property hasn't
  // laid it out yet), fall back to the viewport itself so the game and its
  // buttons are never invisible/unreachable.
  if (!W || !H) {
    W = window.innerWidth || 360;
    H = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 640;
  }
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  groundY = H * 0.82;
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resizeCanvas);
}

// ---------- Game constants (scaled relative to canvas) ----------
let groundY = 0;
const STORAGE_KEY = 'dinoRushHighScore';
const DIFF_KEY = 'dinoRushDifficulty';

// ---------- Difficulty presets ----------
const DIFFICULTIES = {
  easy:   { speedMul: 0.8,  spawnMul: 1.35, gravityMul: 0.92, rampMul: 0.75 },
  medium: { speedMul: 1.0,  spawnMul: 1.0,  gravityMul: 1.0,  rampMul: 1.0  },
  hard:   { speedMul: 1.3,  spawnMul: 0.72, gravityMul: 1.1,  rampMul: 1.3  },
};
let selectedDifficulty = localStorage.getItem(DIFF_KEY) || 'medium';

// ---------- Game state ----------
let state = 'start'; // 'start' | 'playing' | 'gameover'
let score = 0;
let highScore = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
let gameSpeed = 0;
let baseSpeed = 0;
let elapsedFrames = 0;
let muted = false;
let lastTime = 0;
let obstacles = [];
let particles = [];
let clouds = [];
let spawnTimer = 0;
let nextSpawnAt = 0;

highScoreValueEl.textContent = highScore;

// ---------- Dino ----------
const dino = {
  x: 0,
  y: 0,
  vy: 0,
  w: 0,
  h: 0,
  standH: 0,
  duckH: 0,
  grounded: true,
  legPhase: 0,
  squash: 1,
  isDucking: false,
};

function resetDino() {
  dino.standH = H * 0.13;
  dino.duckH = dino.standH * 0.55;
  dino.w = H * 0.11;
  dino.h = dino.standH;
  dino.x = W * 0.12;
  dino.y = groundY - dino.h;
  dino.vy = 0;
  dino.grounded = true;
  dino.legPhase = 0;
  dino.squash = 1;
  dino.isDucking = false;
}

function jump() {
  if (dino.grounded && state === 'playing' && !dino.isDucking) {
    dino.vy = -H * 0.021;
    dino.grounded = false;
    dino.squash = 1.15;
    playJumpSound();
  }
}

function setDucking(val) {
  dino.isDucking = val;
}

// ---------- Obstacles ----------
function spawnObstacle() {
  const isBird = Math.random() < 0.34 && score > 15;
  if (isBird) {
    const h = H * 0.075;
    // Two flight bands:
    //  - "high" band sits around head height of a standing dino -> must DUCK to avoid
    //  - "low" band sits low near the ground, similar to a cactus -> must JUMP to avoid
    const requiresDuck = Math.random() < 0.55;
    let flightBottomY;
    if (requiresDuck) {
      // overlaps the upper portion of a standing dino, clear of a ducked dino
      flightBottomY = groundY - dino.duckH - (dino.standH - dino.duckH) * 0.35;
    } else {
      // low enough that only a jump clears it
      flightBottomY = groundY - dino.standH * 0.35;
    }
    obstacles.push({
      type: 'bird',
      requiresDuck: requiresDuck,
      x: W + 10,
      y: flightBottomY - h,
      w: H * 0.115,
      h: h,
      wingPhase: Math.random() * Math.PI,
    });
  } else {
    const clusterSize = Math.random() < 0.25 ? 2 : 1;
    const baseW = H * 0.055;
    const baseH = H * (0.11 + Math.random() * 0.06);
    let offsetX = 0;
    for (let i = 0; i < clusterSize; i++) {
      obstacles.push({
        type: 'cactus',
        x: W + 10 + offsetX,
        y: groundY - baseH,
        w: baseW,
        h: baseH,
      });
      offsetX += baseW + 6;
    }
  }
}

function spawnCloud() {
  clouds.push({
    x: W + 40,
    y: Math.random() * H * 0.35 + H * 0.05,
    scale: 0.6 + Math.random() * 0.8,
    speedMul: 0.3 + Math.random() * 0.3,
  });
}

// ---------- Background (day/night cycle) ----------
// Smooth continuous cycle driven by distance traveled.
function getSkyColors(cycleT) {
  // cycleT: 0..1 -> day -> dusk -> night -> dawn -> day
  const stops = [
    { t: 0.00, top: [135, 206, 235], bot: [224, 246, 255] }, // day
    { t: 0.25, top: [255, 154, 90], bot: [255, 205, 130] },  // dusk
    { t: 0.5, top: [20, 24, 55], bot: [55, 40, 80] },        // night
    { t: 0.75, top: [255, 154, 90], bot: [255, 205, 130] },  // dawn
    { t: 1.0, top: [135, 206, 235], bot: [224, 246, 255] },  // day
  ];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (cycleT >= stops[i].t && cycleT <= stops[i + 1].t) {
      a = stops[i]; b = stops[i + 1];
      break;
    }
  }
  const span = (b.t - a.t) || 1;
  const localT = (cycleT - a.t) / span;
  const lerp = (p, q, t) => p + (q - p) * t;
  const top = a.top.map((v, i) => lerp(v, b.top[i], localT));
  const bot = a.bot.map((v, i) => lerp(v, b.bot[i], localT));
  return { top, bot, isNight: cycleT > 0.35 && cycleT < 0.65 };
}

// ---------- Input ----------
function handlePrimaryAction() {
  if (state === 'start') {
    startGame();
  } else if (state === 'playing') {
    jump();
  } else if (state === 'gameover') {
    restartGame();
  }
  if (!tapHint.classList.contains('hidden')) {
    tapHint.classList.add('hidden');
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    handlePrimaryAction();
  } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    e.preventDefault();
    setDucking(true);
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    setDucking(false);
  }
});

// Primary input: Pointer Events (covers mouse, touch, and pen on all
// modern browsers, including current Android Chrome/WebView/Samsung
// Internet/Firefox).
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  ensureAudio();
  handlePrimaryAction();
}, { passive: false });

// Fallback for the rare browser without Pointer Event support (some
// older/embedded Android WebViews). Harmless to also register on modern
// browsers since every action here (jump/start/restart) is safe to run
// more than once for the same tap.
canvas.addEventListener('touchstart', (e) => {
  ensureAudio();
  handlePrimaryAction();
}, { passive: true });

// Mouse-only fallback (covers desktop browsers or accessibility tools
// that emit 'click' without a preceding pointerdown).
canvas.addEventListener('click', () => {
  ensureAudio();
  handlePrimaryAction();
});

// Prevent scrolling / zooming interactions on mobile while playing
document.addEventListener('touchmove', (e) => {
  if (state === 'playing') e.preventDefault();
}, { passive: false });

// Also block double-tap-to-zoom and long-press context menu across the game
gameWrap.addEventListener('contextmenu', (e) => e.preventDefault());
gameWrap.addEventListener('dblclick', (e) => e.preventDefault());

startBtn.addEventListener('click', () => { ensureAudio(); handlePrimaryAction(); });
restartBtn.addEventListener('click', () => { ensureAudio(); handlePrimaryAction(); });

muteBtn.addEventListener('click', () => {
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
});

// ---------- Duck button (touch/mouse, press-and-hold) ----------
function duckPress(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  ensureAudio();
  duckBtn.classList.add('pressed');
  setDucking(true);
}
function duckRelease(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  duckBtn.classList.remove('pressed');
  setDucking(false);
}
duckBtn.addEventListener('pointerdown', duckPress, { passive: false });
duckBtn.addEventListener('pointerup', duckRelease, { passive: false });
duckBtn.addEventListener('pointercancel', duckRelease, { passive: false });
duckBtn.addEventListener('pointerleave', duckRelease, { passive: false });
// Touch-event fallback for browsers without full Pointer Event support.
duckBtn.addEventListener('touchstart', duckPress, { passive: false });
duckBtn.addEventListener('touchend', duckRelease, { passive: false });
duckBtn.addEventListener('touchcancel', duckRelease, { passive: false });
// Mouse fallback for desktop testing.
duckBtn.addEventListener('mousedown', duckPress);
duckBtn.addEventListener('mouseup', duckRelease);
duckBtn.addEventListener('mouseleave', duckRelease);

// ---------- Difficulty selector ----------
function applyDifficultyUI() {
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === selectedDifficulty);
  });
}
function selectDifficulty(btn) {
  if (!btn || !btn.dataset || !btn.dataset.diff) return;
  selectedDifficulty = btn.dataset.diff;
  localStorage.setItem(DIFF_KEY, selectedDifficulty);
  applyDifficultyUI();
}
diffRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.diff-btn');
  if (btn) selectDifficulty(btn);
});
applyDifficultyUI();

// ---------- PWA: install prompt ----------
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.classList.remove('hidden');
});
installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.classList.add('hidden');
});
window.addEventListener('appinstalled', () => {
  installBtn.classList.add('hidden');
});

// ---------- PWA: register service worker for offline play ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline support is optional — game still runs fine without it */
    });
  });
}

// ---------- Game flow ----------
function startGame() {
  const diff = DIFFICULTIES[selectedDifficulty];
  state = 'playing';
  score = 0;
  lastMilestone = 0;
  gameSpeed = H * 0.0068 * diff.speedMul;
  baseSpeed = gameSpeed;
  elapsedFrames = 0;
  obstacles = [];
  particles = [];
  clouds = [];
  for (let i = 0; i < 3; i++) spawnCloud();
  spawnTimer = 0;
  nextSpawnAt = 60 * diff.spawnMul;
  resetDino();
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  duckBtn.classList.remove('hidden');
}

function restartGame() {
  startGame();
}

function endGame() {
  state = 'gameover';
  dino.isDucking = false;
  duckBtn.classList.add('hidden');
  duckBtn.classList.remove('pressed');
  playHitSound();
  const finalScore = Math.floor(score);
  let isNew = false;
  if (finalScore > highScore) {
    highScore = finalScore;
    localStorage.setItem(STORAGE_KEY, String(highScore));
    isNew = true;
  }
  finalScoreText.textContent = `Score: ${finalScore}`;
  newHighScoreText.classList.toggle('hidden', !isNew);
  highScoreValueEl.textContent = highScore;
  gameOverScreen.classList.remove('hidden');
}

// ---------- Physics / update ----------
function rectsOverlap(a, b) {
  const pad = a.w * 0.18; // forgiving hitbox
  return (
    a.x + pad < b.x + b.w &&
    a.x + a.w - pad > b.x &&
    a.y + pad < b.y + b.h &&
    a.y + a.h - pad > b.y
  );
}

function update(dt) {
  elapsedFrames++;
  const diff = DIFFICULTIES[selectedDifficulty];

  // difficulty ramp
  gameSpeed = Math.min(
    baseSpeed + score * (H * 0.000018 * diff.rampMul),
    baseSpeed * 2.6
  );

  score += dt * (gameSpeed * 5.2);
  scoreValueEl.textContent = Math.floor(score);

  // milestone sound every 200 points
  if (Math.floor(score) > 0 && Math.floor(score) % 200 === 0 && Math.floor(score) !== lastMilestone) {
    lastMilestone = Math.floor(score);
    playMilestoneSound();
  }

  // dino physics
  let gravity = H * 0.0016 * diff.gravityMul;
  if (!dino.grounded && dino.isDucking) {
    gravity *= 2.1; // fast-fall / slide-drop when holding duck mid-air
  }
  dino.vy += gravity;
  dino.y += dino.vy;

  // target height: shrink to duck height while grounded & ducking
  const wantDuck = dino.grounded && dino.isDucking;
  dino.h = wantDuck ? dino.duckH : dino.standH;

  if (dino.y >= groundY - dino.h) {
    dino.y = groundY - dino.h;
    if (!dino.grounded) dino.squash = 0.85;
    dino.vy = 0;
    dino.grounded = true;
  }
  dino.squash += (1 - dino.squash) * 0.2;

  if (dino.grounded) {
    dino.legPhase += dt * gameSpeed * (dino.isDucking ? 46 : 30);
  }

  // obstacles
  spawnTimer++;
  if (spawnTimer >= nextSpawnAt) {
    spawnObstacle();
    spawnTimer = 0;
    nextSpawnAt = (55 - Math.min(gameSpeed * 2, 25) + Math.random() * 35) * diff.spawnMul;
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x -= gameSpeed * dt * 60;
    if (o.type === 'bird') o.wingPhase += dt * 12;
    if (o.x + o.w < -20) {
      obstacles.splice(i, 1);
      continue;
    }
    if (rectsOverlap(dino, o)) {
      endGame();
      return;
    }
  }

  // clouds
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i];
    c.x -= gameSpeed * c.speedMul * dt * 60;
    if (c.x < -80) clouds.splice(i, 1);
  }
  if (Math.random() < 0.006) spawnCloud();

  // dust particles while running
  if (dino.grounded && Math.random() < 0.4) {
    particles.push({
      x: dino.x + dino.w * 0.1,
      y: groundY - 2,
      vx: -gameSpeed * 1.5 - Math.random(),
      vy: -Math.random() * 0.5,
      life: 1,
    });
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= dt * 1.8;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

let lastMilestone = 0;

// ---------- Drawing ----------
function drawBackground() {
  const cycleT = (elapsedFrames % 3600) / 3600; // full day/night cycle over time
  const { top, bot, isNight } = getSkyColors(cycleT);
  const g = ctx.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0, `rgb(${top[0]|0},${top[1]|0},${top[2]|0})`);
  g.addColorStop(1, `rgb(${bot[0]|0},${bot[1]|0},${bot[2]|0})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // stars at night
  if (isNight) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 97 + elapsedFrames * 0.02) % W;
      const sy = (i * 53) % (groundY * 0.6);
      const tw = 0.5 + 0.5 * Math.sin(elapsedFrames * 0.05 + i);
      ctx.globalAlpha = 0.3 + tw * 0.5;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // clouds
  ctx.fillStyle = isNight ? 'rgba(200,200,220,0.25)' : 'rgba(255,255,255,0.85)';
  clouds.forEach(c => {
    ctx.beginPath();
    const s = c.scale * H * 0.05;
    ctx.ellipse(c.x, c.y, s * 1.6, s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + s * 1.2, c.y + s * 0.2, s * 1.1, s * 0.8, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - s * 1.1, c.y + s * 0.3, s * 1.0, s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // ground
  ctx.fillStyle = isNight ? '#1c2333' : '#5b3a29';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = isNight ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();

  // ground texture dashes scrolling
  ctx.strokeStyle = isNight ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 3;
  const dashLen = 26, gap = 20, total = dashLen + gap;
  const offset = (elapsedFrames * gameSpeed * 1.1) % total;
  for (let x = -total + offset; x < W; x += total) {
    ctx.beginPath();
    ctx.moveTo(x, groundY + 10);
    ctx.lineTo(x + dashLen, groundY + 10);
    ctx.stroke();
  }
}

function drawDino() {
  const { x, y, w, h, squash } = dino;
  const ducking = dino.grounded && dino.isDucking;
  const dw = ducking ? w * 1.35 : w; // slide wider/lower when ducking
  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.scale(1, squash);
  ctx.translate(-(x + w / 2), -(y + h));

  if (ducking) {
    // ---- Ducking / sliding pose: low, stretched body, head forward ----
    ctx.fillStyle = '#2f9e63';
    roundRect(x - dw * 0.08, y + h * 0.25, dw * 0.72, h * 0.6, h * 0.22);
    ctx.fill();

    // head (forward & low)
    ctx.fillStyle = '#37b374';
    roundRect(x + dw * 0.5, y + h * 0.12, dw * 0.42, h * 0.55, h * 0.2);
    ctx.fill();

    // eye
    ctx.fillStyle = '#0d2b1a';
    ctx.beginPath();
    ctx.arc(x + dw * 0.82, y + h * 0.35, w * 0.05, 0, Math.PI * 2);
    ctx.fill();

    // tail out back
    ctx.fillStyle = '#2f9e63';
    ctx.beginPath();
    ctx.moveTo(x - dw * 0.06, y + h * 0.5);
    ctx.lineTo(x - dw * 0.35, y + h * 0.35);
    ctx.lineTo(x - dw * 0.02, y + h * 0.65);
    ctx.closePath();
    ctx.fill();

    // little legs tucked, animated fast for slide effect
    ctx.fillStyle = '#227a4c';
    const legSwing = Math.sin(dino.legPhase);
    const legW = w * 0.14, legH = h * 0.28;
    roundRect(x + dw * 0.12 + legSwing * w * 0.05, y + h * 0.78, legW, legH, legW * 0.3);
    ctx.fill();
    roundRect(x + dw * 0.4 - legSwing * w * 0.05, y + h * 0.78, legW, legH, legW * 0.3);
    ctx.fill();

    ctx.restore();
    return;
  }

  // ---- Standing / running / jumping pose ----
  // body
  ctx.fillStyle = '#2f9e63';
  roundRect(x, y + h * 0.15, w * 0.78, h * 0.65, w * 0.14);
  ctx.fill();

  // head
  ctx.fillStyle = '#37b374';
  roundRect(x + w * 0.42, y, w * 0.58, h * 0.5, w * 0.16);
  ctx.fill();

  // eye
  ctx.fillStyle = '#0d2b1a';
  ctx.beginPath();
  ctx.arc(x + w * 0.82, y + h * 0.2, w * 0.055, 0, Math.PI * 2);
  ctx.fill();

  // tail
  ctx.fillStyle = '#2f9e63';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.05, y + h * 0.35);
  ctx.lineTo(x - w * 0.22, y + h * 0.15);
  ctx.lineTo(x + w * 0.08, y + h * 0.55);
  ctx.closePath();
  ctx.fill();

  // legs (animated)
  ctx.fillStyle = '#227a4c';
  const legSwing = dino.grounded ? Math.sin(di
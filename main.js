import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { createInfallState, stepInfall, dilationFactor } from "./physics.js";
import { kerrHorizons, ergoRadius, iscoRadius, orbitalOmega } from "./kerr.js";
import { levelDims, nextLevel, scaleFactor, MAX_LEVEL } from "./dimensions.js";
import { createHypercube } from "./hypercube.js";

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 2000);

// ---------- gravitational lensing post-process ----------
// uChroma drives a chromatic-aberration spike (R/G/B sampled at slightly
// diverging warped UVs) layered on top of the steady lensing bend, used
// during horizon crossing for the "tearing apart" look.
const lensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBH: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: window.innerWidth / window.innerHeight },
    uStrength: { value: 0 },
    uChroma: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uBH;
    uniform float uAspect;
    uniform float uStrength;
    uniform float uChroma;
    varying vec2 vUv;

    vec2 warpAt(vec2 uv, float extraBend) {
      vec2 diff = uv - uBH;
      diff.x *= uAspect;
      float dist = max(length(diff), 0.0001);
      vec2 dir = diff / dist;
      float bend = (uStrength + extraBend) / (dist * dist * 30.0 + 0.015);
      bend = min(bend, 0.6);
      vec2 offset = dir * bend * dist;
      offset.x /= uAspect;
      return clamp(uv - offset, 0.0, 1.0);
    }

    void main() {
      float r = texture2D(tDiffuse, warpAt(vUv, uChroma * 0.03)).r;
      float g = texture2D(tDiffuse, warpAt(vUv, 0.0)).g;
      float b = texture2D(tDiffuse, warpAt(vUv, -uChroma * 0.03)).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const lensPass = new ShaderPass(lensShader);
lensPass.renderToScreen = true;
composer.addPass(lensPass);

// ---------- starfield ----------
function makeStarfield(count, radius) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius * (0.6 + 0.4 * Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.4, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}
const stars = makeStarfield(4000, 400);
scene.add(stars);

// ---------- Kerr black hole (horizon, ergosphere, ISCO-anchored particle disk) ----------
// Spin axis is world Y. Horizon/ergosphere shapes below are stylized (a
// squashed sphere, not the exact embedding diagram) — the horizon/ergosphere
// *radii* driving them (kerrHorizons, ergoRadius) are the exact formulas.
let bh = { M: 0.5, a: 0 };
let horizonMesh, ergoMesh, diskPoints;

function buildBlackHole() {
  if (horizonMesh) scene.remove(horizonMesh);
  if (ergoMesh) scene.remove(ergoMesh);
  if (diskPoints) scene.remove(diskPoints);

  const { rPlus } = kerrHorizons(bh.M, bh.a);
  const oblateness = 1 - 0.35 * (bh.a / bh.M); // stylized flattening with spin

  horizonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(rPlus, 64, 64),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  horizonMesh.scale.y = oblateness;
  scene.add(horizonMesh);

  // ergosphere: exact ergoRadius(theta) swept into a surface of revolution
  const ergoSegs = 48;
  const ergoRings = 32;
  const ergoGeo = new THREE.BufferGeometry();
  const ergoPos = [];
  const ergoIdx = [];
  for (let ring = 0; ring <= ergoRings; ring++) {
    const theta = (ring / ergoRings) * Math.PI;
    const rE = ergoRadius(bh.M, bh.a, theta);
    for (let seg = 0; seg <= ergoSegs; seg++) {
      const phi = (seg / ergoSegs) * Math.PI * 2;
      ergoPos.push(
        rE * Math.sin(theta) * Math.cos(phi),
        rE * Math.cos(theta) * oblateness,
        rE * Math.sin(theta) * Math.sin(phi)
      );
    }
  }
  for (let ring = 0; ring < ergoRings; ring++) {
    for (let seg = 0; seg < ergoSegs; seg++) {
      const a0 = ring * (ergoSegs + 1) + seg;
      const b0 = a0 + ergoSegs + 1;
      ergoIdx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
  }
  ergoGeo.setAttribute("position", new THREE.Float32BufferAttribute(ergoPos, 3));
  ergoGeo.setIndex(ergoIdx);
  ergoGeo.computeVertexNormals();
  ergoMesh = new THREE.Mesh(
    ergoGeo,
    new THREE.MeshBasicMaterial({
      color: 0xb44fff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  scene.add(ergoMesh);

  diskPoints = buildParticleDisk(particleCount);
  scene.add(diskPoints);
}

let diskData = null;
function buildParticleDisk(count) {
  const rIsco = iscoRadius(bh.M, bh.a, true);
  const rOuter = rIsco * 7;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const angles = new Float32Array(count);
  const omegas = new Float32Array(count);

  const hot = new THREE.Color(0x00ff8c);
  const cool = new THREE.Color(0xb44fff);

  for (let i = 0; i < count; i++) {
    const r = rIsco + Math.pow(Math.random(), 1.5) * (rOuter - rIsco);
    const theta = Math.random() * Math.PI * 2;
    const scatter = (Math.random() - 0.5) * rIsco * 0.06;
    radii[i] = r;
    angles[i] = theta;
    omegas[i] = orbitalOmega(bh.M, bh.a, r, true);

    positions[i * 3] = r * Math.cos(theta);
    positions[i * 3 + 1] = scatter;
    positions[i * 3 + 2] = r * Math.sin(theta);

    const t = Math.min((r - rIsco) / (rOuter - rIsco), 1);
    const c = hot.clone().lerp(cool, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.9 });
  diskData = { radii, angles, omegas, count };
  return new THREE.Points(geo, mat);
}

function updateDisk(dt) {
  if (!diskPoints || !diskData) return;
  const pos = diskPoints.geometry.attributes.position;
  for (let i = 0; i < diskData.count; i++) {
    diskData.angles[i] += diskData.omegas[i] * dt;
    const r = diskData.radii[i];
    const a = diskData.angles[i];
    pos.setX(i, r * Math.cos(a));
    pos.setZ(i, r * Math.sin(a));
  }
  pos.needsUpdate = true;
}

let particleCount = 6000;

// ---------- camera / infall state ----------
const START_R = 20;
let state = createInfallState(START_R);
let falling = false;
let timeScale = 1;

let theta = 0;
let phi = 0.28;
let dragging = false;
let lastPointer = { x: 0, y: 0 };

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastPointer = { x: e.clientX, y: e.clientY };
});
window.addEventListener("pointerup", () => (dragging = false));
window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;
  lastPointer = { x: e.clientX, y: e.clientY };
  theta -= dx * 0.004;
  phi = Math.max(-1.3, Math.min(1.3, phi + dy * 0.003));
});

function placeCamera(dt) {
  if (!dragging) theta += dt * 0.03;
  const r = state.r + 2.2;
  camera.position.set(
    r * Math.cos(theta) * Math.cos(phi),
    r * Math.sin(phi),
    r * Math.sin(theta) * Math.cos(phi)
  );
  camera.lookAt(0, 0, 0);
}
placeCamera(0);

// ---------- HUD ----------
const statRPlus = document.getElementById("stat-rplus");
const statRMinus = document.getElementById("stat-rminus");
const statErgo = document.getElementById("stat-ergo");
const statIsco = document.getElementById("stat-isco");
const statR = document.getElementById("stat-r");
const statV = document.getElementById("stat-v");
const statDilation = document.getElementById("stat-dilation");
const statProper = document.getElementById("stat-proper");
const statCoord = document.getElementById("stat-coord");
const statPhase = document.getElementById("stat-phase");
const dimensionPanel = document.getElementById("dimension-panel");
const statLevel = document.getElementById("stat-level");
const statSpaceDim = document.getElementById("stat-space-dim");
const statTimeDim = document.getElementById("stat-time-dim");
const statDelta = document.getElementById("stat-delta");
const transitionEl = document.getElementById("transition");
const transitionText = document.getElementById("transition-text");

function updateKerrStats() {
  const { rPlus, rMinus } = kerrHorizons(bh.M, bh.a);
  statRPlus.textContent = rPlus.toFixed(3);
  statRMinus.textContent = rMinus.toFixed(3);
  statErgo.textContent = ergoRadius(bh.M, bh.a, Math.PI / 2).toFixed(3);
  statIsco.textContent = iscoRadius(bh.M, bh.a, true).toFixed(3);
}

document.getElementById("btn-start").addEventListener("click", () => {
  falling = true;
  statPhase.textContent = "Phase: infalling";
});
document.getElementById("btn-reset").addEventListener("click", fullReset);
document.getElementById("timescale").addEventListener("input", (e) => {
  timeScale = parseFloat(e.target.value);
});
// The "spin" slider is a dimensionless ratio a* = a/M in [0, 0.998); the
// physical spin parameter a is derived from it and the current mass.
document.getElementById("mass").addEventListener("input", (e) => {
  bh.M = parseFloat(e.target.value);
  const aStar = parseFloat(document.getElementById("spin").value);
  bh.a = aStar * bh.M;
  buildBlackHole();
  updateKerrStats();
});
document.getElementById("spin").addEventListener("input", (e) => {
  const aStar = parseFloat(e.target.value);
  bh.a = aStar * bh.M;
  buildBlackHole();
  updateKerrStats();
});
document.getElementById("particles").addEventListener("input", (e) => {
  particleCount = parseInt(e.target.value, 10);
  buildBlackHole();
});
document.getElementById("btn-descend").addEventListener("click", descendDimension);

function fullReset() {
  state = createInfallState(START_R);
  falling = false;
  level = 0;
  mode = "kerr";
  transitionStarted = false;
  crossingT0 = null;
  lensShader.uniforms.uChroma.value = 0;
  flashEl.classList.remove("hit", "fade");
  disposeHypercube();
  disposeBeam();
  dimensionPanel.hidden = true;
  horizonMesh.visible = true;
  ergoMesh.visible = true;
  diskPoints.visible = true;
  stars.visible = true;
  transitionEl.classList.remove("visible");
  transitionText.innerHTML = "";
  statPhase.textContent = "Phase: approaching";
}

// ---------- dimension tower state machine ----------
let level = 0;
let mode = "kerr"; // 'kerr' | 'beam' | 'hypercube' | 'bigbang'
let beamMesh = null;
let beamStart = 0;
let hypercube = null;
let bigbangMesh = null;
let bigbangStart = 0;

const BEAM_AAXES = [
  new THREE.Vector3(1, 0.2, 0),
  new THREE.Vector3(0, 1, 0.3),
  new THREE.Vector3(0.3, 0.4, 1),
  new THREE.Vector3(1, 1, 1),
];

function disposeHypercube() {
  if (hypercube) {
    scene.remove(hypercube.group);
    hypercube.dispose();
    hypercube = null;
  }
}
function disposeBeam() {
  if (beamMesh) {
    scene.remove(beamMesh);
    beamMesh.geometry.dispose();
    beamMesh.material.dispose();
    beamMesh = null;
  }
}

function startBeam() {
  disposeHypercube();
  const axis = BEAM_AAXES[(level - 1) % BEAM_AAXES.length].clone().normalize();
  const geo = new THREE.CylinderGeometry(0.02, 0.02, 8, 24, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: 0x00ff8c, transparent: true, opacity: 0.85 });
  beamMesh = new THREE.Mesh(geo, mat);
  beamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  scene.add(beamMesh);
  beamStart = performance.now();
  mode = "beam";
  statPhase.textContent = `Phase: dimension ${level} unfurling`;
}

function updateBeam() {
  const t = (performance.now() - beamStart) / 1000;
  const t0 = 1.6;
  const w = scaleFactor(t, t0) * 1.1 + 0.02;
  beamMesh.scale.set(w, 1, w);
  beamMesh.material.opacity = 0.85 * (1 - Math.max(0, (t - t0) / 0.6));
  if (t >= t0 + 0.6) {
    disposeBeam();
    const { S } = levelDims(level);
    hypercube = createHypercube(S);
    scene.add(hypercube.group);
    mode = "hypercube";
    statPhase.textContent = `Phase: level ${level} — ${S}D space folded into view`;
  }
}

function descendDimension() {
  if (mode !== "hypercube") return;
  const next = nextLevel(level);
  if (next === null) {
    startBigBang();
    return;
  }
  level = next;
  updateDimensionHud();
  startBeam();
}

function startBigBang() {
  disposeHypercube();
  const geo = new THREE.SphereGeometry(0.02, 32, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  bigbangMesh = new THREE.Mesh(geo, mat);
  scene.add(bigbangMesh);
  bigbangStart = performance.now();
  mode = "bigbang";
  statPhase.textContent = "Phase: primordial singularity — 0D collapse";
  transitionText.textContent =
    "Space and time both terminate here. This is not a level of the tower — it is the state the " +
    "tower resets from. What follows is stipulated, not derived: this collapse becomes the Big Bang " +
    "that seeds level 0 again.";
  transitionEl.classList.add("visible");
}

function updateBigBang(dt) {
  const t = (performance.now() - bigbangStart) / 1000;
  const t0 = 2.2;
  const w = scaleFactor(t, t0, 0.5) * 30;
  bigbangMesh.scale.setScalar(Math.max(w, 0.02));
  bigbangMesh.material.opacity = Math.max(1 - t / t0, 0);
  if (t >= t0) {
    scene.remove(bigbangMesh);
    bigbangMesh.geometry.dispose();
    bigbangMesh.material.dispose();
    bigbangMesh = null;
    transitionEl.classList.remove("visible");
    fullReset();
  }
}

function updateDimensionHud() {
  const { S, T } = levelDims(level);
  statLevel.textContent = level;
  statSpaceDim.textContent = S;
  statTimeDim.textContent = T;
  statDelta.textContent = T - S;
}

// Horizon-crossing sequence, beat-matched to Gargantua's entry in
// Interstellar: escalating warp/shake as the horizon fills the frame,
// a flash-cut to white then black, a silent beat, then the reveal.
let transitionStarted = false;
let crossingT0 = null; // non-null while the pre-cut warp/shake ramp is live
const flashEl = document.getElementById("flash");

function showCommLine(text, delayMs) {
  setTimeout(() => {
    const el = document.createElement("span");
    el.className = "line";
    el.textContent = text;
    transitionText.appendChild(el);
  }, delayMs);
}

function beginHorizonCrossing() {
  transitionStarted = true;
  crossingT0 = performance.now();
  statPhase.textContent = "Phase: crossing the horizon";
  transitionText.innerHTML = "";
  transitionEl.classList.add("visible");
  showCommLine("HORIZON BREACH IMMINENT.", 0);
  showCommLine("TIDAL SHEAR RISING.", 450);
  showCommLine("HOLD TOGETHER.", 900);
  showCommLine("THIS IS IT.", 1350);

  // flash-cut to white, then black
  setTimeout(() => {
    crossingT0 = null;
    lensShader.uniforms.uChroma.value = 0;
    flashEl.classList.remove("fade");
    flashEl.classList.add("hit");
    horizonMesh.visible = false;
    ergoMesh.visible = false;
    diskPoints.visible = false;
    stars.visible = false;
    transitionText.innerHTML = "";
  }, 1750);

  // white fades to black (transition backdrop is already #000)
  setTimeout(() => {
    flashEl.classList.remove("hit");
    flashEl.classList.add("fade");
  }, 1850);

  // silent beat on black, nothing on screen
  setTimeout(() => {
    const line = document.createElement("span");
    line.className = "line";
    line.style.textTransform = "none";
    line.style.fontSize = "16px";
    line.style.color = "var(--v3)";
    line.style.letterSpacing = "0.02em";
    line.textContent =
      "Your proper time never stopped. It is the outside universe's clock that has run away to infinity — " +
      "its timeline no longer has anything left to synchronize with.";
    transitionText.appendChild(line);
    const line2 = document.createElement("span");
    line2.className = "line";
    line2.style.textTransform = "none";
    line2.style.fontSize = "14px";
    line2.style.color = "var(--muted)";
    line2.style.animationDelay = "0.4s";
    line2.textContent =
      "What follows — a tower of rising space and time dimensions — is speculative worldbuilding layered " +
      "on top of that real fact, not a further physical derivation.";
    transitionText.appendChild(line2);
  }, 3100);

  // proceed into the dimension reveal
  setTimeout(() => {
    transitionEl.classList.remove("visible");
    dimensionPanel.hidden = false;
    level = 1;
    updateDimensionHud();
    startBeam();
  }, 5600);
}

// ---------- init ----------
buildBlackHole();
updateKerrStats();
updateDimensionHud();

// ---------- animation loop ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale;

  if (mode === "kerr") {
    const { rPlus } = kerrHorizons(bh.M, bh.a);
    if (falling && !state.crossed) {
      stepInfall(state, dt * 0.4, rPlus);
      updateDisk(dt);
    }
    if (state.crossed && !transitionStarted) {
      beginHorizonCrossing();
    }
    const dilation = dilationFactor(state.r, rPlus);
    placeCamera(dt);

    if (crossingT0 !== null) {
      const t = (performance.now() - crossingT0) / 1000;
      const ramp = Math.min(t / 1.4, 1);
      const shakeMag = ramp * ramp * 0.12;
      camera.position.x += (Math.random() - 0.5) * shakeMag;
      camera.position.y += (Math.random() - 0.5) * shakeMag;
      camera.position.z += (Math.random() - 0.5) * shakeMag;
      lensShader.uniforms.uChroma.value = ramp;
    }

    const bhWorld = new THREE.Vector3(0, 0, 0).project(camera);
    lensShader.uniforms.uBH.value.set((bhWorld.x + 1) / 2, (bhWorld.y + 1) / 2);
    const proximity = Math.min(rPlus / Math.max(state.r - rPlus, rPlus * 0.05), 6);
    const crossingBoost = crossingT0 !== null ? (Math.min((performance.now() - crossingT0) / 1400, 1) * 0.6) : 0;
    lensShader.uniforms.uStrength.value = 0.06 + proximity * 0.09 + crossingBoost;

    statR.textContent = (state.r / rPlus).toFixed(3);
    statV.textContent = Math.min(Math.sqrt(rPlus / Math.max(state.r, 0.001)), 0.9999).toFixed(4);
    statDilation.textContent = dilation.toExponential(3);
    statProper.textContent = `${state.tau.toFixed(2)} s`;
    statCoord.textContent = state.tCoord > 1e6 ? state.tCoord.toExponential(2) + " s" : `${state.tCoord.toFixed(2)} s`;
  } else {
    camera.position.lerp(new THREE.Vector3(0, 0, 6), 0.02);
    camera.lookAt(0, 0, 0);
    lensShader.uniforms.uStrength.value *= 0.95;

    if (mode === "beam") updateBeam();
    else if (mode === "hypercube") hypercube.update(dt);
    else if (mode === "bigbang") updateBigBang(dt);
  }

  composer.render();
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  lensShader.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
});

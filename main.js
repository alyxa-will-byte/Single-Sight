import * as THREE from "three";
import { RS, createInfallState, stepInfall, dilationFactor } from "./physics.js";
import { createTesseract } from "./tesseract.js";

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 2000);

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

// ---------- event horizon (unlit sphere = pure black) ----------
const horizon = new THREE.Mesh(
  new THREE.SphereGeometry(RS, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0x000000 })
);
scene.add(horizon);

// photon-ring glow just outside the horizon
const ring = new THREE.Mesh(
  new THREE.RingGeometry(RS * 1.01, RS * 1.25, 128),
  new THREE.MeshBasicMaterial({ color: 0xaaffd8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
);
ring.rotation.x = Math.PI / 2;
scene.add(ring);

// ---------- accretion disk (shader for swirl + Doppler-ish color) ----------
const diskUniforms = {
  uTime: { value: 0 },
  uInner: { value: RS * 1.3 },
  uOuter: { value: RS * 9 },
};
const diskGeo = new THREE.RingGeometry(RS * 1.3, RS * 9, 256, 1);
const diskMat = new THREE.ShaderMaterial({
  uniforms: diskUniforms,
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: false,
  vertexShader: `
    varying vec2 vUv;
    varying float vDist;
    void main() {
      vUv = uv;
      vDist = length(position.xy);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uInner;
    uniform float uOuter;
    varying vec2 vUv;
    varying float vDist;
    void main() {
      float t = clamp((vDist - uInner) / (uOuter - uInner), 0.0, 1.0);
      float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
      float swirl = sin(angle * 6.0 - uTime * (3.0 - t * 2.5) + vDist * 2.0) * 0.5 + 0.5;
      vec3 hot = vec3(0.0, 1.0, 0.549);   // --g #00ff8c
      vec3 cool = vec3(0.706, 0.310, 1.0); // --v #b44fff
      vec3 color = mix(hot, cool, t) * (0.55 + 0.45 * swirl);
      float edgeFade = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.85, t);
      gl_FragColor = vec4(color, edgeFade * 0.9);
    }
  `,
});
const disk = new THREE.Mesh(diskGeo, diskMat);
disk.rotation.x = Math.PI / 2 + 0.15;
scene.add(disk);

// ---------- 4D bridge (hidden until crossing) ----------
const tesseract = createTesseract();
tesseract.group.visible = false;
scene.add(tesseract.group);

// ---------- camera / infall state ----------
const START_R = 20;
let state = createInfallState(START_R);
let falling = false;
let timeScale = 1;

function placeCamera() {
  const angle = performance.now() * 0.00005;
  const r = state.r + 2.2; // stay slightly outside probe radius for a chase view
  camera.position.set(r * Math.cos(angle), r * 0.28, r * Math.sin(angle));
  camera.lookAt(0, 0, 0);
}
placeCamera();

// ---------- HUD ----------
const statR = document.getElementById("stat-r");
const statV = document.getElementById("stat-v");
const statDilation = document.getElementById("stat-dilation");
const statProper = document.getElementById("stat-proper");
const statCoord = document.getElementById("stat-coord");
const statPhase = document.getElementById("stat-phase");
const transitionEl = document.getElementById("transition");
const transitionText = document.getElementById("transition-text");

document.getElementById("btn-start").addEventListener("click", () => {
  falling = true;
  statPhase.textContent = "Phase: infalling";
});
document.getElementById("btn-reset").addEventListener("click", reset);
document.getElementById("timescale").addEventListener("input", (e) => {
  timeScale = parseFloat(e.target.value);
});

function reset() {
  state = createInfallState(START_R);
  falling = false;
  tesseract.group.visible = false;
  disk.visible = true;
  ring.visible = true;
  horizon.visible = true;
  stars.visible = true;
  transitionEl.classList.remove("visible");
  statPhase.textContent = "Phase: approaching";
}

let transitionStarted = false;
function beginTransition() {
  transitionStarted = true;
  statPhase.textContent = "Phase: crossing the horizon";
  transitionText.textContent =
    "Your proper time never stopped. It is the outside universe's clock that has run away to infinity — " +
    "its timeline no longer has anything left to synchronize with. Beyond this point, the radial coordinate " +
    "becomes time-like and one of the old time-like directions becomes spatial: a rotation of the coordinate " +
    "axes into a fourth dimension.";
  transitionEl.classList.add("visible");
  setTimeout(() => {
    disk.visible = false;
    ring.visible = false;
    horizon.visible = false;
    stars.visible = false;
    tesseract.group.visible = true;
    statPhase.textContent = "Phase: inside the 4D bridge";
    setTimeout(() => transitionEl.classList.remove("visible"), 2200);
  }, 3200);
}

// ---------- animation loop ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale;

  if (falling && !state.crossed) {
    stepInfall(state, dt * 0.4);
  }

  if (state.crossed && !transitionStarted) {
    beginTransition();
  }

  const dilation = dilationFactor(state.r);
  diskUniforms.uTime.value += dt * dilation; // disk motion slows as seen from outside
  ring.rotation.z += dt * 0.1;

  if (!state.crossed) {
    placeCamera();
  } else {
    tesseract.update(dt);
    camera.position.lerp(new THREE.Vector3(0, 0, 6), 0.02);
    camera.lookAt(0, 0, 0);
  }

  statR.textContent = (state.r / RS).toFixed(3);
  statV.textContent = Math.min(Math.sqrt(RS / Math.max(state.r, 0.001)), 0.9999).toFixed(4);
  statDilation.textContent = dilation.toExponential(3);
  statProper.textContent = `${state.tau.toFixed(2)} s`;
  statCoord.textContent = state.tCoord > 1e6 ? state.tCoord.toExponential(2) + " s" : `${state.tCoord.toFixed(2)} s`;

  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

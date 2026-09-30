import * as THREE from "three";

// Generalizes tesseract.js from a fixed 4D hypercube to an N-dimensional one,
// rotated in floor(N/2) independent planes and projected down to 3D. Used to
// represent "S(L) space dimensions" at each level of the dimension tower.

function makeVerticesND(n) {
  const count = 1 << n; // 2^n vertices
  const verts = [];
  for (let i = 0; i < count; i++) {
    const v = [];
    for (let k = 0; k < n; k++) v.push(i & (1 << k) ? 1 : -1);
    verts.push(v);
  }
  return verts;
}

function makeEdges(vertices, n) {
  const edges = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      let diff = 0;
      for (let k = 0; k < n; k++) if (vertices[i][k] !== vertices[j][k]) diff++;
      if (diff === 1) edges.push([i, j]);
    }
  }
  return edges;
}

// Rotate in each of the floor(n/2) orthogonal coordinate-pair planes.
function rotateND(v, n, t) {
  const out = v.slice();
  for (let p = 0; p + 1 < n; p += 2) {
    const speed = 0.4 + p * 0.11;
    const c = Math.cos(t * speed);
    const s = Math.sin(t * speed);
    const a = out[p];
    const b = out[p + 1];
    out[p] = a * c - b * s;
    out[p + 1] = a * s + b * c;
  }
  return out;
}

// Perspective-project N dimensions down to 3 by repeatedly folding the
// highest axis in using the same w-camera-distance trick as the 4D case.
function projectND(v, n, wCameraDist) {
  let cur = v.slice();
  for (let dim = n; dim > 3; dim--) {
    const w = cur[dim - 1];
    const factor = 1 / (wCameraDist - w);
    for (let k = 0; k < dim - 1; k++) cur[k] *= factor;
    cur = cur.slice(0, dim - 1);
  }
  return new THREE.Vector3(cur[0] ?? 0, cur[1] ?? 0, cur[2] ?? 0);
}

export function createHypercube(n) {
  const dims = Math.max(3, Math.min(n, 9)); // clamp for sane vertex/edge counts
  const group = new THREE.Group();
  const vertices = makeVerticesND(dims);
  const edges = makeEdges(vertices, dims);

  const positions = new Float32Array(edges.length * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({ color: 0xb44fff, transparent: true, opacity: 0.85 });
  const lines = new THREE.LineSegments(geo, mat);
  group.add(lines);

  const glow = new THREE.PointLight(0x00ff8c, 2, 20);
  group.add(glow);

  let t = 0;
  function update(dt) {
    t += dt;
    const scale = 1.5;
    const positionsAttr = geo.attributes.position;
    for (let e = 0; e < edges.length; e++) {
      const [ai, bi] = edges[e];
      const a = projectND(rotateND(vertices[ai], dims, t), dims, 3.2);
      const b = projectND(rotateND(vertices[bi], dims, t), dims, 3.2);
      positionsAttr.setXYZ(e * 2, a.x * scale, a.y * scale, a.z * scale);
      positionsAttr.setXYZ(e * 2 + 1, b.x * scale, b.y * scale, b.z * scale);
    }
    positionsAttr.needsUpdate = true;
    group.rotation.y += dt * 0.05;
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
  }

  return { group, update, dispose, dims, vertexCount: vertices.length, edgeCount: edges.length };
}

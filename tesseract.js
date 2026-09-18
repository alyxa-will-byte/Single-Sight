import * as THREE from "three";

// Builds a 4D hypercube, rotates it in two independent 4D planes, and
// projects it into 3D each frame — a visual stand-in for "the radial
// direction becoming a genuine 4th axis" once the horizon is crossed.

function makeVertices4D() {
  const verts = [];
  for (let i = 0; i < 16; i++) {
    verts.push([
      i & 1 ? 1 : -1,
      i & 2 ? 1 : -1,
      i & 4 ? 1 : -1,
      i & 8 ? 1 : -1,
    ]);
  }
  return verts;
}

function makeEdges(vertices) {
  const edges = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      let diff = 0;
      for (let k = 0; k < 4; k++) if (vertices[i][k] !== vertices[j][k]) diff++;
      if (diff === 1) edges.push([i, j]);
    }
  }
  return edges;
}

function rotate4D(v, angleXW, angleYZ) {
  let [x, y, z, w] = v;
  const cxw = Math.cos(angleXW), sxw = Math.sin(angleXW);
  const nx = x * cxw - w * sxw;
  const nw = x * sxw + w * cxw;
  x = nx; w = nw;

  const cyz = Math.cos(angleYZ), syz = Math.sin(angleYZ);
  const ny = y * cyz - z * syz;
  const nz = y * syz + z * cyz;
  y = ny; z = nz;

  return [x, y, z, w];
}

function project(v, wCameraDist) {
  const [x, y, z, w] = v;
  const factor = 1 / (wCameraDist - w);
  return new THREE.Vector3(x * factor, y * factor, z * factor);
}

export function createTesseract() {
  const group = new THREE.Group();
  const vertices = makeVertices4D();
  const edges = makeEdges(vertices);

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
    const scale = 1.6;
    const positionsAttr = geo.attributes.position;
    for (let e = 0; e < edges.length; e++) {
      const [ai, bi] = edges[e];
      const a = project(rotate4D(vertices[ai], t * 0.6, t * 0.35), 3);
      const b = project(rotate4D(vertices[bi], t * 0.6, t * 0.35), 3);
      positionsAttr.setXYZ(e * 2, a.x * scale, a.y * scale, a.z * scale);
      positionsAttr.setXYZ(e * 2 + 1, b.x * scale, b.y * scale, b.z * scale);
    }
    positionsAttr.needsUpdate = true;
    group.rotation.y += dt * 0.05;
  }

  return { group, update };
}

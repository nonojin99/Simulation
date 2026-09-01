import * as THREE from "three";
import * as CANNON from "cannon-es";
import {
  PARTS, MAX_PARTS, state, scene, world, anchors,
} from "./world.js";

const matPart = new CANNON.Material("part");
const matWheel = new CANNON.Material("wheel");

export const grid = new THREE.GridHelper(40, 40, 0x94a3b8, 0xcbd5e1);
grid.position.y = 0.01;
scene.add(grid);

export const preview = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.45 })
);
preview.visible = false;
scene.add(preview);

export const view = { previewYaw: 0 };
export const raycaster = new THREE.Raycaster();
export const pointer = new THREE.Vector2();
export const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function snap(v) {
  return Math.round(v);
}

function nextId() {
  return "p" + Math.random().toString(36).slice(2, 8);
}

function makeVisual(type) {
  const def = PARTS[type];
  let geo;
  if (type === "wheel") geo = new THREE.CylinderGeometry(def.size[0], def.size[0], def.size[1], 16);
  else if (type === "rocket") geo = new THREE.ConeGeometry(0.28, def.size[1], 12);
  else geo = new THREE.BoxGeometry(...def.size);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.5 }));
  if (type === "wheel") mesh.rotation.z = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeBody(type, pos, quat) {
  const def = PARTS[type];
  const body = new CANNON.Body({
    mass: def.mass,
    material: type === "wheel" ? matWheel : matPart,
    linearDamping: 0.12,
    angularDamping: 0.2,
    allowSleep: true,
  });
  if (type === "wheel") body.addShape(new CANNON.Sphere(def.size[0]));
  else if (type === "rocket") body.addShape(new CANNON.Box(new CANNON.Vec3(0.2, def.size[1] / 2, 0.2)));
  else body.addShape(new CANNON.Box(new CANNON.Vec3(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2)));
  body.position.set(pos.x, pos.y, pos.z);
  if (quat) body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  return body;
}

export function setBodyKinematic(body, on) {
  if (on) {
    body.type = CANNON.Body.KINEMATIC;
    body.velocity.setZero();
    body.angularVelocity.setZero();
  } else {
    body.type = CANNON.Body.DYNAMIC;
    body.wakeUp();
  }
}

export function addPart(type, pos, quat) {
  if (state.parts.length >= MAX_PARTS) return null;
  const id = nextId();
  const mesh = makeVisual(type);
  mesh.position.copy(pos);
  mesh.userData.partId = id;
  scene.add(mesh);
  const body = makeBody(type, pos, quat);
  world.addBody(body);
  if (state.mode === "build") setBodyKinematic(body, true);
  const part = { id, type, mesh, body };
  state.parts.push(part);
  return part;
}

export function findById(id) {
  return state.parts.find((p) => p.id === id) || anchors.find((a) => a.id === id);
}

function teardownLink(l) {
  if (l.constraint) world.removeConstraint(l.constraint);
  if (l.helper) scene.remove(l.helper);
}

export function removePart(id) {
  const i = state.parts.findIndex((p) => p.id === id);
  if (i < 0) return;
  const p = state.parts[i];
  scene.remove(p.mesh);
  world.removeBody(p.body);
  state.links = state.links.filter((l) => {
    if (l.a !== id && l.b !== id) return true;
    teardownLink(l);
    return false;
  });
  state.parts.splice(i, 1);
}

function localAnchor(entity, worldPoint) {
  const wp = new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z);
  const local = new CANNON.Vec3();
  entity.body.pointToLocalFrame(wp, local);
  return local;
}

export function connect(aId, bId, kind) {
  if (aId === bId) return;
  if (state.links.some((l) => l.a === aId && l.b === bId && l.kind === kind)) return;
  const A = findById(aId);
  const B = findById(bId);
  if (!A || !B) return;
  const mid = A.body.position.vadd(B.body.position).scale(0.5);
  let constraint = null;
  let spring = null;
  if (kind === "weld") {
    constraint = new CANNON.LockConstraint(A.body, B.body, { maxForce: 1e6 });
  } else if (kind === "hinge") {
    const axis = new CANNON.Vec3(1, 0, 0);
    constraint = new CANNON.HingeConstraint(A.body, B.body, {
      pivotA: localAnchor(A, mid),
      pivotB: localAnchor(B, mid),
      axisA: axis,
      axisB: axis,
      maxForce: 1e6,
    });
  } else if (kind === "spring") {
    const rest = A.body.position.distanceTo(B.body.position);
    spring = new CANNON.Spring(A.body, B.body, {
      localAnchorA: localAnchor(A, A.body.position),
      localAnchorB: localAnchor(B, B.body.position),
      restLength: Math.max(0.6, rest),
      stiffness: 80,
      damping: 4,
    });
  }
  if (constraint) world.addConstraint(constraint);
  const helper = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: kind === "spring" ? 0x4ade80 : kind === "hinge" ? 0x60a5fa : 0xfbbf24 })
  );
  scene.add(helper);
  state.links.push({ a: aId, b: bId, kind, constraint, spring, helper });
}

export function autoWeld(part) {
  if (part.type === "wheel") {
    let best = null, bestD = 1.35;
    for (const o of state.parts) {
      if (o.id === part.id) continue;
      const d = part.body.position.distanceTo(o.body.position);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) connect(part.id, best.id, "hinge");
    return;
  }
  for (const o of state.parts) {
    if (o.id === part.id) continue;
    if (part.body.position.distanceTo(o.body.position) < 1.25) connect(part.id, o.id, "weld");
  }
}

export function clearWorldParts() {
  [...state.parts].forEach((p) => removePart(p.id));
  state.links.forEach(teardownLink);
  state.links = [];
  state.riding = null;
}

export function snapshot() {
  return {
    parts: state.parts.map((p) => ({
      id: p.id, type: p.type, p: p.body.position.toArray(), q: p.body.quaternion.toArray(),
    })),
    links: state.links.map((l) => ({ a: l.a, b: l.b, kind: l.kind })),
  };
}

export function applySnapshot(data) {
  clearWorldParts();
  const idMap = {};
  for (const raw of data.parts || []) {
    const pos = new THREE.Vector3(raw.p[0], raw.p[1], raw.p[2]);
    const quat = { x: raw.q[0], y: raw.q[1], z: raw.q[2], w: raw.q[3] };
    const part = addPart(raw.type, pos, quat);
    if (part) idMap[raw.id] = part.id;
  }
  for (const l of data.links || []) connect(idMap[l.a] || l.a, idMap[l.b] || l.b, l.kind);
}

export function updateLinkHelpers() {
  for (const l of state.links) {
    const A = findById(l.a), B = findById(l.b);
    if (!A || !B || !l.helper) continue;
    l.helper.geometry.setFromPoints([A.mesh.position, B.mesh.position]);
    if (l.spring && state.mode === "play") l.spring.applyForce();
  }
}

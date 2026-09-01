import {
  THREE, CANNON, PARTS, MAX_PARTS, SAVE_KEY, state, hint, stats, modePill, setHint,
  canvas, renderer, scene, camera, orbit, world, anchors,
} from "./world.js";
import {
  grid, preview, view, raycaster, pointer, groundPlane, snap, addPart, findById,
  removePart, connect, autoWeld, clearWorldParts, snapshot, applySnapshot,
  setBodyKinematic, updateLinkHelpers,
} from "./parts.js";

let authored = { parts: [], links: [] };

function enterPlay() {
  authored = snapshot();
  state.mode = "play";
  state.riding = null;
  modePill.textContent = "체험";
  modePill.classList.add("play");
  grid.visible = false;
  preview.visible = false;
  for (const p of state.parts) setBodyKinematic(p.body, false);
  setHint();
}

function enterBuild() {
  state.mode = "build";
  state.riding = null;
  modePill.textContent = "제작";
  modePill.classList.remove("play");
  grid.visible = true;
  applySnapshot(authored);
  for (const p of state.parts) setBodyKinematic(p.body, true);
  camera.position.set(12, 10, 16);
  orbit.target.set(0, 2, 0);
  orbit.enabled = true;
  setHint();
}

function save() {
  const data = state.mode === "play" ? authored : snapshot();
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  hint.innerHTML = "저장했습니다. (이 브라우저 localStorage)";
}

function load() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { hint.innerHTML = "저장된 맵이 없습니다."; return; }
  const data = JSON.parse(raw);
  authored = data;
  applySnapshot(data);
  if (state.mode === "build") for (const p of state.parts) setBodyKinematic(p.body, true);
  setHint();
}

function resetMap() {
  authored = { parts: [], links: [] };
  clearWorldParts();
  state.mode = "build";
  modePill.textContent = "제작";
  modePill.classList.remove("play");
  grid.visible = true;
  setHint();
}

const bar = document.getElementById("part-bar");
for (const [id, def] of Object.entries(PARTS)) {
  const b = document.createElement("button");
  b.className = "part" + (id === state.tool ? " active" : "");
  b.textContent = def.label;
  b.onclick = () => {
    state.tool = id;
    state.linkPick = null;
    bar.querySelectorAll(".part").forEach((el) => el.classList.remove("active"));
    b.classList.add("active");
    setHint();
  };
  bar.appendChild(b);
}

document.querySelectorAll(".actions button").forEach((b) => {
  b.onclick = () => {
    const act = b.dataset.act;
    if (act === "play") enterPlay();
    if (act === "build") enterBuild();
    if (act === "save") save();
    if (act === "load") load();
    if (act === "reset") resetMap();
  };
});

function pickEntity(ev) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const objs = [...state.parts.map((p) => p.mesh), ...anchors.map((a) => a.mesh)];
  const hit = raycaster.intersectObjects(objs, false)[0];
  if (!hit) return null;
  return findById(hit.object.userData.partId);
}

function groundPoint(ev) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const out = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, out) ? out : null;
}

canvas.addEventListener("pointermove", (ev) => {
  if (state.mode !== "build") return;
  const def = PARTS[state.tool];
  if (def.connector) { preview.visible = false; return; }
  const gp = groundPoint(ev);
  if (!gp) return;
  const y = (def.size?.[1] || 1) / 2;
  preview.position.set(snap(gp.x), y, snap(gp.z));
  preview.rotation.set(0, view.previewYaw, 0);
  preview.visible = true;
  const h = pickEntity(ev);
  state.hoverId = h && state.parts.includes(h) ? h.id : null;
});

canvas.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0 || state.mode !== "build") return;
  const def = PARTS[state.tool];
  if (def.connector) {
    const ent = pickEntity(ev);
    if (!ent) return;
    if (!state.linkPick) {
      state.linkPick = ent.id;
      hint.innerHTML = `${def.label}: 두 번째 대상을 클릭하세요.`;
      return;
    }
    connect(state.linkPick, ent.id, def.connector);
    state.linkPick = null;
    setHint();
    return;
  }
  const gp = groundPoint(ev);
  if (!gp) return;
  if (state.parts.length >= MAX_PARTS) {
    hint.innerHTML = "파츠 한도에 도달했습니다 (40).";
    return;
  }
  const y = (def.size?.[1] || 1) / 2 + 0.02;
  const pos = new THREE.Vector3(snap(gp.x), y, snap(gp.z));
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), view.previewYaw);
  const part = addPart(state.tool, pos, { x: q.x, y: q.y, z: q.z, w: q.w });
  if (part) autoWeld(part);
  authored = snapshot();
  setHint();
});

function assemblyFrom(start) {
  const ids = new Set([start.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of state.links) {
      if (ids.has(l.a) && !ids.has(l.b) && findById(l.b)?.body?.mass > 0) { ids.add(l.b); changed = true; }
      if (ids.has(l.b) && !ids.has(l.a) && findById(l.a)?.body?.mass > 0) { ids.add(l.a); changed = true; }
    }
  }
  return [...ids].map(findById).filter(Boolean);
}

function nearestSeat() {
  let best = null, bestD = 4;
  for (const p of state.parts) {
    if (p.type !== "seat") continue;
    const d = camera.position.distanceTo(p.mesh.position);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best || state.parts.find((p) => p.type === "seat") || null;
}

function toggleRide() {
  if (state.riding) {
    state.riding = null;
    orbit.enabled = true;
    return;
  }
  const seat = nearestSeat();
  if (!seat) {
    hint.innerHTML = "좌석이 없습니다. 제작에서 좌석을 배치하세요.";
    return;
  }
  state.riding = seat;
  orbit.enabled = false;
}

addEventListener("keydown", (e) => {
  state.keys[e.code] = true;
  if (e.code === "KeyR" && state.mode === "build") view.previewYaw += Math.PI / 2;
  if ((e.code === "Delete" || e.code === "Backspace") && state.mode === "build" && state.hoverId) {
    removePart(state.hoverId);
    authored = snapshot();
    setHint();
  }
  if (e.code === "KeyE" && state.mode === "play") toggleRide();
  if (e.code === "KeyQ" && state.riding) {
    state.riding = null;
    orbit.enabled = true;
  }
});
addEventListener("keyup", (e) => { state.keys[e.code] = false; });

function rideForces() {
  if (!state.riding) return;
  const seat = state.riding;
  const fwd = new CANNON.Vec3();
  seat.body.vectorToWorldFrame(new CANNON.Vec3(0, 0, -1), fwd);
  fwd.y = 0;
  if (fwd.length() > 0.01) fwd.normalize();
  const right = new CANNON.Vec3();
  seat.body.vectorToWorldFrame(new CANNON.Vec3(1, 0, 0), right);
  right.y = 0;
  if (right.length() > 0.01) right.normalize();
  let mx = 0, mz = 0;
  if (state.keys.KeyW) mz -= 1;
  if (state.keys.KeyS) mz += 1;
  if (state.keys.KeyA) mx -= 1;
  if (state.keys.KeyD) mx += 1;
  seat.body.applyForce(fwd.scale(-mz * 28).vadd(right.scale(mx * 18)), seat.body.position);
  if (state.keys.Space) seat.body.applyImpulse(new CANNON.Vec3(0, 1.2, 0), seat.body.position);
  if (state.keys.ShiftLeft || state.keys.ShiftRight) {
    for (const p of assemblyFrom(seat)) {
      if (p.type !== "rocket") continue;
      const dir = new CANNON.Vec3();
      p.body.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), dir);
      p.body.applyForce(dir.scale(55), p.body.position);
    }
  }
}

function chaseCam() {
  const seat = state.riding;
  const back = new THREE.Vector3(0, 1.4, 4.2);
  back.applyQuaternion(seat.mesh.quaternion);
  const target = seat.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0));
  camera.position.lerp(target.clone().add(back), 0.12);
  camera.lookAt(target);
}

const clock = new THREE.Clock();
let acc = 0;
const DT = 1 / 60;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.mode === "play") {
    acc += dt;
    while (acc >= DT) {
      rideForces();
      world.step(DT);
      acc -= DT;
    }
  }
  for (const p of state.parts) {
    p.mesh.position.copy(p.body.position);
    p.mesh.quaternion.copy(p.body.quaternion);
  }
  updateLinkHelpers();
  if (state.riding) chaseCam();
  else orbit.update();
  renderer.render(scene, camera);
  const v = state.riding ? state.riding.body.velocity.length() : 0;
  stats.textContent = `파츠 ${state.parts.length}/${MAX_PARTS} · 연결 ${state.links.length} · 속도 ${v.toFixed(1)} m/s`;
}

setHint();
loop();

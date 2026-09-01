import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as CANNON from "cannon-es";

export const MAX_PARTS = 40;
export const GRID = 1;
export const SAVE_KEY = "physbox-s-v1";

export const PARTS = {
  block:  { label: "블록",  size: [1, 1, 1],       mass: 2,   color: 0x64748b },
  seat:   { label: "좌석",  size: [1, 0.4, 1],     mass: 1.4, color: 0xf97316 },
  wheel:  { label: "바퀴",  size: [0.35, 0.7],     mass: 0.8, color: 0x111827 },
  rocket: { label: "로켓",  size: [0.4, 0.9, 0.4], mass: 1.0, color: 0xef4444 },
  spring: { label: "스프링", connector: "spring" },
  hinge:  { label: "힌지",   connector: "hinge" },
};

export const state = {
  mode: "build",
  tool: "block",
  parts: [],
  links: [],
  linkPick: null,
  riding: null,
  keys: {},
  hoverId: null,
};

export const hint = document.getElementById("hint");
export const stats = document.getElementById("stats");
export const modePill = document.getElementById("mode-pill");

export function setHint() {
  if (state.mode === "play") {
    hint.innerHTML = `<b>체험</b> · E 좌석 탑승/하차 · WASD 이동 · Shift 로켓 · Space 점프 힘<br>Q 하차 · 제작으로 돌아가면 배치 상태로 복구됩니다.`;
    return;
  }
  const conn = PARTS[state.tool]?.connector;
  hint.innerHTML = conn
    ? `<b>제작 · ${PARTS[state.tool].label}</b> · 부품 A 클릭 후 부품 B 클릭해서 연결 · 기둥에도 연결 가능`
    : `<b>제작 · ${PARTS[state.tool].label}</b> · 클릭 배치 · R 미리보기 회전 · Del 삭제 · 가까이 두면 자동 용접<br>파츠 ${state.parts.length}/${MAX_PARTS}`;
}

export const canvas = document.getElementById("c");
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d6);
scene.fog = new THREE.Fog(0x87b5d6, 40, 120);

export const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 250);
camera.position.set(12, 10, 16);

export const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 2, 0);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x3d4a2a, 0.9));
const sun = new THREE.DirectionalLight(0xfff3d0, 1.15);
sun.position.set(18, 28, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
sun.shadow.camera.right = sun.shadow.camera.top = 30;
scene.add(sun);

export const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 12;

const matGround = new CANNON.Material("ground");
const matPart = new CANNON.Material("part");
const matWheel = new CANNON.Material("wheel");
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matPart, { friction: 0.55, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matWheel, { friction: 1.3, restitution: 0.0 }));
world.addContactMaterial(new CANNON.ContactMaterial(matPart, matPart, { friction: 0.4, restitution: 0.02 }));
world.addContactMaterial(new CANNON.ContactMaterial(matWheel, matPart, { friction: 0.8, restitution: 0.0 }));

export const anchors = [];

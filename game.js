import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as CANNON from "cannon-es";

const MAX_PARTS = 40;
const GRID = 1;
const SAVE_KEY = "physbox-s-v1";

const PARTS = {
  block:  { label: "블록",  size: [1, 1, 1],       mass: 2,   color: 0x64748b },
  seat:   { label: "좌석",  size: [1, 0.4, 1],     mass: 1.4, color: 0xf97316 },
  wheel:  { label: "바퀴",  size: [0.35, 0.7],     mass: 0.8, color: 0x111827 },
  rocket: { label: "로켓",  size: [0.4, 0.9, 0.4], mass: 1.0, color: 0xef4444 },
  spring: { label: "스프링", connector: "spring" },
  hinge:  { label: "힌지",   connector: "hinge" },
};

const state = {
  mode: "build",
  tool: "block",
  parts: [],
  links: [],
  linkPick: null,
  riding: null,
  keys: {},
  hoverId: null,
};

const hint = document.getElementById("hint");
const stats = document.getElementById("stats");
const modePill = document.getElementById("mode-pill");

function setHint() {
  if (state.mode === "play") {
    hint.innerHTML = `<b>체험</b> · E 좌석 탑승/하차 · WASD 이동 · Shift 로켓 · Space 점프 힘<br>Q 하차 · 제작으로 돌아가면 배치 상태로 복구됩니다.`;
    return;
  }
  const conn = PARTS[state.tool]?.connector;
  hint.innerHTML = conn
    ? `<b>제작 · ${PARTS[state.tool].label}</b> · 부품 A 클릭 후 부품 B 클릭해서 연결 · 기둥에도 연결 가능`
    : `<b>제작 · ${PARTS[state.tool].label}</b> · 클릭 배치 · R 미리보기 회전 · Del 삭제 · 가까이 두면 자동 용접<br>파츠 ${state.parts.length}/${MAX_PARTS}`;
}

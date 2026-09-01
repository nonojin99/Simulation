# PHYSBOX S

HTML 물리 조립 놀이터. 블록을 붙이고 좌석에 앉아 로켓·스프링을 탄다.

저장소: https://github.com/nonojin99/Simulation

## 실행

ES 모듈이라 `file://`로 열면 막힐 수 있습니다.

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080` 을 엽니다.

GitHub Pages를 켜면 `https://nonojin99.github.io/Simulation/` 로도 실행할 수 있습니다.

## 조작

제작
- 위 버튼으로 파츠 선택
- 바닥 클릭: 배치 (가까이 두면 자동 용접)
- 스프링/힌지: A 클릭 → B 클릭 (회색 기둥에도 연결 가능)
- R: 미리보기 회전
- Del: 가리킨 파츠 삭제

체험
- Play 후 E: 가까운 좌석 탑승
- WASD, Shift 로켓, Space 살짝 점프, Q 하차
- 제작을 누르면 날아가기 전 배치로 복구

저장은 이 브라우저 `localStorage` (`physbox-s-v1`).

## 파츠

블록, 좌석, 바퀴, 로켓, 스프링, 힌지. 한도 40개.

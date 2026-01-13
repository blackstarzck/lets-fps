요청하신 내용을 바탕으로, **opencode**가 즉시 개발에 착수할 수 있도록 구성된 **최종 기술 설계서(Technical Design Document)**를 마크다운(MD) 형식으로 작성해 드립니다.

이 내용을 복사하여 `.md` 파일로 저장하거나 개발 도구에 전달하시기 바랍니다.

---

# 📑 Project: Three.js FPS x Supabase Realtime Multiplayer

## 1. 프로젝트 개요

본 프로젝트는 Three.js의 공식 FPS 예제를 기반으로, Supabase Realtime을 활용하여 다중 접속 및 실시간 상호작용이 가능한 웹 기반 멀티플레이어 FPS 게임을 구축하는 것을 목적으로 합니다.

## 2. 주요 기능 상세 (Functional Specifications)

### 2.1 인증 및 환경

* **정식 로그인**: Supabase Auth를 통한 이메일/비밀번호 인증 시스템을 사용합니다. (익명 로그인 기능은 제외)
* **공용 월드**: 모든 사용자는 인증 후 동일한 Three.js 씬(Scene) 환경에 접속합니다.

### 2.2 물리 및 캐릭터 제어 (Three.js 기반)

* **FPS 컨트롤**: `PointerLockControls`를 사용하여 마우스 시점 전환을 구현합니다.
* **이동 및 점프**:
* **WASD**: 전후좌우 이동.
* **Space**: 점프 기능. 플레이어가 지면에 닿아 있는 상태(`playerOnGround`)일 때 수직 가속도를 부여합니다.


* **충돌 감지**: Three.js의 `Octree`와 `Capsule` 라이브러리를 사용하여 맵과의 충돌 및 중력 처리를 수행합니다.

### 2.3 실시간 멀티플레이어 (Supabase Realtime)

* **위치 동기화**: `Broadcast` 기능을 사용하여 플레이어의 좌표()와 회전() 값을 실시간 전송합니다.
* **접속자 관리**: `Presence` 기능을 통해 현재 접속 중인 유저 리스트를 동기화하고, 나간 유저의 모델을 씬에서 제거합니다.
* **글로벌 채팅**:
* 화면 좌하단 UI를 통한 전역 채팅 시스템.
* 비속어 필터링 및 말풍선 기능을 제외한 단순 텍스트 로그 방식.



---

## 3. 사용자 흐름 (User Flow)

1. **Auth 단계**: 사용자는 로그인 페이지에서 인증을 완료합니다.
2. **초기화 단계**:
* Three.js 엔진이 실행되고 GLTF 맵 데이터와 `worldOctree`를 로드합니다.
* Supabase Realtime 채널(`world-1`)에 접속합니다.


3. **플레이 단계**:
* 사용자가 이동하거나 점프하면 로컬 물리 엔진이 좌표를 계산합니다.
* 계산된 좌표는 실시간으로 Supabase 채널에 브로드캐스트됩니다.


4. **인터랙션 단계**:
* 타 클라이언트로부터 받은 좌표를 바탕으로 다른 플레이어의 모델 위치를 업데이트합니다.
* 채팅 입력을 통해 다른 모든 접속자와 실시간으로 대화합니다.



---

## 4. 시스템 흐름 (System Architecture)

### 4.1 데이터 구조 (Payload Example)

```json
{
  "event": "PLAYER_MOVE",
  "payload": {
    "id": "user-uuid",
    "pos": { "x": 10.2, "y": 5.0, "z": -12.4 },
    "rot": { "w": 1, "x": 0, "y": 0, "z": 0 },
    "isJumping": false
  }
}

```

### 4.2 물리 업데이트 루프

1. `requestAnimationFrame` 내에서 `worldOctree` 충돌 계산.
2. 중력 가속도() 상시 적용.
3. 점프 입력 시 `velocity.y` 값 수정.
4. 최종 위치 확정 후 Supabase로 전송.

---

## 5. 개발 가이드 (For opencode Implementation)

### 핵심 라이브러리

* **Engine**: `three`, `three/examples/jsm/math/Octree.js`, `three/examples/jsm/math/Capsule.js`
* **Backend**: `@supabase/supabase-js`

### 구현 주의사항

1. **FPS 물리 이식**: `threejs.org/examples/#games_fps`의 소스 코드를 참조하여 `playerCollider`와 `playerVelocity` 로직을 그대로 유지하되, 외부 유저 렌더링 로직만 추가할 것.
2. **점프 로직**:
```javascript
if ( playerOnGround && keyStates[ 'Space' ] ) {
    playerVelocity.y = 15; // 점프 위력 조절
}

```


3. **Supabase 최적화**: 매 프레임(60fps)마다 데이터를 보내는 대신, `throttle`을 적용하여 초당 20~30회로 전송 빈도를 조절하여 네트워크 과부하를 방지할 것.
4. **UI 레이어**: 채팅창은 `z-index`가 높은 HTML/CSS 레이어로 구현하여 Three.js Canvas 위에 배치할 것.

---

## 6. 제외 항목 (Out of Scope)

* 익명 로그인 기능
* 캐릭터 리깅 및 애니메이션 (단순 박스 또는 기본 모델로 대체 가능)
* 스폰 지점 보호 및 구역 제한
* 채팅 도배 방지 및 비속어 필터링

---

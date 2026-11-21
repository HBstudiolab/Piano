# KEYFALL — MIDI 피아노 리듬게임

떨어지는 노트를 실제 MIDI 피아노로 연주하는 웹 리듬게임. 빌드 과정 없는 순수 HTML/JS.

## 실행

Chrome 또는 Edge에서 실행 (Web MIDI 지원 브라우저).

```bash
npx serve .          # 또는: python -m http.server 8000
```

`http://localhost:...` 접속 → MIDI 권한 허용. (`index.html` 더블클릭도 대부분 동작하지만 로컬 서버를 권장)

## 모드

- **7키**: 도·레·미·파·솔·라·시 7개 레인. 옥타브 무관, 검은건반은 아래 흰건반 레인으로 처리. 키보드 `S D F Space J K L`
- **피아노**: 곡 음역에 맞춰 실제 건반 배치. 정확한 음높이 필요. 키보드 `A W S E D F T G Y H U J K O L P ;`, `Z/X` 옥타브

## 기능

- 판정 COOL ±45ms / GOOD ±90ms / BAD ±150ms, 콤보·점수·HP·랭크, FAST/SLOW 표시
- 롱노트 (0.8초 이상 음은 누르고 있기)
- `.mid` 파일 불러오기 → 파트(트랙·채널)별로 연주 / 반주 / 끔 선택
- 연습용 재생 속도(50~100%), 판정 오프셋, 오토 플레이

## 구조

| 파일 | 역할 |
|---|---|
| `js/midi-file.js` | SMF 파서 (템포 맵, 트랙·채널별 파트 분리) |
| `js/songs.js` | 내장곡 + 간단한 음표 표기법 (`C4/1`, `C4+E4/2`, `R/.5`) |
| `js/audio.js` | Web Audio 신스 (반주·건반 소리) |
| `js/input.js` | Web MIDI + 키보드 입력 |
| `js/game.js` | 판정·노트 처리·캔버스 렌더링 |
| `js/main.js` | 메뉴·설정·화면 전환 |

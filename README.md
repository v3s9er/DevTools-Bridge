# DevTools Bridge

제작자: [v3s9er](https://github.com/v3s9er)

현재 Chrome 탭에 확장이 `chrome.debugger`로 연결하고, 로컬 서버가 DevTools UI와 CDP 메시지를 중계하는 실험용 도구입니다. UI는 일반 `http://127.0.0.1` 탭에 열립니다. **화면에 패널이 표시되는 것과 그 패널의 모든 기능이 동작하는 것은 다릅니다.**

## 실행

1. Node.js 20 이상과 `tar`가 필요합니다. Windows에서 `start_server.cmd`를 실행해 로컬 서버 창을 열어 둡니다. 첫 실행 때 고정된 버전의 외부 패키지를 다운로드하고 SHA-512 무결성을 검사합니다. `http://127.0.0.1:18765/health`에 `ready: true`가 보이면 준비됐습니다.
2. 이미 이전 버전의 확장을 로드했다면 `chrome://extensions`에서 **새로고침**을 누릅니다. 처음 설치한다면 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드**에서 이 폴더를 선택합니다.
3. 검사할 일반 웹 페이지의 탭을 활성화하고 확장 아이콘 → **현재 탭의 DevTools 열기**를 누릅니다.
4. UI 탭을 닫거나 확장의 **연결 종료**를 누르면 디버거 연결이 해제됩니다.

Windows 외 환경에서는 `node setup.mjs` 다음 `node server.mjs`를 실행할 수 있습니다.

Chrome은 디버거 권한 안내를 표시할 수 있습니다. 다른 디버거가 이미 연결됐거나 관리형 브라우저 정책이 막으면 시작할 수 없습니다. UI를 새로고침하면 연결이 끊길 수 있으므로 확장 아이콘에서 다시 여세요.

## Chrome 내장 DevTools와의 차이

| 항목 | DevTools Bridge | Chrome 내장 DevTools |
| --- | --- | --- |
| 화면 | 별도 일반 탭에서 DevTools UI를 표시 | 브라우저 내장 DevTools 창 또는 도킹 영역 |
| 연결 | 확장의 `chrome.debugger` 권한을 통해 CDP 명령 전달 | Chrome 내부의 DevTools 연결 |
| Elements·Console·Network·Sources | 기본 조회와 Console 실행을 실제 탭에서 확인 | 전체 기능 제공 |
| Memory 힙 스냅샷·할당 추적 | `HeapProfiler` 도메인이 허용되지 않아 지원하지 않음 | 지원 |
| `Profiler` 도메인 기반 CPU 프로파일링 | 해당 도메인이 허용되지 않아 지원하지 않음. Performance의 다른 기록 기능은 별도 | 지원 |
| Application의 Service Worker 제어 | `ServiceWorker` 도메인이 허용되지 않아 일부 기능 제한. 저장소·캐시는 별도 도메인 사용 | 지원 |
| Lighthouse·Recorder·로컬 파일 연동 | UI는 표시되지만 실행 기능은 검증하지 않음 | 지원 기능 사용 가능 |
| 동시 연결 | 현재 구현은 한 번에 HTTP(S) 탭 하나만 연결 | 여러 DevTools 창 사용 가능 |

이 차이는 [Chrome 확장 `chrome.debugger` API의 허용 CDP 도메인](https://developer.chrome.com/docs/extensions/reference/api/debugger)과 현재 구현에서 비롯됩니다. 같은 대상 탭에 내장 DevTools를 열면 확장 연결이 해제됩니다. Chrome의 관리 정책이 디버거 연결을 제한할 수도 있습니다.

## 확인된 범위와 한계

- 로컬 서버의 정적 파일 제공과 WebSocket 중계, 실제 웹 탭의 Elements 트리·Sources 목록·Network 요청 및 헤더를 확인했습니다. Console의 `2+2`가 `4`를 반환했습니다.
- 페이지 수정, 거래 동작, Lighthouse·Recorder·Memory·Performance의 전체 기능은 시험하지 않았습니다. 브라우저 또는 사이트의 보안 정책 우회를 보장하지 않습니다.

## 구성과 보안

- 서버는 `127.0.0.1:18765`에만 바인딩합니다. 연결 URL에는 임시 난수 토큰이 들어갑니다. 서버는 CDP 요청·응답을 파일에 저장하지 않습니다.
- DevTools UI는 Chromium DevTools 프런트엔드를 제3자가 빌드해 배포한 `@chrome-devtools/devtools-app` 1.20261025.0 패키지입니다. [패키지 출처](https://www.npmjs.com/package/@chrome-devtools/devtools-app). [patch_bundle.mjs](./patch_bundle.mjs)가 브라우저에서 불러올 수 없는 Node 전용 정적 import 세 개를 제거합니다.
- WebSocket 서버는 `ws` 8.22.0입니다. [패키지 출처](https://www.npmjs.com/package/ws).
- 로컬 UI의 CSP는 외부 서버 연결을 차단합니다. 디버거 권한 자체는 현재 탭의 내용과 네트워크 정보에 폭넓게 접근할 수 있으므로, 신뢰하는 프로필에서만 사용하세요.

외부 패키지는 저장소에 포함하지 않습니다. [setup.mjs](./setup.mjs)가 첫 실행 때 npm 레지스트리에서 고정 버전을 받아 코드에 기록된 SHA-512 값과 대조합니다. 외부 패키지는 각 패키지의 MIT 라이선스를 따르며, 이 저장소의 자체 코드 라이선스는 [LICENSE](./LICENSE)를 참조하세요. 공개 커밋의 작성자와 도구 제작자는 `v3s9er`입니다. 외부 패키지 제작자는 위 출처에 별도로 표시했습니다.

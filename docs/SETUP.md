# 설치 방법

> 현재는 API 키 없이 보고서 업로드 방식으로 진행한다. 아래 4번의 "API 키 입력"과 "연결 테스트"는 키를 확보했을 때만 쓴다.

1. 구글 시트를 만들고 **확장 프로그램 → Apps Script**를 연다.
2. `src/` 의 `Config.gs`, `Setup.gs`, `NaverApi.gs`, `Test.gs`를 각각 같은 이름의 스크립트 파일로 붙여넣는다.
3. 프로젝트 설정에서 **"appsscript.json 매니페스트 파일 표시"**를 켜고 `src/appsscript.json` 내용으로 바꾼다.
4. 시트를 새로고침하면 **네이버 광고** 메뉴가 생긴다.
   1. **시트 초기화**: 5개 탭과 헤더, 설정 기본값 생성
   2. **API 키 입력**: 마케터가 발급한 API 키·비밀키·고객 ID 입력 (스크립트 속성에만 저장)
   3. **연결 테스트**: 실행 로그에 캠페인 목록이 출력되면 1단계 완료
5. `testSignature()`로 서명 함수가 같은 입력에 같은 값을 내는지 확인할 수 있다.

6. `Verdict.gs`, `Collect.gs`도 같은 방식으로 붙여넣는다. 메뉴의 **5. 판정 실행**으로 판정 탭을 갱신한다.
7. 판정 계산 테스트: 저장소 루트에서 `node tests/verdict.test.js`

참고: `STAT_FIELDS`, `ENDPOINTS`는 0단계 조사로 대부분 확인했다. 키 확보 시 바꿀 곳은 [STAGE0_FINDINGS.md](STAGE0_FINDINGS.md)에 있다.

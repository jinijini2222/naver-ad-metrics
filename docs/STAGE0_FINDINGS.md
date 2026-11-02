# 0단계 조사 결과 (공식 API 문서 기준)

출처: naver/searchad-apidoc GitHub, naver.github.io/searchad-apidoc (샘플 코드, Swagger JSON, 에러 코드 표, 공지·릴리스 노트). 조사일 2026-11-02. 서비스 URL `https://api.searchad.naver.com`.
마케터가 **네이버 검색광고 API 키만 발급 가능**하다고 확인해 API 방식으로 진행한다. 아래 "확인 불가" 항목은 키를 받은 뒤 실제 계정에서 확인한다.

## 확인된 사항

| 영역 | 내용 |
| --- | --- |
| 헤더 | `X-Timestamp`, `X-API-KEY`, `X-Customer`(조회할 광고주 ID), `X-Signature` |
| 서명 | `Base64( HMAC-SHA256( 비밀키, "{타임스탬프}.{메서드}.{경로}" ) )`. 쿼리스트링 제외, 경로만 서명. 타임스탬프는 밀리초 |
| 캠페인 | `GET /ncc/campaigns` → `nccCampaignId`, `name`, `campaignTp` (`WEB_SITE`, `SHOPPING`, `POWER_CONTENTS`, `BRAND_SEARCH`, `PLACE`) |
| 광고그룹 | `GET /ncc/adgroups?nccCampaignId=` → `nccAdgroupId`, `name` |
| 광고(소재) | `GET /ncc/ads?nccAdgroupId=` → `nccAdId`, `type` (`TEXT_45`, `SHOPPING_PRODUCT_AD`, `CATALOG_AD` 등) |
| 쇼핑검색 소재 | 별도 엔드포인트 없음. 같은 광고 목록의 `type`으로 구분하는 구조로 보임 (명시 문장은 없음) |
| 확장소재 | `GET /ncc/ad-extensions?ownerId=` (광고그룹 ID). 이미지형은 `POWER_LINK_IMAGE`, `IMAGE_SUB_LINKS`. 응답 ID `nccAdExtensionId` |
| 성과 | `GET /stats?ids=&fields=[..]&timeRange={..}&timeIncrement=allDays`. `fields`·`timeRange`는 JSON 문자열, 날짜 `YYYY-MM-DD`(KST) |
| 지표 필드 | 노출 `impCnt`, 클릭 `clkCnt`, 광고비 `salesAmt`(VAT 포함), 전환수 `ccnt`, 전환매출 `convAmt`, 평균 순위 `avgRnk`, 구매완료 `purchaseCcnt`·`purchaseConvAmt`·`purchaseRor` |
| 순위 | `avgRnk`는 파워링크에만 의미가 있음. 2025-10-27부터 `recentAvgRnk`, `recentAvgCpc`는 항상 0 |
| 제약 | `ids`는 같은 캠페인 유형끼리만 (섞으면 400, 내부 코드 11003). `ids` 조회는 `allDays`만 가능 |
| 지연 | `/stats` 지연 약 2시간. 성과는 최대 48시간 내 바뀔 수 있음 |
| 호출 제한 | 계정당 속도 제한(수치 없음). 429 시 길게 쉬었다 재시도 (키워드 도구 안내: 5~6배 길게, 대량 429면 5분 중단) |
| 키 발급 | 광고주센터 → 광고 시스템(manage.searchad.naver.com) → 도구 → API 사용 관리. 문서 용어는 "API License", "비밀키" |
| 권한 | 구성원 역할 `OWNER`, `MASTER`, `READ_ONLY`. 키 자체의 읽기 전용 제한은 확인 불가 |
| 성과형 디스플레이 | 공식 API 문서에 언급 없음 (확인 불가) |

## 확인 불가 (실제 계정에서 확인 필요)

- 확장소재 ID를 `/stats`에 넣어 성과를 받을 수 있는지. 문서에 근거 없음. 안 되면 STAT-REPORT `ADEXTENSION` 보고서(비동기)로 받아야 하며, 2026-11-16부터 8번 열(`AD extension Business Channel ID`)이 삭제되어 열이 한 칸씩 당겨지므로 헤더 이름으로 읽어야 한다
- `ids` 최대 개수, 조회 기간 최대치(92일), `/ncc/ads`·`/ncc/ad-extensions` 건수 제한
- 소재 데이터가 없는 날 응답에서 빠지는지 0으로 오는지, 응답이 한 번 감싸진 구조인지
- 직접/간접 전환 구분 (`/stats`에는 없음, 전환 보고서의 `Conversion Method`로만 확인)
- 읽기 전용 구성원의 키 발급 가능 여부, 관리계정 키로 하위 광고주 직접 조회 가능 여부, 고객 ID 확인 위치

## API 코드에 반영한 내용 (2026-11-02)

1. `IMAGE_EXTENSION_TYPES`를 `['POWER_LINK_IMAGE', 'IMAGE_SUB_LINKS']`로 수정
2. `fetchStats_`: `timeIncrement=allDays` 추가, 광고 상품별로 묶어서 호출(캠페인 유형이 섞이면 400), 감싸진 응답도 처리
3. 429 대기 시간 확대(5초, 10초, 20초)
4. 키 입력창 문구를 "API 라이선스"로
5. 확장소재 `/stats` 조회가 실패하면 STAT-REPORT `ADEXTENSION` 방식이 필요할 수 있다는 안내를 오류에 포함

## 키를 받은 뒤 가장 먼저 확인할 것

1. `testListCampaigns()`로 인증이 통과하는지 (헤더·서명이 문서와 일치하는지)
2. 쇼핑검색 소재가 `/ncc/ads`로 조회되는지, 쇼핑 캠페인의 `avgRnk`가 0인지
3. 확장소재 ID를 `/stats`에 넣었을 때 성과가 오는지 (안 되면 STAT-REPORT 방식)
4. `ids` 50개 묶음이 통과하는지, 소재가 없는 날 응답이 어떻게 오는지

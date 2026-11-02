/**
 * 공통 상수. 코드에 비밀 값(API 키 등)을 적지 않는다.
 * 비밀 값은 스크립트 속성(PropertiesService)에만 저장한다.
 */

var SHEETS = {
  RAW: '네이버_원본',
  MAPPING: '매핑',
  VERDICT: '판정',
  ALERT_LOG: '알림_로그',
  SETTINGS: '설정'
};

// 탭별 헤더 (PRD 8절)
var HEADERS = {};
HEADERS[SHEETS.RAW] = ['수집일', '기간시작', '기간종료', '광고 상품', '캠페인', '광고그룹', '소재 ID',
  '노출수', '클릭수', '광고비', '전환수', '전환매출', '평균 노출 순위'];
HEADERS[SHEETS.MAPPING] = ['작업물 ID', '네이버 소재 ID', '광고 상품', '게시일', '교체일', '메모'];
HEADERS[SHEETS.VERDICT] = ['작업물 ID', '주차', 'CTR', '기준선', '판정비율', '판정', '전환율', 'CPC', 'ROAS',
  '순위 영향 여부', '3주 추이'];
HEADERS[SHEETS.ALERT_LOG] = ['발송일', '작업물 ID', '알림 유형', 'AI 개선안 전문', '발송 대상'];

// 설정 탭 기본값 (PRD 5, 8절). [키, 값, 설명]
var SETTINGS_DEFAULTS = [
  ['성공 기준', 0.2, '기준선 대비 +20% 이상이면 성공'],
  ['개선 기준', 0.2, '기준선 대비 -20% 이하이면 개선 필요'],
  ['최소 노출', 1000, '주간 노출수가 이 값 미만이면 데이터 부족'],
  ['순위 차', 2, '기준선 소재보다 이 단계 이상 낮으면 순위 영향 표시'],
  ['알림 수신자', '', '쉼표로 구분'],
  ['AI 사용 여부', false, 'TRUE이면 알림에 AI 개선안 첨부']
];

// 스크립트 속성 키 (값은 setCredentials()로 입력)
var PROP = {
  NAVER_API_KEY: 'NAVER_API_KEY',
  NAVER_SECRET_KEY: 'NAVER_SECRET_KEY',
  NAVER_CUSTOMER_ID: 'NAVER_CUSTOMER_ID',
  CLAUDE_API_KEY: 'CLAUDE_API_KEY'
};

var NAVER_API = {
  BASE_URL: 'https://api.searchad.naver.com',
  MAX_RETRY: 3,
  RETRY_WAIT_MS: 1000,
  REQUEST_GAP_MS: 200
};

/**
 * stats 지표 필드명 (예상값). 0단계에서 공식 문서(naver/searchad-apidoc)로 확정 후 수정한다.
 * API 사양이 바뀌어도 이 상수만 고치면 되도록 분리했다.
 */
var STAT_FIELDS = {
  IMPRESSIONS: 'impCnt',
  CLICKS: 'clkCnt',
  COST: 'salesAmt',
  CONVERSIONS: 'ccnt',
  CONV_AMOUNT: 'convAmt',
  AVG_RANK: 'avgRnk'
};

// 조회 전용 엔드포인트 (경로는 0단계에서 공식 문서로 확인)
var ENDPOINTS = {
  CAMPAIGNS: '/ncc/campaigns',
  ADGROUPS: '/ncc/adgroups'
};

// ---- 2단계: 수집 ----

// 광고 상품 구분 (원본 탭 '광고 상품' 값과 판정 단위)
var PRODUCT = {
  SHOPPING: '쇼핑검색',
  POWERLINK_IMAGE: '파워링크 확장소재',
  POWERLINK_TEXT: '파워링크 텍스트'
};

// 조회 전용 엔드포인트 추가 (경로·파라미터는 0단계에서 공식 문서로 확정)
ENDPOINTS.ADS = '/ncc/ads';                    // ?nccAdgroupId=
ENDPOINTS.AD_EXTENSIONS = '/ncc/ad-extensions'; // ?ownerId=
ENDPOINTS.STATS = '/stats';                    // ?ids=&fields=&timeRange=

// 캠페인 유형 → 광고 상품 (예상값, 확인 필요)
var CAMPAIGN_TYPE = {
  SHOPPING: 'SHOPPING',
  POWERLINK: 'WEB_SITE'
};
// 파워링크 확장소재 중 이미지형 (예상값, 확인 필요)
var IMAGE_EXTENSION_TYPES = ['IMAGE', 'IMAGE_SUB_LINKS'];

var COLLECT = {
  STATS_BATCH_SIZE: 50,      // stats 1회 요청당 소재 ID 수
  RECOLLECT_WEEKS_AGO: 2,    // 늦게 잡히는 전환 반영용 재수집
  MAX_RUN_MS: 5 * 60 * 1000  // Apps Script 6분 제한 전에 중단
};

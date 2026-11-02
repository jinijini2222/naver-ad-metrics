/**
 * 공통 상수. 코드에 비밀 값(API 키 등)을 적지 않는다.
 * 비밀 값은 스크립트 속성(PropertiesService)에만 저장한다.
 */

var SHEETS = {
  RAW: '네이버_원본',
  MAPPING: '매핑',
  VERDICT: '판정',
  ALERT_LOG: '알림_로그',
  BANNER: '성과기록_배너',
  ITEM_REPORT: '소재_주간리포트',
  SETTINGS: '설정'
};

// 탭별 헤더 (PRD 8절)
var HEADERS = {};
HEADERS[SHEETS.RAW] = ['수집일', '기간시작', '기간종료', '광고 상품', '캠페인', '광고그룹', '소재 ID',
  '노출수', '클릭수', '광고비', '전환수', '전환매출', '평균 노출 순위'];
HEADERS[SHEETS.MAPPING] = ['작업물 ID', '네이버 소재 ID', '광고 상품', '게시일', '교체일', '메모', '이미지 URL', '규격(가로x세로)'];
HEADERS[SHEETS.VERDICT] = ['작업물 ID', '주차', 'CTR', '기준선', '판정비율', '판정', '전환율', 'CPC', 'ROAS',
  '순위 영향 여부', '3주 추이', '광고 상품', '알림 유형', '비고', '기준 전환율'];
HEADERS[SHEETS.ALERT_LOG] = ['발송일', '작업물 ID', '알림 유형', 'AI 개선안 전문', '발송 대상'];
// 임시 성과 기록 템플릿 (디자이너용 배너 시트). C~O열은 스크립트가 판정 탭에서 채운다.
HEADERS[SHEETS.BANNER] = ['작업물 ID', '작업물 이름', '광고 상품', '게시일', '최근 주차', 'CTR', '기준선 CTR', '기준선 대비',
  '판정', '전환율', 'CPC', 'ROAS', '순위 영향', '3주 추이', '알림 유형', '조치', '조치일', '메모'];

// 설정 탭 기본값 (PRD 5, 8절). [키, 값, 설명]
var SETTINGS_DEFAULTS = [
  ['성공 기준', 0.2, '기준선 대비 +20% 이상이면 성공'],
  ['개선 기준', 0.2, '기준선 대비 -20% 이하이면 개선 필요'],
  ['최소 노출', 1000, '주간 노출수가 이 값 미만이면 데이터 부족'],
  ['순위 차', 2, '기준선 소재보다 이 단계 이상 낮으면 순위 영향 표시'],
  ['알림 수신자', '', '쉼표로 구분'],
  ['AI 사용 여부', false, 'TRUE이면 알림에 AI 개선안 첨부'],
  ['기준선 주수', 4, '기준선 CTR을 계산할 최근 주 수 (해당 주 포함)'],
  ['피로 주수', 3, '이 주 수 동안 CTR이 계속 떨어지면 소재 피로 후보'],
  ['피로 하락률', 0.2, '피로 판정: 첫 주 대비 이만큼 이상 감소'],
  ['알림 최소 소재 수', 5, '광고 상품별 기준선 소재가 이보다 적으면 알림 끔'],
  ['우선순위 광고비 비중', 0.1, '캠페인 광고비가 그 주 전체 광고비의 이 비율 이상이면 우선순위 후보 (10%)'],
  ['우선순위 최소 클릭', 100, '캠페인 클릭이 이보다 적으면 전환율을 판단하지 않음'],
  ['우선순위 전환율 기준', 0.005, '전환수 ÷ 클릭수가 이 값 이하이면 전환율 낮음 (0.5%). 0.5 또는 0.5%로 입력'],
  ['노출 감소 기준', 0.5, '전주 대비 노출이 이 비율 이상 줄면 후보 (50%). 전주 노출이 최소 노출 이상일 때만']
];

// 값이 비율인 설정 항목 (시트에서 % 서식으로 보여 준다)
var RATE_SETTING_KEYS = ['성공 기준', '개선 기준', '피로 하락률', '우선순위 광고비 비중', '우선순위 전환율 기준', '노출 감소 기준'];

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
  RETRY_WAIT_MS: 5000,   // 429는 길게 쉬었다 재시도 (5초, 10초, 20초)
  REQUEST_GAP_MS: 200
};

/**
 * stats 지표 필드명 (0단계 조사로 확인됨, 공식 문서 searchad-apidoc 기준).
 * API 사양이 바뀌어도 이 상수만 고치면 되도록 분리했다.
 * avgRnk는 파워링크에만 의미가 있다. recentAvgRnk/recentAvgCpc는 2025-10-27부터 항상 0이라 쓰지 않는다.
 */
var STAT_FIELDS = {
  IMPRESSIONS: 'impCnt',
  CLICKS: 'clkCnt',
  COST: 'salesAmt',
  CONVERSIONS: 'ccnt',
  CONV_AMOUNT: 'convAmt',
  AVG_RANK: 'avgRnk'
};

// 조회 전용 엔드포인트
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

// 조회 전용 엔드포인트 추가 (0단계 조사로 확인, docs/STAGE0_FINDINGS.md)
ENDPOINTS.ADS = '/ncc/ads';                    // ?nccAdgroupId=
ENDPOINTS.AD_EXTENSIONS = '/ncc/ad-extensions'; // ?ownerId=
ENDPOINTS.STATS = '/stats';                    // ?ids=&fields=&timeRange=

// 캠페인 유형 → 광고 상품 (확인됨)
var CAMPAIGN_TYPE = {
  SHOPPING: 'SHOPPING',
  POWERLINK: 'WEB_SITE'
};
// 파워링크 확장소재 중 이미지형 (확인됨: 파워링크 이미지, 이미지 서브링크)
var IMAGE_EXTENSION_TYPES = ['POWER_LINK_IMAGE', 'IMAGE_SUB_LINKS'];

var COLLECT = {
  STATS_BATCH_SIZE: 50,      // stats 1회 요청당 소재 ID 수
  RECOLLECT_WEEKS_AGO: 2,    // 늦게 잡히는 전환 반영용 재수집
  MAX_RUN_MS: 5 * 60 * 1000  // Apps Script 6분 제한 전에 중단
};

// ---- 3단계: 판정 ----

// 판정 대상 광고 상품 (파워링크 텍스트는 수집만 하고 판정 제외)
var JUDGED_PRODUCTS = [PRODUCT.SHOPPING, PRODUCT.POWERLINK_IMAGE];

var VERDICT = {
  SUCCESS: '성공',
  NORMAL: '보통',
  IMPROVE: '개선 필요',
  NO_DATA: '데이터 부족'
};
var ALERT = { IMPROVE: '개선 필요', FATIGUE: '소재 피로' };
var RANK_FLAG = '순위 영향 가능';

// ---- 7단계: 소재 주간 리포트, 디자인 우선순위 ----
HEADERS[SHEETS.ITEM_REPORT] = ['주차', '이미지', '작업물 ID', '작업물 이름', '광고 상품', '노출수', '클릭수', 'CTR',
  '전환수', '전환율', '광고비', 'CPC', '판정', '알림 유형'];

var PRIORITY_TEXT = {
  A: '소재 교체·제작 후보. 전환율이 낮은 원인이 상세페이지·가격일 수도 있어 함께 확인하세요.',
  B: '입찰·예산·심사 상태를 먼저 확인하세요. 디자인 문제가 아닐 수 있습니다.'
};

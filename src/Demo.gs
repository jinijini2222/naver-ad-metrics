/**
 * 데모 데이터: 네이버 API 키 없이 판정·알림 미리보기를 끝까지 돌려 보기 위한 가짜 데이터.
 * 소재 ID는 'demo-', 작업물 ID는 'DEMO_'로 시작해서 실제 데이터와 섞이지 않고, 지울 때 이 접두사만 지운다.
 *
 * 주의: 실제 데이터가 이미 쌓인 시트에서 쓰면 기준선이 오염된다. 실제 수집 전에 쓰고, 끝나면 반드시 지운다.
 */

var DEMO = { CREATIVE_PREFIX: 'demo-', WORK_PREFIX: 'DEMO_', MEMO: '데모 데이터' };

/**
 * 최근 4주(지난주까지) 가짜 성과.
 * 기대 결과: 개선 필요(S1), 소재 피로(S3), 순위 영향 + 개선 필요(P1) = 알림 3건,
 * 성공(S2), 데이터 부족(S4), 미매핑(S6), 텍스트 소재(T1)는 판정 제외.
 */
function buildDemoData_(now) {
  var weeks = [4, 3, 2, 1].map(function (n) { return getWeekRange_(now, n); }); // 오래된 주부터
  var collectedAt = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  var flat = [0.02, 0.02, 0.02, 0.02];
  var defs = [
    { id: 'S1', product: PRODUCT.SHOPPING, mapped: true, ctr: [0.02, 0.02, 0.02, 0.01] },            // 개선 필요
    { id: 'S2', product: PRODUCT.SHOPPING, mapped: true, ctr: [0.02, 0.02, 0.02, 0.03] },            // 성공
    { id: 'S3', product: PRODUCT.SHOPPING, mapped: true, ctr: [0.02, 0.024, 0.022, 0.018] },         // 소재 피로
    { id: 'S4', product: PRODUCT.SHOPPING, mapped: true, ctr: [0.02, 0.02, 0.02, 0.01], imp: [10000, 10000, 10000, 500] }, // 데이터 부족
    { id: 'S5', product: PRODUCT.SHOPPING, mapped: true, ctr: flat },                                // 보통
    { id: 'S6', product: PRODUCT.SHOPPING, mapped: false, ctr: flat },                               // 미매핑
    { id: 'P1', product: PRODUCT.POWERLINK_IMAGE, mapped: true, ctr: [0.02, 0.02, 0.02, 0.01], rank: [2, 2, 2, 5] }, // 순위 영향
    { id: 'P2', product: PRODUCT.POWERLINK_IMAGE, mapped: true, ctr: flat, rank: [2, 2, 2, 2] },
    { id: 'P3', product: PRODUCT.POWERLINK_IMAGE, mapped: true, ctr: flat, rank: [2, 2, 2, 2] },
    { id: 'P4', product: PRODUCT.POWERLINK_IMAGE, mapped: true, ctr: flat, rank: [2, 2, 2, 2] },
    { id: 'P5', product: PRODUCT.POWERLINK_IMAGE, mapped: true, ctr: flat, rank: [2, 2, 2, 2] },
    { id: 'T1', product: PRODUCT.POWERLINK_TEXT, mapped: false, ctr: [0.01, 0.01, 0.01, 0.01] }     // 텍스트: 판정 제외
  ];

  var rows = [], mapping = [];
  defs.forEach(function (d) {
    weeks.forEach(function (w, i) {
      var imp = d.imp ? d.imp[i] : 10000;
      var clk = Math.round(imp * d.ctr[i]);
      var conv = Math.round(clk * 0.04);
      rows.push([collectedAt, w.since, w.until, d.product, '데모 캠페인', '데모 그룹', DEMO.CREATIVE_PREFIX + d.id,
        imp, clk, clk * 120, conv, conv * 30000, d.rank ? d.rank[i] : 0]);
    });
    if (d.mapped) mapping.push([DEMO.WORK_PREFIX + d.id, DEMO.CREATIVE_PREFIX + d.id, d.product, '', '', DEMO.MEMO]);
  });
  return { rows: rows, mapping: mapping };
}

/** 메뉴: 데모 데이터 넣기. 이미 있으면 덮어쓴다(중복 없음). */
function seedDemoData() {
  var ss = SpreadsheetApp.getActive();
  var missing = Object.keys(HEADERS).concat([SHEETS.SETTINGS]).some(function (n) { return !ss.getSheetByName(n); });
  if (missing) setupSheets();

  var demo = buildDemoData_(new Date());
  var r = upsertRawRows_(demo.rows);

  var mapSheet = ss.getSheetByName(SHEETS.MAPPING);
  var have = {};
  if (mapSheet.getLastRow() > 1) {
    mapSheet.getRange(2, 2, mapSheet.getLastRow() - 1, 1).getValues().forEach(function (x) { have[str_(x[0])] = true; });
  }
  var newMap = demo.mapping.filter(function (m) { return !have[m[1]]; });
  if (newMap.length) mapSheet.getRange(mapSheet.getLastRow() + 1, 1, newMap.length, 6).setValues(newMap);

  Logger.log('데모 데이터: 원본 추가 ' + r.added + '행 / 덮어쓰기 ' + r.updated + '행, 매핑 추가 ' + newMap.length + '행');
  try {
    SpreadsheetApp.getActive().toast('데모 데이터를 넣었습니다. 5. 판정 실행 → 7. 알림 미리보기 순서로 눌러 보세요.', '네이버 광고', 10);
  } catch (e) { /* UI 없는 실행 환경 */ }
}

/** 메뉴: 데모 데이터 지우기. 접두사가 'demo-' / 'DEMO_' 인 행만 지우고 판정을 다시 계산한다. */
function clearDemoData() {
  var ss = SpreadsheetApp.getActive();
  var n = 0;
  n += removeRowsWhere_(ss.getSheetByName(SHEETS.RAW), HEADERS[SHEETS.RAW].length,
    function (r) { return str_(r[RAW_COL.CREATIVE_ID]).indexOf(DEMO.CREATIVE_PREFIX) === 0; });
  n += removeRowsWhere_(ss.getSheetByName(SHEETS.MAPPING), HEADERS[SHEETS.MAPPING].length,
    function (r) { return str_(r[1]).indexOf(DEMO.CREATIVE_PREFIX) === 0 || str_(r[0]).indexOf(DEMO.WORK_PREFIX) === 0; });
  n += removeRowsWhere_(ss.getSheetByName(SHEETS.ALERT_LOG), HEADERS[SHEETS.ALERT_LOG].length,
    function (r) { return str_(r[1]).indexOf(DEMO.WORK_PREFIX) === 0; });
  n += removeRowsWhere_(ss.getSheetByName(SHEETS.BANNER), HEADERS[SHEETS.BANNER].length,
    function (r) { return str_(r[0]).indexOf(DEMO.WORK_PREFIX) === 0; });
  runVerdict(); // 판정·성과기록 탭을 남은 실제 데이터 기준으로 다시 쓴다
  Logger.log('데모 데이터 ' + n + '행 삭제');
}

/** 조건에 맞는 행을 지운다(헤더 제외). 지운 행 수를 돌려준다. */
function removeRowsWhere_(sheet, width, pred) {
  if (!sheet) return 0;
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var range = sheet.getRange(2, 1, last - 1, width);
  var vals = range.getValues();
  var kept = vals.filter(function (r) { return !pred(r); });
  if (kept.length === vals.length) return 0;
  range.clearContent();
  if (kept.length) sheet.getRange(2, 1, kept.length, width).setValues(kept);
  return vals.length - kept.length;
}

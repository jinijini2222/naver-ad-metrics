/**
 * 임시 성과 기록 템플릿: '성과기록_배너' 탭.
 * 작업물 ID마다 한 줄. 판정 탭의 최신 주 결과를 C~O열에 자동으로 채우고,
 * 이름·조치·조치일·메모는 디자이너가 직접 적는다(스크립트가 건드리지 않음).
 * 기존 성과 기록 템플릿이 생기면 컬럼 대응만 바꾸면 된다 (docs/PERFORMANCE_LOG.md).
 */

var BANNER = {
  AUTO_FIRST_COL: 3,   // C열부터
  AUTO_COLS: 13,       // O열까지
  ACTION_COL: 16,      // P: 조치
  ACTION_DATE_COL: 17, // Q: 조치일
  ACTIONS: ['수정안 제작 중', '교체 완료', 'A/B 테스트 중', '유지', '보류']
};

/**
 * 작업물 ID별 최신 주 결과를 C~O열 순서로 만든다. 순수 함수.
 * 순서: 광고 상품, 게시일, 최근 주차, CTR, 기준선 CTR, 기준선 대비, 판정, 전환율, CPC, ROAS, 순위 영향, 3주 추이, 알림 유형
 * @param {Array<string>} workIds 시트 A열 순서
 * @param {Array<Array>} verdictRows 판정 행(computeVerdicts_의 rows)
 * @param {Array<Object>} mapping parseMapping_ 결과
 */
function computeBannerAutoCols_(workIds, verdictRows, mapping) {
  var latest = {};
  verdictRows.forEach(function (v) {
    var id = v[0];
    if (!latest[id] || String(v[1]) > String(latest[id][1])) latest[id] = v;
  });
  var posted = {}, mapProduct = {};
  mapping.forEach(function (m) {
    if (!m.workId) return;
    if (m.postedAt && (!posted[m.workId] || m.postedAt < posted[m.workId])) posted[m.workId] = m.postedAt;
    if (m.product && !mapProduct[m.workId]) mapProduct[m.workId] = m.product;
  });
  return workIds.map(function (id) {
    var v = latest[id];
    if (!v) return [mapProduct[id] || '', posted[id] || '', '', '', '', '', '', '', '', '', '', '', ''];
    return [
      v[11] || mapProduct[id] || '', posted[id] || '', v[1], v[2], v[3],
      v[4] === '' ? '' : v[4] - 1,   // 기준선 대비 (판정비율 - 1)
      v[5], v[6], v[7], v[8], v[9], v[10], v[12]
    ];
  });
}

/**
 * 매핑 탭의 작업물 ID를 A열에 없으면 추가하고, 자동 열을 갱신한다.
 * 디자이너가 쓴 열(B, P~R)과 행 순서는 그대로 둔다.
 * @return {{added:number, rows:number}}
 */
function syncBannerSheet_(ss, verdictRows, mapping) {
  var sheet = ss.getSheetByName(SHEETS.BANNER);
  if (!sheet) return { added: 0, rows: 0 };

  var have = {};
  var last = sheet.getLastRow();
  if (last > 1) {
    sheet.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { if (str_(r[0])) have[str_(r[0])] = true; });
  }
  var added = [];
  mapping.forEach(function (m) {
    if (m.workId && !have[m.workId]) { have[m.workId] = true; added.push(m.workId); }
  });
  if (added.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, added.length, 1).setValues(added.map(function (id) { return [id]; }));
  }

  var after = sheet.getLastRow();
  if (after < 2) return { added: 0, rows: 0 };
  var ids = sheet.getRange(2, 1, after - 1, 1).getValues().map(function (r) { return str_(r[0]); });
  var auto = computeBannerAutoCols_(ids, verdictRows, mapping);

  var n = ids.length, c0 = BANNER.AUTO_FIRST_COL;
  sheet.getRange(2, 4, n, 2).setNumberFormat('@');                    // 게시일, 최근 주차는 글자로
  sheet.getRange(2, c0, n, BANNER.AUTO_COLS).setValues(auto);
  [[6, '0.00%'], [7, '0.00%'], [8, '+0%;-0%;0%'], [10, '0.00%'], [11, '#,##0'], [12, '0%']].forEach(function (f) {
    sheet.getRange(2, f[0], n, 1).setNumberFormat(f[1]);
  });
  return { added: added.length, rows: n };
}

/** 입력 제한과 보기 설정: 조치 드롭다운, 조치일 검사, 판정 색, 자동 열 보호(경고). */
function applyBannerSheetRules_(ss) {
  var sheet = ss.getSheetByName(SHEETS.BANNER);
  if (!sheet) return;
  var n = Math.max(sheet.getMaxRows() - 1, 1);

  sheet.getRange(2, BANNER.ACTION_COL, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(BANNER.ACTIONS, true)
      .setAllowInvalid(false).setHelpText('알림 이후 한 일을 선택하세요.').build());
  sheet.getRange(2, BANNER.ACTION_DATE_COL, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireDate()
      .setAllowInvalid(false).setHelpText('날짜로 입력하세요 (예: 2026-11-02).').build()).setNumberFormat('yyyy-mm-dd');

  var verdictCol = sheet.getRange(2, 9, n, 1);
  var colors = [[VERDICT.SUCCESS, '#d9ead3'], [VERDICT.IMPROVE, '#f4cccc'], [VERDICT.NO_DATA, '#efefef']];
  sheet.setConditionalFormatRules(colors.map(function (c) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(c[0]).setBackground(c[1]).setRanges([verdictCol]).build();
  }));

  sheet.getRange(1, 1).setNote('판정 실행 때 매핑 탭의 작업물 ID가 자동으로 추가됩니다. 직접 추가해도 됩니다.');
  sheet.getRange(1, 3).setNote('C~O열은 판정 탭의 최신 주 결과로 자동 갱신됩니다. 직접 수정하지 마세요.');
  sheet.getRange(1, 2).setNote('직접 입력: 사람이 알아볼 수 있는 이름 (예: 추석 기획전 메인 배너)');
  sheet.getRange(1, BANNER.ACTION_COL).setNote('알림 이후 무엇을 했는지. "교체 완료", "A/B 테스트 중"은 성공 기준(알림이 조치로 이어졌는가)에 집계됩니다.');

  if (sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).length === 0) {
    sheet.getRange(2, BANNER.AUTO_FIRST_COL, n, BANNER.AUTO_COLS).protect()
      .setDescription('스크립트 전용 열').setWarningOnly(true);
  }
}

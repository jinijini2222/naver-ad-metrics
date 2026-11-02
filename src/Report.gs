/**
 * 보고서 화면: 그래프 보고서(수치 표시) + 일반 보고서(서브 창).
 * 서버는 판정 탭 데이터를 JSON으로 만들어 주고(buildReportData_), 화면은 ReportGraph.html 이 그린다.
 * 일반 보고서는 그래프 화면의 '일반 보고서' 버튼을 누르면 같은 페이지 안의 서브 창으로 뜬다.
 */

/** 메뉴: 보고서 보기 */
function showReport() {
  var ss = SpreadsheetApp.getActive();
  var verdicts = parseVerdictRows_(readSheetRows_(ss, SHEETS.VERDICT));
  if (!verdicts.length) {
    SpreadsheetApp.getUi().alert('보고서', '판정 데이터가 없습니다. 먼저 5. 판정 실행(또는 9. 데모 데이터 넣기 후 판정 실행)을 해 주세요.',
      SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  var html = HtmlService.createHtmlOutputFromFile('ReportGraph').setWidth(1060).setHeight(760);
  SpreadsheetApp.getUi().showModelessDialog(html, '성과 보고서');
}

/** 화면(google.script.run)이 호출하는 데이터 */
function getReportData() {
  var ss = SpreadsheetApp.getActive();
  return buildReportData_(
    parseVerdictRows_(readSheetRows_(ss, SHEETS.VERDICT)),
    parseMapping_(readSheetRows_(ss, SHEETS.MAPPING)),
    new Date());
}

function nz_(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

/**
 * 판정 탭·매핑 탭 → 화면용 JSON. 순수 함수.
 * 비어 있는 숫자는 null 로 바꾼다(JSON·화면에서 구분하기 쉽게).
 */
function buildReportData_(verdicts, mapping, now) {
  var weekSet = {};
  verdicts.forEach(function (v) { if (v.week) weekSet[v.week] = true; });
  var weeks = Object.keys(weekSet).sort();
  var labels = {};
  weeks.forEach(function (w) { labels[w] = md_(w) + '~' + md_(addDays_(w, 6)); });

  return {
    generatedAt: Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
    weeks: weeks,
    latestWeek: weeks.length ? weeks[weeks.length - 1] : '',
    weekLabels: labels,
    rows: verdicts.map(function (v) {
      return {
        workId: v.workId, week: v.week, product: v.product,
        ctr: nz_(v.ctr), baseCtr: nz_(v.baseCtr), ratio: nz_(v.ratio), verdict: v.verdict,
        convRate: nz_(v.convRate), baseConv: nz_(v.baseConv), cpc: nz_(v.cpc), roas: nz_(v.roas),
        rankFlag: v.rankFlag, trend: v.trend, alertType: v.alertType, note: v.note,
        diagnosis: v.alertType ? diagnose_(v) : ''
      };
    }),
    unmapped: mapping.filter(function (m) { return !m.workId && m.creativeId; }).map(function (m) {
      return { creativeId: m.creativeId, product: m.product, memo: m.memo };
    })
  };
}

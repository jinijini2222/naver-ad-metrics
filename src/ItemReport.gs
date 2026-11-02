/**
 * 7-1. 소재별 성과 주간 리포트.
 * 작업물 × 주의 노출·클릭·CTR·전환·전환율·광고비·CPC를 한 표로 모은다. 전환은 '총 전환수' 기준(원본 탭의 전환수).
 * 계산(computeWorkWeekStats_, buildItemRows_, itemReportSheetRows_)은 순수 함수라 tests/itemreport.test.js 로 검증한다.
 */

function ratio_(a, b) { return b > 0 ? a / b : null; }
function blank_(x) { return x == null ? '' : x; }

/** 작업물×주 절대 수치 (판정 대상 광고 상품만) */
function computeWorkWeekStats_(raw, mapping) {
  var judged = raw.filter(function (r) { return JUDGED_PRODUCTS.indexOf(r.product) >= 0; });
  var works = groupByWork_(judged, mapping).works, out = [];
  Object.keys(works).forEach(function (id) {
    var w = works[id];
    Object.keys(w.weeks).forEach(function (week) {
      var a = w.weeks[week];
      out.push({ workId: id, week: week, product: w.product, imp: a.imp, clk: a.clk, cost: a.cost, conv: a.conv, convAmt: a.convAmt });
    });
  });
  return out;
}

/**
 * 합산 수치에 비율·판정·이미지·이름을 붙인다.
 * @param {Array} verdicts parseVerdictRows_ 결과
 * @param {Object<string,string>} names 작업물 ID → 작업물 이름
 */
function buildItemRows_(stats, verdicts, mapping, names) {
  var vk = {};
  verdicts.forEach(function (v) { vk[v.workId + '|' + v.week] = v; });
  var img = {};
  mapping.forEach(function (m) { if (m.workId && m.imageUrl && !img[m.workId]) img[m.workId] = m.imageUrl; });
  return stats.map(function (s) {
    var v = vk[s.workId + '|' + s.week];
    return {
      workId: s.workId, week: s.week, product: s.product, name: (names && names[s.workId]) || '', imageUrl: img[s.workId] || '',
      imp: s.imp, clk: s.clk, ctr: ratio_(s.clk, s.imp), conv: s.conv, cvr: ratio_(s.conv, s.clk), cost: s.cost, cpc: ratio_(s.cost, s.clk),
      verdict: v ? v.verdict : '', alertType: v ? v.alertType : ''
    };
  });
}

/** =IMAGE() 수식. http(s) 주소만 허용하고, 수식을 깨뜨릴 수 있는 따옴표가 있으면 빈칸. */
function imageFormula_(url) {
  var u = str_(url);
  if (!/^https?:\/\/\S+$/i.test(u) || u.indexOf('"') >= 0) return '';
  return '=IMAGE("' + u + '")';
}

function sumRow_(label, product, sum, week) {
  return [week, '', label, '', product, sum.imp, sum.clk, blank_(ratio_(sum.clk, sum.imp)), sum.conv, blank_(ratio_(sum.conv, sum.clk)),
    sum.cost, blank_(ratio_(sum.cost, sum.clk)), '', ''];
}

/**
 * 한 주의 탭 행: 광고 상품별로 노출 많은 순, 상품마다 소계, 마지막에 합계.
 * @return {{rows: Array<Array>, kinds: Array<string>}} kinds: 'item' | 'sub' | 'total'
 */
function itemReportSheetRows_(items, week) {
  var list = items.filter(function (i) { return i.week === week; });
  var order = JUDGED_PRODUCTS.slice();
  list.forEach(function (i) { if (order.indexOf(i.product) < 0) order.push(i.product); });
  var rows = [], kinds = [], grand = { imp: 0, clk: 0, conv: 0, cost: 0 };
  order.forEach(function (p) {
    var g = list.filter(function (i) { return i.product === p; }).sort(function (a, b) {
      return b.imp - a.imp || (a.workId < b.workId ? -1 : 1);
    });
    if (!g.length) return;
    var sub = { imp: 0, clk: 0, conv: 0, cost: 0 };
    g.forEach(function (i) {
      rows.push([week, imageFormula_(i.imageUrl), i.workId, i.name, i.product, i.imp, i.clk, blank_(i.ctr), i.conv, blank_(i.cvr),
        i.cost, blank_(i.cpc), i.verdict, i.alertType]);
      kinds.push('item');
      ['imp', 'clk', 'conv', 'cost'].forEach(function (k) { sub[k] += i[k]; grand[k] += i[k]; });
    });
    rows.push(sumRow_('소계 · ' + p, p, sub, week)); kinds.push('sub');
  });
  if (rows.length) { rows.push(sumRow_('합계', '', grand, week)); kinds.push('total'); }
  return { rows: rows, kinds: kinds };
}

/** 성과기록_배너 탭의 작업물 이름 (A: 작업물 ID, B: 이름) */
function getBannerNames_(ss) {
  var sh = ss.getSheetByName(SHEETS.BANNER), names = {};
  if (!sh || sh.getLastRow() < 2) return names;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    if (str_(r[0]) && str_(r[1])) names[str_(r[0])] = str_(r[1]);
  });
  return names;
}

/** 소재_주간리포트 탭을 가장 최근 주로 다시 쓴다. 지난 주 이력은 판정 탭과 보고서 화면에서 본다. */
function syncItemReportSheet_(ss, raw, mapping, verdictRows) {
  var sheet = ss.getSheetByName(SHEETS.ITEM_REPORT);
  if (!sheet) return { rows: 0, week: '' };
  var headers = HEADERS[SHEETS.ITEM_REPORT];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  var last = sheet.getLastRow();
  if (last > 1) {
    var old = sheet.getRange(2, 1, last - 1, headers.length);
    old.clearContent(); old.setFontWeight('normal');
  }

  var items = buildItemRows_(computeWorkWeekStats_(raw, mapping), parseVerdictRows_(verdictRows), mapping, getBannerNames_(ss));
  var week = '';
  items.forEach(function (i) { if (i.week > week) week = i.week; });
  if (!week) return { rows: 0, week: '' };

  var out = itemReportSheetRows_(items, week), n = out.rows.length;
  sheet.getRange(2, 1, n, 1).setNumberFormat('@'); // 주차를 날짜로 바꾸지 않음
  sheet.getRange(2, 1, n, headers.length).setValues(out.rows);
  [[6, '#,##0'], [7, '#,##0'], [8, '0.00%'], [9, '#,##0'], [10, '0.00%'], [11, '#,##0'], [12, '#,##0']].forEach(function (f) {
    sheet.getRange(2, f[0], n, 1).setNumberFormat(f[1]);
  });
  out.kinds.forEach(function (k, i) {
    if (k !== 'item') sheet.getRange(2 + i, 1, 1, headers.length).setFontWeight('bold');
  });
  if (out.rows.some(function (r) { return r[1]; })) {   // 이미지가 하나라도 있으면 행을 높게
    sheet.setColumnWidth(2, 64);
    sheet.setRowHeights(2, n, 48);
  }
  return { rows: n, week: week };
}

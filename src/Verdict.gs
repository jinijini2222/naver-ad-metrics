/**
 * 3단계: 매핑 + 판정.
 * 계산(computeVerdicts_)은 시트와 분리한 순수 함수라 tests/verdict.test.js 로 검증한다.
 *
 * 구현 기준 (PRD 5절 + 해석):
 * - 기준선 = 같은 광고 상품 전체 소재의 최근 N주(해당 주 포함) 합산 CTR (클릭 합 ÷ 노출 합)
 * - 순위 기준선 = 같은 기간 노출 가중 평균 순위. 순위 값이 0/없음이면(쇼핑검색 등) 비교하지 않는다.
 * - 소재 피로 = 최근 N주(기본 3주) CTR이 매주 감소하고 마지막 주가 첫 주보다 X%(기본 20%) 이상 낮음
 * - 교체 매핑은 주 시작일 기준으로 [게시일, 교체일)에 속한 작업물 ID에 배정 (주중 교체는 이전 ID에 포함됨)
 */

var EPS = 1e-9;

// ---------- 진입점 ----------

function runVerdict() {
  var ss = SpreadsheetApp.getActive();
  var settings = parseSettings_(readSheetRows_(ss, SHEETS.SETTINGS));
  var raw = parseRaw_(readSheetRows_(ss, SHEETS.RAW));
  var mapping = parseMapping_(readSheetRows_(ss, SHEETS.MAPPING));

  var res = computeVerdicts_(raw, mapping, settings);
  writeVerdictSheet_(ss, res.rows);
  var added = addUnmappedToMapping_(ss, res.unmapped);

  Logger.log('판정 ' + res.rows.length + '행, 미매핑 신규 ' + added + '개, 최신 주 매핑률 ' +
    (res.mappingRate.total - res.mappingRate.unmapped) + '/' + res.mappingRate.total);
  try {
    SpreadsheetApp.getActive().toast('판정 ' + res.rows.length + '행, 미매핑 ' + res.unmapped.length + '개', '네이버 광고', 5);
  } catch (e) { /* UI 없는 실행 환경 */ }
  return res;
}

// ---------- 시트 읽기 ----------

function readSheetRows_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("'" + name + "' 탭이 없습니다. 먼저 시트 초기화를 실행하세요.");
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, Math.max(sheet.getLastColumn(), 1)).getValues();
}

function str_(v) { return v == null ? '' : String(v).trim(); }
function dateOrEmpty_(v) { return (v === '' || v == null) ? '' : dateStr_(v); }

function parseRaw_(rows) {
  var out = [];
  rows.forEach(function (r) {
    var id = str_(r[6]);
    if (!id) return;
    out.push({
      since: dateStr_(r[1]), until: dateStr_(r[2]), product: str_(r[3]),
      campaign: str_(r[4]), adgroup: str_(r[5]), creativeId: id,
      imp: num_(r[7]), clk: num_(r[8]), cost: num_(r[9]),
      conv: num_(r[10]), convAmt: num_(r[11]), rank: num_(r[12])
    });
  });
  return out;
}

function parseMapping_(rows) {
  var out = [];
  rows.forEach(function (r) {
    var workId = str_(r[0]), creativeId = str_(r[1]);
    if (!workId && !creativeId) return;
    out.push({
      workId: workId, creativeId: creativeId, product: str_(r[2]),
      postedAt: dateOrEmpty_(r[3]), replacedAt: dateOrEmpty_(r[4]), memo: str_(r[5])
    });
  });
  return out;
}

/** 설정 탭 [항목, 값, 설명] 행 → 설정 객체. 비었거나 잘못된 값은 기본값. 20 처럼 1보다 큰 비율은 %로 보고 100으로 나눈다. */
function parseSettings_(rows) {
  var map = {};
  (rows || []).forEach(function (r) {
    if (r[0] !== '' && r[0] != null) map[String(r[0]).trim()] = r[1];
  });
  function n(key, def) {
    var v = map[key];
    if (v === '' || v == null) return def;
    var x = Number(v);
    return isFinite(x) ? x : def;
  }
  function rate(key, def) { var x = n(key, def); return x > 1 ? x / 100 : x; }
  var ai = map['AI 사용 여부'];
  return {
    successRate: rate('성공 기준', 0.2),
    improveRate: rate('개선 기준', 0.2),
    minImpressions: n('최소 노출', 1000),
    rankGap: n('순위 차', 2),
    baselineWeeks: Math.max(1, Math.round(n('기준선 주수', 4))),
    fatigueWeeks: Math.max(2, Math.round(n('피로 주수', 3))),
    fatigueDrop: rate('피로 하락률', 0.2),
    minCreatives: n('알림 최소 소재 수', 5),
    recipients: str_(map['알림 수신자']),
    aiEnabled: ai === true || String(ai).toUpperCase() === 'TRUE'
  };
}

// ---------- 계산 (순수 함수) ----------

function addDays_(dateString, days) {
  var p = dateString.split('-');
  return fmtUtcDate_(Date.UTC(+p[0], +p[1] - 1, +p[2]) + days * 86400000);
}

function pct_(x) { return (x * 100).toFixed(2) + '%'; }

/**
 * @param {Array} raw parseRaw_ 결과
 * @param {Array} mapping parseMapping_ 결과
 * @param {Object} s parseSettings_ 결과
 * @return {{rows:Array, unmapped:Array, mappingRate:{total:number, unmapped:number}}}
 */
function computeVerdicts_(raw, mapping, s) {
  var judged = raw.filter(function (r) { return JUDGED_PRODUCTS.indexOf(r.product) >= 0; });

  // 소재 ID → 작업물 ID가 있는 매핑 행들
  var mapByCreative = {};
  mapping.forEach(function (m) {
    if (m.creativeId && m.workId) (mapByCreative[m.creativeId] = mapByCreative[m.creativeId] || []).push(m);
  });

  // 1) 소재 행을 작업물 ID·주차로 합산
  var works = {};
  var unmappedMap = {};
  judged.forEach(function (r) {
    var cands = mapByCreative[r.creativeId] || [];
    if (!cands.length) {
      unmappedMap[r.creativeId] = { creativeId: r.creativeId, product: r.product, campaign: r.campaign, adgroup: r.adgroup };
      return;
    }
    var hit = cands.filter(function (m) {
      return (!m.postedAt || r.since >= m.postedAt) && (!m.replacedAt || r.since < m.replacedAt);
    })[0];
    if (!hit) return; // 게시 전/교체 후 기간: 이 작업물의 성과가 아님

    var w = works[hit.workId] = works[hit.workId] || { workId: hit.workId, product: r.product, weeks: {} };
    var a = w.weeks[r.since] = w.weeks[r.since] || { imp: 0, clk: 0, cost: 0, conv: 0, convAmt: 0, rankSum: 0, rankImp: 0 };
    a.imp += r.imp; a.clk += r.clk; a.cost += r.cost; a.conv += r.conv; a.convAmt += r.convAmt;
    if (r.rank > 0 && r.imp > 0) { a.rankSum += r.rank * r.imp; a.rankImp += r.imp; }
  });

  // 2) 광고 상품·주차별 풀 (기준선 계산용, 미매핑 소재 포함)
  var pool = {};
  judged.forEach(function (r) {
    var p = pool[r.product] = pool[r.product] || {};
    var w = p[r.since] = p[r.since] || { imp: 0, clk: 0, rankSum: 0, rankImp: 0, ids: {} };
    w.imp += r.imp; w.clk += r.clk;
    if (r.rank > 0 && r.imp > 0) { w.rankSum += r.rank * r.imp; w.rankImp += r.imp; }
    if (r.imp > 0) w.ids[r.creativeId] = true;
  });

  function baselineFor(product, week) {
    var t = { imp: 0, clk: 0, rankSum: 0, rankImp: 0 }, ids = {};
    for (var i = 0; i < s.baselineWeeks; i++) {
      var w = (pool[product] || {})[addDays_(week, -7 * i)];
      if (!w) continue;
      t.imp += w.imp; t.clk += w.clk; t.rankSum += w.rankSum; t.rankImp += w.rankImp;
      Object.keys(w.ids).forEach(function (id) { ids[id] = true; });
    }
    return {
      ctr: t.imp > 0 ? t.clk / t.imp : null,
      rank: t.rankImp > 0 ? t.rankSum / t.rankImp : null,
      creativeCount: Object.keys(ids).length
    };
  }

  // 3) 작업물 × 주차 판정
  var rows = [];
  Object.keys(works).forEach(function (workId) {
    var w = works[workId];
    Object.keys(w.weeks).forEach(function (week) {
      var a = w.weeks[week];
      var ctr = a.imp > 0 ? a.clk / a.imp : null;
      var base = baselineFor(w.product, week);
      var notes = [];

      var verdict, ratio = null;
      if (ctr === null || a.imp < s.minImpressions) {
        verdict = VERDICT.NO_DATA;
        notes.push('주간 노출 ' + a.imp + ' < 최소 노출 ' + s.minImpressions);
      } else if (base.ctr === null || base.ctr <= 0) {
        verdict = VERDICT.NO_DATA;
        notes.push('기준선 없음');
      } else {
        ratio = ctr / base.ctr;
        if (ratio >= 1 + s.successRate - EPS) verdict = VERDICT.SUCCESS;
        else if (ratio <= 1 - s.improveRate + EPS) verdict = VERDICT.IMPROVE;
        else verdict = VERDICT.NORMAL;
      }

      // 순위 영향: 소재 평균 순위가 기준선보다 rankGap 단계 이상 낮음(숫자가 큼)
      var rank = a.rankImp > 0 ? a.rankSum / a.rankImp : null;
      var rankFlag = '';
      if (verdict !== VERDICT.NO_DATA && rank !== null && base.rank !== null && rank - base.rank >= s.rankGap - EPS) {
        rankFlag = RANK_FLAG;
      }

      // 추이 + 소재 피로
      var series = [], allOk = true;
      for (var k = s.fatigueWeeks - 1; k >= 0; k--) {
        var wa = w.weeks[addDays_(week, -7 * k)];
        var c = wa && wa.imp > 0 ? wa.clk / wa.imp : null;
        series.push(c);
        if (!wa || wa.imp < s.minImpressions || c === null) allOk = false;
      }
      var trend = series.map(function (c) { return c === null ? '-' : pct_(c); }).join(' → ');
      var fatigue = false;
      if (allOk) {
        fatigue = true;
        for (var j = 0; j < series.length - 1; j++) {
          if (!(series[j + 1] < series[j] - EPS)) fatigue = false;
        }
        if (fatigue && !(series[series.length - 1] <= series[0] * (1 - s.fatigueDrop) + EPS)) fatigue = false;
      }

      // 알림 유형 (기준선 소재 수가 부족하면 알림 끔)
      var types = [];
      if (verdict === VERDICT.IMPROVE) types.push(ALERT.IMPROVE);
      if (fatigue) types.push(ALERT.FATIGUE);
      var alertType = '';
      if (types.length) {
        if (base.creativeCount >= s.minCreatives) alertType = types.join(', ');
        else notes.push('기준선 소재 ' + base.creativeCount + '개 (<' + s.minCreatives + '): 알림 끔');
      }

      rows.push([
        workId, week, ctr, base.ctr, ratio, verdict,
        a.clk > 0 ? a.conv / a.clk : null,
        a.clk > 0 ? a.cost / a.clk : null,
        a.cost > 0 ? a.convAmt / a.cost : null,
        rankFlag, trend, w.product, alertType, notes.join('; ')
      ].map(function (v) { return v === null ? '' : v; }));
    });
  });

  rows.sort(function (x, y) {
    if (x[1] !== y[1]) return x[1] < y[1] ? 1 : -1; // 최신 주 먼저
    return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0;
  });

  // 4) 미매핑 목록과 최신 주 매핑률 (성공 기준: 90% 이상)
  var latest = '';
  judged.forEach(function (r) { if (r.since > latest) latest = r.since; });
  var latestIds = {};
  judged.forEach(function (r) { if (r.since === latest) latestIds[r.creativeId] = true; });
  var ids = Object.keys(latestIds);

  return {
    rows: rows,
    unmapped: Object.keys(unmappedMap).map(function (k) { return unmappedMap[k]; }),
    mappingRate: {
      total: ids.length,
      unmapped: ids.filter(function (id) { return unmappedMap[id]; }).length
    }
  };
}

// ---------- 시트 쓰기 ----------

function writeVerdictSheet_(ss, rows) {
  var sheet = ss.getSheetByName(SHEETS.VERDICT);
  var headers = HEADERS[SHEETS.VERDICT];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  var last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, Math.max(sheet.getLastColumn(), headers.length)).clearContent();
  if (!rows.length) return;

  sheet.getRange(2, 2, rows.length, 1).setNumberFormat('@'); // 주차를 날짜로 자동 변환하지 않음
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  [[3, '0.00%'], [4, '0.00%'], [5, '0.00'], [7, '0.00%'], [8, '#,##0'], [9, '0%']].forEach(function (f) {
    sheet.getRange(2, f[0], rows.length, 1).setNumberFormat(f[1]);
  });
}

/**
 * 매핑에 없는 소재를 매핑 탭 아래에 '작업물 ID 빈칸' 행으로 추가한다.
 * 디자이너가 작업물 ID만 채우면 된다. 이미 매핑 탭에 있는 소재 ID는 건너뛴다.
 * @return {number} 추가한 행 수
 */
function addUnmappedToMapping_(ss, unmapped) {
  if (!unmapped.length) return 0;
  var sheet = ss.getSheetByName(SHEETS.MAPPING);
  var have = {};
  var last = sheet.getLastRow();
  if (last > 1) {
    sheet.getRange(2, 2, last - 1, 1).getValues().forEach(function (r) { have[str_(r[0])] = true; });
  }
  var rows = unmapped.filter(function (u) { return !have[u.creativeId]; }).map(function (u) {
    return ['', u.creativeId, u.product, '', '', '미매핑(자동 추가) | ' + u.campaign + ' / ' + u.adgroup];
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return rows.length;
}

/**
 * 매핑 탭 입력 규칙: 시트 입력 제한(드롭다운·날짜), 미등록 강조, 규칙 점검.
 * 규칙 설명은 docs/MAPPING_RULES.md.
 *
 * 점검 수준: 오류(판정이 틀어짐) / 경고(의도 확인 필요) / 안내(할 일)
 */

var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseYmd_(d) {
  var p = d.split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
}
function validYmd_(d) {
  if (!DATE_RE.test(d)) return false;
  var p = d.split('-'), dt = parseYmd_(d);
  return dt.getUTCFullYear() === +p[0] && dt.getUTCMonth() === +p[1] - 1 && dt.getUTCDate() === +p[2];
}
function isMonday_(d) { return parseYmd_(d).getUTCDay() === 1; }

/**
 * 매핑 행(parseMapping_ 결과)을 규칙에 따라 점검한다. 순수 함수.
 * @return {Array<{level:string, row:number, msg:string}>} 행 번호 순
 */
function validateMapping_(mapping) {
  var issues = [];
  function add(level, row, msg) { issues.push({ level: level, row: row, msg: msg }); }
  var judged = JUDGED_PRODUCTS.concat([PRODUCT.POWERLINK_TEXT]);

  var byCreative = {}, productsByWork = {};
  mapping.forEach(function (m) {
    var datesOk = true;

    if (!m.creativeId) add('오류', m.row, '네이버 소재 ID가 비어 있습니다.');
    if (m.creativeId && !m.workId) add('안내', m.row, '작업물 ID를 채워 주세요 (미매핑 소재 ' + m.creativeId + ').');
    if (/\s/.test(m.workId)) add('경고', m.row, "작업물 ID '" + m.workId + "'에 공백이 있습니다. 공백 없이 쓰세요.");
    if (m.product && judged.indexOf(m.product) < 0) {
      add('경고', m.row, "광고 상품 '" + m.product + "'은 목록(" + judged.join(' / ') + ')에 없습니다.');
    }
    if (m.imageUrl && !/^https?:\/\/\S+$/i.test(m.imageUrl)) {
      add('경고', m.row, "이미지 URL이 http(s):// 로 시작하는 주소가 아닙니다. 소재 주간 리포트의 이미지가 표시되지 않습니다.");
    }
    if (m.product === PRODUCT.POWERLINK_TEXT && m.workId) {
      add('경고', m.row, '파워링크 텍스트 소재는 판정에서 제외됩니다. 매핑할 필요가 없습니다.');
    }

    [['게시일', m.postedAt], ['교체일', m.replacedAt]].forEach(function (d) {
      if (!d[1]) return;
      if (!validYmd_(d[1])) {
        add('오류', m.row, d[0] + " '" + d[1] + "'은 날짜(yyyy-mm-dd)가 아닙니다. 글자로 입력된 날짜는 비교가 틀어집니다.");
        datesOk = false;
      } else if (!isMonday_(d[1])) {
        add('경고', m.row, d[0] + ' ' + d[1] + '은 월요일이 아닙니다. 판정은 월~일 주 단위라 그 주 전체가 한쪽 작업물에 들어갑니다.');
      }
    });
    if (datesOk && m.postedAt && m.replacedAt && m.replacedAt <= m.postedAt) {
      add('오류', m.row, '교체일(' + m.replacedAt + ')이 게시일(' + m.postedAt + ')보다 늦어야 합니다.');
    }

    if (m.workId && m.product) {
      (productsByWork[m.workId] = productsByWork[m.workId] || {})[m.product] = true;
    }
    if (m.workId && m.creativeId && datesOk) (byCreative[m.creativeId] = byCreative[m.creativeId] || []).push(m);
  });

  // 한 작업물 ID에는 한 가지 광고 상품만
  Object.keys(productsByWork).forEach(function (w) {
    var ps = Object.keys(productsByWork[w]);
    if (ps.length > 1) {
      mapping.filter(function (m) { return m.workId === w; }).forEach(function (m) {
        add('오류', m.row, "작업물 ID '" + w + "'가 서로 다른 광고 상품(" + ps.join(', ') + ')에 쓰였습니다.');
      });
    }
  });

  // 같은 소재 ID의 기간은 겹치지 않고 이어져야 한다
  Object.keys(byCreative).forEach(function (cid) {
    var g = byCreative[cid].slice().sort(function (a, b) {
      return a.postedAt < b.postedAt ? -1 : a.postedAt > b.postedAt ? 1 : 0;
    });
    for (var i = 0; i < g.length - 1; i++) {
      var a = g[i], b = g[i + 1];
      if (!a.replacedAt || !b.postedAt || a.replacedAt > b.postedAt) {
        add('오류', b.row, a.row + '행과 ' + b.row + '행의 기간이 겹칩니다 (같은 소재 ID ' + cid + '). ' +
          '이전 작업물에 교체일을, 새 작업물에 게시일을 같은 날짜로 적으세요.');
      } else if (a.replacedAt < b.postedAt) {
        add('경고', b.row, a.row + '행 교체일(' + a.replacedAt + ')과 ' + b.row + '행 게시일(' + b.postedAt +
          ') 사이 기간의 성과는 어느 작업물에도 들어가지 않습니다.');
      }
    }
  });

  return issues.sort(function (x, y) { return x.row - y.row; });
}

function formatMappingIssues_(issues) {
  var c = { '오류': 0, '경고': 0, '안내': 0 };
  issues.forEach(function (i) { c[i.level]++; });
  var head = '오류 ' + c['오류'] + '건 / 경고 ' + c['경고'] + '건 / 할 일(미매핑) ' + c['안내'] + '건';
  if (!issues.length) return head + '\n매핑 탭이 규칙에 맞습니다.';
  var order = { '오류': 0, '경고': 1, '안내': 2 };
  var sorted = issues.slice().sort(function (x, y) { return order[x.level] - order[y.level] || x.row - y.row; });
  var lines = sorted.slice(0, 20).map(function (i) { return '[' + i.level + '] ' + i.row + '행: ' + i.msg; });
  if (sorted.length > 20) lines.push('... 외 ' + (sorted.length - 20) + '건 (실행 로그에서 전체 확인)');
  return head + '\n\n' + lines.join('\n');
}

/** 메뉴: 매핑 탭 점검. 결과를 팝업과 실행 로그에 출력한다. */
function checkMapping() {
  var ss = SpreadsheetApp.getActive();
  var issues = validateMapping_(parseMapping_(readSheetRows_(ss, SHEETS.MAPPING)));
  var text = formatMappingIssues_(issues);
  Logger.log(issues.map(function (i) { return '[' + i.level + '] ' + i.row + '행: ' + i.msg; }).join('\n') || '문제 없음');
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert('매핑 점검', text, ui.ButtonSet.OK);
  } catch (e) { /* UI 없는 실행 환경 */ }
  return issues;
}

/**
 * 매핑 탭 입력 제한: 광고 상품 드롭다운, 날짜 검증, 헤더 메모, 미등록 행 강조.
 * 스크립트가 쓰는 값(미매핑 자동 추가 행)에는 적용되지 않는다.
 */
function applyMappingInputRules_(ss) {
  var sheet = ss.getSheetByName(SHEETS.MAPPING);
  if (!sheet) return;
  var n = Math.max(sheet.getMaxRows() - 1, 1);

  var productRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([PRODUCT.SHOPPING, PRODUCT.POWERLINK_IMAGE, PRODUCT.POWERLINK_TEXT], true)
    .setAllowInvalid(false).setHelpText('목록에서 선택하세요.').build();
  sheet.getRange(2, 3, n, 1).setDataValidation(productRule);

  var dateRule = SpreadsheetApp.newDataValidation().requireDate()
    .setAllowInvalid(false).setHelpText('날짜로 입력하세요 (예: 2026-10-19). 월요일을 권장합니다.').build();
  sheet.getRange(2, 4, n, 2).setDataValidation(dateRule).setNumberFormat('yyyy-mm-dd');

  sheet.getRange(1, 1).setNote('디자인 작업물의 고유 ID. 공백 없이. 예: SH_1019_A\n썸네일을 바꾸면 새 ID(…_B)로 새 행을 추가합니다.');
  sheet.getRange(1, 2).setNote('네이버 광고 소재 ID (nad-…). 소재를 새로 게시하면 자동으로 빈 작업물 ID 행이 추가됩니다.');
  sheet.getRange(1, 7).setNote('소재 주간 리포트에 보일 이미지 주소(https://…). 구글 드라이브 보기 링크는 이미지로 표시되지 않을 수 있어 직접 이미지 주소를 쓰세요.');
  sheet.getRange(1, 8).setNote('가로x세로 (예: 750x280). 규격 점검(예정)에 쓰입니다.');
  sheet.getRange(1, 4).setNote('이 작업물이 광고에 나가기 시작한 월요일. 비우면 처음부터.');
  sheet.getRange(1, 5).setNote('이 작업물을 다른 것으로 교체한 월요일 (그 주부터 새 작업물). 교체 전에는 비워 둡니다.\n새 작업물의 게시일과 같은 날짜로 적습니다.');

  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2="",$B2<>"")')
    .setBackground('#fff2cc').setRanges([sheet.getRange(2, 1, n, 6)]).build();
  sheet.setConditionalFormatRules([rule]); // 작업물 ID가 비어 있는 행을 노란색으로
}

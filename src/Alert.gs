/**
 * 4단계: 트리거, 알림 메일, 오류 메일, 알림 로그.
 * 순수 함수(diagnose_, buildAlertMail_ 등)는 tests/alert.test.js 로 검증한다.
 */

// ---------- 트리거 ----------

/**
 * 월 09:00 수집 → 10:30 판정 → 11:00 알림. 기존 트리거는 지우고 다시 만든다.
 * Apps Script 시간 트리거는 지정 시각 후 최대 약 15분 안에 실행된다.
 */
function installTriggers() {
  var handlers = ['collectWeekly', 'runVerdictJob', 'sendWeeklyAlert'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  [['collectWeekly', 9, 0], ['runVerdictJob', 10, 30], ['sendWeeklyAlert', 11, 0]].forEach(function (x) {
    ScriptApp.newTrigger(x[0]).timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(x[1]).nearMinute(x[2]).create();
  });
  try { SpreadsheetApp.getActive().toast('월요일 09:00 수집, 10:30 판정, 11:00 알림 트리거를 만들었습니다.', '네이버 광고', 8); } catch (e) { /* UI 없음 */ }
}

// ---------- 작업 진입점 ----------

/** 월 10:30 트리거용. 지난주 데이터가 없으면 판정하지 않고 오류 메일을 보낸다 (이전 주 데이터로 판정 금지). */
function runVerdictJob() {
  try {
    var raw = parseRaw_(readSheetRows_(SpreadsheetApp.getActive(), SHEETS.RAW));
    var f = checkFreshness_(raw, new Date());
    if (!f.ok) {
      throw new Error('원본 탭의 최신 주가 ' + (f.latest || '없음') + ' 입니다. 지난주(' + f.expected +
        ') 데이터가 수집되지 않아 판정을 건너뜁니다.');
    }
    runVerdict();
  } catch (e) {
    notifyError_('판정 실패', e);
    throw e;
  }
}

/** 월 11:00 트리거용 + 수동 발송. */
function sendWeeklyAlert() {
  try {
    return runAlert_(new Date(), { send: true, requireFresh: true, useAi: true });
  } catch (e) {
    notifyError_('알림 실패', e);
    throw e;
  }
}

/** 메일을 보내지 않고 내용만 로그에 출력 (AI 호출 없음). 테스트·검증용. */
function previewAlert() {
  var r = runAlert_(new Date(), { send: false, requireFresh: false, useAi: false });
  Logger.log(r.targets.length ? r.subject + '\n\n' + r.body : '알림 대상이 없습니다 (' + r.week + ')');
  return r;
}

function runAlert_(now, opts) {
  var ss = SpreadsheetApp.getActive();
  var settings = parseSettings_(readSheetRows_(ss, SHEETS.SETTINGS));
  var verdicts = parseVerdictRows_(readSheetRows_(ss, SHEETS.VERDICT));
  var mapping = parseMapping_(readSheetRows_(ss, SHEETS.MAPPING));

  var week = pickAlertWeek_(verdicts, now, opts.requireFresh);
  var targets = selectAlertTargets_(verdicts, week);
  if (!targets.length) {
    if (opts.send) logAlertEvent_('알림 없음', week + ' 주 알림 대상 없음', '');
    return { sent: false, week: week, targets: [] };
  }

  var advice = {};
  if (settings.aiEnabled && opts.useAi) {
    targets.forEach(function (t) {
      var a = generateAdvice_(t);
      if (a) advice[t.workId] = a; // 실패하면 AI 없이 발송
    });
  }
  var unmapped = mapping.filter(function (m) { return !m.workId && m.creativeId; });
  var mail = buildAlertMail_(targets, unmapped, week, ss.getUrl(), advice);

  if (opts.send) {
    var to = parseRecipients_(settings.recipients);
    if (!to) throw new Error("설정 탭의 '알림 수신자'가 비어 있습니다.");
    MailApp.sendEmail({ to: to, subject: mail.subject, body: mail.text, htmlBody: mail.html });
    targets.forEach(function (t) { logAlertEvent_(t.alertType, advice[t.workId] || '', to, t.workId); });
  }
  return { sent: !!opts.send, week: week, targets: targets, subject: mail.subject, body: mail.text };
}

// ---------- 순수 함수 ----------

/** 원본 탭의 최신 주가 지난주 이상인지. */
function checkFreshness_(rawRows, now) {
  var expected = getWeekRange_(now, 1).since;
  var latest = '';
  rawRows.forEach(function (r) { if (r.since > latest) latest = r.since; });
  return { ok: latest >= expected && latest !== '', expected: expected, latest: latest };
}

/** 판정 탭 값 → 객체 */
function parseVerdictRows_(rows) {
  var out = [];
  rows.forEach(function (r) {
    if (!str_(r[0])) return;
    out.push({
      workId: str_(r[0]), week: dateOrEmpty_(r[1]), ctr: r[2], baseCtr: r[3], ratio: r[4], verdict: str_(r[5]),
      convRate: r[6], cpc: r[7], roas: r[8], rankFlag: str_(r[9]), trend: str_(r[10]), product: str_(r[11]),
      alertType: str_(r[12]), note: str_(r[13]), baseConv: r[14] === undefined ? '' : r[14]
    });
  });
  return out;
}

/** 알림 주차 결정. requireFresh면 지난주 결과가 없을 때 오류. */
function pickAlertWeek_(verdicts, now, requireFresh) {
  var expected = getWeekRange_(now, 1).since;
  if (requireFresh) {
    if (!verdicts.some(function (v) { return v.week === expected; })) {
      throw new Error('판정 탭에 지난주(' + expected + ') 결과가 없습니다. 수집 또는 판정이 실패했을 수 있습니다.');
    }
    return expected;
  }
  var latest = '';
  verdicts.forEach(function (v) { if (v.week > latest) latest = v.week; });
  if (!latest) throw new Error('판정 탭이 비어 있습니다. 먼저 판정을 실행하세요.');
  return latest;
}

function selectAlertTargets_(verdicts, week) {
  return verdicts.filter(function (v) { return v.week === week && v.alertType !== ''; });
}

function parseRecipients_(s) {
  return String(s || '').split(/[,;\s]+/).filter(function (x) { return x.indexOf('@') > 0; }).join(',');
}

function signedPct_(ratio) {
  if (ratio === '' || ratio == null) return '-';
  var d = (ratio - 1) * 100;
  return (d >= 0 ? '+' : '') + d.toFixed(0) + '%';
}
function pct2_(x) { return (x === '' || x == null) ? '-' : (x * 100).toFixed(2) + '%'; }
function md_(dateString) { var p = dateString.split('-'); return (+p[1]) + '/' + (+p[2]); }

/** 소재별 규칙 기반 진단 한 줄 (PRD 9절) */
function diagnose_(t) {
  var parts = [];
  if (t.rankFlag) parts.push('순위가 기준선보다 낮아 CTR 하락이 순위 영향일 수 있음 → ' + AI.RANK_NOTE);
  if (t.verdict === VERDICT.IMPROVE && t.convRate !== '' && t.baseConv !== '' && t.convRate != null && t.baseConv != null) {
    parts.push(t.convRate >= t.baseConv
      ? '클릭 후 전환율은 기준 이상 → 썸네일·이미지 첫인상 문제 가능성'
      : '클릭 후 전환율도 기준 미달 → 이미지뿐 아니라 상품·상세페이지·가격 요인도 확인');
  }
  if (t.alertType.indexOf(ALERT.FATIGUE) >= 0) parts.push('CTR이 연속 하락 → 소재 피로, 교체 또는 변형 A/B 테스트 시점');
  return parts.join(' / ');
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 알림 메일 제목·본문 생성 */
function buildAlertMail_(targets, unmapped, week, sheetUrl, advice) {
  var until = addDays_(week, 6);
  var subject = '[네이버 광고 알림] 기준 이하 소재 ' + targets.length + '건 (' + md_(week) + '~' + md_(until) + ')';

  var text = [subject, ''];
  var html = ['<div style="font-family:sans-serif;font-size:14px;line-height:1.5">', '<h3>' + esc_(subject) + '</h3>'];

  targets.forEach(function (t) {
    var line = t.workId + ' | ' + t.product + ' | CTR ' + pct2_(t.ctr) + ' (기준선 ' + pct2_(t.baseCtr) +
      ', 기준선 대비 ' + signedPct_(t.ratio) + ') | ' + t.alertType + (t.rankFlag ? ' | ' + t.rankFlag : '');
    var diag = diagnose_(t);
    var ai = advice && advice[t.workId];

    text.push('■ ' + line);
    if (diag) text.push('  진단: ' + diag);
    if (ai) text.push('  [AI 개선안 초안]', ai.split('\n').map(function (l) { return '  ' + l; }).join('\n'));
    text.push('');

    html.push('<p><b>' + esc_(line) + '</b>' + (diag ? '<br>진단: ' + esc_(diag) : '') + '</p>');
    if (ai) html.push('<div style="background:#f5f5f5;padding:8px;border-radius:4px"><b>AI 개선안 초안</b><pre style="white-space:pre-wrap;font-family:inherit;margin:4px 0 0">' + esc_(ai) + '</pre></div>');
  });

  if (unmapped && unmapped.length) {
    text.push('미매핑 소재 ' + unmapped.length + '건 (매핑 탭에서 작업물 ID를 채워 주세요)');
    html.push('<p><b>미매핑 소재 ' + unmapped.length + '건</b> (매핑 탭에서 작업물 ID를 채워 주세요)</p><ul>');
    unmapped.forEach(function (m) {
      var l = m.creativeId + ' | ' + m.product + (m.memo ? ' | ' + m.memo : '');
      text.push('- ' + l);
      html.push('<li>' + esc_(l) + '</li>');
    });
    html.push('</ul>');
    text.push('');
  }

  text.push('판정 탭: ' + sheetUrl);
  html.push('<p><a href="' + esc_(sheetUrl) + '">판정 탭 열기</a></p></div>');
  return { subject: subject, text: text.join('\n'), html: html.join('\n') };
}

// ---------- 로그·오류 알림 ----------

function logAlertEvent_(type, text, to, workId) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.ALERT_LOG);
  if (!sheet) return;
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  sheet.appendRow([now, workId || '', type, text, to || '']);
}

/** 오류를 알림_로그에 남기고 메일로 알린다. 이 함수 자체의 실패는 원래 오류를 가리지 않는다. */
function notifyError_(title, err) {
  var msg = String(err && err.message || err);
  try { logAlertEvent_(title, msg, ''); } catch (e) { /* ignore */ }
  try {
    var to = '';
    try {
      to = parseRecipients_(parseSettings_(readSheetRows_(SpreadsheetApp.getActive(), SHEETS.SETTINGS)).recipients);
    } catch (e) { /* 설정을 못 읽어도 계속 */ }
    if (!to) to = Session.getEffectiveUser().getEmail();
    if (to) {
      MailApp.sendEmail({
        to: to,
        subject: '[네이버 광고 오류] ' + title,
        body: msg + '\n\n시트: ' + SpreadsheetApp.getActive().getUrl()
      });
    }
  } catch (e) { /* ignore */ }
}

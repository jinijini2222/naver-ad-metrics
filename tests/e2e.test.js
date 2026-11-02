// 실행: node tests/e2e.test.js
// 가짜 스프레드시트(메모리)로 메뉴 흐름을 처음부터 끝까지 실행한다: 초기화 → 데모 → 판정 → 알림 미리보기/발송 → 오류 경로 → 삭제
const assert = require('assert');
const { load } = require('./helpers');

// ---------- 가짜 스프레드시트 ----------
const validations = [], cfRules = [];
function makeSheet(name) {
  const cells = [], prot = [];
  const get = (r, c) => (cells[r - 1] && cells[r - 1][c - 1] !== undefined ? cells[r - 1][c - 1] : '');
  const set = (r, c, v) => { while (cells.length < r) cells.push([]); cells[r - 1][c - 1] = v; };
  const lastRow = () => { for (let r = cells.length; r >= 1; r--) if ((cells[r - 1] || []).some((v) => v !== '' && v !== undefined)) return r; return 0; };
  const lastCol = () => { let m = 0; cells.forEach((row) => row.forEach((v, i) => { if (v !== '' && v !== undefined) m = Math.max(m, i + 1); })); return m; };
  const sheet = {
    name, getName: () => name, getLastRow: lastRow, getLastColumn: lastCol, getMaxRows: () => 1000,
    getRange(r, c, nr = 1, nc = 1) {
      const rg = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => get(r + i, c + j))),
        setValues: (v) => { v.forEach((row, i) => row.forEach((x, j) => set(r + i, c + j, x))); return rg; },
        clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) set(r + i, c + j, ''); return rg; },
        setNumberFormat: () => rg, setFontWeight: () => rg, setNote: () => rg,
        setValue: (v) => { set(r, c, v); return rg; },
        protect: () => { const p = { setDescription: () => p, setWarningOnly: () => { prot.push(p); return p; } }; return p; },
        setDataValidation: (rule) => { validations.push({ tab: name, col: c, rows: nr, rule }); return rg; },
      };
      return rg;
    },
    appendRow: (row) => { const r = lastRow() + 1; row.forEach((x, j) => set(r, j + 1, x)); },
    setFrozenRows() {}, autoResizeColumns() {}, setRowHeights() {}, setColumnWidth() {}, setConditionalFormatRules: (r) => { cfRules.push(...r); },
    getProtections: () => prot,
    protect: () => { const p = { setDescription: () => p, setWarningOnly: () => { prot.push(p); return p; } }; return p; },
    rows: () => { const out = []; for (let r = 2; r <= lastRow(); r++) out.push(Array.from({ length: lastCol() }, (_, c) => get(r, c + 1))); return out; },
    header: () => Array.from({ length: lastCol() }, (_, c) => get(1, c + 1)),
    setCell: (r, c, v) => set(r, c, v),
  };
  return sheet;
}
const sheets = { Sheet1: makeSheet('Sheet1') };
const ss = {
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = makeSheet(n)),
  deleteSheet: (s) => { delete sheets[s.name]; },
  getSheets: () => Object.values(sheets),
  getUrl: () => 'https://docs.google.com/spreadsheets/d/FAKE',
  toast() {},
  setSpreadsheetTimeZone(tz) { ss.tz = tz; },
};
const mails = [];
const globals = {
  SpreadsheetApp: { getActive: () => ss, getActiveSpreadsheet: () => ss, ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
    newDataValidation: () => { const b = { _: {}, requireValueInList(l) { b._.list = l; return b; }, requireDate() { b._.date = true; return b; },
      setAllowInvalid(x) { b._.allowInvalid = x; return b; }, setHelpText() { return b; }, build: () => b._ }; return b; },
    newConditionalFormatRule: () => { const b = { _: {}, whenFormulaSatisfied(f) { b._.formula = f; return b; }, whenTextEqualTo(t) { b._.text = t; return b; }, setBackground() { return b; },
      setRanges() { return b; }, build: () => b._ }; return b; } },
  MailApp: { sendEmail: (o) => mails.push(o) },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@test.com' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  UrlFetchApp: { fetch: () => { throw new Error('네트워크 호출 금지'); } },
  Utilities: {
    sleep() {},
    formatDate(d, tz, fmt) {
      const k = new Date(d.getTime() + 9 * 3600 * 1000), p = (n) => String(n).padStart(2, '0');
      return fmt.replace('yyyy', k.getUTCFullYear()).replace('MM', p(k.getUTCMonth() + 1)).replace('dd', p(k.getUTCDate()))
        .replace('HH', p(k.getUTCHours())).replace('mm', p(k.getUTCMinutes()));
    },
  },
};
const { ctx, call } = load(['Config.gs', 'Setup.gs', 'NaverApi.gs', 'Collect.gs', 'Verdict.gs', 'Mapping.gs', 'Banner.gs', 'ItemReport.gs', 'Priority.gs', 'Alert.gs', 'Ai.gs', 'Demo.gs'], globals);
const run = (fn) => call(`${fn}()`);
const TABS = ['네이버_원본', '매핑', '판정', '알림_로그', '설정'];
const count = (tab) => sheets[tab].rows().length;

// 1) 시트 초기화
run('setupSheets');
TABS.forEach((t) => assert.ok(sheets[t], t + ' 탭 생성'));
assert.ok(!sheets.Sheet1, '빈 기본 시트 삭제');
assert.strictEqual(sheets['판정'].header().length, 15);
assert.strictEqual(sheets['설정'].rows().length, 14);
run('setupSheets');                                                     // 다시 실행해도 중복 없음
assert.strictEqual(sheets['설정'].rows().length, 14);
assert.strictEqual(ss.tz, 'Asia/Seoul', '시트 시간대를 서울로');
assert.strictEqual(sheets['성과기록_배너'].header().length, 18, '성과기록_배너 탭 생성');
assert.ok(validations.some((x) => x.tab === '성과기록_배너' && x.col === 16 && x.rule.list.length === 5), '조치 드롭다운');
assert.ok(cfRules.some((r) => r.text === '개선 필요'), '판정 색');
const prodRule = validations.find((x) => x.tab === '매핑' && x.col === 3).rule;
assert.deepStrictEqual(JSON.parse(JSON.stringify(prodRule.list)), ['쇼핑검색', '파워링크 확장소재', '파워링크 텍스트']);
assert.strictEqual(prodRule.allowInvalid, false);
const dateRule = validations.find((x) => x.tab === '매핑' && x.col === 4).rule;
assert.ok(dateRule.date && dateRule.allowInvalid === false);
assert.ok(cfRules.some((r) => r.formula === '=AND($A2="",$B2<>"")'), '미등록 행 강조');
console.log('OK 시트 초기화 (5개 탭, 헤더, 설정, 시간대, 매핑 입력 규칙, 재실행 안전)');

// 2) 데모 데이터
run('seedDemoData');
assert.strictEqual(count('네이버_원본'), 48);
assert.strictEqual(count('매핑'), 10);
run('seedDemoData');
assert.strictEqual(count('네이버_원본'), 48, '데모 재실행해도 원본 중복 없음');
assert.strictEqual(count('매핑'), 10);
console.log('OK 데모 데이터 (원본 48행, 매핑 10행, 재실행 중복 없음)');

// 3) 판정
run('runVerdict');
assert.strictEqual(count('판정'), 40, '10개 작업물 x 4주');
assert.strictEqual(count('매핑'), 11, '미매핑 소재(demo-S6)가 매핑 탭에 추가됨');
const unm = sheets['매핑'].rows().find((r) => r[0] === '');
assert.strictEqual(unm[1], 'demo-S6');
run('runVerdict');
assert.strictEqual(count('판정'), 40, '판정 재실행도 행 수 동일');
assert.strictEqual(count('매핑'), 11, '미매핑 중복 추가 없음');
const lastWeek = ctx.getWeekRange_(new Date(), 1).since;
const v = (id) => sheets['판정'].rows().find((r) => r[0] === id && r[1] === lastWeek);
assert.strictEqual(v('DEMO_S1')[5], '개선 필요');
assert.strictEqual(v('DEMO_S2')[5], '성공');
assert.strictEqual(v('DEMO_S3')[12], '소재 피로');
assert.strictEqual(v('DEMO_S4')[5], '데이터 부족');
assert.strictEqual(v('DEMO_P1')[9], '순위 영향 가능');
assert.strictEqual(v('DEMO_P1')[12], '개선 필요');
assert.ok(!sheets['판정'].rows().some((r) => r[0].indexOf('T1') >= 0), '텍스트 소재 판정 제외');
console.log('OK 판정 (개선 필요 / 성공 / 소재 피로 / 데이터 부족 / 순위 영향 / 미매핑 추가 / 재실행 안전)');

// 3-1) 소재_주간리포트: 최신 주만, 상품별 소계와 합계 (전환은 총 전환수)
{
  const R = sheets['소재_주간리포트'];
  assert.strictEqual(R.header().length, 14);
  const rows = R.rows();
  assert.strictEqual(rows.length, 13, '작업물 10 + 소계 2 + 합계 1');
  assert.ok(rows.every((r) => r[0] === lastWeek), '최신 주만');
  const s1 = rows.find((r) => r[2] === 'DEMO_S1');
  assert.deepStrictEqual([s1[5], s1[6], s1[8], s1[10]], [10000, 100, 4, 12000]);     // 노출, 클릭, 전환(100×4%), 광고비(100×120)
  assert.strictEqual(s1[12], '개선 필요');
  assert.deepStrictEqual(rows.filter((r) => String(r[2]).startsWith('소계')).map((r) => r[2]), ['소계 · 쇼핑검색', '소계 · 파워링크 확장소재']);
  const total = rows[rows.length - 1];
  assert.strictEqual(total[2], '합계');
  const itemsOnly = rows.filter((r) => String(r[2]).startsWith('DEMO_'));
  assert.strictEqual(total[5], itemsOnly.reduce((a, r) => a + r[5], 0), '합계 노출 = 작업물 합');
  assert.strictEqual(total[8], itemsOnly.reduce((a, r) => a + r[8], 0), '합계 전환 = 작업물 합');
  console.log('OK 소재_주간리포트 (최신 주, 상품별 소계, 합계)');
}

// 4) 알림 미리보기 (발송 안 함)
const prev = call('previewAlert()');
assert.deepStrictEqual(prev.targets.map((t) => t.workId).sort(), ['DEMO_P1', 'DEMO_S1', 'DEMO_S3']);
assert.match(prev.subject, /기준 이하 소재 3건 · 디자인 우선순위 2건/);
assert.deepStrictEqual(prev.priority.A.map((i) => i.campaign), ['데모 캠페인 B']);      // 광고비 비중 큼 + 전환 없음
assert.deepStrictEqual(prev.priority.B.map((i) => i.campaign), ['데모 캠페인 C']);      // 노출 급감 (10,000 → 500)
assert.match(prev.body, /데모 캠페인 B \| 광고비 .*전환율 0\.00%/);
assert.match(prev.body, /데모 캠페인 C \| 노출 10,000 → 500 \(-95%\)/);
assert.strictEqual(mails.length, 0, '미리보기는 메일을 보내지 않음');
console.log('OK 알림 미리보기 (대상 3건, 발송 없음)');

// 5) 수신자가 없으면 오류 + 오류 메일, 있으면 발송
assert.throws(() => run('sendWeeklyAlert'), /알림 수신자/);
assert.strictEqual(mails.length, 1);
assert.strictEqual(mails[0].to, 'owner@test.com');
assert.match(mails[0].subject, /\[네이버 광고 오류\] 알림 실패/);
const setRow = sheets['설정'].rows().findIndex((r) => r[0] === '알림 수신자');
sheets['설정'].setCell(setRow + 2, 2, 'designer@test.com');
const sent = call('sendWeeklyAlert()');
assert.strictEqual(sent.sent, true);
assert.strictEqual(mails.length, 2);
assert.strictEqual(mails[1].to, 'designer@test.com');
assert.match(mails[1].body, /미매핑 소재 1건[\s\S]*demo-S6/);
assert.match(mails[1].body, /디자인 우선순위 · 비용은 큰데 전환율이 낮은 캠페인/);
assert.ok(sheets['알림_로그'].rows().some((r) => r[2] === '디자인 우선순위 A' && r[3].includes('데모 캠페인 B')), '우선순위 로그');
assert.ok(mails[1].htmlBody.includes('href="https://docs.google.com/spreadsheets/d/FAKE"'));
assert.ok(sheets['알림_로그'].rows().filter((r) => r[1].indexOf('DEMO_') === 0).length === 3, '소재별 로그 3건');
console.log('OK 알림 발송 (수신자 없음 → 오류 메일 / 있음 → 발송 + 로그)');

// 5-1) 썸네일을 교체했는데 새 작업물 행을 안 만든 경우: 조용히 버리지 않고 빈 행이 추가된다
{
  const rows = sheets['매핑'].rows();
  const idx = rows.findIndex((r) => r[0] === 'DEMO_S5');
  sheets['매핑'].setCell(idx + 2, 5, lastWeek);              // 교체일 = 지난주 월요일
  const mapBefore = count('매핑');
  run('runVerdict');
  assert.strictEqual(count('매핑'), mapBefore + 1, 'demo-S5 빈 행 추가');
  const added = sheets['매핑'].rows().filter((r) => r[0] === '' && r[1] === 'demo-S5');
  assert.strictEqual(added.length, 1);
  assert.match(added[0][5], /교체 후 새 작업물 등록 필요/);
  assert.ok(!v('DEMO_S5'), '교체 이후 주는 DEMO_S5 판정에서 빠짐');
  run('runVerdict');
  assert.strictEqual(count('매핑'), mapBefore + 1, '재실행해도 빈 행은 한 번만');
  const issues = call('checkMapping()');
  assert.ok(issues.some((i) => i.level === '안내' && /demo-S5/.test(i.msg)));
  assert.ok(!issues.some((i) => i.level === '오류'));
  console.log('OK 교체 후 새 작업물 미등록 → 빈 행 추가 / 매핑 점검');
}

// 5-2) 성과기록_배너: 판정 최신 주를 작업물 ID별로 채우고, 디자이너가 쓴 열은 보존
{
  const B = sheets['성과기록_배너'];
  const rows = () => B.rows();
  assert.strictEqual(rows().length, 10, '매핑된 작업물 10개');
  const row = (id) => rows().find((r) => r[0] === id);
  assert.strictEqual(row('DEMO_S1')[2], '쇼핑검색');
  assert.strictEqual(row('DEMO_S1')[4], lastWeek);
  assert.strictEqual(row('DEMO_S1')[8], '개선 필요');
  assert.strictEqual(row('DEMO_S1')[14], '개선 필요');
  assert.ok(row('DEMO_S1')[7] < 0, '기준선 대비 음수');
  assert.strictEqual(row('DEMO_P1')[12], '순위 영향 가능');
  // 교체되어 마지막 주가 빠진 DEMO_S5는 그 작업물의 최근 주차(2주 전)를 보여줌
  assert.strictEqual(row('DEMO_S5')[4], call('getWeekRange_(new Date(), 2)').since);

  const r1 = rows().findIndex((r) => r[0] === 'DEMO_S1') + 2;
  B.setCell(r1, 2, '추석 배너'); B.setCell(r1, 16, '교체 완료'); B.setCell(r1, 18, '10/26 교체');
  const order = rows().map((r) => r[0]);
  sheets['매핑'].appendRow(['DEMO_X', 'demo-X', '쇼핑검색', '', '', '데모 데이터']);
  run('runVerdict');
  assert.strictEqual(rows().length, 11, '새 작업물 한 줄 추가');
  assert.deepStrictEqual(rows().map((r) => r[0]).slice(0, 10), order, '기존 행 순서 유지');
  assert.strictEqual(row('DEMO_S1')[1], '추석 배너');
  assert.strictEqual(row('DEMO_S1')[15], '교체 완료');
  assert.strictEqual(row('DEMO_S1')[17], '10/26 교체');
  assert.strictEqual(row('DEMO_X')[8], '', '판정이 없는 작업물은 자동 열 빈칸');
  run('runVerdict');
  assert.strictEqual(rows().length, 11, '재실행해도 중복 없음');
  console.log('OK 성과기록_배너 (최신 주 자동 채움 / 수동 열 보존 / 신규 추가 / 재실행 안전)');
}

// 6) 삭제 후: 데이터가 없으면 판정 작업이 오류 메일로 중단
run('clearDemoData');
assert.strictEqual(count('네이버_원본'), 0);
assert.strictEqual(count('매핑'), 0);
assert.strictEqual(count('판정'), 0);
assert.strictEqual(count('성과기록_배너'), 0, '데모 작업물 행 삭제');
assert.strictEqual(count('소재_주간리포트'), 0, '데이터가 없으면 소재 리포트도 비움');
assert.strictEqual(sheets['알림_로그'].rows().filter((r) => r[1].indexOf('DEMO_') === 0).length, 0);
const before = mails.length;
assert.throws(() => run('runVerdictJob'), /지난주\(.*\) 데이터가 수집되지 않아 판정을 건너뜁니다/);
assert.strictEqual(mails.length, before + 1);
assert.match(mails[before].subject, /판정 실패/);
console.log('OK 데모 삭제 / 데이터 없으면 판정 중단 + 오류 메일');

console.log('\nALL PASSED');

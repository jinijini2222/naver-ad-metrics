// 실행: node tests/report.test.js  (보고서 화면용 데이터 구성)
const assert = require('assert');
const { load } = require('./helpers');
const { call } = load(['Config.gs', 'Collect.gs', 'Verdict.gs', 'Mapping.gs', 'Banner.gs', 'ItemReport.gs', 'Priority.gs', 'Alert.gs', 'Ai.gs', 'Report.gs']);

const row = (id, week, o = {}) => [id, week, o.ctr ?? 0.01, 0.02, o.ratio ?? 0.5, o.verdict ?? '개선 필요', 0.05, 120, 3.2, o.rank ?? '',
  'a → b → c', '쇼핑검색', o.alert ?? '개선 필요', '', 0.03];
const verdicts = call('parseVerdictRows_(r)', { r: [
  row('W1', '2026-10-19', { alert: '' , verdict: '보통', ratio: 1.0 }),
  row('W1', '2026-10-26', { rank: '순위 영향 가능' }),
  row('W2', '2026-10-26', { ctr: '', ratio: '', verdict: '데이터 부족', alert: '' }),
] });
const mapping = call('parseMapping_(m)', { m: [['A', 'nad-1', '쇼핑검색', '', '', ''], ['', 'nad-9', '쇼핑검색', '', '', '미매핑(자동 추가) | C / G']] });
const d = call('buildReportData_(v, m, new Date("2026-11-02T01:00:00Z"))', { v: verdicts, m: mapping });

assert.deepStrictEqual(d.weeks, ['2026-10-19', '2026-10-26']);
assert.strictEqual(d.latestWeek, '2026-10-26');
assert.strictEqual(d.weekLabels['2026-10-26'], '10/26~11/1');
assert.strictEqual(d.generatedAt, '2026-11-02 10:00');                       // 서울 시간
assert.strictEqual(d.rows.length, 3);
const w2 = d.rows.find((r) => r.workId === 'W2');
assert.strictEqual(w2.ctr, null);                                            // 빈 숫자는 null
assert.strictEqual(w2.ratio, null);
assert.strictEqual(w2.diagnosis, '');                                        // 알림 아니면 진단 없음
const w1 = d.rows.find((r) => r.workId === 'W1' && r.week === '2026-10-26');
assert.strictEqual(w1.ctr, 0.01);
assert.match(w1.diagnosis, /입찰·순위 확인 먼저/);                              // 알림 대상은 진단 포함
assert.deepStrictEqual(d.unmapped.map((u) => u.creativeId), ['nad-9']);
JSON.stringify(d);                                                            // 직렬화 가능
console.log('OK 보고서 데이터 (주차/라벨/null/진단/미매핑)');

const empty = call('buildReportData_([], [], new Date())');
assert.deepStrictEqual(empty.weeks, []);
assert.strictEqual(empty.latestWeek, '');
console.log('OK 빈 데이터');
console.log('\nALL PASSED');

// 실행: node tests/mapping.test.js  (매핑 탭 입력 규칙 점검)
const assert = require('assert');
const { load } = require('./helpers');
const { call } = load(['Config.gs', 'Collect.gs', 'Verdict.gs', 'Mapping.gs']);

const M = (row, workId, creativeId, o = {}) => Object.assign(
  { row, workId, creativeId, product: '쇼핑검색', postedAt: '', replacedAt: '', memo: '' }, o);
const check = (rows) => call('validateMapping_(m)', { m: rows });
const has = (issues, level, row, re) => issues.some((i) => i.level === level && i.row === row && re.test(i.msg));

// 정상: 교체가 월요일로 딱 이어짐
let r = check([
  M(2, 'SH_1005_A', 'nad-1', { postedAt: '2026-10-05', replacedAt: '2026-10-19' }),
  M(3, 'SH_1019_B', 'nad-1', { postedAt: '2026-10-19' }),
  M(4, 'SH_1005_C', 'nad-2'),
]);
assert.deepStrictEqual(r, []);
console.log('OK 정상 교체는 문제 없음');

// 미매핑 안내, 소재 ID 없음
r = check([M(2, '', 'nad-9'), M(3, 'X', '')]);
assert.ok(has(r, '안내', 2, /작업물 ID를 채워/));
assert.ok(has(r, '오류', 3, /소재 ID가 비어/));
console.log('OK 미매핑 안내 / 소재 ID 누락');

// 날짜: 글자(오류), 월요일 아님(경고), 교체일 <= 게시일(오류), 없는 날짜
r = check([
  M(2, 'A', 'nad-1', { postedAt: '2026.10.19' }),
  M(3, 'B', 'nad-2', { postedAt: '2026-10-21' }),
  M(4, 'C', 'nad-3', { postedAt: '2026-10-19', replacedAt: '2026-10-12' }),
  M(5, 'D', 'nad-4', { postedAt: '2026-02-30' }),
]);
assert.ok(has(r, '오류', 2, /날짜\(yyyy-mm-dd\)가 아닙니다/));
assert.ok(has(r, '경고', 3, /월요일이 아닙니다/));
assert.ok(has(r, '오류', 4, /게시일.*보다 늦어야/));
assert.ok(has(r, '오류', 5, /날짜\(yyyy-mm-dd\)가 아닙니다/));
console.log('OK 날짜 형식 / 월요일 / 순서');

// 같은 소재 ID의 기간: 겹침(오류), 교체일 비어 있음(오류), 공백(경고)
r = check([
  M(2, 'A', 'nad-1', { postedAt: '2026-10-05', replacedAt: '2026-10-26' }),
  M(3, 'B', 'nad-1', { postedAt: '2026-10-19' }),                         // 10/19~10/26 겹침
  M(4, 'C', 'nad-2', { postedAt: '2026-10-05' }),                         // 교체일 비어 있는데 뒤에 또 있음
  M(5, 'D', 'nad-2', { postedAt: '2026-10-19' }),
  M(6, 'E', 'nad-3', { postedAt: '2026-10-05', replacedAt: '2026-10-12' }),
  M(7, 'F', 'nad-3', { postedAt: '2026-10-26' }),                         // 10/12~10/26 공백
]);
assert.ok(has(r, '오류', 3, /2행과 3행의 기간이 겹칩니다/));
assert.ok(has(r, '오류', 5, /4행과 5행의 기간이 겹칩니다/));
assert.ok(has(r, '경고', 7, /사이 기간의 성과는 어느 작업물에도 들어가지 않습니다/));
console.log('OK 기간 겹침 / 공백');

// 작업물 ID에 서로 다른 광고 상품, 공백, 텍스트 상품, 허용 목록 밖 상품
r = check([
  M(2, 'W1', 'nad-1', { product: '쇼핑검색' }),
  M(3, 'W1', 'nad-2', { product: '파워링크 확장소재' }),
  M(4, 'W 2', 'nad-3'),
  M(5, 'W3', 'nad-4', { product: '파워링크 텍스트' }),
  M(6, 'W4', 'nad-5', { product: '브랜드검색' }),
]);
assert.ok(has(r, '오류', 2, /서로 다른 광고 상품/) && has(r, '오류', 3, /서로 다른 광고 상품/));
assert.ok(has(r, '경고', 4, /공백이 있습니다/));
assert.ok(has(r, '경고', 5, /텍스트 소재는 판정에서 제외/));
assert.ok(has(r, '경고', 6, /목록.*에 없습니다/));
console.log('OK 작업물 ID 규칙 / 광고 상품 값');

// 같은 작업물 ID를 여러 소재에 쓰는 것은 허용 (성과 합산)
assert.deepStrictEqual(check([M(2, 'W1', 'nad-1'), M(3, 'W1', 'nad-2')]), []);
console.log('OK 한 작업물 ID에 여러 소재 허용');

// 점검 결과 요약 문구
const txt = call('formatMappingIssues_(i)', { i: check([M(2, '', 'nad-9'), M(3, 'A', 'nad-1', { postedAt: '2026.10.19' })]) });
assert.match(txt, /^오류 1건 \/ 경고 0건 \/ 할 일\(미매핑\) 1건/);
assert.strictEqual(call('formatMappingIssues_([])'), '오류 0건 / 경고 0건 / 할 일(미매핑) 0건\n매핑 탭이 규칙에 맞습니다.');
console.log('OK 요약 문구');
console.log('\nALL PASSED');

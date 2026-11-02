// 실행: node tests/manifest.test.js
// 코드가 쓰는 Apps Script 서비스에 필요한 권한이 매니페스트에 모두 있는지 확인한다.
// (oauthScopes를 명시하면 자동 감지가 꺼져서, 빠진 권한은 실행 시 권한 오류가 된다)
const assert = require('assert'), fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'src');
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'appsscript.json'), 'utf8'));
const code = fs.readdirSync(src).filter((f) => f.endsWith('.gs')).map((f) => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');

assert.strictEqual(manifest.timeZone, 'Asia/Seoul');
assert.strictEqual(manifest.runtimeVersion, 'V8');
const S = 'https://www.googleapis.com/auth/';
const need = [
  [/SpreadsheetApp\./, 'spreadsheets'],
  [/SpreadsheetApp\.getUi|HtmlService/, 'script.container.ui'],
  [/UrlFetchApp\./, 'script.external_request'],
  [/ScriptApp\./, 'script.scriptapp'],
  [/MailApp\./, 'script.send_mail'],
  [/Session\.get(Effective|Active)User/, 'userinfo.email'],
];
need.forEach(([re, scope]) => {
  if (re.test(code)) assert.ok(manifest.oauthScopes.includes(S + scope), `코드가 쓰는 서비스에 필요한 권한 누락: ${scope}`);
});
console.log('OK 매니페스트 권한 (' + manifest.oauthScopes.length + '개) / 타임존');
console.log('\nALL PASSED');

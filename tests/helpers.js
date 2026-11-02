// Apps Script(.gs) 파일을 가짜 전역 환경에서 불러오는 테스트 도우미
const vm = require('vm'), fs = require('fs'), path = require('path');

function load(files, globals = {}) {
  const ctx = Object.assign({
    Logger: { log() {} },
    Utilities: { formatDate: () => '2026-11-02 09:00', sleep() {} },
  }, globals);
  vm.createContext(ctx);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  }
  // expr 를 실행하고 결과를 JSON 으로 정규화해 돌려준다 (vm 간 프로토타입 차이 제거)
  const call = (expr, vars = {}) => {
    Object.assign(ctx, vars);
    const out = vm.runInContext(`JSON.stringify((function(){ return (${expr}); })())`, ctx);
    return out === undefined ? undefined : JSON.parse(out);
  };
  return { ctx, call };
}
module.exports = { load };

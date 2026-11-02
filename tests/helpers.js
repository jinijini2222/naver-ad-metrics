// Apps Script(.gs) 파일을 가짜 전역 환경에서 불러오는 테스트 도우미
const vm = require('vm'), fs = require('fs'), path = require('path');

function load(files, globals = {}) {
  const ctx = Object.assign({
    Logger: { log() {} },
    Utilities: {
      sleep() {},
      // Asia/Seoul(+9) 기준 포맷만 흉내 낸다
      formatDate(d, tz, fmt) {
        const k = new Date(d.getTime() + 9 * 3600 * 1000), p = (n) => String(n).padStart(2, '0');
        return fmt.replace('yyyy', k.getUTCFullYear()).replace('MM', p(k.getUTCMonth() + 1)).replace('dd', p(k.getUTCDate()))
          .replace('HH', p(k.getUTCHours())).replace('mm', p(k.getUTCMinutes()));
      },
    },
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

/** 서명 함수 단위 확인: 같은 입력이면 같은 값이 나와야 한다. */
function testSignature() {
  var sig = naverSignature_('1700000000000', 'GET', '/ncc/campaigns', 'test-secret');
  Logger.log('signature = ' + sig);
  Logger.log('동일 입력 재계산 일치: ' + (sig === naverSignature_('1700000000000', 'GET', '/ncc/campaigns', 'test-secret')));
}

/** 1단계 완료 조건: 캠페인 목록이 로그에 출력된다. */
function testListCampaigns() {
  var campaigns = naverGet_(ENDPOINTS.CAMPAIGNS);
  Logger.log('캠페인 ' + campaigns.length + '개');
  campaigns.forEach(function (c) {
    Logger.log([c.nccCampaignId, c.name, c.campaignTp, c.status].join(' | '));
  });
  try {
    SpreadsheetApp.getActive().toast('캠페인 ' + campaigns.length + '개 조회 성공 (로그 확인)', '네이버 광고', 5);
  } catch (e) { /* 시트 UI가 없는 실행 환경 */ }
}

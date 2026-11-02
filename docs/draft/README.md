# 화면 초안 (목업) 배포

`automation-screens.html`은 외부 파일·주소를 쓰지 않는 한 장짜리 HTML입니다. 모든 수치는 **샘플 데이터**이며 실제 값이 아닙니다.

## Vercel에 올리기

`vercel.json`이 `/`를 `automation-screens.html`로 연결하고, 검색 엔진 색인을 막는 헤더(`X-Robots-Tag: noindex`)를 붙입니다.

```bash
cd docs/draft
npx vercel --prod
```

처음 실행하면 로그인과 프로젝트 연결 질문이 나옵니다. 토큰을 쓰는 환경에서는 `VERCEL_TOKEN`을 환경 변수로 두고 `npx vercel --prod --yes --token "$VERCEL_TOKEN"`으로 실행합니다. 토큰은 대화·코드·저장소에 적지 않습니다.

## 알아둘 점

- 배포된 주소는 기본적으로 **누구나 열 수 있습니다**. 색인 방지 헤더는 검색 노출을 줄일 뿐 접근을 막지 않습니다. 팀원에게만 보이게 하려면 Vercel 프로젝트 설정의 Deployment Protection을 켜세요.
- 내용은 샘플이지만 화면 구성과 용어(캠페인·소재·규격 공지 예시)가 드러납니다. 공개해도 되는지 확인하고 올리세요.
- 이 폴더만 배포합니다. 저장소의 다른 파일(`src/`, 시트 코드, 실제 데이터)은 올라가지 않습니다.
- 목업을 고친 뒤에는 같은 명령으로 다시 배포하면 같은 주소가 갱신됩니다(`--prod`).

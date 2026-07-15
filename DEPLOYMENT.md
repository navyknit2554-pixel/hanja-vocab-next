# Vercel 테스트 배포 체크리스트

## 1. Vercel 프로젝트 설정

- Framework Preset: `Next.js`
- Root Directory: 이 프로젝트 폴더
- Build Command: `npm run build`
- Output Directory: 비워두기

배포 전에 로컬에서 아래 명령을 먼저 실행합니다.

```powershell
npm.cmd run secrets:make
npm.cmd run deploy:check
npm.cmd run build
```

`npm.cmd run secrets:make`가 출력하는 `ADMIN_SESSION_SECRET`, `STUDENT_SESSION_SECRET`, `HANJA_LICENSE_SECRET` 값을 Vercel 환경변수에 그대로 넣으면 됩니다.

## 2. 필수 환경변수

Vercel 프로젝트의 Settings > Environment Variables에 아래 값을 넣습니다.

```text
POSTGRES_URL=Neon에서 복사한 연결 문자열
ADMIN_PASSWORD=선생님이 사용할 관리자 비밀번호
ADMIN_SESSION_SECRET=길고 무작위인 문자열
STUDENT_SESSION_SECRET=길고 무작위인 문자열
HANJA_LICENSE_SECRET=길고 무작위인 문자열
```

운영 배포에서는 `ADMIN_PASSWORD=1234`, `ADMIN_SESSION_SECRET=change-this-before-deploy`, `STUDENT_SESSION_SECRET=change-this-before-deploy-too`를 사용하면 로그인이 막힙니다.

## 3. 배포 후 확인 주소

- 학생 화면: `/student`
- 관리자 화면: `/admin`
- 배포 상태 점검: `/api/health`

`/api/health`에서 `ok: true`, `storage: "postgres"`가 나오면 테스트 배포 기본 조건은 통과입니다.

## 4. 테스트 순서

1. `/api/health`에서 환경변수와 DB 연결 상태를 확인합니다.
2. `/admin`에 로그인합니다.
3. 학생 계정 2~3개를 생성합니다.
4. `/student`에서 생성한 계정으로 로그인합니다.
5. 학습과 퀴즈를 끝까지 진행합니다.
6. 다시 `/admin`에서 학생별 학습 완성 여부와 응시 횟수를 확인합니다.

## 5. 주의

Vercel에서는 파일 저장소가 영구 저장용으로 적합하지 않습니다. `POSTGRES_URL` 없이 배포하면 화면은 열릴 수 있지만 학생 계정과 학습 기록이 안정적으로 유지되지 않습니다.

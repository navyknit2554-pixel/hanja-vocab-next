# 한자 어휘 학습 프로그램

학생용 학습 화면과 관리자 화면을 분리한 Next.js 초안입니다. Vercel 배포를 기준으로 만들었습니다.

## 실행

이 폴더에서 실행합니다.

```powershell
cd C:\Users\demps\Documents\Codex\2026-07-01\zmff\outputs\hanja-vocab-next
npm.cmd run dev
```

## 화면

- `/student`: 학생 로그인 및 학습
- `/admin`: 학생 계정, 일차별 한자, 학습도 관리
- `/api/state`: 관리자용 상태 API

## 저장 방식

로컬 개발에서는 `.data/app-state.json` 파일에 저장됩니다.

Vercel 운영에서는 `POSTGRES_URL` 또는 `DATABASE_URL` 환경변수가 있으면 Postgres 저장소를 자동으로 사용합니다. Vercel Marketplace에서 Neon 연결 문자열을 프로젝트 환경변수에 넣으면 됩니다.

현재 DB 구조는 `app_state` 테이블의 JSON 값 칸에 전체 상태를 저장하는 단순 구조입니다. MVP를 빠르게 운영하기 위한 방식이고, 학생 수가 많아지면 학생, 커리큘럼, 제출 기록을 별도 테이블로 나누면 됩니다.

## 관리자 로그인

관리자 화면 `/admin`은 비밀번호로 잠겨 있습니다.

로컬 기본 비밀번호는 `1234`입니다. 배포 전 Vercel 환경변수에 아래 값을 꼭 설정하세요.

- `ADMIN_PASSWORD`: 관리자 화면 비밀번호
- `ADMIN_SESSION_SECRET`: 관리자 로그인 쿠키 서명용 긴 무작위 문자열
- `STUDENT_SESSION_SECRET`: 학생 로그인 쿠키 서명용 긴 무작위 문자열

운영 배포(`NODE_ENV=production`)에서는 `ADMIN_PASSWORD=1234` 또는 기본 secret 값이 남아 있으면 로그인이 막히고 설정 안내 메시지가 표시됩니다.

## 데이터 관리

- 관리 화면에서 전체 백업 JSON을 내려받고 다시 가져올 수 있습니다.
- AI 결과, 직접 입력 JSON, 백업 가져오기는 필수 필드 검사를 거칩니다.
- 한자에는 `character`, `sound`, `meaning`, `origin`, `vocab`이 필요합니다.
- 어휘에는 `hanja`, `word`, `meaning`, `examples`가 필요합니다.

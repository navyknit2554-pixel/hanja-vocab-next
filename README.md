# Chologi Hanja Vocab v2

학생, 강사, 커리큘럼, 한자, 어휘, 용례, 학습도를 각각 테이블로 분리한 새 버전입니다.

## 현재 기능

- 학생 로그인: 강사 코드, 아이디, 비밀번호로 로그인
- 학생 학습: 현재 일차 한자/어휘만 불러와 카드 학습과 문제 풀이 진행
- 학생 비밀번호: 학생 추가 시 전화번호를 넣으면 `010`을 제외한 번호로 자동 설정
- 관리자 로그인: 마스터 비밀번호 또는 기존 라이선스 키 사용
- 관리자 학생 관리: 추가, 수정, 삭제, 로그아웃
- 일차별 학습도: 학생별 완료, 복습, 진행, 현재 일차 표시
- 한자·어휘 관리: 현재 일차의 국어원 어휘·뜻·용례만 직접 가져오기
- PWA: 초록이 아이콘과 홈화면 추가용 manifest

## 로컬 실행

처음 한 번만 환경변수를 저장합니다.

```powershell
cd "C:\Users\demps\Documents\Codex\2026-07-01\zmff\outputs\hanja-vocab-v2"
powershell -ExecutionPolicy Bypass -File scripts\setup-local-env.ps1
```

평소 실행은 아래 명령을 사용합니다. 3000 포트가 꼬였을 때도 이 명령을 먼저 씁니다.

```powershell
cd "C:\Users\demps\Documents\Codex\2026-07-01\zmff\outputs\hanja-vocab-v2"
npm.cmd run dev:clean
```

학생 화면:

```text
http://localhost:3000/student
```

관리자 화면:

```text
http://localhost:3000/admin
```

DB 연결 확인:

```text
http://localhost:3000/api/health
```

## 데이터 확인

학생이나 한자 구성이 사라진 것처럼 보일 때 먼저 확인합니다.

```powershell
cd "C:\Users\demps\Documents\Codex\2026-07-01\zmff\outputs\hanja-vocab-v2"
npm.cmd run check:data
```

## 기존 데이터 가져오기

한자 구성이 이미 들어가 있다면 학생과 학습도만 가져옵니다.

```powershell
cd "C:\Users\demps\Documents\Codex\2026-07-01\zmff\outputs\hanja-vocab-v2"
$env:SOURCE_DATABASE_URL="기존 데이터가 들어 있는 Supabase 연결 문자열"
$env:SUPABASE_DATABASE_URL="새 v2 앱이 사용하는 Supabase 연결 문자열"
npm.cmd run import:legacy-students -- --write
```

한자 구성이 비어 있을 때만 먼저 실행합니다.

```powershell
npm.cmd run import:legacy-curriculum -- --write
```

## 배포 환경변수

Vercel 프로젝트 Settings > Environment Variables에 아래 값을 넣습니다.

```text
SUPABASE_DATABASE_URL
KOREAN_DICT_API_KEY
HANJA_LICENSE_SECRET
ADMIN_PASSWORD
STUDENT_SESSION_SECRET
```

새 세션 비밀키가 필요하면 아래 명령으로 만들 수 있습니다.

```powershell
npm.cmd run secrets:make
```

배포 직전 점검:

```powershell
npm.cmd run deploy:check
npm.cmd run build
```

배포 후 확인:

```text
https://배포주소/api/health
https://배포주소/admin
https://배포주소/student
```

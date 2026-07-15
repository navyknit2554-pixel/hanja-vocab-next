# GitHub 연결 순서

이 프로젝트는 Vercel에 폴더 업로드 방식으로 테스트 배포를 한 상태입니다. 앞으로 기능을 수정할 때 편하게 재배포하려면 GitHub 저장소로 올린 뒤 Vercel 프로젝트를 그 저장소에 연결하는 방식이 좋습니다.

## 1. GitHub 저장소 만들기

GitHub에서 새 저장소를 만듭니다.

- Repository name: `hanja-vocab-next`
- Public/Private: 원하는 방식 선택
- README, .gitignore, license는 추가하지 않기

## 2. 로컬 프로젝트 올리기

이 폴더에서 아래 명령을 실행합니다.

```powershell
cd C:\Users\demps\Documents\Codex\2026-07-01\zmff\outputs\hanja-vocab-next
git remote add origin https://github.com/사용자이름/hanja-vocab-next.git
git branch -M main
git push -u origin main
```

## 3. Vercel에 GitHub 저장소 연결

Vercel에서 새 프로젝트를 만들 때 GitHub 저장소 `hanja-vocab-next`를 Import합니다.

- Framework Preset: `Next.js`
- Build Command: `npm run build`
- Environment Variables:
  - `POSTGRES_URL`
  - `ADMIN_PASSWORD`
  - `ADMIN_SESSION_SECRET`
  - `STUDENT_SESSION_SECRET`

## 4. 연결 후 확인

배포가 끝나면 아래 주소를 확인합니다.

```text
/api/health
```

다음 값이면 정상입니다.

```json
{
  "ok": true,
  "storage": "postgres",
  "warnings": []
}
```

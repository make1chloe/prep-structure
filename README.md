# 클로이영어 학습관리 웹앱

Next.js(App Router) + Supabase 로 만든 학원 학습관리 시스템입니다.

- **DB 스키마**: `supabase/migrations/` (적용법은 `supabase/README.md`)
- **앱**: 로그인 → 대시보드 → 학생 관리 (MVP 1단계)

---

## 로컬 실행

```bash
npm install
cp .env.local.example .env.local   # 값 채우기 (아래 참고)
npm run dev                        # http://localhost:3000
```

`.env.local` 에 Supabase 접속 정보를 넣습니다 (Supabase 대시보드 > Project Settings > API):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

## Vercel 배포

1. https://vercel.com 접속 → GitHub 로그인 → **Add New… > Project**
2. `make1chloe/prep-structure` 저장소 선택 → **Import**
3. Framework 는 **Next.js** 자동 감지됨. **Environment Variables** 에 위 두 값 추가:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy** 클릭 → 1~2분 후 `https://...vercel.app` 주소 생성

## 첫 로그인 계정 만들기 (원장)

앱에는 아직 회원가입이 없습니다. 원장 계정은 Supabase에서 직접 만듭니다:

1. Supabase > **Authentication > Users > Add user**
   - Email / Password 입력 → **Create user**
2. Supabase > **SQL Editor** 에서 방금 만든 계정을 원장으로 지정:
   ```sql
   update public.profiles
   set role = 'principal', name = '클로이'
   where id = (select id from auth.users where email = '내이메일@example.com');
   ```
3. 배포된 앱에서 그 이메일/비밀번호로 로그인 → 대시보드 진입

## 구글 로그인 (선택)

Supabase > **Authentication > Providers > Google** 활성화 후,
**URL Configuration > Redirect URLs** 에 `https://<내앱>.vercel.app/auth/callback` 추가.

---

## 폴더 구조

```
app/            화면 (로그인 / 대시보드 / 학생)
components/      공용 컴포넌트 (TopBar)
lib/supabase/    Supabase 클라이언트 (브라우저/서버/미들웨어)
middleware.js    로그인 세션 관리 + 접근 보호
supabase/        DB 스키마(SQL) + 설정 가이드
```

## 다음 단계

- 노션 기존 데이터 이관
- 교재 관리 · 통합진도관리 · 데일리리포트 · 출결 화면
- 내신대비 트랙 (`0002_naesin_schema.sql`)

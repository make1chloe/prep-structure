# 클로이영어 웹앱 — Supabase 설정 가이드

이 폴더에는 데이터베이스 스키마(SQL)가 들어 있습니다. 아래 순서대로 하면 됩니다.

## 1. Supabase 프로젝트 만들기 (원장님이 직접)

1. https://supabase.com 접속 → **Start your project** → 구글로 로그인(권장)
2. **New project** 클릭
   - Name: `chloe-english` (아무 이름이나)
   - Database Password: 안전한 비밀번호 설정 후 **따로 저장** (나중에 필요)
   - Region: **Northeast Asia (Seoul)** 선택 (한국에서 빠름)
3. 생성까지 1~2분 대기

## 2. 스키마 적용하기

1. 프로젝트 좌측 메뉴 **SQL Editor** 클릭 → **New query**
2. 이 폴더의 `migrations/0001_core_schema.sql` 파일 **전체 내용을 복사**해서 붙여넣기
3. 우측 하단 **Run** 클릭 → "Success" 뜨면 완료
4. 좌측 **Table Editor** 에서 테이블들(students, classes, textbooks …)이 생겼는지 확인

## 3. 접속 키 확인 (개발 연결용)

좌측 **Project Settings → API** 에서 아래 두 값을 확인해두세요 (나중에 앱 연결에 사용):

- **Project URL** (예: `https://xxxx.supabase.co`)
- **anon public key**
- **service_role key** (서버 전용 — 절대 외부 노출 금지)

> 이 키들은 채팅창에 붙여넣지 마세요. 앱 배포(Vercel) 환경변수에 넣게 됩니다.

## 4. 구글 로그인 켜기 (선택 — 나중에 해도 됨)

**Authentication → Providers → Google** 활성화. 설정은 앱 연결 단계에서 함께 진행합니다.

---

## 스키마 구성 (0001_core_schema.sql)

MVP 1단계 = **정규수업 트랙**의 코어 테이블입니다.

| 영역 | 테이블 |
|---|---|
| 사람·계정 | `profiles`(역할), `students`, `parent_student`, `student_electives` |
| 반·수업 | `classes`, `class_students` |
| 교재·커리큘럼 | `textbooks`, `textbook_units`(단원 트리), `unit_sections`, `learning_items`, `student_curriculum` |
| 오늘의 운영(허브) | `daily_assignments`, `tests`(단어/문장), `attendance`, `daily_reports` |

- 로그인 계정(`auth.users`)이 생기면 `profiles` 가 자동 생성됩니다.
- RLS(행 보안) 켜져 있고, **스태프(원장/강사/조교) 전체 접근** 기본 정책이 들어 있습니다. 학생/학부모 열람 정책은 다음 단계에서 세분화합니다.

## 다음 마이그레이션 (예정)

- `0002_naesin_schema.sql` — 내신대비(자료 유형/시험/범위/학생 배정)
- `0003_intake_schedule.sql` — 신규생 유입(leads/상담) · 일정 · 할일
- 노션 기존 데이터 이관 스크립트

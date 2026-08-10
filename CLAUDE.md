# 클로이영어 앱 — 작업 규칙

Next.js 14 (App Router) + Supabase. `main` 에 푸시하면 Vercel 로 배포된다.

## 대원칙 — 고치기 전에, 전체와의 정합성을 검토한다

원장님 (2026-08-09): 「요구를 단편적으로 반영하다 보니 예외 규칙이 너무
많아져서 제대로 작동이 안 되는 것 같아.」 실제로 그랬다. 그래서 수정 하나를
넣을 때마다 아래를 거친다 (자세한 것은 `docs/PRINCIPLES.md` 원칙 4):

1. **같은 판단이 이미 있는지 grep 으로 먼저 찾는다.** 있으면 그곳을 쓴다 —
   비슷한 것을 하나 더 만들지 않는다.
2. **규칙을 고치면 소비처를 전부 찾아** 하나하나 어긋나지 않는지 본다.
3. **예외가 세 번째로 필요해지면 멈춘다** — 예외가 아니라 설계가 틀렸다는
   신호다. 규칙 자체를 다시 세운다.
4. **도메인이 걸린 수정은 실제 세계부터 조사한다**
   (`docs/시험-일정-조사.md` · `docs/영어시험-특징.md`).
5. **고친 뒤 전수 검사 + 실제 화면**: `bash scripts/check-pages.sh`,
   `bash scripts/e2e/run.sh`, 화면이 걸리면 브라우저로 찍어 눈으로 본다.
   빌드가 통과해도 화면은 터질 수 있다.
6. **한 곳으로 모은 규칙은 `scripts/check-dup.mjs` 의 ONE_PLACE 에 등록**해서
   다시 흩어지면 검사가 잡게 한다.

## 판단이 사는 곳 (여기 말고 다른 데 만들지 말 것)

| 판단 | 곳 |
|---|---|
| 시험 이름의 갈래 (내신·모의·수능·수행) | `lib/examKind.js` |
| 회차의 갈래·범위 재촉 | `lib/examList.js` |
| 이 아이가 이 시험을 보나 | `lib/who.js takesExam` |
| 학교 이름 견주기 | `lib/schoolName.js` |
| 권한 (원장·강사·조교) | `lib/guard.js` + `lib/roles.js` |
| SQL 오류 판별 | `lib/sqlError.js` |
| 학년 목록·정규화 | `lib/grades.js` |
| 받아오기 동기화 (이번 목록에 없는 나이스 줄은 치운다) | `lib/exams.js staleAfterImport` |

## 늘 지키는 것

- 설명은 짧게 (원장님 요청). 결론 먼저.
- **같은 값을 두 번 입력하게 하지 않고, 같은 정보를 두 벌의 코드로 그리지
  않는다** (PRINCIPLES.md 원칙 1). 줄·문구·계산은 한 벌로 만들고 화면은
  그것을 가져다 쓴다. 두 벌은 반드시 어긋난다.
- 마이그레이션은 멱등하게 — `scripts/check-sql.sh` 가 SETUP_ALL 을 3번 돌린다.
- 앱 코드를 테스트용으로 고치지 않는다 (테스트 전용 뒷문 금지).
- 커밋은 작업 브랜치와 `main` 둘 다에 푸시 (원장님이 허락함).
- e2e: 로컬 Postgres :55440 + PostgREST :55441 + 인증 흉내 :55442,
  `bash scripts/e2e/up.sh` 로 세우고 앱은 :3300. Playwright 는
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  **한글 파일 경로는 setInputFiles 가 조용히 실패한다** — ASCII 이름으로 복사.

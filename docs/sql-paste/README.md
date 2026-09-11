# 실 DB 에 붙여넣을 SQL — 원장님용

Supabase → **SQL Editor** → **New query** → 파일을 통째로 붙여넣고 **Run**.

| 파일 | 무엇이 들어가나 | 언제 |
|---|---|---|
| `0156-0159.sql` | 0156 재원생 화면(달 넘기기·그 달 출결 요약) · 0157 문자 갈래 · 0158 🃏 클래스카드 건너뜀 · 0159 🏫 학교 홈페이지 받은 때 | **지금** — 실 DB 는 0155 까지 들어가 있습니다 |

**통째로 한 트랜잭션입니다** — 하나라도 틀리면 아무것도 안 들어갑니다. 실패하면 고쳐서 **그대로 다시** 붙여넣으면 됩니다.
맨 끝에 `notify pgrst, 'reload schema';` 가 이미 들어 있습니다(표에 칸을 더해도 화면이 그 칸을 못 쓰던 일 — 원장님 9/10 밤).

이 파일은 `supabase/migrations/` 의 원본을 **번호 차례대로 이어 붙인 것**이고,
`node scripts/build-real-db-sql.mjs 0156_student_month.sql 0157_sms_kinds.sql 0158_cc_skip.sql 0159_site_import.sql` 로 다시 만듭니다.

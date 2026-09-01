-- ─────────────────────────────────────────────────────────────
-- 0005 · 권한
--
-- ⚠️ **접근 규칙만으로는 아무 일도 안 일어난다.**
--    규칙만 있고 권한이 없으면 → 아무도 못 본다 (검사가 이걸 잡았다)
--    권한만 있고 규칙이 없으면 → 다 보인다
--    **둘 다** 있어야 하고, **검사가 그 둘을 갈라야** 한다.
--
-- ⚠️ 여기서 `authenticated` 에 권한을 줘도 **PostgREST 로는 아직 안 열린다** —
--    노출 스키마 목록에 `v2` 를 넣는 것은 **전환일**에 한다(계획 6단계).
-- ─────────────────────────────────────────────────────────────
grant usage on schema v2 to authenticated, anon, service_role;

-- 읽기는 모든 표에. **막는 것은 접근 규칙이 한다**
grant select on all tables in schema v2 to authenticated;

-- 쓰기는 **줄 자리만** — 규칙이 다시 거른다
grant insert, update, delete on
  v2.profiles, v2.students, v2.parent_student,
  v2.classes, v2.class_schedule, v2.class_member
to authenticated;

-- 감사 기록은 **아무도 못 고친다.** 트리거(security definer)만 넣는다
revoke insert, update, delete on v2.audit from authenticated;
grant usage, select on sequence v2.audit_id_seq to authenticated;

-- 파기 목록은 원장만 — 접근 규칙이 막지만 권한도 안 준다
revoke insert, update, delete on v2.purge_map from authenticated;

-- 함수
grant execute on function v2.today(), v2.now_seoul(), v2.me(),
  v2.is_staff(), v2.my_students(),
  v2.class_roster(uuid,date), v2.student_classes(uuid,date)
to authenticated;

-- 앞으로 만들 표에도 저절로 붙게
alter default privileges in schema v2 grant select on tables to authenticated;

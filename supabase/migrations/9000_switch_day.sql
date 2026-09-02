-- ═══════════════════════════════════════════════════════════════════════════
-- 9000 · 전환일에 **한 번에** 켜는 것 — v2 밖을 만지는 자리를 여기 한 곳에 모은다
--
-- ⚠️⚠️ **이 파일은 평소에 돌리지 않는다.** `scripts/_ap.mjs` 로 돌리지 마라.
--    여기 든 것은 전부 `v2` 밖이라(계획 0단계 9번) 공사 중에 건드리면
--    **구앱이 그날 저녁부터 반쯤 죽는다** — 계정 발급이 멈추거나 숙제 사진이 안 올라간다.
--    그리고 그 사고는 **도메인 원복으로 못 되돌린다.**
--
-- ⚠️ 켜는 것마다 **되돌리는 줄을 짝으로** 적어 두었다 (계획 6단계 표).
-- ⚠️ 수업 시간 밖에 돌린다 — PostgREST 노출을 바꿀 때 잠깐 끊길 수 있다.
--
-- 돌리는 법:  psql "$DATABASE_URL" -f supabase/migrations/9000_switch_day.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① PostgREST 가 v2 를 내보내게 한다 ────────────────────────────────────
-- 되돌리기: 아래 목록에서 v2 를 빼고 다시 알린다
-- ⚠️ 지금은 public, graphql_public 둘뿐이다. **public 을 빼지 마라** — 구앱이 그 자리에서 죽는다
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, v2';
alter role anon          set pgrst.db_schemas = 'public, graphql_public, v2';
alter role authenticated set pgrst.db_schemas = 'public, graphql_public, v2';
alter role service_role  set pgrst.db_schemas = 'public, graphql_public, v2';
notify pgrst, 'reload config';

-- ── ② 계정이 생기면 v2 프로필도 만든다 ────────────────────────────────────
-- ⚠️ `public` 용 옛 트리거는 **끄지 않는다.** 되돌릴 때 필요하다 (계획 6단계 표).
-- ⚠️ 이 트리거가 v2 제약에 걸리면 **구앱의 계정 발급이 그 자리에서 멈춘다** —
--    「학생을 등록하는 순간 계정이 저절로 발급」되므로 신규 상담 도중 등록 전환이 끊긴다.
--    그래서 **어떤 경우에도 안 던지게** 짠다.
create or replace function v2.on_auth_user() returns trigger
language plpgsql security definer set search_path = v2, public as $$
begin
  begin
    insert into v2.profiles (id, role, name, login_id)
    values (new.id, 'student', coalesce(new.raw_user_meta_data->>'name', ''),
            split_part(new.email, '@', 1))
    on conflict (id) do nothing;
  exception when others then
    -- ⚠️ 삼킨다. 여기서 던지면 **구앱의 계정 발급이 통째로 멈춘다**
    raise warning 'v2.on_auth_user 실패(무시함): %', sqlerrm;
  end;
  return new;
end $$;

create trigger v2_on_auth_user after insert on auth.users
  for each row execute function v2.on_auth_user();
-- 되돌리기: drop trigger v2_on_auth_user on auth.users;

-- ── ③ 자료함 버킷과 접근 정책 ────────────────────────────────────────────
-- 되돌리기: 아래 policy 셋을 drop 한다 (버킷은 파일이 들어 있으면 지우지 않는다)
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('files', 'files', false,
        array['image/jpeg','image/pjpeg','image/png','image/heic','image/heif','image/webp',
              'image/gif','image/bmp','image/tiff',
              'application/pdf',
              'application/haansofthwp','application/x-hwp','application/vnd.hancom.hwp',
              'application/vnd.hancom.hwpx',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-powerpoint',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'text/plain','text/csv'])
on conflict (id) do nothing;

alter table storage.objects enable row level security;

-- 올리기 — 로그인한 사람. 무엇을 올렸는지는 v2.file 이 적는다
drop policy if exists files_insert on storage.objects;
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files');

-- 읽기 — v2.file 의 접근 규칙을 **그대로 빌려 쓴다.** 여기서 다시 판단하면 두 벌이 된다(원칙 1)
drop policy if exists files_read on storage.objects;
create policy files_read on storage.objects for select to authenticated
  using (bucket_id = 'files'
         and exists (select 1 from v2.file f where f.path = storage.objects.name));

-- ⚠️ delete·update 정책은 일부러 안 만든다 — 파기는 service_role 이 storagePaths 를 받아 지운다
-- ── ④ 켠 뒤 반드시 확인할 것 (손으로) ────────────────────────────────────
--   1. 원장님 폰에서 **설치된 앱 아이콘으로 열어** 새 화면이 뜨는가
--   2. `zz_시험_` 계정에 시험 알림을 쏴서 뜨고, **눌렀을 때 맞는 화면이 열리는가**
--      (옛 서비스워커가 아직 그 폰을 지배하고 있으면 여기서 드러난다)
--   3. 학생 한 명을 실제로 등록해 **계정 발급 → 로그인 → 자기 화면**까지 끝을 본다
--      ⚠️ ②가 안 걸리면 그 아이는 로그인은 되는데 v2 에 프로필이 없어 역할이 없고,
--         **오류 없이 빈 화면**이 된다. 조용해서 며칠 뒤에나 발견된다

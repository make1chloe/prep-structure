-- 0093: 화면 안내 문구를 **원장님이 직접 적는다**
--
-- 원장님 (2026-08-06)
--   「메뉴에 대한 안내는 설정페이지에서 내가 직접 적게해줘 특히 학생학부모용」
--
-- 지금 화면의 안내 문구는 전부 내가 코드에 박아 넣은 것이다.
--   「숙제를 누르면 하는 법이 나와요」  「집에서 폰을 못 쓰면 찍어 두세요」
-- 나쁘지 않지만 **내 말투**다. 학원마다 아이들에게 하는 말이 다르고,
-- 한 학원 안에서도 학년마다 다르다. 그리고 고치려면 매번 나를 불러야 한다.
--
-- 그래서 **자리만 코드가 잡고, 말은 원장님이 적는다.**
--   · 안 적으시면 원래 문구가 그대로 나온다 (빈 화면이 되면 안 된다)
--   · 적으시면 그것이 대신 나온다
--
-- 자리 이름(key)은 `me.homework` 처럼 **화면.자리** 로 짓는다.
-- 새 자리가 생기면 lib/screenNotes.js 에 한 줄 적으면 설정 화면에 저절로 뜬다.

create table if not exists public.screen_notes (
  key        text primary key,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

comment on table public.screen_notes is
  '화면에 뜨는 안내 문구. 자리 이름은 lib/screenNotes.js 의 SPOTS 에 있다';

alter table public.screen_notes enable row level security;

-- **학생·학부모도 읽어야 한다.** 그분들 보라고 적는 글이다.
-- 비밀이 담길 자리가 아니다 — 원래도 화면에 그대로 떠 있던 문구다.
drop policy if exists note_read_all on public.screen_notes;
create policy note_read_all on public.screen_notes
  for select to authenticated using (true);

-- 적는 것은 선생님만
drop policy if exists note_write_staff on public.screen_notes;
create policy note_write_staff on public.screen_notes
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

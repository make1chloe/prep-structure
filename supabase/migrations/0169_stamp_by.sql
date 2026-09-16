-- 0169 (어48) 출결 곁에 하원 · 도착·하원 시각을 누가 찍었나 · 원장님 2026-09-16 「학생들이 어플에서 하원처리를 안했을 경우를 대비해서 출석체크 근처에 하원도 넣고 출석, 지각, 하원은 시간이 기록되게해 1차적으로 학생어플에서 눌렀으면 그걸 기준으로 삼고, 내가 다시 눌렀으면 내가 누른걸로 정정 그리고 시간 정정가능하게 나중에 누를수도 있으니까」
--   ① v2.arrival.stamped_by · 'student'(아이 앱) · 'staff'(원장·강사가 01 에서) · 기본값은 아이
--   ② 문지기(arrival_stamp)가 아이 줄에는 늘 'student' 를 덮는다(아이가 'staff' 라고 보내도 안 먹힌다) · 학원 사람은 그대로 지난다(시각도 손으로 정한다)
--   ⚠️ 몇 번을 돌려도 같은 결과여야 한다.
alter table v2.arrival add column if not exists stamped_by text not null default 'student';
alter table v2.arrival drop constraint if exists arrival_stamped_by;
alter table v2.arrival add constraint arrival_stamped_by check (stamped_by in ('student','staff'));

comment on column v2.arrival.stamped_by is
  '(어48) 누가 찍었나 · student 아이 앱(07 등원·하원 단추) · staff 원장·강사(01 출결 곁). '
  '아이가 찍은 시각이 1차 기준이라 출결을 눌러도 **이미 있는 줄은 안 덮는다**(lib/attend.js) · '
  '고치는 것은 01 의 시각 고치기 하나뿐이다(lib/arrival.js staffStamp)';

create or replace function v2.arrival_stamp() returns trigger
  language plpgsql security definer set search_path = v2, public as $fn$
declare 누구 uuid := auth.uid();
begin
  -- ⚠️ 검사·마이그레이션·이관은 지나간다(0083 과 같다)
  if 누구 is null then return new; end if;
  if v2.is_staff() then return new; end if;      -- 원장·강사는 손으로 고칠 수 있다(시각도 · stamped_by 도)

  if tg_op = 'UPDATE' then
    raise exception '찍은 시각은 아이 손으로 못 고친다 (arrival)' using errcode = '42501';
  end if;
  -- **아이가 보낸 시각·날짜·찍은이를 안 믿는다.** 서버가 제 시계로 덮는다
  new.at   := now();
  new.date := v2.today();
  new.stamped_by := 'student';
  return new;
end $fn$;

drop trigger if exists arrival_stamp on v2.arrival;
create trigger arrival_stamp before insert or update on v2.arrival
  for each row execute function v2.arrival_stamp();

comment on function v2.arrival_stamp() is
  '표-10 · 「했다」는 서버가 시각을 정한다. 아이가 보낸 at·date·stamped_by 를 now()·v2.today()·student 로 덮고, '
  '아이의 update 는 거절한다. ⚠️ auth.uid() 가 null 이면(검사·이관) 그냥 지나간다 · (어48) stamped_by 를 더했다';

notify pgrst, 'reload schema';

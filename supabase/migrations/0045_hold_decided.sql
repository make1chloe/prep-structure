-- 보류를 「원장님이 정한 것」과 「아직 안 정한 것」으로 가른다
-- 계획: 「보류 0 이 아니면 전환하지 않는다」 — 그 0 이 무엇인지 이 표가 정한다.
-- ⚠️ 재적재가 skip_why 를 매번 새로 쓰므로 결정은 **따로** 산다.
create table v2.hold_decision (
  why_like text primary key,
  decided  text not null,
  at       date not null default v2.today()
);
comment on table v2.hold_decision is
  '보류 사유마다 원장님이 내린 결정. 여기 걸린 보류는 전환을 막지 않는다';
alter table v2.hold_decision enable row level security;
alter table v2.hold_decision force row level security;
grant select, insert, update, delete on v2.hold_decision to authenticated;
create policy staff_all on v2.hold_decision for all to authenticated
  using (v2.is_staff()) with check (v2.is_staff());

insert into v2.hold_decision(why_like, decided) values
 ('%조합이 이미 있다%',
  '첫 줄만 옮긴다 — 진도가 붙은 줄이 0 줄이라 잃는 것이 없다'),
 ('%소속 기간이 없다%',
  '과거는 복원 불가. 이관일 이전 달의 「8회 채웠나」는 못 센다 (수강료 금액은 그대로 옮겼다)'),
 ('%영역이 안 접힌다 — 옛 영역: (빈칸)%',
  '원장님이 웹앱에서 정한다 (2026-09-02)')
on conflict (why_like) do update set decided=excluded.decided;

-- 듣기 교재는 안 옮긴다 (원장님 2026-09-02 「듣기교재는 삭제해」)
-- ⚠️ 지우는 것은 **새 앱 쪽뿐**이다. 옛 앱에는 그대로 있다 (대전제 1 — 옛 앱이 진실).
--    학생 0 명 · 진도 0 줄이라 딸려 사라지는 것이 없다.
insert into v2.import_skip(old_table, old_id, why)
select 'textbooks', t.id::text, '원장님이 안 옮기기로 정함 (듣기 교재) — 2026-09-02'
from public.textbooks t where t.area = '듣기'
on conflict (old_table, old_id) do nothing;

delete from v2.units  where book_id in (select old_id::uuid from v2.import_skip
  where old_table='textbooks' and why like '%안 옮기기로%');
delete from v2.books  where id      in (select old_id::uuid from v2.import_skip
  where old_table='textbooks' and why like '%안 옮기기로%');
delete from v2.import_map where old_table='textbooks'
  and old_id in (select old_id from v2.import_skip where old_table='textbooks');

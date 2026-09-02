-- 0048 · 학습 항목 · 검사 · 성적 · 문항별 오답
create or replace function v2.import_day()
returns table(what text, n int) language plpgsql security definer
set search_path = v2, public as $$
begin
  -- ① 학습 항목 — ⚠️ **두 벌이 될 자리다.**
  --    옛 이름은 「문법 804 · 필수학습 746 · 단락독해 587」 — **영역·교재 이름**이지
  --    새 루틴 항목(숙제채점 · 오답 고치기 · 노트 쓰기 …)과 **층위가 다르다.**
  --    → 합치지 않는다. 옛 것은 **내림(retired)** 으로 들어와 새 루틴 화면에 안 뜨고,
  --      지난 검사 기록만 가리킨다. 이름이 같은 7종은 **한 줄로 접는다.**
  insert into v2.learn_items(id, name, method, tool, state, sort, import_batch)
  select h.id, h.name, nullif(h.method,''), nullif(h.tool,''), 'retired', coalesce(h.sort,0), 'import'
  from public.homework_items h
  where not exists (select 1 from v2.learn_items l where l.name = h.name)
  on conflict (id) do nothing;
  -- 접은 것과 새로 넣은 것 둘 다 짝을 남긴다 — 검사가 이 짝으로 항목을 찾는다
  insert into v2.import_map(old_table, old_id, new_table, new_id)
  select 'homework_items', h.id::text, 'learn_items',
         coalesce((select l.id from v2.learn_items l where l.name = h.name), h.id)
  from public.homework_items h
  on conflict (old_table, old_id) do nothing;
  what:='learn_items(옛것 내림)';
  n:=(select count(*)::int from v2.learn_items where import_batch='import'); return next;

  -- ② 검사 4,150 → 판 항목
  --    ⚠️ 단원이 붙은 줄이 **33줄뿐**이다(0.8%). 새 앱은 숙제를 진도에 매다는데
  --       옛 앱은 따로 놀았다 — 나머지는 단원 없이 옮긴다(지어내지 않는다).
  -- ⚠️ day_item 에는 import_batch 가 없다 — 판(day_sheet)에 달려 있으므로 거기서 읽는다.
  --    같은 사실을 두 벌로 적지 않는다(원칙 1). 되돌릴 때도 판을 타고 지운다.
  insert into v2.day_item(id, sheet_id, slot, item_id, unit_id, range_note, status, sort)
  select i.id, d.id,
         case i.status when 'inclass' then 'class' when 'plan_next' then 'next'
                       when 'assigned' then 'home' else 'check' end,
         (select m.new_id from v2.import_map m
            where m.old_table='homework_items' and m.old_id=i.homework_item_id::text),
         (select u.id from v2.units u where u.id = i.textbook_unit_id),
         nullif(trim(coalesce(i.range_note,'') ||
           case when cardinality(coalesce(i.textbook_unit_ids,'{}')) > 1
                then ' (옛 앱이 단원 '||cardinality(i.textbook_unit_ids)||'개를 한 줄에 담았다)'
                else '' end), ''),
         case i.status when 'done' then 'done' when 'weak' then 'weak'
                       when 'missing' then 'missing' else 'none' end,
         coalesce(i.inclass_sort, 0)
  from public.daily_report_items i
  join public.daily_reports r on r.id = i.daily_report_id
  join v2.day_sheet d on d.student_id = r.student_id and d.date = r.date
  where d.import_batch='import'
  on conflict (id) do nothing;
  -- ⚠️⚠️ **매핑을 데이터와 같은 조건으로 좁힌다.** 안 좁히면 **안 옮긴 옛 줄에도**
  --    「새 줄 X 가 되었다」가 적힌다 — 실측으로 19줄이 그랬다(전부 「테스트계정」 아이 것).
  --    매핑표는 「이게 새 앱 어디로 갔지」를 되짚는 장부다. 거기에 없는 줄을 가리키면
  --    되짚을 때 **빈 곳을 가리키고**, 재적재가 「이미 옮겼다」로 읽어 영영 안 옮긴다.
  -- ⚠️ 안 옮긴 줄도 **버리지 않는다** — `new_table` 을 비우고 **사유를 적어** 남긴다
  --    (계획 1-3 「옮기지 않기로 한 것은 사유와 함께 매핑표에 남긴다」).
  insert into v2.import_map(old_table, old_id, new_table, new_id, skip_why)
  select 'daily_report_items', i.id::text,
         case when d.id is null then null else 'day_item' end,
         case when d.id is null then null else i.id end,
         case when d.id is null
              then '그 아이를 안 옮겼다 — ' ||
                   coalesce((select k.why from v2.import_skip k
                              where k.old_table='students' and k.old_id=r.student_id::text),
                            '판이 안 섰다')
              else null end
  from public.daily_report_items i
  join public.daily_reports r on r.id = i.daily_report_id
  left join v2.day_sheet d on d.student_id = r.student_id and d.date = r.date
                          and d.import_batch='import'
  on conflict (old_table, old_id) do nothing;
  what:='day_item'; n:=(select count(*)::int from v2.day_item t join v2.day_sheet d on d.id=t.sheet_id
        where d.import_batch='import'); return next;

  -- ③ 성적 127 — ⚠️ 옛 kind 는 unit 118 · mock 9. school 은 **한 줄도 없다**
  insert into v2.score(id, student_id, kind, taken_on, subject, raw, full_score,
                       by_who, confirmed, show_to, note, import_batch)
  select s.id, s.student_id,
         case s.kind when 'mock' then 'mock' when 'unit' then 'unit' else 'school' end,
         s.taken_on, coalesce(nullif(s.subject,''),'영어'), s.raw_score, s.full_score,
         'staff', true, 'staff', nullif(s.note,''), 'import'
  from public.scores s
  where exists (select 1 from v2.students x where x.id=s.student_id)
    and s.student_id::text not in (select old_id from v2.import_skip where old_table='students')
  on conflict (id) do nothing;
  -- ⚠️ 위와 같은 병 — 데이터 insert 는 「v2 에 있는 아이 · 안 거른 아이」로 좁히는데
  --    매핑만 안 좁히면 **안 옮긴 성적에도 짝이 적힌다.** (지금은 짝 없는 줄이 0이지만
  --    걸러지는 아이가 하나만 늘어도 그날 생긴다 — 잠복이다)
  insert into v2.import_map(old_table, old_id, new_table, new_id, skip_why)
  select 'scores', s.id::text,
         case when v.id is null then null else 'score' end,
         case when v.id is null then null else s.id end,
         case when v.id is null
              then '그 아이를 안 옮겼다 — ' ||
                   coalesce((select k.why from v2.import_skip k
                              where k.old_table='students' and k.old_id=s.student_id::text),
                            '학생이 v2 에 없다')
              else null end
  from public.scores s
  left join v2.score v on v.id = s.id
  on conflict (old_table, old_id) do nothing;
  what:='score'; n:=(select count(*)::int from v2.score where import_batch='import'); return next;

  -- ④ 문항별 오답 122 — 전부 「틀림」이다. 사유는 **여러 개를 쉼표로 이어 놓았다**
  insert into v2.score_wrong(score_id, q_no, kind)
  select si.score_id, si.no, nullif(si.reason,'')
  from public.score_items si
  where exists (select 1 from v2.score s where s.id = si.score_id)
  on conflict (score_id, q_no) do nothing;
  what:='score_wrong'; n:=(select count(*)::int from v2.score_wrong); return next;
end $$;
grant execute on function v2.import_day() to service_role;

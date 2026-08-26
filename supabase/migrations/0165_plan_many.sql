-- **배정·등원 줄 수술 — 목록 3그룹을 제자리-고치기로** (배정줄수술 v2 §2).
--
-- 검사행 수술(0163)이 남긴 반쪽: assigned·inclass·plan_next 는 아직
-- 지우고-다시쓰기라, 저장마다 행 id 가 바뀌어 제출물 소속이 끊기고
-- (homework_submissions.report_item_id — 0159 set null) 학생 「다했어요」
-- 가 옛 id 를 못 찾아 「0158 SQL」 오진을 냈다. 행이 안 죽으면 전부
-- 원인째 사라진다.
--
-- 계약 (v2 §2 — 위반은 회귀다):
--   p_groups = { assigned|inclass|plan_next: 배열 } — 키 없음 = 무접촉,
--   배열(빈 것 포함) = 그 그룹 전체 교체(목록 밖 delete + 제자리 upsert).
--   축은 0005 의 (판,항목,status) 유일 — 새 자물쇠 없음.
--   무조건 덮기: unit_id·unit_ids·range_note·inclass_sort·carry_next
--     (json 에 없으면 컬럼 null — 단 carry_next 는 coalesce false,
--      8/24 23502 사고 재발 방지).
--   불가침: student_done_at·check_note (행이 제자리라 자연 보존).
--   changed_at: delete 전에 v_had_any·기존 assigned 행을 확정한 뒤 판정
--     (같으면 유지 / 다르면 now() / 신규+처음이면 null).
--   한 함수 = 한 트랜잭션 = 전부-또는-무.
--
-- 되돌리기:
--   drop function public.plan_many(uuid, jsonb);
--   drop function public.plan_many_on();

create or replace function public.plan_many(p_report_id uuid, p_groups jsonb)
returns jsonb
language plpgsql
as $$
declare
  g text;
  it jsonb;
  v_had_any boolean;
  old_assigned jsonb;
  v_changed uuid[] := '{}';
  keep uuid[];
  v_item uuid;
  v_sort int;
  v_carry boolean;
  v_u1 uuid;
  v_us uuid[];
  v_note text;
  v_old jsonb;
  v_ch timestamptz;
begin
  if p_report_id is null then
    raise exception '판이 없습니다';
  end if;
  for g in select jsonb_object_keys(coalesce(p_groups, '{}'::jsonb)) loop
    if g not in ('assigned','inclass','plan_next') then
      raise exception '어휘 밖 그룹: %', g;
    end if;
  end loop;

  -- changed_at 재료는 delete **전에** 확정한다 (검토 중대4 — 지운 뒤
  -- 재면 「처음 주는 숙제」 오판·루프 자기오염)
  v_had_any := exists (
    select 1 from public.daily_report_items
     where daily_report_id = p_report_id and status = 'assigned');
  select coalesce(jsonb_object_agg(homework_item_id::text, jsonb_build_object(
           'us', to_jsonb(coalesce(textbook_unit_ids, '{}'::uuid[])),
           'note', coalesce(range_note, ''),
           'ch', changed_at)), '{}'::jsonb)
    into old_assigned
    from public.daily_report_items
   where daily_report_id = p_report_id and status = 'assigned';

  foreach g in array array['assigned','inclass','plan_next'] loop
    if p_groups ? g then
      keep := '{}';
      for it in select * from jsonb_array_elements(p_groups->g) loop
        v_item := nullif(it->>'item_id', '')::uuid;
        if v_item is not null then keep := keep || v_item; end if;
      end loop;
      -- 목록 밖 행만 지운다 (검사 3상태는 이 그룹이 아니라 무접촉)
      delete from public.daily_report_items
       where daily_report_id = p_report_id and status = g
         and (array_length(keep, 1) is null or homework_item_id <> all (keep));

      for it in select * from jsonb_array_elements(p_groups->g) loop
        v_item := nullif(it->>'item_id', '')::uuid;
        if v_item is null then continue; end if;
        v_sort  := (it->>'sort')::int;
        v_carry := coalesce((it->>'carry_next')::boolean, false);
        v_u1    := nullif(it->>'unit_id', '')::uuid;
        v_us    := case when it ? 'unit_ids' and jsonb_typeof(it->'unit_ids') = 'array'
                        then (select array_agg(x::uuid)
                                from jsonb_array_elements_text(it->'unit_ids') x)
                        else null end;
        v_note  := nullif(it->>'range_note', '');

        if g = 'assigned' then
          v_old := old_assigned -> (v_item::text);
          if v_old is not null
             and (v_old->>'note') = coalesce(v_note, '')
             and (v_old->'us') = to_jsonb(coalesce(v_us, '{}'::uuid[])) then
            v_ch := nullif(v_old->>'ch', '')::timestamptz;  -- 안 바뀜 — 그대로
          elsif not v_had_any then
            v_ch := null;                                    -- 그날 처음 주는 숙제
          else
            v_ch := now();
            v_changed := v_changed || v_item;
          end if;
        else
          v_ch := null;
        end if;

        insert into public.daily_report_items as d
          (daily_report_id, homework_item_id, status, inclass_sort, carry_next,
           textbook_unit_id, textbook_unit_ids, range_note, changed_at)
        values
          (p_report_id, v_item, g, v_sort, v_carry, v_u1, v_us, v_note, v_ch)
        on conflict (daily_report_id, homework_item_id, status)
        do update set
          inclass_sort      = excluded.inclass_sort,
          carry_next        = excluded.carry_next,
          textbook_unit_id  = excluded.textbook_unit_id,
          textbook_unit_ids = excluded.textbook_unit_ids,
          range_note        = excluded.range_note,
          changed_at        = excluded.changed_at;
        -- student_done_at·check_note 는 set 목록에 없다 — 불가침 (계약)
      end loop;
    end if;
  end loop;

  return jsonb_build_object('ok', true,
    'changed', to_jsonb(coalesce(v_changed, '{}'::uuid[])));
end;
$$;

grant execute on function public.plan_many(uuid, jsonb) to authenticated;

create or replace function public.plan_many_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.plan_many_on() to authenticated;

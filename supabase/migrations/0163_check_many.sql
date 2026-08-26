-- **검사 저장 수술 — 지우고-다시쓰기를 제자리-고치기로** (계획서 v2 §1).
--
-- 지금까지 검사 결과는 「옛 행 delete + 새 행 insert」 였다. 그 뿌리에서
-- 사고가 여럿 자랐다: 학생 「다 했어요」·조교 메모·제출물 소속이 행과
-- 함께 죽어서 보존 맵·복구 코드(붕대)가 겹겹이 감겼고, 0159 뒤에는
-- 제출물 소속이 저장마다 조용히 끊겼다. 행이 안 죽으면 전부 원인째
-- 사라진다 — 그것이 이 함수다.
--
-- 계약 (네 경로 공용: 판 저장 · 대기줄 markCheck · /check checkOne ·
-- markMissing):
--   p_items = [{item_id, status, note}] 배열, 호출 1회.
--   status: done|weak|missing = 쓰기(있으면 고치고 없으면 만든다)
--           null·빈값 = 그 (판,항목) 검사행 delete (칩 재클릭·취소)
--           그 밖 = 오류 (legacy 어휘를 조용히 쓰지 않는다)
--   note:   null = 기존 유지(조교 메모는 남의 칸) / '' = 지움 / 문자열 = 덮어씀
--   전부-또는-무 (한 함수 = 한 트랜잭션). 부분 실패로 반쪽이 남지 않는다.
--
-- 표적 자물쇠는 0162 의 dri_check_one — (판,항목)당 검사행 1개.
-- RLS 는 그대로 탄다 (security invoker — 직원만 쓰고 지울 수 있다).
--
-- 되돌리기: drop function public.check_many(uuid, jsonb);
--          drop function public.check_many_on();

create or replace function public.check_many(p_report_id uuid, p_items jsonb)
returns jsonb
language plpgsql
as $$
declare
  it jsonb;
  v_item uuid;
  v_status text;
  v_note text;
begin
  if p_report_id is null then
    raise exception '판이 없습니다';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_item := nullif(it->>'item_id', '')::uuid;
    if v_item is null then continue; end if;
    v_status := it->>'status';

    if v_status is null or v_status = '' then
      delete from public.daily_report_items
        where daily_report_id = p_report_id
          and homework_item_id = v_item
          and status in ('done','weak','missing');
      continue;
    end if;

    if v_status not in ('done','weak','missing') then
      raise exception '어휘 밖 status: %', v_status;
    end if;

    v_note := it->>'note';
    insert into public.daily_report_items as d
      (daily_report_id, homework_item_id, status, check_note)
      values (p_report_id, v_item, v_status, nullif(v_note, ''))
    on conflict (daily_report_id, homework_item_id)
      where status in ('done','weak','missing')
    do update set
      status = excluded.status,
      check_note = case
        when v_note is null then d.check_note
        when v_note = ''    then null
        else v_note
      end;
    -- student_done_at·제출물 소속(homework_submissions.report_item_id)은
    -- 행이 안 죽으니 저절로 산다 — 붕대가 하던 일이 여기서 소멸한다
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.check_many(uuid, jsonb) to authenticated;

-- 돌아가는지 손가락 하나로 확인하는 탐침
create or replace function public.check_many_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.check_many_on() to authenticated;

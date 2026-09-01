-- 0041 · 문장시험에서 「구두」를 뺀다 (원장님 2026-09-02)
-- ⚠️ 「구두테스트」는 **루틴 항목**(등원 확인 방식)이지 문장시험이 아니다. 섞어 놨었다.
update v2.quiz_style set s_way='dictation' where kind='sentence' and s_way='oral';
alter table v2.quiz_style drop constraint if exists quiz_style_s_way_check;
alter table v2.quiz_style add constraint quiz_style_s_way_check
  check (s_way in ('dictation','record'));           -- 받아쓰기 · 녹음
create or replace function v2.style_text(p_style uuid) returns text
language sql stable as $$
  select case when s.kind='sentence' then
      case s.s_way when 'dictation' then '받아쓰기' else '녹음' end
    else
      nullif(concat_ws(' · ',
        case when s.mc_meaning>0 then '객관식 뜻 '||s.mc_meaning||'%' end,
        case when s.sa_meaning>0 then '주관식 뜻 '||s.sa_meaning||'%' end,
        case when s.mc_word   >0 then '객관식 영어 '||s.mc_word||'%' end,
        case when s.sa_word   >0 then '주관식 영어 '||s.sa_word||'%' end,
        case when s.first_hint then '첫글자 힌트' end), '')
    end
  from v2.quiz_style s where s.id = p_style $$;
grant execute on function v2.style_text(uuid) to authenticated;

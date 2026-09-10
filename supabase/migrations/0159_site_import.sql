-- 0159 (버2) 학교 홈페이지에서 받아오기 — 나이스에 없는 학교.
-- 원장님이 12b 에서 홈페이지 주소를 넣어 두신 학교는, 확장이 그 화면 글을 앱에 보내고 **앱이** 시험 회차를 뽑는다.
-- 판단은 새로 없다(원칙-1) — 나이스와 같은 길(planImport · diffExams)로 들어오고, 출처만 'site' 다.
-- ① 학교마다 **마지막으로 받은 때** 한 칸. 학교가 홈페이지를 바꾸면 **조용히 멈추는데**, 그것을 12b 가 이 칸으로 안다
--    (목업 12b: 「신송중은 3주째 못 받았습니다」). 새 표는 안 만든다.
-- ② 판 import_board 를 다시 낸다 — 0120 의 열쇠를 **전부 품고**(검사-74) 학교마다 site_seen_at·site_exams 를 더한다.
alter table v2.schools add column if not exists site_seen_at timestamptz;
comment on column v2.schools.site_seen_at is '(버2) 학교 홈페이지에서 마지막으로 받아 적은 때 — 비어 있으면 아직 한 번도 못 받았다. 12b 가 「N일째 못 받았습니다」로 말한다';

-- ══ import_board — 0120 그대로 + 학교줄에 site_seen_at · site_exams(검사-74: 앞 열쇠를 전부 품는다)
create or replace function v2.import_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level, 'neis_code', s.neis_code, 'site_url', s.site_url,
                  'site_seen_at', s.site_seen_at,
                  'students', (select count(*) from v2.students st where st.school_id = s.id and st.state = 'active'),
                  'neis_exams', (select count(*) from v2.exams e where e.school_id = s.id and e.source = 'neis' and e.state = 'active' and e.term_to >= p_on - 30),
                  'site_exams', (select count(*) from v2.exams e where e.school_id = s.id and e.source = 'site' and e.state = 'active' and e.term_to >= p_on - 30)) order by s.name), '[]'::jsonb)
                 from v2.schools s where s.state = 'active'),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'scope', e.scope, 'school_id', e.school_id, 'school', sc.name, 'grade', e.grade, 'name', e.name, 'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'source', e.source, 'updated_at', e.updated_at) order by coalesce(e.term_from, e.english_on), sc.name), '[]'::jsonb)
               from v2.exams e left join v2.schools sc on sc.id = e.school_id
              where e.state = 'active' and coalesce(e.term_to, e.english_on, e.term_from) >= p_on - 30),
    'words', (select coalesce(jsonb_agg(jsonb_build_object('word', w.word, 'scope', w.scope) order by w.word), '[]'::jsonb) from v2.exam_word w),
    'last_neis_at', (select max(e.updated_at) from v2.exams e where e.source = 'neis'),
    'last_site_at', (select max(s.site_seen_at) from v2.schools s),
    'neis_key', (select coalesce(nullif(trim(i.config->>'key'), ''), '') <> '' from v2.integration i where i.id = 'neis')
  ) where v2.is_staff()
$$;
comment on function v2.import_board(date) is '학사일정 받아오기 12b 가 읽는 한 벌 — 학교(나이스 코드·홈페이지·아이 수·나이스 시험 수·홈페이지 시험 수·마지막으로 받은 때) · 지난 한 달부터의 시험 · 전국 낱말 · 마지막 받은 때 둘 · 열쇠 있나(참·거짓만). 학원 사람만';

-- 표에 칸이 늘었다 — API 기억을 새로 읽지 않으면 화면이 이 칸을 못 쓴다(원장님 9/10 「schema cache」)
notify pgrst, 'reload schema';

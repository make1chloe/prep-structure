-- 0029: 문자 문구를 종류별로 나눈다
--
-- 지금까지 인삿말·맺음말이 **하나뿐**이라 데일리리포트에도, 숙제 문자에도,
-- 하원 안내에도 같은 말이 붙었다. 종류마다 톤이 다른데 그럴 수가 없었다.
--
-- 문자를 두 갈래로 본다.
--
--   ① 앱이 본문을 만드는 것 (key 가 있다)
--      데일리리포트 · 숙제 문자 · 하원 안내
--      본문은 그날 입력에서 자동으로 만들어진다. 손댈 것은 인삿말·맺음말뿐이다.
--
--   ② 내가 본문을 쓰는 것 (key 가 없다)
--      교재 안내 · 지각 안내 · 보강 안내 · 단원평가 결과 · 상담 일정 …
--      {{변수}} 를 넣어두면 보낼 때 채워진다.
--
-- 둘 다 **설정 → 문자 문구** 한 곳에서 추가·수정·삭제한다. 코드에는 없다.

alter table public.message_templates
  add column if not exists key      text,   -- report | homework | late (앱이 본문을 만드는 것)
  add column if not exists greeting text,
  add column if not exists closing  text;

create unique index if not exists message_templates_key_idx
  on public.message_templates (key) where key is not null;

comment on column public.message_templates.key is
  '앱이 본문을 자동으로 만드는 문자. 값이 있으면 본문은 못 고치고 인삿말·맺음말만 고친다';


-- ------------------------------------------------------------
-- ① 앱이 만드는 문자 — 자리를 만들어 둔다
-- ------------------------------------------------------------
insert into public.message_templates (name, kind, key, body, sort) values
  ('데일리리포트',      'auto', 'report',   '', 10),
  ('숙제 문자 (학생용)', 'auto', 'homework', '', 20),
  ('늦은 귀가 안내',     'auto', 'late',     '', 30)
on conflict (key) where key is not null do nothing;   -- 부분 유니크 인덱스라 조건을 같이 적어야 한다

-- 예전에 한 곳에 적어둔 인삿말·맺음말을 데일리리포트로 옮긴다 (한 번만)
update public.message_templates t
   set greeting = coalesce(t.greeting, i.config->>'greeting'),
       closing  = coalesce(t.closing,  i.config->>'closing')
  from public.integrations i
 where i.id = 'message'
   and t.key = 'report'
   and t.greeting is null
   and t.closing is null;


-- ------------------------------------------------------------
-- ② 내가 쓰는 문자 — 아직 없는 것만 만들어 둔다
--    문구는 초안입니다. 설정 화면에서 원장님 말투로 고쳐 쓰세요.
-- ------------------------------------------------------------
insert into public.message_templates (name, kind, body, sort)
select v.name, v.kind, v.body, v.sort
  from (values
    ('지각 안내', 'late_in',
     '[{{학원명}}] {{학생명}} 학생 등원 안내

{{학생명}} 학생이 {{시간}}에 등원했습니다.
수업에 늦지 않도록 가정에서도 한 번 챙겨주시면 감사하겠습니다.', 40),

    ('보강 안내', 'makeup',
     '[{{학원명}}] {{학생명}} 학생 보강 안내

{{날짜}} {{시간}} 으로 보강 일정을 잡았습니다.

{{내용}}

시간이 어려우시면 말씀해주세요.', 50),

    ('단원평가 결과 안내', 'exam',
     '[{{학원명}}] {{학생명}} 학생 단원평가 결과

{{내용}}

부족한 부분은 다음 수업에서 다시 짚어주겠습니다.', 60),

    ('신규 상담 · 레벨테스트 일정 안내', 'consult',
     '[{{학원명}}] {{학생명}} 학생 상담 안내

문의해주셔서 감사합니다.

▶ 일시: {{날짜}} {{시간}}
▶ 장소: {{학원주소}}

{{내용}}

변경이 필요하시면 편하게 연락주세요.', 70)
  ) as v(name, kind, body, sort)
 where not exists (
   select 1 from public.message_templates m where m.name = v.name
 );

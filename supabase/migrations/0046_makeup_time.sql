-- 0046: 보강 시간
--
-- 보강을 잡을 때 날짜만 정하고 시간이 없었다. 그런데 보강은 정규 수업이
-- 아니라 **그날 비는 시간에 끼워 넣는 것**이라, 몇 시인지가 날짜만큼 중요하다.
-- 학부모께도 "금요일에 오세요" 로는 안 되고 "금요일 5시" 라야 한다.
--
-- 시간은 비워둘 수 있다 (아직 안 정했을 수 있으므로).

alter table public.attendance add column if not exists makeup_time time;
comment on column public.attendance.makeup_time is '보강 시각. 비면 아직 안 정한 것';

alter table public.class_attendance add column if not exists makeup_time time;

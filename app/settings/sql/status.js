"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";

/**
 * DB 에 어디까지 들어갔는지 실제로 찔러본다.
 *
 * "SQL 을 돌렸는데 화면이 그대로다" 를 혼자 확인할 수 있어야 한다.
 * 표/칸이 있는지만 보면 되므로 한 줄도 안 읽고 limit 0 으로 물어본다.
 *
 * 확인하는 방법이 세 가지다.
 *   table + col   그 칸이 있나 (대부분)
 *   rpc           그 함수가 있나 (저장소 권한처럼 표가 아닌 것)
 *   anonTable     **로그인 없이도 읽히나** (GRANT 만 주는 SQL)
 *
 * 세 번째가 없어서 0081(아이콘 읽기 권한)이 「넣을 것이 없음」 으로 보였다.
 * 표도 칸도 이미 있으니 검사를 통과해버렸고, 그래서 실행되지 않았다.
 * **확인할 방법이 없는 SQL 은 없는 것과 같다.**
 */
const CHECKS = [
  { id: "0009", label: "공지 · 전달사항", table: "notices", col: "id" },
  { id: "0013", label: "숙제 문자 · 발송 이력", table: "report_sends", col: "kind" },
  { id: "0017", label: "문자 문구 · 신규 상담", table: "message_templates", col: "body" },
  { id: "0020", label: "할일 분류", table: "todo_categories", col: "name" },
  { id: "0022", label: "2026 시험 일정", table: "exam_periods", col: "english_on" },
  { id: "0023", label: "리포트 댓글", table: "report_comments", col: "body" },
  { id: "0024", label: "경고 · 늦귀가 과제", table: "stay_tasks", col: "status" },
  { id: "0025", label: "단어시험 방식", table: "word_test_settings", col: "first_hint" },
  { id: "0026", label: "회독별 진도", table: "student_unit_progress", col: "round" },
  { id: "0027", label: "하원 안내", table: "daily_reports", col: "late_until" },
  { id: "0028", label: "숙제 → 내 할일", table: "homework_items", col: "prep_task" },
  { id: "0029", label: "문자 문구 종류별", table: "message_templates", col: "key" },
  { id: "0030", label: "알림톡 연결", table: "message_templates", col: "alimtalk_id" },
  { id: "0031", label: "월간리포트 · 단원평가", table: "monthly_reports", col: "ym" },
  { id: "0033", label: "학생 타이머", table: "study_sessions", col: "seconds" },
  { id: "0034", label: "등원 학습 · 학습 완료", table: "study_sessions", col: "kind" },
  { id: "0035", label: "학습 루틴", table: "routine_steps", col: "sort" },
  { id: "0037", label: "단어시험 시점", table: "students", col: "word_when" },
  { id: "0038", label: "등원 체크 (학생이 누름)", table: "arrival_checks", col: "phone_at" },
  { id: "0039", label: "등원 체크 · 출석", table: "arrival_checks", col: "attend_at" },
  { id: "0041", label: "학원에서만 등원 체크", table: "academy_net", col: "ip" },
  { id: "0042", label: "특강 기한", table: "classes", col: "ends_on" },
  { id: "0042", label: "반별 출결 (특강)", table: "class_attendance", col: "status" },
  { id: "0043", label: "학생 계정 연결", table: "student_link_codes", col: "code" },
  { id: "0044", label: "숙제 제출", table: "homework_submissions", col: "kind" },
  { id: "0045", label: "학생 아이디 로그인", table: "students", col: "login_id" },
  { id: "0045", label: "체크리스트 숙제", table: "homework_items", col: "checklist" },
  { id: "0046", label: "보강 시간", table: "attendance", col: "makeup_time" },
  // 표·칸이 아니라 **함수**로 확인한다 (저장소 권한이 이 함수에 걸려 있다)
  { id: "0047", label: "숙제 파일 권한", rpc: "my_student_id" },
  { id: "0048", label: "숙제로 낼 때 바뀌는 학습", table: "homework_items", col: "home_item_id" },
  { id: "0049", label: "상담일지", table: "student_notes", col: "raw" },
  { id: "0049", label: "본보기 문장", table: "comment_samples", col: "body" },
  { id: "0050", label: "학생공지 · 부모님공지", table: "daily_reports", col: "notice_student" },
  { id: "0051", label: "문제번호 단원", table: "textbook_units", col: "question_no" },
  { id: "0052", label: "내신 자료 관리", table: "prep_materials", col: "need_card" },
  { id: "0053", label: "내신 자료 종류", table: "prep_material_types", col: "need_card" },
  { id: "0054", label: "내신 자료 순서", table: "prep_assignments", col: "sort" },
  { id: "0055", label: "수납 (결제선생)", table: "payments", col: "paid_on" },
  { id: "0056", label: "오래된 제출물 정리", table: "homework_submissions", col: "purged_at" },
  { id: "0057", label: "반 명단 잠그기 (보안)", rpc: "my_class_ids" },
  { id: "0058", label: "안 보내기", table: "daily_reports", col: "skip_kinds" },
  { id: "0059", label: "나이스 학사일정", table: "schools", col: "schul_code" },
  { id: "0060", label: "시험 일정 숨기기", table: "exam_periods", col: "hidden" },
  { id: "0062", label: "검사 한 줄", table: "daily_report_items", col: "check_note" },
  { id: "0063", label: "직접검사 숙제", table: "homework_items", col: "in_person" },
  { id: "0064", label: "공지 사진", table: "notices", col: "photos" },
  { id: "0065", label: "영상 배정 · 본 기록", table: "videos", col: "id" },
  { id: "0066", label: "달력 나누기", table: "tasks", col: "private" },
  { id: "0067", label: "메뉴 고르기", table: "profiles", col: "menu_hidden" },
  { id: "0068", label: "학부모가 보내는 사진", table: "requests", col: "photos" },
  { id: "0069", label: "학교 지역·주소", table: "schools", col: "address" },
  { id: "0070", label: "단어 개수 · 단어시험 설정", table: "students", col: "word_cut_pct" },
  { id: "0071", label: "형제자매 묶기", table: "students", col: "family_id" },
  { id: "0072", label: "성적 (내신 · 모의고사)", table: "scores", col: "cuts" },
  { id: "0073", label: "시험 회차별 등급컷", table: "exam_periods", col: "cuts" },
  { id: "0074", label: "시험 한 줄로 합치기 (범위·자료·출제샘)", table: "exam_periods", col: "teacher" },
  { id: "0075", label: "내 시험에 나이스 붙이기", table: "exam_periods", col: "neis_source_id" },
  { id: "0076", label: "학교 한 곳으로 · 출제샘 여러 명", table: "exam_periods", col: "teachers" },
  { id: "0077", label: "일정을 학생·학교에 배정", table: "tasks", col: "deliver_student_ids" },
  { id: "0078", label: "구글 캘린더 구독", table: "calendar_tokens", col: "token" },
  { id: "0079", label: "학부모 계정 · 선생님 권한", table: "profiles", col: "login_id" },
  { id: "0080", label: "로고 올리기", table: "app_assets", col: "data" },
  { id: "0081", label: "아이콘을 로그인 없이 받기", anonTable: "app_assets", col: "key" },
  { id: "0082", label: "되풀이 할일", table: "todo_routines", col: "repeat_kind" },
  { id: "0083", label: "신규 학생 · 교재 끝나감 할일", table: "todo_routines", col: "lead_units" },
  { id: "0084", label: "지금 뭐 하는 중 (실시간)", table: "student_activity", col: "state" },
  { id: "0085", label: "학생이 자기 상태 누르기", table: "student_activity", col: "by_student" },
  { id: "0087", label: "바뀐 숙제 표시", table: "daily_report_items", col: "changed_at" },
  // 0088 은 로그인 함수를 고친다 — 표·칸이 아니라 함수라 rpc 로 확인한다.
  //   학부모 계정을 만들어도 로그인이 안 되던 것을 고친 것이다.
  { id: "0088", label: "학부모도 아이디로 로그인", rpc: "login_lookup_v2" },
  { id: "0089", label: "수업 가이드 링크", table: "class_guides", col: "url" },
  // 0090 은 표·칸이 아니라 **읽기 규칙**을 고친다. 그래서 표식 함수의 있고 없음으로 본다.
  //   이게 없으면 학부모 화면이 통째로 비어 보인다 (오류도 안 난다).
  { id: "0090", label: "학부모도 수업 기록 읽기", rpc: "parent_reads_reports" },
  // 0086 은 실시간 발행만 건드린다 — 표·칸으로는 확인할 수가 없다.
  // 확인은 오늘 수업 화면 오른쪽 위의 「● 실시간」 으로 한다.
];

export async function checkSchema() {
  const supabase = createClient();
  // 로그인 없이 읽히는지 보려면 **로그인 안 한 손님**으로 물어봐야 한다
  const anon = createAnonClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const out = [];
  for (const c of CHECKS) {
    const { error } = c.rpc
      ? await supabase.rpc(c.rpc)
      : c.anonTable
      ? await anon.from(c.anonTable).select(c.col).limit(1)
      : await supabase.from(c.table).select(c.col).limit(1);
    out.push({
      ...c,
      ok: !error,
      why: error ? `${error.message}${error.code ? ` (${error.code})` : ""}` : null,
    });
  }
  return out;
}

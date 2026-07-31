"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * DB 에 어디까지 들어갔는지 실제로 찔러본다.
 *
 * "SQL 을 돌렸는데 화면이 그대로다" 를 혼자 확인할 수 있어야 한다.
 * 표/칸이 있는지만 보면 되므로 한 줄도 안 읽고 limit 0 으로 물어본다.
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
  { id: "0031", label: "월말 리포트 · 단원평가", table: "monthly_reports", col: "ym" },
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
  { id: "0059", label: "나이스 학사일정", table: "neis_schools", col: "schul_code" },
];

export async function checkSchema() {
  const supabase = createClient();
  const out = [];
  for (const c of CHECKS) {
    // 함수로 확인하는 것과 표로 확인하는 것을 나눠 본다
    const { error } = c.rpc
      ? await supabase.rpc(c.rpc)
      : await supabase.from(c.table).select(c.col).limit(1);
    out.push({
      ...c,
      ok: !error,
      why: error ? `${error.message}${error.code ? ` (${error.code})` : ""}` : null,
    });
  }
  return out;
}

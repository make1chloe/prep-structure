/**
 * **파일형 답지** (0148, 원장님 2026-08-22 — 「답지가 DB화되지 않았을 때
 * 업로드도 가능해야 해」 · 「답지 없으면 그냥 제출까지, 답지 있으면
 * 채점하라는 메시지까지 나오기」).
 *
 * 열쇠는 **원장의 확인**이다. 제출물 「확인·봤어요」(오늘 수업 ·
 * 숙제 검사)나 검사 저장이 일어나는 순간 그 (학생·항목·배정일)의 답지에
 * opened_at 이 찍히고, 학생에게 「채점해서 오세요」 알림이 배치(30분
 * 단위, lib/pushQueue)로 나간다.
 *
 * 「어느 배정일 줄이 그 답지인가」 의 판단은 전부 여기 있다 (원칙 2) —
 * 정확한 배정일을 알면 date 로, 모르면 upTo(그 날짜 이하의 가장 최근
 * 배정일 한 줄)로 찾는다. 0148 전 DB 면 전부 조용히 넘어간다 —
 * 확인·검사 저장이 먼저다.
 */

import { queuePush } from "./pushQueue";

/** 그 (학생·항목)의 답지 줄 — upTo 이하에서 가장 최근 배정일 한 줄 */
export async function latestAnswerRow(supabase, studentId, itemId, upTo) {
  if (!studentId || !itemId || !upTo) return null;
  try {
    const { data, error } = await supabase
      .from("answer_files")
      .select("student_id, homework_item_id, date, paths, opened_at")
      .eq("student_id", studentId)
      .eq("homework_item_id", itemId)
      .lte("date", upTo)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;   // 0148 전 — 답지 기능이 아직 없는 것뿐이다
    return data || null;
  } catch {
    return null;
  }
}

/**
 * 답지를 연다 — 아직 안 열린 줄만 opened_at 을 찍는다 (이미 찍혀 있으면
 * 그대로 — 처음 열린 시각이 진실이고, 다시 울리지도 않는다). 하나라도
 * 새로 열리면 학생에게 알림 **한 통**을 배치에 담는다 (학부모는 아님).
 *
 * @param date 배정일을 정확히 알 때 (제출물 → 배정 줄 → 그 리포트의 날짜)
 * @param upTo 모를 때 — 이 날짜 이하의 가장 최근 배정일 줄을 연다.
 *   검사에서 부를 때는 **검사일 전날**을 준다: 검사 대상은 지난 수업의
 *   배정이라, 오늘 새로 배정하며 붙인 다음 답지가 같이 열리면 안 된다.
 */
export async function openAnswers(supabase, { studentId, itemIds = [], date = null, upTo = null }) {
  const ids = [...new Set((itemIds || []).filter(Boolean))];
  if (!studentId || ids.length === 0 || (!date && !upTo)) return { opened: 0 };
  try {
    let rows = [];
    if (date) {
      const { data, error } = await supabase
        .from("answer_files")
        .select("student_id, homework_item_id, date, opened_at")
        .eq("student_id", studentId)
        .eq("date", date)
        .in("homework_item_id", ids);
      if (error) return { opened: 0 };
      rows = data || [];
    } else {
      // 항목마다 upTo 이하의 **가장 최근 배정일 한 줄**만 — 같은 항목을
      // 여러 번 냈으면 지금 검사하는 것은 마지막 배정이다
      const { data, error } = await supabase
        .from("answer_files")
        .select("student_id, homework_item_id, date, opened_at")
        .eq("student_id", studentId)
        .lte("date", upTo)
        .in("homework_item_id", ids)
        .order("date", { ascending: false });
      if (error) return { opened: 0 };
      const latest = new Map();
      (data || []).forEach((r) => {
        if (!latest.has(r.homework_item_id)) latest.set(r.homework_item_id, r);
      });
      rows = [...latest.values()];
    }

    const fresh = rows.filter((r) => !r.opened_at);
    if (fresh.length === 0) return { opened: 0 };

    const now = new Date().toISOString();
    for (const r of fresh) {
      await supabase
        .from("answer_files")
        .update({ opened_at: now })
        .eq("student_id", r.student_id)
        .eq("homework_item_id", r.homework_item_id)
        .eq("date", r.date)
        .is("opened_at", null);   // 그 사이 다른 화면이 먼저 열었으면 그대로 둔다
    }

    // 열리는 순간 학생에게 (원장님 — 「답지 있으면 채점하라는 메시지까지」).
    // 즉시가 아니라 다음 :00/:30 에 나간다 — 그 전엔 발송 「보낼 것」 에서 취소된다
    await queuePush(supabase, {
      studentIds: [studentId],
      who: "student",
      title: "답지가 열렸어요",
      body: "답지 보고 채점해서 오세요 — 앱의 숙제에서 열 수 있어요",
      // 숙제 탭으로 바로 (탭 개편 §5-2 — 모르는 값이면 기본 탭으로 후퇴한다)
      url: "/me?tab=hw",
    }, "답지 열림");
    return { opened: fresh.length };
  } catch {
    return { opened: 0 };   // 0148 전이거나 실패 — 확인·검사 저장을 막지 않는다
  }
}

/**
 * 제출물 하나를 확인했을 때 — 그 제출물이 딸린 **배정일**의 답지를 연다.
 * 배정 줄(report_item)이 살아 있으면 그 리포트의 날짜가 정확한 배정일이고,
 * 없으면(옛 제출·항목만 있는 제출) 제출한 날짜 이하의 가장 최근 줄로 물러난다.
 */
export async function openForSubmission(supabase, submissionId) {
  if (!submissionId) return { opened: 0 };
  try {
    const { data: sub } = await supabase
      .from("homework_submissions")
      .select("student_id, homework_item_id, report_item_id, date")
      .eq("id", submissionId)
      .maybeSingle();
    if (!sub?.student_id || !sub.homework_item_id) return { opened: 0 };

    let assignedOn = null;
    if (sub.report_item_id) {
      const { data: ri } = await supabase
        .from("daily_report_items")
        .select("daily_report_id")
        .eq("id", sub.report_item_id)
        .maybeSingle();
      if (ri?.daily_report_id) {
        const { data: rep } = await supabase
          .from("daily_reports")
          .select("date")
          .eq("id", ri.daily_report_id)
          .maybeSingle();
        assignedOn = rep?.date || null;
      }
    }
    return openAnswers(supabase, {
      studentId: sub.student_id,
      itemIds: [sub.homework_item_id],
      date: assignedOn,
      upTo: assignedOn ? null : sub.date,
    });
  } catch {
    return { opened: 0 };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { noColumn } from "@/lib/sqlError";
// 리포트 행 만들기는 lib/ensureReport 한 벌 (출결보다 폰 제출이 먼저일 수
// 있다 — 그 사정은 그대로. 예전 이 파일의 사본은 오류 문구를 삼켰다)
import { ensureReport } from "@/lib/ensureReport";
// 출결을 찍으면 그날 판까지 같이 — 여덟 갈래가 지나는 한 벌 (0184)
import { mirrorKind } from "@/lib/attendKind";

/** 그날만 단어시험 시점을 바꾼다 */
export async function setArrival(studentId, date, patch = {}) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = await createClient();
  const { id, error: idErr } = await ensureReport(supabase, studentId, date);
  if (idErr || !id) return { error: idErr || "기록을 만들지 못했어요." };

  const row = {};
  if ("wordWhen" in patch) row.word_when = patch.wordWhen || null;
  if (Object.keys(row).length === 0) return { error: null };

  const { error } = await supabase.from("daily_reports").update(row).eq("id", id);
  if (noColumn(error)) return { error: "0037 SQL 을 먼저 실행해주세요." };
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}

/**
 * 등원 체크를 **선생님이 대신** 찍는다.
 *
 * 원래는 아이가 자기 화면에서 누르는 것이다. 그런데 학생 앱을 아직 안 줬거나,
 * 폰을 안 가져왔거나, 계정이 없는 아이도 있다. 그럴 때 여기서 찍는다.
 *
 * 출석을 찍으면 등원으로도 잡는다 — 학생이 눌렀을 때와 같게 동작해야
 * 나중에 앱을 나눠줘도 화면이 달라지지 않는다.
 */
export async function setArrivalFor(studentId, date, kind, on) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const COLS = { phone: "phone_at", attend: "attend_at", homework: "homework_at" };
  const col = COLS[kind];
  if (!col) return { error: "알 수 없는 항목이에요." };

  const supabase = await createClient();
  const { error } = await supabase.from("arrival_checks").upsert(
    { student_id: studentId, date, [col]: on ? new Date().toISOString() : null },
    { onConflict: "student_id,date" }
  );
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { error: "0038 SQL 을 먼저 실행해주세요." };
    }
    return { error: error.message };
  }

  if (kind === "attend" && on) {
    const { data: already } = await supabase
      .from("attendance")
      .select("student_id")
      .eq("student_id", studentId)
      .eq("date", date)
      .maybeSingle();
    if (!already) {
      await supabase
        .from("attendance")
        .upsert({ student_id: studentId, date, status: "present" }, { onConflict: "student_id,date" });
      // 선생님이 대신 찍어준 등원도 수업이다 (0184)
      await mirrorKind(supabase, [{ student_id: studentId, date, status: "present" }]);
    }
  }

  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}

/** 이 학생의 평소 단어시험 시점을 바꾼다 */
export async function setWordWhenDefault(studentId, when) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ word_when: when === "end" ? "end" : "start" })
    .eq("id", studentId);
  if (noColumn(error)) return { error: "0037 SQL 을 먼저 실행해주세요." };
  revalidatePath("/today");
  revalidatePath("/students");
  return { error: error ? error.message : null };
}

/**
 * **등원 학습 완료를 선생님이 대신 찍는다** (원장님 2026-08-28 —
 * 「등원학습 완료는 어떻게 표시해? 지금은 학생밖에 못 하는 거야?
 *  학생이 안 했거나 잘못하면 내가 해야 하는데」).
 *
 * 지금까지는 **학생만** 찍을 수 있었다 (app/me/timerActions finishStudy).
 * 오늘 수업 판의 등원 학습 구역은 보기 전용이라, 아이가 안 눌렀거나 잘못
 * 눌렀으면 원장님이 손쓸 길이 아예 없었다.
 *
 * ── 칸을 따로 두지 않는다 (누가 찍었나) ─────────────────────────
 * 등원 체크가 이미 같은 물음에 답해두었다 — setArrivalFor(바로 위)는
 * 학생이 쓰는 **그 칸에 그대로** 쓴다. 여기서도 같은 잣대를 쓴다:
 *   · student_done_at 을 읽는 곳(lib/checkQueue · lib/menuBadges ·
 *     lib/sheetTab · 오늘 수업 셈)은 전부 **「이 항목이 다 됐나」** 로만
 *     쓴다. 「아이가 스스로 눌렀나」 를 묻는 자리는 한 곳도 없다.
 *   · 칸을 더하면 그 값을 읽는 곳을 전부 다시 정해야 한다 (원칙 4).
 * 대신 **찍는 자리에서** 구별이 된다 — 이 단추는 오늘 수업 판에만 있고,
 * 등원 체크와 똑같이 「학생 대신 찍기」 라고 적혀 있다.
 *
 * 0158 트리거는 `not is_staff()` 일 때만 칸을 묶으므로 선생님은 그냥 지난다.
 */
export async function setItemDoneFor(studentId, date, homeworkItemId, on) {
  if (!studentId || !date || !homeworkItemId) return { error: "값이 부족해요." };
  const supabase = await createClient();

  const { id: reportId, error: repErr } = await ensureReport(supabase, studentId, date);
  if (!reportId) return { error: repErr || "그 날 리포트를 못 만들었어요." };

  // (리포트, 항목) 로 줄을 찾는다. 열쇠가 (리포트, 항목, 상태)라 한 항목에
  // 배정 줄과 등원 줄이 따로 설 수 있다 — 등원 줄을 고른다.
  const { data: rows, error: findErr } = await supabase
    .from("daily_report_items")
    .select("id, status")
    .eq("daily_report_id", reportId)
    .eq("homework_item_id", homeworkItemId);
  if (findErr) return { error: findErr.message };

  const mine =
    (rows || []).find((x) => x.status === "inclass") ||
    (rows || []).find((x) => x.status !== "assigned") ||
    null;

  const stamp = on ? new Date().toISOString() : null;

  if (!mine) {
    // 이월·계획으로 목록에만 서 있고 아직 저장 안 된 항목 — 등원 줄을
    // 그 자리에서 세운다. 판 저장(plan_many, 0165)이 나중에 이 줄을
    // **제자리로** 고치므로 줄이 갈리지 않는다.
    const { error } = await supabase
      .from("daily_report_items")
      .insert({
        daily_report_id: reportId,
        homework_item_id: homeworkItemId,
        status: "inclass",
        student_done_at: stamp,
      });
    if (error) return { error: error.message };
    revalidatePath("/me");
    return { error: null };
  }

  // .select() 로 몇 줄이 바뀌었는지 본다 — 막히면 update 는 0행 갱신 +
  // 오류 없음이라, 확인 안 하면 조용히 사라진다 (0158 실사고)
  const { data: hit, error } = await supabase
    .from("daily_report_items")
    .update({ student_done_at: stamp })
    .eq("id", mine.id)
    .select("id");
  if (error) return { error: error.message };
  if (!hit || hit.length === 0) return { error: "완료 표시가 저장되지 않았어요. (0158 SQL)" };

  // 아이 화면은 다시 그린다 (이 판은 일부러 안 그린다 — 열린 줄이 튄다)
  revalidatePath("/me");
  return { error: null };
}

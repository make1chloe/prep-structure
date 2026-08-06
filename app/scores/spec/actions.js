"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MOCK_SPEC } from "@/lib/examSpec";

/**
 * **기본 문항표 저장** (원장님, 2026-08-06 —
 * 「기본값을 세팅하되, 수정 가능하게 해줘」).
 *
 * 통째로 갈아끼운다. 문항을 지우셨을 때 옛 줄이 남아 있으면 45문항이
 * 46문항이 되어버리기 때문이다.
 */
export async function saveSpec(kind, rows) {
  const supabase = createClient();
  const list = (rows || [])
    .map((r) => ({
      kind: kind || "mock",
      no: Number(r.no),
      area: (r.area || "").trim() || null,
      topic: (r.topic || "").trim() || null,
      detail: (r.detail || "").trim() || null,
      points: r.points === "" || r.points == null ? null : Number(r.points),
    }))
    .filter((r) => Number.isFinite(r.no) && r.no >= 1);

  const { error: delErr } = await supabase.from("exam_spec_rows").delete().eq("kind", kind || "mock");
  if (delErr) {
    return { error: delErr.message.includes("exam_spec_rows")
      ? "0097 SQL 을 먼저 실행해주세요."
      : delErr.message };
  }
  if (list.length > 0) {
    const { error } = await supabase.from("exam_spec_rows").insert(list);
    if (error) return { error: error.message };
  }
  revalidatePath("/scores/spec");
  revalidatePath("/scores");
  return { error: null, saved: list.length };
}

/** 「표준으로 되돌리기」 — 코드에 박힌 45문항으로 */
export async function resetSpec(kind) {
  if (kind !== "mock") return { error: "표준 문항표는 모의고사만 있어요." };
  return saveSpec("mock", MOCK_SPEC.map((q) => ({ ...q, points: null })));
}

/**
 * **이 회차만 다르게** — 시험 회차 하나의 문항표를 저장한다.
 *
 * 기본 문항표를 고치면 지난 회차의 분석까지 바뀐다. 3월 학평에서만
 * 18번이 「심경」 이었다면 그 회차만 고쳐야 한다.
 */
export async function saveExamQuestions(examId, rows) {
  if (!examId) return { error: "어느 시험인지 골라주세요." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const list = (rows || [])
    .map((r) => ({
      exam_id: examId,
      no: Number(r.no),
      area: (r.area || "").trim() || null,
      topic: (r.topic || "").trim() || null,
      detail: (r.detail || "").trim() || null,
      answer: (r.answer || "").trim() || null,
      points: r.points === "" || r.points == null ? null : Number(r.points),
      unit: (r.unit || "").trim() || null,
      source: (r.source || "").trim() || null,
      created_by: user?.id || null,
    }))
    .filter((r) => Number.isFinite(r.no) && r.no >= 1);

  const { error: delErr } = await supabase.from("exam_questions").delete().eq("exam_id", examId);
  if (delErr) {
    return { error: delErr.message.includes("exam_questions")
      ? "0097 SQL 을 먼저 실행해주세요."
      : delErr.message };
  }
  if (list.length > 0) {
    const { error } = await supabase.from("exam_questions").insert(list);
    if (error) return { error: error.message };
  }
  revalidatePath("/scores/spec");
  return { error: null, saved: list.length };
}

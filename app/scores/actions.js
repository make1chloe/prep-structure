"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function needSql(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205");
}
function ok(error) {
  if (needSql(error)) return { error: "설정 → Supabase SQL 에서 0072 를 먼저 실행해주세요." };
  return { error: error ? error.message : null };
}

function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "90, 84, 77" 을 [90, 84, 77] 로 — 원장님은 학교 표를 보고 그대로 옮겨 적는다 */
function toCuts(v) {
  if (Array.isArray(v)) return v.map(Number).filter(Number.isFinite);
  return (v || "")
    .toString()
    .split(/[,\s/·]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
}

export async function saveScore(input) {
  const { id, studentId } = input || {};
  if (!studentId) return { error: "학생을 골라주세요." };

  const row = {
    student_id: studentId,
    kind: input.kind || "school",
    taken_on: input.taken_on || null,
    year: num(input.year),
    term: (input.term || "").trim() || null,
    subject: (input.subject || "영어").trim(),
    raw_score: num(input.raw_score),
    full_score: num(input.full_score),
    grade: num(input.grade),
    percentile: num(input.percentile),
    rank_in: num(input.rank_in),
    rank_of: num(input.rank_of),
    school: (input.school || "").trim() || null,
    cuts: toCuts(input.cuts),
    note: (input.note || "").trim() || null,
  };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (id) {
    const { error } = await supabase.from("scores").update(row).eq("id", id);
    revalidatePath("/scores");
    revalidatePath("/me");
    return ok(error);
  }

  const { data, error } = await supabase
    .from("scores")
    .insert({ ...row, created_by: user?.id || null })
    .select("id")
    .single();
  revalidatePath("/scores");
  revalidatePath("/me");
  return { ...ok(error), id: data?.id || null };
}

export async function removeScores(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (list.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("scores").delete().in("id", list);
  revalidatePath("/scores");
  revalidatePath("/me");
  return ok(error);
}

/**
 * 틀린 문제 — **점수만 남기면 "몇 점이었다" 로 끝난다.**
 * 무엇을 틀렸는지가 남아야 다음에 무엇을 다시 볼지 정할 수 있다.
 */
export async function addWrong(scoreId, input) {
  if (!scoreId) return { error: "성적을 먼저 저장해주세요." };
  const supabase = createClient();
  const { data: last } = await supabase
    .from("score_wrongs")
    .select("sort")
    .eq("score_id", scoreId)
    .order("sort", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("score_wrongs").insert({
    score_id: scoreId,
    question: (input?.question || "").trim() || null,
    topic: (input?.topic || "").trim() || null,
    reason: (input?.reason || "").trim() || null,
    note: (input?.note || "").trim() || null,
    sort: (last?.[0]?.sort ?? 0) + 1,
  });
  revalidatePath("/scores");
  return ok(error);
}

export async function removeWrongs(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (list.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("score_wrongs").delete().in("id", list);
  revalidatePath("/scores");
  return ok(error);
}

/** 그 성적의 틀린 문제들 */
export async function listWrongs(scoreId) {
  if (!scoreId) return { rows: [] };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("score_wrongs")
    .select("id, question, topic, reason, note, sort")
    .eq("score_id", scoreId)
    .order("sort", { ascending: true });
  if (error) return { rows: [], error: ok(error).error };
  return { rows: data || [], error: null };
}

/**
 * 학생이 직접 내는 설문지 주소.
 *
 * 앱에서 폼을 새로 만들지 않는다 — 원장님이 이미 노션을 쓰시고, 문항을 바꾸는
 * 일이 잦다. 주소만 걸어두면 문항은 노션에서 고치면 된다.
 */
export async function saveFormLinks(links) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["principal", "instructor", "assistant"].includes(p?.role)) {
    return { error: "선생님만 바꿀 수 있어요." };
  }

  const clean = (v) => (v || "").toString().trim() || "";
  const { error } = await supabase.from("integrations").upsert(
    {
      id: "score_form",
      enabled: true,
      config: {
        school: clean(links?.school),
        mock: clean(links?.mock),
        unit: clean(links?.unit),
      },
    },
    { onConflict: "id" }
  );
  revalidatePath("/scores");
  revalidatePath("/me");
  return ok(error);
}

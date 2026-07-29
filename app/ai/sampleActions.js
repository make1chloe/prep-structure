"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 본보기 문장 — **원장님이 예전에 쓰신 것을 그대로 쓴다.**
 *
 * 제가 지어낸 문장을 본보기로 주면 제 말투가 나온다. 그러면 학부모가
 * "선생님 글이 달라졌네" 를 먼저 느낀다.
 *
 * 다행히 노션에서 가져온 데일리리포트에 **원장님이 실제로 쓰신 공지**가
 * 그대로 들어 있다. 그걸 뽑아 본보기로 삼는다.
 */

function needSql(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205");
}

/**
 * 노션에서 쓰시던 줄바꿈 기호를 진짜 줄바꿈으로 되돌린다.
 *
 * 공지에 `*` 나 `-` 를 줄 나누는 표시로 쓰셨다. 그대로 두면 AI 가 그걸
 * **글자로** 배워서 초안에도 별표를 찍는다. 본보기로 넣기 전에 푼다.
 *
 * 날짜(6-2)나 낱말 사이 붙임표는 건드리지 않는다 — 앞뒤가 띄어져 있거나
 * 줄 맨 앞에 있을 때만 줄바꿈으로 본다.
 */
function tidy(t) {
  return (t || "")
    .replace(/\r/g, "")
    .replace(/^[\s]*[*\-–·•]\s*/gm, "")        // 줄 맨 앞의 표시
    .replace(/\s+[*\-–·•]\s+/g, "\n")           // 문장 사이의 표시
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** 너무 짧거나 긴 것, 사무적인 안내문은 본보기로 쓸모가 없다 */
function usable(t) {
  const s = (t || "").trim();
  if (s.length < 12 || s.length > 400) return false;
  // 날짜·금액·링크만 있는 안내는 말투 본보기가 안 된다
  if (/^https?:\/\//.test(s)) return false;
  if (/^\d/.test(s) && s.length < 30) return false;
  return true;
}

/** 지난 공지에서 뽑을 것을 미리 보여준다 (아직 저장 안 함) */
export async function previewFromReports(limit = 400) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_reports")
    .select("notice, date")
    .not("notice", "is", null)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) return { error: error.message, rows: [] };

  const seen = new Set();
  const rows = [];
  (data || []).forEach((r) => {
    const t = tidy(r.notice);
    if (!usable(t)) return;
    const key = t.replace(/\s+/g, " ");
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ body: t, date: r.date });
  });

  const { count } = await supabase
    .from("comment_samples")
    .select("id", { count: "exact", head: true });

  return { error: null, rows, already: count || 0 };
}

/** 고른 것을 본보기로 넣는다 */
export async function addSamples(bodies = [], tag = null) {
  const list = (Array.isArray(bodies) ? bodies : [])
    .map((b) => tidy(b))
    .filter((b) => b.length > 3);
  if (list.length === 0) return { error: "넣을 문장이 없어요.", added: 0 };

  const supabase = createClient();

  // 이미 들어 있는 것은 다시 넣지 않는다
  const { data: have } = await supabase.from("comment_samples").select("body");
  const seen = new Set((have || []).map((x) => (x.body || "").replace(/\s+/g, " ")));
  const fresh = list.filter((b) => !seen.has(b.replace(/\s+/g, " ")));
  if (fresh.length === 0) return { error: null, added: 0, skipped: list.length };

  const { error } = await supabase
    .from("comment_samples")
    .insert(fresh.map((body) => ({ body, tag: tag || null })));
  if (needSql(error)) return { error: "0049 SQL 을 먼저 실행해주세요.", added: 0 };
  if (error) return { error: error.message, added: 0 };

  revalidatePath("/settings/sql");
  return { error: null, added: fresh.length, skipped: list.length - fresh.length };
}

export async function listSamples() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("comment_samples")
    .select("id, body, tag")
    .order("created_at", { ascending: false })
    .limit(300);
  if (needSql(error)) return { rows: [], error: "0049 SQL 을 먼저 실행해주세요." };
  return { rows: data || [], error: error ? error.message : null };
}

export async function removeSample(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("comment_samples").delete().eq("id", id);
  revalidatePath("/settings/sql");
  return { error: error ? error.message : null };
}

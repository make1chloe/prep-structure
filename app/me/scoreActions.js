"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/session";

/**
 * **아이가 자기 시험 결과를 적는다** (원장님, 2026-08-06 —
 * 「학생용 화면에서 자기 시험 결과를 입력하게 해줘 — 문법, 내신, 모의고사 전부」).
 *
 * 노션 설문지가 하던 일을 앱이 한다. 노션 폼은 결과가 노션에 쌓여서
 * 성적표와 따로 놀았다 — 옮겨보니 문항별 오답 152개가 성적과 이어지지
 * 않은 채로 있었다. 여기서 적으면 **곧바로 리포트가 된다.**
 *
 * ── 두 가지를 조심한다 ──────────────────────────────────
 *
 * **아이 것에만 쓴다.** student_id 를 화면에서 받지 않고 로그인한 사람에게서
 * 찾는다. 받으면 남의 id 를 보내는 길이 생긴다 (RLS 가 막지만, 막히는 것에
 * 기대는 코드는 언젠가 정책이 바뀌면 뚫린다).
 *
 * **source 를 'form' 으로 박는다.** 아이가 낸 것과 선생님이 매긴 것을
 * 갈라두어야 한다 — 0098 의 고치기 규칙이 이 글자를 본다. 아이는 자기가 낸
 * 것만 고치고, 선생님이 매긴 점수는 못 건드린다.
 */

/** 로그인한 사람의 학생 줄 (없으면 null) */
async function meOf(supabase) {
  const user = await sessionUser(supabase);
  if (!user) return null;
  const { data } = await supabase
    .from("students")
    .select("id, name")
    .eq("profile_id", user.id)
    .maybeSingle();
  return data || null;
}

function clean(v) {
  return (v ?? "").toString().trim() || null;
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 시험 결과 한 건 + 문항별 오답.
 *
 * @param input {
 *   id?        고치는 것이면 성적 id
 *   kind       school | mock | unit
 *   term       시험명 (단원평가는 단원명)
 *   taken_on   본 날
 *   raw_score  점수 · full_score 만점
 *   passed     단원평가만 — 통과했나
 *   self_note  잘한 점 · 부족했던 점 · 하고 싶은 말
 *   items      [{ no, label, reason }]  틀린 문항
 * }
 */
export async function saveMyScore(input) {
  const supabase = createClient();
  const me = await meOf(supabase);
  if (!me) return { error: "로그인을 다시 해주세요." };

  const kind = ["school", "mock", "unit"].includes(input?.kind) ? input.kind : "mock";
  const term = clean(input?.term);
  const taken_on = clean(input?.taken_on);
  if (!taken_on) return { error: "시험 본 날짜를 적어주세요." };
  if (!term) return { error: kind === "unit" ? "단원 이름을 적어주세요." : "시험 이름을 적어주세요." };

  const row = {
    student_id: me.id,
    kind,
    term,
    taken_on,
    raw_score: num(input?.raw_score),
    full_score: num(input?.full_score) ?? (kind === "unit" ? null : 100),
    self_note: clean(input?.self_note),
    // 단원평가는 통과 여부가 점수보다 중요하다 (선생님이 그것을 보신다)
    note: kind === "unit" && input?.passed != null
      ? (input.passed ? "통과" : "재시험")
      : null,
    source: "form",
    filled_at: new Date().toISOString(),
  };

  let scoreId = clean(input?.id);
  if (scoreId) {
    const { error } = await supabase.from("scores").update(row).eq("id", scoreId);
    if (error) return { error: friendly(error) };
  } else {
    // 같은 (종류·시험명·날짜)를 두 번 내면 두 줄이 된다. 아이는 잘못 냈다고
    // 생각하고 또 낸다 — 있으면 그것을 고친다
    const { data: have } = await supabase
      .from("scores")
      .select("id, source")
      .eq("student_id", me.id)
      .eq("kind", kind)
      .eq("term", term)
      .eq("taken_on", taken_on)
      .maybeSingle();

    if (have?.id && have.source === "form") {
      const { error } = await supabase.from("scores").update(row).eq("id", have.id);
      if (error) return { error: friendly(error) };
      scoreId = have.id;
    } else if (have?.id) {
      // 선생님이 이미 매겨두신 시험이다 — 점수는 안 건드리고 오답만 붙인다
      scoreId = have.id;
    } else {
      const { data, error } = await supabase.from("scores").insert(row).select("id").single();
      if (error) return { error: friendly(error) };
      scoreId = data.id;
    }
  }

  // 문항별 오답 — 통째로 갈아끼운다 (지운 문항이 남으면 오답이 안 줄어든다)
  const items = (input?.items || [])
    .map((it) => ({
      score_id: scoreId,
      no: num(it?.no),
      wrong: true,
      reason: clean(it?.reason),
      label: clean(it?.label),
    }))
    .filter((it) => it.no != null || it.label);

  const { error: delErr } = await supabase.from("score_items").delete().eq("score_id", scoreId);
  if (delErr) return { error: friendly(delErr), id: scoreId };
  if (items.length > 0) {
    const { error } = await supabase.from("score_items").insert(items);
    if (error) return { error: friendly(error), id: scoreId };
  }

  revalidatePath("/me");
  revalidatePath("/scores");
  return { error: null, id: scoreId, saved: items.length };
}

/** 잘못 낸 것 물리기 — 자기가 낸 것만 (0098) */
export async function dropMyScore(id) {
  if (!id) return { error: "어느 것인지 모르겠어요." };
  const supabase = createClient();
  const me = await meOf(supabase);
  if (!me) return { error: "로그인을 다시 해주세요." };

  const { data: row } = await supabase
    .from("scores")
    .select("id, source, student_id")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.student_id !== me.id) return { error: "내 것이 아니에요." };
  if (row.source !== "form") {
    return { error: "선생님이 넣어주신 성적이라 여기서는 지울 수 없어요. 선생님께 말씀해주세요." };
  }

  const { error } = await supabase.from("scores").delete().eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath("/me");
  revalidatePath("/scores");
  return { error: null };
}

/** SQL 을 아직 안 돌리신 것과 진짜 오류를 갈라서 알려준다 */
function friendly(error) {
  const m = error?.message || "";
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    return "선생님께 말씀해주세요 — 앱 준비가 아직 안 됐어요 (0097·0098 SQL).";
  }
  if (m.includes("self_note") || m.includes("filled_at")) {
    return "선생님께 말씀해주세요 — 앱 준비가 아직 안 됐어요 (0097 SQL).";
  }
  if (m.includes("label") || m.includes("score_items")) {
    return "선생님께 말씀해주세요 — 앱 준비가 아직 안 됐어요 (0098 SQL).";
  }
  return m || "저장이 안 됐어요. 다시 해볼래요?";
}

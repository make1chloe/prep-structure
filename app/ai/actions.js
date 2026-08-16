"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/guard";

/**
 * AI 에게 초안을 시킨다.
 *
 * 두 군데에 쓴다.
 *   · 상담일지 — 말한 것을 받아쓴 덩어리를 읽을 수 있게 정리
 *   · 학부모 코멘트 — 오늘 기록을 바탕으로 한 문단
 *
 * **원장님이 예전에 쓰신 문장을 본보기로 함께 보낸다.** 조각을 이어 붙이면
 * 붙여넣은 티가 난다. 말투를 흉내내게 해야 고칠 것이 적다.
 *
 * 키는 설정 화면에서 직접 넣어 integrations 에 담기고 서버에서만 읽는다.
 * 코드에도 대화에도 없다.
 */

const API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

async function apiKey(supabase) {
  const { data } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "anthropic")
    .maybeSingle();
  return { key: (data?.config?.key || "").trim(), model: data?.config?.model || MODEL };
}

async function ask(supabase, system, user, maxTokens = 900) {
  const { key, model } = await apiKey(supabase);
  if (!key) {
    return {
      error:
        "AI 키가 없어요. 설정 → Supabase SQL → 'AI 키' 에 넣어주세요 " +
        "(대화창에는 붙여넣지 마세요).",
    };
  }

  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      cache: "no-store",
    });
  } catch (e) {
    return { error: `AI 를 부르지 못했어요: ${e.message}` };
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const m = json?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) return { error: `AI 키가 맞지 않아요. (${m})` };
    if (res.status === 429) return { error: `잠시 뒤에 다시 해주세요. (${m})` };
    return { error: `AI 가 답하지 못했어요: ${m}` };
  }

  const text = (json?.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
  return { error: null, text };
}

/**
 * 원장님이 정해두신 조건 — **모든 초안에 그대로 붙는다.**
 *
 * 매번 "존댓말로", "이모티콘 빼고", "학생 이름은 부르지 말고" 를 다시 적을 수는
 * 없다. 한 번 적어두면 AI 가 부를 때마다 함께 간다.
 *
 * 키(anthropic)와 따로 둔다 — 키를 다시 넣을 때 조건이 지워지면 안 되기 때문이다.
 */
async function rules(supabase) {
  const { data } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "ai_rules")
    .maybeSingle();
  return (data?.config?.text || "").trim();
}

/** 조건을 지시문에 끼워 넣는다 (비어 있으면 아무것도 안 붙는다) */
function withRules(lines, mine, ask) {
  const out = [...lines];
  if (mine) {
    out.push(
      "",
      "아래는 원장님이 **항상 지켜달라고 하신 것**입니다. 위 규칙과 부딪히면 이쪽을 따르세요.",
      mine.split("\n").map((x) => `  ${x}`).join("\n")
    );
  }
  if (ask) {
    out.push(
      "",
      "이번에만 따로 부탁하신 것입니다. 제일 우선합니다.",
      `  ${ask}`
    );
  }
  return out.join("\n");
}

/** 조건을 저장한다 */
export async function saveAiRules(text) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const { error } = await supabase
    .from("integrations")
    .upsert(
      { id: "ai_rules", enabled: true, config: { text: (text || "").trim() } },
      { onConflict: "id" }
    );
  return { error: error ? error.message : null };
}

/** 저장해둔 조건 (화면에 다시 보여주기 위해) */
export async function getAiRules() {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { text: "", error: guard.error };
  return { text: await rules(supabase), error: null };
}

/** 원장님이 예전에 쓰신 문장 — 말투 본보기 */
async function samples(supabase, limit = 60) {
  const { data } = await supabase
    .from("comment_samples")
    .select("body, tag")
    .limit(limit);
  return (data || []).map((s) => (s.tag ? `[${s.tag}] ${s.body}` : s.body));
}

/**
 * 받아쓴 상담 내용을 읽을 수 있게 정리한다.
 * 없는 말을 지어내지 않는 것이 제일 중요하다 — 상담 기록이기 때문이다.
 */
export async function summarizeConsult(raw, studentName, opts = {}) {
  const text = (raw || "").trim();
  if (text.length < 10) return { error: "받아쓴 내용이 너무 짧아요." };

  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const mine = await rules(supabase);
  return ask(
    supabase,
    withRules([
      "당신은 한국 영어학원 원장의 상담 기록을 정리합니다.",
      "받아쓰기라 문장이 끊기고 같은 말이 반복됩니다. 읽을 수 있게 다듬으세요.",
      "",
      "규칙",
      "- **말하지 않은 것을 절대 지어내지 마세요.** 상담 기록입니다.",
      "- 들은 말만 씁니다. 애매하면 애매한 채로 둡니다.",
      "- 아래 꼭지로 나눕니다. 해당 내용이 없으면 그 꼭지는 통째로 뺍니다.",
      "  ■ 학부모 말씀 / ■ 학생 상태 / ■ 안내한 것 / ■ 이어서 할 일",
      "- 존댓말, 짧은 문장. 각 꼭지 아래 '· ' 로 항목을 답니다.",
      "- 설명이나 인사말 없이 정리된 내용만 내놓습니다.",
    ], mine, (opts.ask || "").trim()),
    `학생: ${studentName || "학생"}\n\n받아쓴 내용:\n${text}`
  );
}

/**
 * 오늘 수업 기록으로 학부모께 나갈 코멘트 초안을 쓴다.
 *
 * @param facts  { name, attendance, word, homework:[], inclass:[], keywords:[], note }
 */
export async function draftComment(facts = {}) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const mine = await samples(supabase);
  const myRules = await rules(supabase);
  const system = withRules([
    "당신은 한국 영어학원 원장이 학부모에게 보내는 그날 수업 코멘트를 대신 씁니다.",
    "",
    "규칙",
    "- **주어진 사실만** 씁니다. 점수·태도·분량을 지어내지 마세요.",
    "- 2~4문장. 인사말과 맺음말은 넣지 않습니다 (앞뒤는 따로 붙습니다).",
    "- 내용이 둘 이상이면 **줄을 나눠서** 씁니다. 한 줄에 몰아 쓰지 마세요.",
    "- 줄을 나눌 때는 진짜 줄바꿈만 씁니다. 별표(*)·가운뎃점(·) 같은 기호는 넣지 마세요",
    "  (문자로 나갈 때 앱이 알아서 붙임표를 붙입니다).",
    "- 못한 것을 적을 때도 아이를 깎아내리지 않습니다. 다음에 어떻게 할지로 맺습니다.",
    facts.emoji
      ? "- 이모티콘을 한두 개만 자연스럽게 씁니다 (문장 끝에). 남발하지 마세요."
      : "- 이모티콘·이모지를 **쓰지 마세요.**",
    "- 아래는 원장님이 예전에 직접 쓰신 문장입니다. **이 말투를 그대로 따라 쓰세요.**",
    "  베끼지 말고 어투·호칭만 흉내 냅니다.",
    "  그 문장들은 수업 중에 급히 적으신 것이라 요지만 있습니다.",
    "  **조금 더 친절하게, 문장을 갖춰서** 쓰세요 — 말투는 그대로 두고 살만 붙입니다.",
    "",
    mine.length ? mine.map((s) => `  ${s}`).join("\n") : "  (아직 본보기 문장이 없습니다)",
    "",
    "코멘트 본문만 내놓습니다. 설명하지 마세요.",
  ], myRules, (facts.ask || "").trim());

  const lines = [
    `학생: ${facts.name || "학생"}`,
    facts.attendance ? `출결: ${facts.attendance}` : "",
    facts.word ? `단어시험: ${facts.word}` : "",
    facts.homework?.length ? `숙제 검사: ${facts.homework.join(", ")}` : "",
    facts.inclass?.length ? `학원에서 한 것: ${facts.inclass.join(", ")}` : "",
    facts.keywords?.length ? `오늘 느낀 점(원장님 메모): ${facts.keywords.join(", ")}` : "",
    // 원장님이 간단히 적어둔 말 — 이게 있으면 **이걸 중심으로** 쓴다
    facts.hint ? `원장님이 꼭 넣고 싶은 말: ${facts.hint}` : "",
    facts.note ? `덧붙일 것: ${facts.note}` : "",
  ].filter(Boolean);

  return ask(supabase, system, lines.join("\n"), 500);
}

/**
 * 전달사항 한 줄로 **학생공지와 부모님공지를 한 번에** 쓴다.
 *
 * 같은 일을 두 번 적게 하면 안 된다. 원장님은 "오늘 워크북 안 해와서 남겨서
 * 시켰음" 한 줄만 적고, 나머지는 받는 사람에 맞게 앱이 고쳐 쓴다.
 *   · 학생공지   — 아이가 읽는다. 짧고, 할 일이 분명하게.
 *   · 부모님공지 — 학부모가 읽는다. 존댓말, 아이를 깎아내리지 않게.
 */
export async function draftNotices(facts = {}) {
  const hint = (facts.hint || "").trim();
  if (hint.length < 2) return { error: "전달할 말을 적어주세요." };

  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const mine = await samples(supabase);
  const myRules = await rules(supabase);
  const system = withRules([
    "당신은 한국 영어학원 원장의 글을 대신 씁니다.",
    "원장님이 적은 **전달사항 한 줄**을 받아, 받는 사람에 맞게 두 벌로 고쳐 씁니다.",
    "",
    "규칙",
    "- **주어진 사실만** 씁니다. 점수·분량·태도를 지어내지 마세요.",
    "- 학생공지: 아이가 읽습니다. 1~2문장, 쉬운 말, 할 일이 분명하게. 반말은 쓰지 않되 딱딱하지 않게.",
    "- 부모님공지: 학부모가 읽습니다. 1~3문장, 존댓말.",
    "  못한 것을 적을 때도 아이를 깎아내리지 않고, 다음에 어떻게 할지로 맺습니다.",
    facts.emoji
      ? "- 이모티콘을 한두 개만 자연스럽게 씁니다. 남발하지 마세요."
      : "- 이모티콘·이모지를 **쓰지 마세요.**",
    "- 인사말·맺음말은 넣지 않습니다 (앞뒤는 따로 붙습니다).",
    "- 내용이 둘 이상이면 **줄을 나눠서** 씁니다. 한 줄에 몰아 쓰지 마세요.",
    "- 줄을 나눌 때는 진짜 줄바꿈만 씁니다. 별표(*)·가운뎃점(·) 같은 기호는 넣지 마세요",
    "  (문자로 나갈 때 앱이 알아서 붙임표를 붙입니다).",
    "",
    "아래는 원장님이 예전에 직접 쓰신 문장입니다. **이 말투와 호칭을 따라 쓰세요.**",
    "다만 그 문장들은 수업하면서 급히 적으신 것이라 요지만 있습니다.",
    "**조금 더 친절하게, 문장을 갖춰서** 쓰세요 — 말투는 그대로 두고 살만 붙입니다.",
    "  (예) '워크북 미완' → '워크북을 다 못 해와서 오늘 남아서 마저 했습니다.'",
    mine.length ? mine.map((x) => `  ${x}`).join("\n") : "  (아직 본보기 문장이 없습니다)",
    "",
    "답은 아래 형식 그대로만 내놓습니다. 설명하지 마세요.",
    "학생: <학생공지>",
    "학부모: <부모님공지>",
  ], myRules, (facts.ask || "").trim());

  const lines = [
    `학생: ${facts.name || "학생"}`,
    `전달사항: ${hint}`,
    facts.attendance ? `출결: ${facts.attendance}` : "",
    facts.word ? `단어시험: ${facts.word}` : "",
    facts.homework?.length ? `숙제 검사: ${facts.homework.join(", ")}` : "",
    facts.inclass?.length ? `학원에서 한 것: ${facts.inclass.join(", ")}` : "",
  ].filter(Boolean);

  const res = await ask(supabase, system, lines.join("\n"), 600);
  if (res.error) return res;

  // "학생: …" / "학부모: …" 를 갈라낸다. 못 가르면 통째로 부모님공지로 본다.
  const t = res.text || "";
  const m = t.match(/학생\s*:\s*([\s\S]*?)\n\s*학부모\s*:\s*([\s\S]*)$/);
  if (!m) return { error: null, student: "", parent: t.trim() };
  return { error: null, student: m[1].trim(), parent: m[2].trim() };
}

/**
 * **월간 AI 브리핑** (11-4, 원장님 2026-08-14 — 「수업 중에 간단한 키워드
 * 수준의 코멘트를 적으면 종합해서 월간 리포트의 AI 브리핑을 생성」,
 * 08-16 「해줘」).
 *
 * 그 달의 별점(집중도·이해도)·단어/문장 시험·단원평가 통과·수업 코멘트
 * (키워드)를 모아 학부모께 드릴 서너 문장을 만든다. **기록에 있는 것만**
 * 쓴다 — 지어내면 학부모가 아이에게 물었을 때 어긋난다. 초안일 뿐이고,
 * 월간 화면의 「덧붙일 한마디」 칸에 채워져 원장님이 고쳐 보낸다.
 */
export async function monthlyBriefing(studentId, ym) {
  if (!studentId || !/^\d{4}-\d{2}$/.test(ym || "")) return { error: "값이 부족해요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const from = `${ym}-01`;
  const to = `${ym}-31`;
  const [stuQ, repQ, scoreQ] = await Promise.all([
    supabase.from("students").select("name, grade").eq("id", studentId).maybeSingle(),
    supabase
      .from("daily_reports")
      .select("id, date, attendance_kind, attitude, understanding, word_correct, word_total, sent_correct, sent_total, sent_unit, sent_passed, notice")
      .eq("student_id", studentId).gte("date", from).lte("date", to)
      .order("date", { ascending: true }),
    supabase
      .from("scores")
      .select("kind, term, taken_on, raw_score, full_score, grade")
      .eq("student_id", studentId).gte("taken_on", from).lte("taken_on", to),
  ]);
  const reps = repQ.data || [];
  if (reps.length === 0) return { error: "이 달 수업 기록이 없어요." };

  const { data: cmts } = await supabase
    .from("report_comments")
    .select("daily_report_id, body, author_role")
    .in("daily_report_id", reps.map((r) => r.id));
  const dateOf = new Map(reps.map((r) => [r.id, r.date]));

  const star = (v) => (v ? `${v}점` : "");
  const lines = [
    `학생: ${stuQ.data?.name || "학생"}${stuQ.data?.grade ? ` (${stuQ.data.grade})` : ""}`,
    `달: ${ym}`,
    `수업 ${reps.length}회`,
    "",
    "날짜별 기록 (별점은 5점 만점 — 집중도/이해도):",
    ...reps.map((r) => {
      const bits = [
        r.attendance_kind && r.attendance_kind !== "정시출석" ? r.attendance_kind : "",
        r.attitude ? `집중 ${star(r.attitude)}` : "",
        r.understanding ? `이해 ${star(r.understanding)}` : "",
        r.word_total ? `단어 ${r.word_correct ?? 0}/${r.word_total}` : "",
        r.sent_total ? `문장 ${r.sent_correct ?? 0}/${r.sent_total}` : "",
        r.sent_unit ? `단원평가 ${r.sent_unit} ${r.sent_passed === true ? "통과" : r.sent_passed === false ? "재시험" : ""}` : "",
        (r.notice || "").trim(),
      ].filter(Boolean);
      return `- ${r.date.slice(5)}: ${bits.join(" · ") || "기록 없음"}`;
    }),
    (cmts || []).length ? "" : null,
    (cmts || []).length ? "수업 중 코멘트 (키워드 메모):" : null,
    ...(cmts || []).map((c) => `- ${String(dateOf.get(c.daily_report_id) || "").slice(5)}: ${c.body}`),
    (scoreQ.data || []).length ? "" : null,
    (scoreQ.data || []).length ? "이 달 성적:" : null,
    ...(scoreQ.data || []).map((x) => `- ${x.term || x.kind}: ${x.raw_score ?? "?"}${x.full_score ? `/${x.full_score}` : ""}${x.grade ? ` (${x.grade}등급)` : ""}`),
  ].filter((x) => x !== null);

  const myRules = await rules(supabase);
  const system = withRules([
    "당신은 한국 영어학원 원장을 대신해 **월간 학부모 브리핑**을 씁니다.",
    "한 달치 수업 기록을 읽고, 학부모께 드릴 3~5문장을 씁니다.",
    "",
    "규칙",
    "- **기록에 있는 것만 씁니다.** 지어내면 학부모가 아이에게 물었을 때 어긋납니다.",
    "- 흐름을 봅니다: 잘해진 것 → 아쉬운 것(있으면 부드럽게) → 다음 달 방향 한 문장.",
    "- 별점·점수를 나열하지 말고 **뜻을 풀어** 씁니다 (「집중도가 월말로 갈수록 올라왔습니다」).",
    "- 존댓말. 과장·빈말 금지. 인사말 없이 본문만.",
  ], myRules, "");

  return ask(supabase, system, lines.join("\n"), 700);
}

/** 키가 들어와 있는지 (키 자체는 절대 돌려주지 않는다) */
export async function aiReady() {
  const supabase = createClient();
  const { key, model } = await apiKey(supabase);
  const { count } = await supabase
    .from("comment_samples")
    .select("id", { count: "exact", head: true });
  return { ready: !!key, model, samples: count || 0 };
}

"use server";

import { createClient } from "@/lib/supabase/server";

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

async function requireStaff(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["principal", "instructor", "assistant"].includes(p?.role)) {
    return { error: "선생님만 쓸 수 있어요." };
  }
  return { error: null };
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
export async function summarizeConsult(raw, studentName) {
  const text = (raw || "").trim();
  if (text.length < 10) return { error: "받아쓴 내용이 너무 짧아요." };

  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  return ask(
    supabase,
    [
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
    ].join("\n"),
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
  const system = [
    "당신은 한국 영어학원 원장이 학부모에게 보내는 그날 수업 코멘트를 대신 씁니다.",
    "",
    "규칙",
    "- **주어진 사실만** 씁니다. 점수·태도·분량을 지어내지 마세요.",
    "- 2~4문장. 인사말과 맺음말은 넣지 않습니다 (앞뒤는 따로 붙습니다).",
    "- 못한 것을 적을 때도 아이를 깎아내리지 않습니다. 다음에 어떻게 할지로 맺습니다.",
    facts.emoji
      ? "- 이모티콘을 한두 개만 자연스럽게 씁니다 (문장 끝에). 남발하지 마세요."
      : "- 이모티콘·이모지를 **쓰지 마세요.**",
    "- 아래는 원장님이 예전에 직접 쓰신 문장입니다. **이 말투를 그대로 따라 쓰세요.**",
    "  베끼지 말고 어투·길이·호칭만 흉내 냅니다.",
    "",
    mine.length ? mine.map((s) => `  ${s}`).join("\n") : "  (아직 본보기 문장이 없습니다)",
    "",
    "코멘트 본문만 내놓습니다. 설명하지 마세요.",
  ].join("\n");

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
  const system = [
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
    "",
    "아래는 원장님이 예전에 직접 쓰신 문장입니다. **이 말투를 따라 쓰세요.**",
    mine.length ? mine.map((x) => `  ${x}`).join("\n") : "  (아직 본보기 문장이 없습니다)",
    "",
    "답은 아래 형식 그대로만 내놓습니다. 설명하지 마세요.",
    "학생: <학생공지>",
    "학부모: <부모님공지>",
  ].join("\n");

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

/** 키가 들어와 있는지 (키 자체는 절대 돌려주지 않는다) */
export async function aiReady() {
  const supabase = createClient();
  const { key, model } = await apiKey(supabase);
  const { count } = await supabase
    .from("comment_samples")
    .select("id", { count: "exact", head: true });
  return { ready: !!key, model, samples: count || 0 };
}

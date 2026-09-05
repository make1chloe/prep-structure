/** 부모님께 글 — 규칙 값과 ✨ 브리핑(AI 초안). 글을 쓰는 길은 day.js saveComment·closeSheet 그대로(한 벌).
 *  열쇠는 v2.integration 의 anthropic 줄(옛 앱 설정에서 0072 가 옮겼다) — 서버에서만 읽고 화면엔 글만 돌려준다. 코드에도 대화에도 열쇠는 없다 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./supabase.js";
import { assertOpen } from "./day.js";
import { quizzesOf } from "./quiz.js";
import { seoulHour } from "./day-plan.js";
import { KIND, commentCfg, isOver, countChars, cutAtSentence, sameAsDraft, facts, promptFor, attached } from "./comment-plan.js";
import { ruleMap } from "./rule.js";
const MODEL = "claude-opus-5";   // 연동 줄의 config.model 이 있으면 그것
/** 규칙 값 한 조회(뼈대-5) — 갈래마다 길이 · 늦은밤 시작 · 다시 시키는 횟수. 지금 서울 시각도 같이(「늦은밤」이 저절로 골라지게). 줄이 없으면 던진다 */
export async function commentRules(sb) { return commentCfg(await ruleMap(sb, ["comment."]), seoulHour(new Date())); }
async function integration(sb, id) {
  const { data, error } = await db(sb).from("integration").select("config").eq("id", id).maybeSingle();
  if (error) throw new Error(`연동을 못 읽음 ${id}: ${error.message}`);
  return data?.config ?? null;
}
const explain = (e) =>
  e instanceof Anthropic.AuthenticationError ? "AI 열쇠가 맞지 않습니다 — 연동(anthropic)의 key 를 확인하세요"
  : e instanceof Anthropic.NotFoundError ? `AI 모델 이름이 틀렸습니다 — 연동(anthropic)의 model 을 확인하세요: ${e.message}`
  : e instanceof Anthropic.RateLimitError ? "AI 가 바쁩니다 — 잠시 뒤 다시 누르세요"
  : e instanceof Anthropic.APIConnectionError ? `AI 를 부르지 못했습니다: ${e.message}`
  : e instanceof Anthropic.APIError ? `AI 가 답하지 못했습니다(${e.status}): ${e.message}`
  : `AI 오류: ${e?.message ?? e}`;
/** ✨ 브리핑 — 상황·길이·키워드로 초안을 시킨다. 넘으면 다시 시킨다(규칙 comment.retry) · 그래도 넘으면 문장 끝에서 자른다.
 *  초안은 comment_ai 에 남기고, 글(comment)은 **비어 있거나 지난 초안 그대로일 때만** 바꾼다 — 원장님 말은 덮지 않는다 */
export async function draftComment(sb, sheetId, { kind, cap, keys } = {}, cfg) {
  await assertOpen(sb, sheetId);
  if (!KIND.some(([k]) => k === kind)) throw new Error(`갈래가 아닙니다: ${kind}`);
  const n = Number(cap); if (!n) throw new Error(`길이가 아닙니다: ${cap}`);
  const [sheetQ, ai, aiRules, samplesQ] = await Promise.all([
    db(sb).from("day_sheet").select("*,students(name,grade),day_item(*,units(label,short,book_id),learn_items(name)),late_stay(*),day_area_memo(*)").eq("id", sheetId).single(),
    integration(sb, "anthropic"), integration(sb, "ai_rules"),
    db(sb).from("comment_sample").select("body,tag").order("id", { ascending: false }).limit(40),
  ]);
  if (sheetQ.error) throw new Error(`판을 못 읽음: ${sheetQ.error.message}`);
  const key = String(ai?.key ?? "").trim();
  if (!key) throw new Error("AI 열쇠가 없습니다 — 연동(v2.integration)의 anthropic 줄에 key 가 있어야 합니다. 옛 앱 설정에 넣은 열쇠는 0072 가 옮겼습니다");
  const raw = sheetQ.data;
  const items = (raw.day_item ?? []).filter((i) => !i.off);
  const sheet = { ...raw, check: items.filter((i) => i.slot === "check"), class: items.filter((i) => i.slot === "class"), home: items.filter((i) => i.slot === "home"), late: (raw.late_stay ?? [])[0] ?? null, memos: raw.day_area_memo ?? [] };
  const quizzes = await quizzesOf(sb, [raw.student_id], raw.date);
  const today = quizzes.filter((q) => q.taken_on === raw.date), next = quizzes.filter((q) => q.state === "planned" && q.taken_on == null);
  const lines = attached({ next, late: sheet.late, warn: null });
  const samples = (samplesQ.data ?? []).map((s) => (s.tag ? `[${s.tag}] ${s.body}` : s.body));
  const { system, user } = promptFor({ kind, cap: n, samples, rules: String(aiRules?.text ?? "").trim(), factLines: facts({ student: raw.students, sheet, quizzes: today, keys, lines }) });
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 40_000 });
  const model = String(ai?.model ?? "").trim() || MODEL;
  let text = "", tries = 0, messages = [{ role: "user", content: user }];
  for (;;) {
    let res;
    try {
      res = await client.messages.create({ model, max_tokens: 800, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages, output_config: { effort: "low" } });
    } catch (e) { throw new Error(explain(e)); }
    if (res.stop_reason === "refusal") throw new Error("AI 가 이 글을 거절했습니다 — 직접 적어 주세요");
    text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (!text) throw new Error("AI 가 빈 글을 냈습니다 — 다시 누르거나 직접 적어 주세요");
    if (!isOver(text, n) || tries >= (cfg?.retry ?? 0)) break;
    tries++;
    messages = [...messages, { role: "assistant", content: text }, { role: "user", content: `${countChars(text)}자입니다 — ${n}자 이내(공백 포함)로 줄여서 본문만 다시 쓰세요.` }];
  }
  const cut = isOver(text, n);
  if (cut) text = cutAtSentence(text, n);
  const replaced = !String(raw.comment ?? "").trim() || sameAsDraft(raw.comment, raw.comment_ai);
  const patch = { comment_ai: text, comment_kind: kind, comment_cap: n, comment_keys: String(keys ?? "").trim() || null, ...(replaced ? { comment: text } : {}) };
  const { error } = await db(sb).from("day_sheet").update(patch).eq("id", sheetId);
  if (error) throw new Error(`초안을 못 저장함: ${error.message}`);
  return { text, chars: countChars(text), retried: tries, cut, replaced };
}

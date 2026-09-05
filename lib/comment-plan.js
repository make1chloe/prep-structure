/** 부모님께 글 판단(목업 01 ✉️ · 03 폰) — 순수, 표를 안 읽는다. 화면(클라이언트)과 서버가 같이 들여온다.
 *  갈래 다섯 · 길이 넷 · **상황이 길이를 먼저 고른다** · 그날 상태에서 갈래가 저절로 · 글자 세기 · 넘으면 **문장 끝에서** 자른다(글자 중간에서 안 자른다)
 *  · 글 밑에 저절로 붙는 줄(학부모 화면 09 · 발송 10 이 같은 것을 붙인다 — 미리보기가 곧 그것) · AI 초안 그대로인가 · AI 재료(사실만)와 지시문 */
import { KIND as QUIZ_KIND, scopeText } from "./quiz-plan.js";
export const KIND = Object.freeze([["normal", "보통"], ["no_homework", "숙제안함"], ["before_exam", "시험전"], ["after_exam", "시험후"], ["late_night", "늦은밤"]]);
export const CAPS = Object.freeze([50, 100, 200, 300]);
export const kindName = (kind) => KIND.find(([k]) => k === kind)?.[1] ?? kind;
export const capName = (cap) => (Number(cap) === 50 ? "50자 이하" : `${cap}자`);
/** 상황이 길이를 먼저 고른다 — 값은 v2.rule 의 comment.cap.*(뼈대-5). 줄이 없으면 던진다 */
export function capOf(kind, caps) { const v = Number(caps?.[kind]); if (!v) throw new Error(`규칙 줄이 없다: comment.cap.${kind}`); return v; }
/** 그날 그 아이 상태에서 갈래가 저절로 골라진다 — 늦은밤(서울 시각 ≥ lateFrom) › 시험후 › 시험전 › 숙제안함(검사에 ✕) › 보통. 원장님은 바꾸고 싶을 때만 바꾼다.
 *  시험 전후(exam: "before" | "after")는 시험 06 을 지은 뒤 넣는 자리 — 지금은 아무도 안 넘긴다 */
export function pickKind({ hour = null, lateFrom = null, checks = [], exam = null } = {}) {
  if (hour != null && lateFrom != null && Number(hour) >= Number(lateFrom)) return "late_night";
  if (exam === "after") return "after_exam";
  if (exam === "before") return "before_exam";
  if (checks.some((c) => c?.status === "missing")) return "no_homework";
  return "normal";
}
const norm = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
/** 글자 수 — 공백 포함, 줄바꿈·연이은 공백은 한 칸으로 센다 */
export const countChars = (text) => [...norm(text)].length;
export const isOver = (text, cap) => countChars(text) > Number(cap);
/** cap 이하 중 **마지막 문장 끝**에서 자른다 — 문장 끝(. ! ? … 뒤가 공백이나 끝)이 없으면 마지막 띄어쓰기에서, 그것도 없으면 cap 에서.
 *  그래서 「100자」를 시키면 정확히 100자가 아니라 90자쯤에서 끝난다(정직하게 — 목업 FAQ) */
export function cutAtSentence(text, cap) {
  const s = norm(text), chars = [...s], n = Number(cap);
  if (chars.length <= n) return s;
  const head = chars.slice(0, n).join("");
  const ends = [...head.matchAll(/[.!?…](?=\s|$)/g)];
  if (ends.length) return head.slice(0, ends[ends.length - 1].index + 1).trim();
  const sp = head.lastIndexOf(" ");
  return (sp > 0 ? head.slice(0, sp) : head).trim();
}
/** AI 초안을 안 고쳤나 — 공백 차이는 같은 것으로. 초안이 없으면 거짓 */
export const sameAsDraft = (comment, ai) => Boolean(norm(ai)) && norm(comment) === norm(ai);
/** 글 밑에 저절로 붙는 줄 — 다음 시간 시험(**전체 개수가 있어야** 붙는다 · 리포트 10 도 같은 문) · 늦귀가(예상 귀가 약속) · 반성문 처분. on 이 꺼진 줄은 「왜 안 붙나」를 말한다 */
export function attached({ next = [], late = null, warn = null } = {}) {
  const lines = [];
  for (const q of next ?? []) {
    const name = QUIZ_KIND.find(([k]) => k === q.kind)?.[1] ?? "시험", on = q.total != null && Number(q.total) > 0;
    lines.push({ key: `quiz:${q.id}`, on, text: on ? `다음 시간 ${name} 시험 — ${scopeText(q)} ${q.total}개 · 통과 ${q.cut_pct ?? 90}%` : `${name} 시험 — 개수를 안 적어 안 붙습니다` });
  }
  if (late?.until_at) lines.push({ key: "late", on: true, text: `오늘 ${String(late.until_at).slice(0, 5)} 귀가 예정${late.reason ? ` — ${late.reason}` : ""}` });
  if (warn?.today_disposal === "homework") lines.push({ key: "refl", on: true, text: "반성문 — 다음 시간 숙제로 씁니다" });
  if (warn?.today_disposal === "stay") lines.push({ key: "refl", on: true, text: "반성문 — 오늘 남아서 씁니다" });
  return lines;
}
/** 학부모가 볼 글 = 원장님 글 + 붙는 줄(켜진 것만). 09·10 은 이것을 그대로 쓴다 */
export const preview = (comment, lines = []) => [norm(comment) ? String(comment).trim() : "", ...lines.filter((l) => l.on).map((l) => l.text)].filter(Boolean).join("\n");
const ATTEND_NAME = { present: "왔음", late: "지각", absent: "결석", early: "조퇴", online: "온라인", makeup: "보강으로 옴", off: "휴강" };
const STATUS_NAME = { done: "○ 해옴", weak: "△ 일부", missing: "✕ 안 해옴", none: "아직 안 봄", inclass: "학원에서 함" };
const itemName = (it) => it?.learn_items?.name ?? it?.text ?? it?.units?.label ?? "항목";
/** AI 재료 — 사실만 한 줄에 하나. 지어낼 것이 없게 판 그대로 준다 */
export function facts({ student, sheet, quizzes = [], keys = "", lines = [] } = {}) {
  const out = [`학생: ${student?.name ?? "학생"}${student?.grade ? ` (${student.grade}학년)` : ""}`];
  if (sheet?.attend) out.push(`출결: ${ATTEND_NAME[sheet.attend] ?? sheet.attend}`);
  const checks = (sheet?.check ?? []).map((it) => `${itemName(it)}${it.units?.label ? ` ${it.units.label}` : ""} ${STATUS_NAME[it.status ?? "none"] ?? it.status}${it.range_note ? ` (${it.range_note})` : ""}`);
  if (checks.length) out.push(`숙제 검사: ${checks.join(", ")}`);
  const cls = (sheet?.class ?? []).map((it) => `${itemName(it)}${it.units?.label ? ` ${it.units.label}` : ""}`);
  if (cls.length) out.push(`오늘 학원에서 한 것: ${cls.join(", ")}`);
  const home = (sheet?.home ?? []).map((it) => `${itemName(it)}${it.units?.label ? ` ${it.units.label}` : ""}`);
  if (home.length) out.push(`오늘 낸 숙제: ${home.join(", ")}`);
  for (const q of quizzes) if (q.pct != null) out.push(`오늘 ${QUIZ_KIND.find(([k]) => k === q.kind)?.[1] ?? ""} 시험: ${scopeText(q)} ${q.pct}%${q.passed === false ? " (통과 못 함 — 재시험)" : q.passed ? " (통과)" : ""}`);
  if (sheet?.late?.until_at) out.push(`늦귀가: 오늘 ${String(sheet.late.until_at).slice(0, 5)}까지 남아서${sheet.late.reason ? ` — ${sheet.late.reason}` : ""}`);
  for (const l of lines.filter((x) => x.on)) out.push(`글 밑에 앱이 붙이는 줄(다시 쓰지 말 것): ${l.text}`);
  if (norm(keys)) out.push(`원장님이 꼭 넣고 싶은 말(이것을 중심으로): ${norm(keys)}`);
  return out;
}
const GUIDE = {
  normal: "보통 날 — 오늘 한 것과 잘한 것 하나, 다음 시간에 할 것 하나.",
  no_homework: "숙제를 안 해온 날 — 무엇을 안 했는지 사실대로, 아이를 깎아내리지 않고, 학원에서 어떻게 했고 다음에 어떻게 할지로 맺는다.",
  before_exam: "시험 전 — 준비된 것과 남은 것, 집에서 봐 줄 것 하나.",
  after_exam: "시험 직후 — 결과(주어진 사실만)와 잘된 것, 다음에 보완할 것.",
  late_night: "늦은 밤 — 한두 문장. 인사 없이 핵심만.",
};
/** AI 지시문 — 옛 앱 draftComment 의 규칙을 잇는다: 주어진 사실만 · 인사말 없음 · 원장님 말투 본보기 · 길이 상한. 시스템(고정, 캐시)과 사용자(오늘 사실)로 나눈다 */
export function promptFor({ kind, cap, samples = [], rules = "", factLines = [] }) {
  const system = [
    "당신은 한국 영어학원 원장이 학부모에게 보내는 그날 수업 글을 대신 씁니다.",
    "",
    "규칙",
    "- **주어진 사실만** 씁니다. 점수·태도·분량을 지어내지 마세요.",
    "- 인사말과 맺음말은 넣지 않습니다(앞뒤는 앱이 붙입니다). 아이 이름 대신 「아이」로 쓰거나 이름을 한 번만 씁니다.",
    "- 내용이 둘 이상이면 줄을 나눕니다. 별표·가운뎃점 같은 기호는 넣지 마세요.",
    "- 못한 것을 적을 때도 아이를 깎아내리지 않고 다음에 어떻게 할지로 맺습니다.",
    "- 이모티콘·이모지를 쓰지 마세요.",
    "- 「글 밑에 앱이 붙이는 줄」은 앱이 따로 붙이니 본문에 다시 쓰지 마세요.",
    "- 아래는 원장님이 예전에 직접 쓰신 문장입니다. 베끼지 말고 **어투·호칭만** 따라 쓰세요. 급히 적으신 요지라 **조금 더 친절하게, 문장을 갖춰서** 씁니다.",
    samples.length ? samples.map((s) => `  ${s}`).join("\n") : "  (아직 본보기 문장이 없습니다)",
    rules ? `\n아래는 원장님이 항상 지켜달라고 하신 것입니다. 위 규칙과 부딪히면 이쪽을 따르세요.\n${rules.split("\n").map((x) => `  ${x}`).join("\n")}` : "",
    "",
    "본문만 내놓습니다. 설명하지 마세요.",
  ].filter((x) => x !== "").join("\n");
  const user = [
    `상황: ${kindName(kind)} — ${GUIDE[kind] ?? ""}`,
    `길이: **${cap}자 이내**(공백 포함). 넘기면 안 됩니다 — 짧은 쪽이 낫습니다.`,
    "",
    "오늘 기록",
    ...factLines.map((l) => `- ${l}`),
  ].join("\n");
  return { system, user };
}

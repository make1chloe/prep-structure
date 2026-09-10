/** 연동 열쇠 판단 한 벌(순수 — (터) 2026-09-10 원장님 「웹앱 자체에서 솔라피 연동정보를 바꿀수있어야해 매번 코드바꿀수없어」 · 확정-72) —
 *  어떤 열쇠가 있나(솔라피 문자 · 나이스 학사일정 · AI 초안) · 칸 · **가리기**(화면에는 가린 것만 간다 — 비밀은 서버 밖으로 안 나온다) · 다 찼나 · 저장 값 합치기(빈 칸은 그대로 둔다).
 *  표는 v2.integration 한 곳(0031) · 쓰기는 서버 자신뿐(사람은 revoke — 0031). 화면과 서버가 같은 것을 본다 */
export const KEYS = Object.freeze([
  { id: "solapi", emo: "✉️", name: "문자 (솔라피)", why: "등록 안내·상담 안내 문자가 이 열쇠로 나갑니다. 발신번호는 솔라피에 미리 등록해 두셔야 합니다.", site: "https://solapi.com",
    fields: [{ k: "key", label: "API Key", peek: true, hint: "솔라피 → 개발/연동 → API Key" },
             { k: "secret", label: "API Secret", secret: true, hint: "한 번만 보입니다 — 잃으면 새로 만드세요" },
             { k: "from", label: "발신번호", secret: false, hint: "솔라피에 등록한 번호(010…)" }] },
  { id: "neis", emo: "📡", name: "학사일정 (나이스)", why: "받아오기 12b 의 「🔄 다시 받기」가 이 열쇠로 학교 일정을 받습니다.", site: "https://open.neis.go.kr",
    fields: [{ k: "key", label: "인증키", secret: true, hint: "나이스 열린포털 → 인증키 신청" }] },
  { id: "anthropic", emo: "🤖", name: "AI 초안 (앤트로픽)", why: "부모님께 글의 초안을 이 열쇠로 씁니다. 없으면 초안 단추만 안 돕니다.", site: "https://console.anthropic.com",
    fields: [{ k: "key", label: "API Key", secret: true, hint: "sk-ant- 로 시작합니다" }] },
]);
export const keyDef = (id) => KEYS.find((k) => k.id === id) ?? null;
/** 가리기 — 비밀(secret)은 길이만 · 알아보기(peek)는 앞 넉 자만 · 나머지(발신번호)는 그대로. 화면으로는 이것만 간다(진짜 값은 서버 밖으로 안 나온다) */
export function maskValue(field, value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (field?.secret) return `●●●●${v.length > 4 ? ` (${v.length}자)` : ""}`;   // 비밀 — 길이만
  if (field?.peek) return `${v.slice(0, 4)}…${v.length > 8 ? v.slice(-2) : ""} (${v.length}자)`;   // 어느 열쇠인지만 알아보게 앞 넉 자
  return v;   // 발신번호처럼 눈으로 봐야 고치는 것
}
/** 한 줄의 상태 — 다 찼나 · 빈 칸 이름들 · 화면에 보일 값(가려서) */
export function keyRow(def, config = {}) {
  const fields = def.fields.map((f) => ({ ...f, filled: Boolean(String(config?.[f.k] ?? "").trim()), shown: maskValue(f, config?.[f.k]) }));
  const missing = fields.filter((f) => !f.filled).map((f) => f.label);
  return { id: def.id, emo: def.emo, name: def.name, why: def.why, site: def.site, fields, missing, ready: missing.length === 0 };
}
export const keyRows = (configs = {}) => KEYS.map((d) => keyRow(d, configs[d.id] ?? {}));
/** 저장할 값 — 적은 칸만 바꾼다(비운 칸은 있던 값 그대로 · 비밀을 다시 적게 하지 않는다) · 지우려면 「-」 한 글자 */
export function mergeConfig(def, old = {}, form = {}) {
  const out = { ...(old ?? {}) };
  for (const f of def.fields) {
    const raw = form?.[f.k];
    if (raw === undefined || raw === null) continue;
    const v = String(raw).trim();
    if (!v) continue;                       // 비워 두면 그대로
    if (v === "-") { delete out[f.k]; continue; }   // 「-」 한 글자면 지운다
    out[f.k] = v;
  }
  return out;
}
/** 무엇이 바뀌었나 — 화면에 알려 줄 말(값은 안 적는다) */
export const changedText = (def, old = {}, next = {}) => {
  const ch = def.fields.filter((f) => String(old?.[f.k] ?? "") !== String(next?.[f.k] ?? "")).map((f) => f.label);
  return ch.length ? `${ch.join(" · ")} 고쳤습니다` : "바뀐 것이 없습니다";
};

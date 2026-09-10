/** 문자(솔라피) 판단 한 벌(순수 — (커) 2026-09-10 원장님 「등록 전에 안내문자 … 어플주소도 알려주고 … 솔라피」 · 「기본 틀은 너가 짜 돼 내가 자유롭게 내용을 추가 수정」 · 확정-71) —
 *  전화 다듬기·가리기 · 글자 수(통신사 바이트) → SMS/LMS · 치환(빈 자리는 못 나간다 · 「덧붙임」처럼 비어도 되는 자리는 줄째 사라진다) · 짐 · 답 읽기(서명·주소는 서버 쪽 lib/solapi.js — 이 파일은 화면도 가져온다).
 *  망을 타지 않는다 — 부르는 자리는 lib/solapi.js 하나(대전제-7 · 검사-①) · 열쇠는 v2.integration 'solapi'(key · secret · from). 화면(글자 수 미리보기)과 서버가 같은 것을 본다 */
/** 비어도 되는 자리 — 값이 없으면 그 줄째 사라진다(원장님이 아이마다 덧붙이는 말) */
export const OPTIONAL = Object.freeze(["덧붙임", "한 줄"]);   // 비면 그 줄이 통째로 사라진다(뼈대-11 의 반대쪽 — 치환 자리가 남으면 못 나간다)
/** 전화 — 숫자만 · 휴대전화 꼴(01X + 7~8자리)만 받는다 · 아니면 null */
export function phoneDigits(p) { const d = String(p ?? "").replace(/\D/g, ""); return /^01[016789]\d{7,8}$/.test(d) ? d : null; }
/** 가린 번호 「010-****-5678」 — 자취(notify_log.to_phone)에는 이것만 남긴다(전화번호를 그대로 안 쌓는다) */
export const maskPhone = (p) => { const d = String(p ?? "").replace(/\D/g, ""); return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : ""; };
/** 문자 길이 — 통신사 셈(한글·전각 2바이트 · 나머지 1) */
export const smsBytes = (t) => [...String(t ?? "")].reduce((n, ch) => n + (ch.codePointAt(0) > 127 ? 2 : 1), 0);
export const SMS_MAX_BYTES = 2000;
/** 90바이트까지 SMS · 넘으면 LMS(2000바이트까지 · 그보다 길면 못 보낸다) */
export const smsType = (t) => (smsBytes(t) <= 90 ? "SMS" : "LMS");
/** 화면 줄 — 「LMS · 412 / 2000바이트」 · 넘치면 over */
export function lenText(t) { const n = smsBytes(t); return { bytes: n, type: smsType(t), over: n > SMS_MAX_BYTES, text: `${smsType(t)} · ${n} / ${SMS_MAX_BYTES}바이트` }; }
/** 치환 — {{자리}} 를 값으로. 비어도 되는 자리(OPTIONAL)는 빈 값이면 그 줄을 지운다 · 나머지는 missing 으로 돌려준다(뼈대-11: 비면 못 나간다) */
export function fill(template, vars = {}, optional = OPTIONAL) {
  const missing = [];
  const lines = String(template ?? "").split("\n").map((line) => {
    let drop = false;
    const out = line.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (m, k) => {
      const v = vars[k], empty = v == null || String(v).trim() === "";
      if (!empty) return String(v);
      if (optional.includes(k)) { drop = true; return ""; }
      missing.push(k || "빈 자리"); return m;
    });
    return drop && !out.trim() ? null : out;
  }).filter((l) => l !== null);
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), missing: [...new Set(missing)] };
}
/** 한 통의 짐 — 받는 번호 · 발신번호(솔라피에 등록된 것) · 글 · 갈래(길이가 정한다) · LMS 면 제목 */
export function smsBody({ to, from, text, subject = null }) {
  const type = smsType(text);
  if (smsBytes(text) > SMS_MAX_BYTES) throw new Error(`문자가 너무 깁니다(${smsBytes(text)}바이트 · ${SMS_MAX_BYTES}까지)`);
  if (!phoneDigits(to)) throw new Error("받는 번호가 휴대전화가 아닙니다");
  if (!String(from ?? "").replace(/\D/g, "")) throw new Error("발신번호가 없습니다 — 연동(solapi)의 from");
  return { message: { to: phoneDigits(to), from: String(from).replace(/\D/g, ""), text, type, ...(type === "LMS" ? { subject: String(subject ?? "안내").slice(0, 40) } : {}) } };
}
/** 솔라피 답 읽기 — 2xx + statusCode 2000 대면 접수 · 아니면 까닭 한 줄(열쇠는 절대 안 적는다) */
export function readSolapi(json, status) {
  const code = String(json?.statusCode ?? ""), ok2 = status >= 200 && status < 300;
  if (ok2 && (code.startsWith("2") || !code)) return { ok: true, id: json?.messageId ?? null, why: null };
  const msg = json?.errorMessage ?? json?.statusMessage ?? "";
  return { ok: false, id: null, why: `솔라피 ${status}${json?.errorCode ? ` ${json.errorCode}` : code ? ` ${code}` : ""}${msg ? ` — ${String(msg).slice(0, 120)}` : ""}` };
}
/** 문구 갈래 — 화면(발송 10 「✉️ 문자 문구」)이 고치는 것 둘. 표는 v2.msg_template(0154) */
export const TEMPLATES = Object.freeze([
  ["sms_welcome", "첫 등원 안내", "18 등록 전환을 누르면 학부모 전화로 — 앱 주소 · 아이디 · 처음 비밀번호 · 규정 · 교재 · 시간표"],
  ["sms_guide", "상담 안내", "18 「📨 안내 문자」 — 문의한 집에 한 통"],
  ["sms_late", "늦은 귀가 안내", "앱 알림과 함께 — 발송 10 에서 켠 갈래만(늦귀가)"],
  ["sms_fee", "수강료 안내", "앱 알림과 함께 — 발송 10 에서 켠 갈래만(수강료)"],
  ["sms_monthly", "월간 리포트", "앱 알림과 함께 — 발송 10 에서 켠 갈래만(월간)"],
]);
/** (뎌-2) 앱 알림과 **함께** 문자로도 갈 수 있는 갈래 — 규칙 notify.sms_kinds 가 켠 것만 나간다(비면 등록·상담 안내만) */
/** (뎌-2) 갈래마다의 「한 줄」 — 문구의 {{한 줄}} 에 들어간다. 비면 그 줄이 사라진다(OPTIONAL).
 *  늦귀가는 예상 시각과 사유 · 수강료는 달과 금액 · 월간은 그 달. 셈이 아니라 **글**이라 여기(순수)에 둔다 */
export const lateLine = (late) => { const t = String(late?.until_at ?? "").slice(0, 5); const why = String(late?.reason ?? "").trim();
  return t ? `오늘 ${t} 귀가 예정${why ? ` · ${why}` : ""}` : (why || ""); };
export const feeLine = (ym, amount) => { const m = Number(String(ym ?? "").slice(5, 7)); const won = Number(amount);
  return [m ? `${m}월 수강료` : "수강료", Number.isFinite(won) && won > 0 ? `${won.toLocaleString("ko-KR")}원` : null].filter(Boolean).join(" "); };
export const monthlyLine = (ym) => { const m = Number(String(ym ?? "").slice(5, 7)); return m ? `${m}월 리포트입니다` : ""; };
export const SMS_ALSO = Object.freeze([["late", "늦은 귀가"], ["fee", "수강료"], ["monthly", "월간 리포트"]]);
export const smsAlsoName = (k) => SMS_ALSO.find(([x]) => x === k)?.[1] ?? k;
/** 이 갈래를 문자로도 보내나 — 규칙 목록에 들어 있고, 보낼 수 있는 갈래일 때만 */
export const smsAlso = (kinds, kind) => SMS_ALSO.some(([k]) => k === kind) && (kinds ?? []).includes(kind);
export const templateName = (kind) => TEMPLATES.find(([k]) => k === kind)?.[1] ?? kind;

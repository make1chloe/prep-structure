/** 자료함 판단 한 벌(순수 — 목업 20 「주고받기」). 학교가 주는 종이가 여기로 모인다: 받은 것(갈래만 고른다 · 학교·학년·학기는 아이에게서 저절로) · 갈래별 묶음 · 보낸 것(붙인 숙제 · 아이가 처리했나) · 아이 쪽 1달(규칙 file.child_days).
 *  겹치는 것을 막지 않는다 — 사진 화질이 다르다(원장님 9/2) · 지우지 않는다(원장님 9/3 「그냥 둬」) · 30장 · 긴 변 1600px(사진만) — 숫자는 v2.rule(file.*) 에서 온다 */
import { md, daysBetween, seoulDate } from "./dash-plan.js";
export const KINDS = Object.freeze(["수행평가", "시험 안내", "수업자료", "학사일정", "가정통신문", "그 밖"]);
export const isKind = (k) => KINDS.includes(k);
/** 받는 파일 종류 — 9000 의 버킷 allowed_mime_types 와 같은 목록(전환일에 버킷이 이 목록으로 선다) */
export const ALLOWED_MIME = Object.freeze(["image/jpeg", "image/pjpeg", "image/png", "image/heic", "image/heif", "image/webp", "image/gif", "image/bmp", "image/tiff", "application/pdf",
  "application/haansofthwp", "application/x-hwp", "application/vnd.hancom.hwp", "application/vnd.hancom.hwpx", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"]);
export const isImage = (mime) => /^image\//.test(String(mime ?? ""));
export const icon = (mime) => (isImage(mime) ? "📷" : "📄");
export const sizeText = (bytes) => { const n = Number(bytes) || 0; return n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`; };
/** 확장자 — 이름에서, 없으면 종류에서. 보관 경로에 쓴다(사람 이름이 든 원래 이름은 경로에 안 쓴다) */
export function extOf(name, mime) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name ?? "").trim()); if (m) return m[1].toLowerCase();
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv" })[mime] ?? "bin";
}
/** 보관 경로 — 연/월/무작위.확장자. 이름이 겹쳐도 안 덮는다(겹치는 것을 막지 않는다 — 화질이 다르다) */
export const pathFor = (date, id, ext) => `${String(date).slice(0, 4)}/${String(date).slice(5, 7)}/${id}.${ext}`;
/** 사진 줄이기 계획 — 긴 변이 maxPx 를 넘으면 그 비율로. pdf·문서는 부르지 않는다(안 줄인다) */
export function shrinkPlan(w, h, maxPx) {
  const long = Math.max(w, h); if (!(long > maxPx)) return { w, h, shrink: false };
  const k = maxPx / long; return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), shrink: true };
}
/** 한 번에 몇 장 — 넘으면 나눠 올리라고 말한다(조용히 자르지 않는다) */
export function acceptBatch(n, max) { const m = Number(max) || 30; return n > m ? { ok: false, msg: `한 번에 ${m}장까지입니다 — ${n}장은 나눠 올려 주세요` } : n < 1 ? { ok: false, msg: "올릴 파일을 고르세요" } : { ok: true, msg: "" }; }
/** 파일 하나가 되나 — 종류(버킷 목록) · 크기(규칙 file.max_mb). 사진은 줄인 뒤의 크기를 본다 */
export function checkFile({ name, mime, bytes }, { maxMb = 4 } = {}) {
  if (!ALLOWED_MIME.includes(String(mime ?? ""))) return `받지 않는 종류입니다 — ${name ?? ""}(${mime || "종류 없음"}). 사진·pdf·한글·워드·엑셀·파워포인트·글`;
  const cap = (Number(maxMb) || 4) * 1048576;
  if (!(Number(bytes) > 0)) return `빈 파일입니다 — ${name ?? ""}`;
  if (Number(bytes) > cap) return `${maxMb}MB 를 넘습니다 — ${name ?? ""} ${sizeText(bytes)}. 사진이면 앱이 줄이니 문서만 걸립니다 — 나눠 주세요`;
  return null;
}
/** 누가 보냈나 — 「강민서 어머니가 보냄」 꼴. 학부모 계정은 아이 이름으로 말한다 */
/** 이/가 — 받침이 있으면 「이」(학생이) 없으면 「가」(지우가). 한글이 아니면 「가」 */
export const ga = (name) => { const c = String(name ?? "").trim().slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? "이" : "가"; };
export function whoText(f) {
  if (f.by_role === "parent") return `${f.student_name ?? "아이"} 학부모가 보냄`;
  if (f.by_role === "student") { const nm = f.student_name ?? f.by_name ?? "아이"; return `${nm}${ga(nm)} 보냄`; }
  const nm = f.by_name ?? "학원"; return `${nm}${ga(nm)} 보냄`;
}
/** 저절로 붙는 꼬리표 — 「🏫 옥련여고 1 · 26-2」. 학교가 없으면 그렇게 말한다(그 밖으로 가라고) */
export const autoTag = (f) => (f.school_name ? `🏫 ${f.school_name} ${f.student_grade ?? ""} · ${f.term ?? ""}`.replace(/\s+·/, " ·") : "학교 없음 — 「그 밖」으로");
/** 방금 온 것 줄 — 새것부터. 갈래는 원장님이 고른다 */
export const inboxRows = (inbox = []) => (inbox ?? []).map((f) => ({ ...f, who: whoText(f), tag: autoTag(f), icon: icon(f.mime), size: sizeText(f.bytes), when: `${md(seoulDate(f.uploaded_at))}` }));
const binTitle = (b) => (b.kind === "학사일정" ? `${b.term ? b.term.slice(0, 2) : ""}학년도 학사일정`.replace(/^학년도/, "학사일정") : `${b.term ?? ""} ${b.kind}`.trim());
/** 갈래별 칸 — 학교·학년마다 한 칸(묶음 카드: 「26-1 수행평가 · 사진 5 · 3.4MB · 마지막 9/2」) + 「🧑‍🎓 아이별」 칸(그 밖 — 학교와 상관없는 것, 아이마다). 빈 묶음은 안 그린다 */
export function columns(bins = []) {
  const cols = new Map(); const kids = new Map();
  for (const b of bins ?? []) {
    const files = b.files ?? []; if (!files.length) continue;
    const bytes = files.reduce((n, f) => n + (Number(f.bytes) || 0), 0), last = files.map((f) => f.uploaded_at).sort().at(-1), photos = files.filter((f) => isImage(f.mime)).length;
    const card = { bin: b, title: binTitle(b), n: files.length, sub: [photos ? `사진 ${photos}` : null, files.length - photos ? `문서 ${files.length - photos}` : null].filter(Boolean).join(" · ") + ` · ${sizeText(bytes)}`, last: md(seoulDate(last)), same: photos >= 2 ? photos : 0, files };
    if (b.kind === "그 밖" && !b.school_id) {
      for (const f of files) { const k = f.student_id ?? "none"; if (!kids.has(k)) kids.set(k, { key: k, name: f.student_name ?? "(아이 없음)", files: [] }); kids.get(k).files.push(f); }
      continue;
    }
    const key = `${b.school_id ?? "none"}-${b.grade ?? ""}`;
    if (!cols.has(key)) cols.set(key, { key, title: `🏫 ${b.school ?? "학교 없음"} ${b.grade ?? ""}`.trim(), n: 0, cards: [] });
    const col = cols.get(key); col.n += files.length; col.cards.push(card);
  }
  const out = [...cols.values()].sort((a, b) => a.title.localeCompare(b.title, "ko"));
  if (kids.size) out.push({ key: "kids", title: "🧑‍🎓 아이별", n: [...kids.values()].reduce((n, k) => n + k.files.length, 0), cards: [...kids.values()].map((k) => ({ bin: null, title: `${k.name} · 그 밖`, n: k.files.length, sub: `사진 ${k.files.filter((f) => isImage(f.mime)).length} · ${sizeText(k.files.reduce((n, f) => n + (Number(f.bytes) || 0), 0))}`, last: md(seoulDate(k.files.map((f) => f.uploaded_at).sort().at(-1))), why: "학교와 상관없는 것", files: k.files, same: 0 })) });
  return out;
}
/** 같은 것이 여럿일 때 — 가장 또렷한 것(가장 큰 사진). 판단은 「골라 씁니다」 — 앱이 지우지 않는다 */
export function sharpest(files = []) { const ph = (files ?? []).filter((f) => isImage(f.mime)); if (ph.length < 2) return null; return ph.reduce((a, f) => (Number(f.bytes) > Number(a.bytes) ? f : a), ph[0]).id; }
export const seenText = (l) => (l.seen_by_child === "saved" ? "💾 저장" : l.seen_by_child === "skip" ? "✓ 안 보기" : "아직");
/** 보낸 것 줄 — 파일마다 붙인 자리(「강민서 · 9/2 숙제 · CH5 부정사」)와 아이가 처리했나(N/M) */
export function sentRows(sent = []) {
  return (sent ?? []).map((f) => { const links = (f.links ?? []).map((l) => ({ ...l, seen: seenText(l), target: l.day_item_id ? `${l.student_name ?? ""} · ${md(l.sheet_date)} 숙제 · ${l.item_name ?? ""}` : l.notice_id ? "공지" : l.consult_id ? "상담" : "안 붙임" }));
    return { ...f, icon: icon(f.mime), size: sizeText(f.bytes), when: md(seoulDate(f.uploaded_at)), links, done: links.filter((l) => l.seen_by_child).length, total: links.length }; });
}
/** 아이 쪽 — 1달 안의 붙임만(규칙 file.child_days). 아직 처리 안 한 것은 숙제 줄에, 처리한 것은 「지난 것 보기」에 · 1달이 지나면 안 보인다(원장님 자료함엔 그대로) */
export function childLinks(links = [], today, days = 30) {
  const d = Number(days) || 30;
  const live = (links ?? []).filter((l) => daysBetween(seoulDate(l.created_at), today) < d);
  const line = (l) => ({ ...l, icon: icon(l.file?.mime), name: l.file?.orig_name ?? "(파일)", size: sizeText(l.file?.bytes), seen: seenText(l), item: l.day_item?.learn_items?.name ?? l.day_item?.range_note ?? "", on: l.day_item?.day_sheet?.date ?? null, until: md(plusDaysStr(seoulDate(l.created_at), d)) });
  return { pending: live.filter((l) => !l.seen_by_child).map(line), past: live.filter((l) => l.seen_by_child).map(line), hidden: (links ?? []).length - live.length };
}
const plusDaysStr = (date, n) => { const x = new Date(`${date}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
/** 숫자 셋 — 받은 것 · 보낸 것 · 안 본 것(갈래 안 고른 것) */
export const counts = (b) => ({ received: (b?.inbox ?? []).length + (b?.bins ?? []).reduce((n, x) => n + (x.files ?? []).length, 0), sent: (b?.sent ?? []).length, unsorted: (b?.inbox ?? []).length });
/** 📤 보내기 양식 — 아이 · 숙제 줄(마지막 판) · 파일. 붙일 줄이 없는 아이는 그렇게 말한다 */
export function sendTargets(students = [], studentId) {
  const st = (students ?? []).find((s) => s.id === studentId); if (!st) return { student: null, items: [], why: "아이를 고르세요" };
  const items = st.sheet?.items ?? [];
  return { student: st, items, why: items.length ? "" : st.sheet ? `${md(st.sheet.date)} 판에 숙제 줄이 없습니다 — 오늘 수업에서 숙제를 내고 붙이세요` : "이 아이의 숙제 판이 없습니다 — 오늘 수업에서 숙제를 내고 붙이세요" };
}
/** ② 원장님 답 한 줄 — 갈래를 고르면 「받았어요 — 「수행평가」로 넣었어요」(자동 글은 갈래를 옮기면 따라 바뀐다 · 고쳐 쓴 글은 그대로 — SQL file_sort 와 같은 꼴) · 없으면 「아직 안 봤어요」 */
export const AUTO_REPLY = (kind) => `받았어요 — 「${kind}」로 넣었어요`;
export const isAutoReply = (t) => /^받았어요 — 「.*」로 넣었어요$/.test(String(t ?? ""));
export const replyText = (f) => (f?.reply ? f.reply : "아직 안 봤어요");
/** 내가 보낸 것 줄(아이·학부모 📎 카드) — 새것부터 · 답 · 사진이면 미리보기 */
export const myUploads = (files = []) => (files ?? []).map((f) => ({ ...f, icon: icon(f.mime), size: sizeText(f.bytes), when: md(seoulDate(f.uploaded_at)), reply: replyText(f), replied: Boolean(f.reply), photo: isImage(f.mime), kid: f.students?.name ?? null }));

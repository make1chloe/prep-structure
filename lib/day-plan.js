/** 날짜 글자('2026-09-06')를 다루는 순수 한 벌 — 요일 · 며칠 뒤. 화면(브라우저)과 서버(Vercel 은 UTC)가 같이 쓴다.
 *  ⚠️ `new Date(d + "T00:00:00+09:00").getDay()` 는 **프로세스 시간대**의 요일이다 — UTC 서버에선 서울 자정이 전날 15시라 하루 전 요일이 나온다(2026-09-05 걷기 캡처가 「9월 6일 토」로 잡음).
 *  달력 날짜의 요일은 시간대와 무관하다 — UTC 자정으로 만들어 UTC 메서드로만 읽는다(0-2 · 검사-㊴) */
import { isUnchecked } from "./status.js";
import { stopOn } from "./routine-plan.js";
import { stayRows } from "./late-plan.js";   // 「남」 줄 세는 법은 한 벌(원칙-1)
export const WEEKDAY = Object.freeze(["일", "월", "화", "수", "목", "금", "토"]);
const at = (date) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error(`날짜가 아닙니다: ${date}`); return new Date(`${date}T00:00:00Z`); };
/** 요일(0=일) — 어느 시간대에서 돌아도 같다 */
export const weekday = (date) => at(date).getUTCDay();
export const weekdayName = (date) => WEEKDAY[weekday(date)];
/** 며칠 뒤(음수면 전) 날짜 글자 */
export const plusDays = (date, n) => { const d = at(date); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** 지금 서울 시각의 시(0~23) · 프로세스 시간대와 무관(Intl · Asia/Seoul). 「늦은밤」 유형이 이것으로 골라진다 */
export const seoulHour = (now = new Date()) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hour12: false }).format(now)) % 24;
/** 서울 시각 「HH:MM」 — ISO 글자(timestamptz)를 프로세스 시간대와 무관하게 읽는다(Intl · Asia/Seoul). 「보냄 21:41」이 이것으로 보인다 */
export const seoulTime = (ts) => { if (!ts) return null; const d = new Date(ts); if (Number.isNaN(d.getTime())) throw new Error(`시각이 아닙니다: ${ts}`); const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value])); return `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`; };
/** 서울의 그 날 그 시각(「HH:MM」)을 ISO 글자로 — 고정 +09:00 이라 어디서 돌아도 같은 순간이다. 원장님이 실제 하원(등원 걸음 4)을 고칠 때 쓴다 */
export const seoulStamp = (date, hhmm) => { at(date); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hhmm))) throw new Error(`시각이 아닙니다: ${hhmm} · 「22:05」처럼 적으세요`); return new Date(`${date}T${hhmm}:00+09:00`).toISOString(); };

/** 01 판 — **지금 쓸 일이 없는 카드는 접고 연다**(원장님 2026-09-12 「더 편하고 간단하게 고도화시키라는 뜻」).
 *  설정이 아니라 **상태**로 정한다 — 적힌 것이 있는 아이는 저절로 펴져 있고, 없는 아이는 제목 줄만 보인다(한 번 누르면 펴진다).
 *  조회가 0 늘어난다(이미 받은 판으로만 센다 · 속도-1) · 저장도 안 한다(다음에 열면 그 날 상태가 다시 정한다).
 *  접혀도 **무엇이 들었는지는 제목 줄이 말한다**(대전제-0 · 「메모 없음」·「늦게 가는 아이 아님」). 마감한 수업 일지는 읽는 판이라 다 편다 */
export function shutCards(sheet, { stay = null, closed = false } = {}) {
  if (!sheet) return { late: null, areamemo: null, comment: null };
  const memos = (sheet.memos ?? []).filter((m) => String(m.memo ?? "").trim()).length;
  const late = Boolean(sheet.late?.until_at || String(sheet.late?.reason ?? "").trim()) || stayRows(sheet.stay).length > 0 || Boolean(stay?.left_at);
  const wrote = String(sheet.comment ?? "").trim().length;
  return {
    late: { shut: !closed && !late, text: late ? "" : "늦게 가는 아이 아님" },
    areamemo: { shut: !closed && memos === 0, text: memos ? `메모 ${memos}` : "메모 없음" },
    comment: { shut: !closed && wrote === 0, text: wrote ? `${wrote}자` : "아직 안 씀" },
  };
}

/** (어21) 3단의 업무 머리 — 카드 제목 줄과 가운데 업무 목록이 **같은 글**을 쓴다(원칙-1). 검사: 「n/N 남음」·「다 봤습니다」·「지난 숙제 없음」 */
export function checkText(sheet) { const n = sheet?.check?.length ?? 0, left = (sheet?.check ?? []).filter(isUnchecked).length; return n ? (left ? `${left}/${n} 남음` : "다 봤습니다") : "지난 숙제 없음"; }
/** 제목 줄이 오늘 볼 것을 말한다(🃏 → 📝 → 🔤 · 대전제-15) — 없으면 안 적힌다 */
export function checkIcons(student) { return [(student?.cc ?? []).length ? "🃏" : null, (student?.unitTests ?? []).length ? "✍️" : null, (student?.quizzes?.today ?? []).length ? "🔤" : null].filter(Boolean); }
/** 멈췄나는 routine-plan stopOn 한 곳 — 교재 머리 · 📄 업무와 같은 판단(날짜가 다른 판에서 거짓말하지 않는다) */
export function workText(sheet, books = [], date) { const stopped = books.filter((b) => stopOn(b, date) === "book_off").length; return [countText(sheet), stopped ? `보류 ${stopped}` : null].filter(Boolean).join(" · "); }
/** (어68) 오늘 나간 줄의 셈 한 벌 — 업무 꼬리표와 학생 줄 알약이 **같은 글**을 쓴다(원칙-1).
 *  「수업후」(stay · 3b 「남」 줄)를 여기에 넣은 까닭: 검사 줄의 손 넷 중 그것만 어느 셈에도 안 잡혀, 눌러도 화면에서 아무 숫자가 안 움직였다(원장님 2026-09-17 「눌러도 뭐가 변동이 없는 거 같애」). 0이면 안 적는다(대전제-21 · 노이즈) */
export function countText(sheet) { const stay = sheet?.stay?.length ?? 0; return [`학원 ${sheet?.class?.length ?? 0}`, `숙제 ${sheet?.home?.length ?? 0}`, stay ? `수업후 ${stay}` : null].filter(Boolean).join(" · "); }
/** 아이를 열면 먼저 열리는 업무 — 흐름에서 처음 안 끝난 것: 검사가 남았으면 검사, 아니면 오늘 학습(원장님 9/14 답). 한 번 정하면 저절로 안 옮긴다(예측 가능) */
export function firstTask(sheet) { return (sheet?.check ?? []).some(isUnchecked) ? "check" : "work"; }
/** 업무가 끝났나((어24) 원장님 9/15 「일단ㅇㅋ」) — 목록에 ✓ · 검사가 끝나면 오늘 학습이 저절로 열린다. 검사: 안 본 줄 0 · 오늘 학습: 루틴이 깔림 · 내신 자료: 줄 것·안 줌 0 · 글: 마감 */
export function taskDone(id, { sheet, closed = false, prepList = [] } = {}) {
  if (id === "check") return !(sheet?.check ?? []).some(isUnchecked);
  if (id === "work") return (sheet?.books ?? []).some((b) => b.laid_at);
  if (id === "prep") return prepList.length > 0 && prepList.every((x) => !x.toHand && !x.notGiven);
  if (id === "comment") return Boolean(closed);
  return false;
}
/** 출결 다섯(세그먼트 · v2.day_sheet.attend 의 CHECK 와 같다) · 화면(01 줄 · 고르기 띠)과 손(lib/attend.js)이 같은 벌을 쓴다((어28)-② 원칙-1 · 전엔 row.js 에 사본이 있었다) */
export const ATTEND = Object.freeze([["present", "출석"], ["late", "지각"], ["absent", "결석"], ["early", "조퇴"], ["online", "온라인"]]);
/** (어83) 「아직 안 찍음」 — 칩이 하나도 안 눌린 상태이자 **수업 일지의 기본값**(0180).
 *  원장님 2026-09-18 「그냥 체크가 안된상태를 기본으로 두고, 예정된 수업에서도 검사및 학습배정까지 …
 *  미리 해놓고 출결만 당일에 찍고 싶은거임. 그리고 실수로 찍었을때 취소하려는것도 있고.」
 *  전에는 판이 서는 순간 'present' 라 **판이 곧 출석**이었고, 그래서 앱이 오늘 말고는 판을 못 세웠다.
 *  칩이 아니라 상태라 ATTEND 목록에는 안 넣는다(화면에 단추로 안 선다) */
export const ATTEND_NONE = "none";
export const attendPicked = (v) => Boolean(v) && v !== ATTEND_NONE;
/** (어44) 지각·결석 까닭 넷(원장님 9/15 「질병 진료 가족일정 학교일정」) · v2.day_sheet.attend_reason 의 CHECK(0166)와 같다 · 어느 까닭이 경고에 안 세는가는 규칙 warn.excused(SQL warn_days 가 본다 · 기본 진료·학교 일정) */
export const ATTEND_REASON = Object.freeze([["sick", "질병"], ["clinic", "진료"], ["family", "가족 일정"], ["school", "학교 일정"]]);
export const REASON_ON = Object.freeze(["late", "absent"]);   // 까닭을 붙이는 출결 둘
const ATTEND_NAME = Object.freeze({ present: "출석", late: "지각", absent: "결석", early: "조퇴", online: "온라인", makeup: "보강으로 옴", off: "휴강" });   // 달력 · 부모님께 글 · 09 가 두 벌로 갖고 있던 것을 한 곳으로(원칙-1)
export const attendName = (v) => ATTEND_NAME[v] ?? v ?? "";
export const reasonName = (k) => ATTEND_REASON.find(([x]) => x === k)?.[1] ?? "";
/** 「지각(진료)」 · 까닭이 없으면 「지각」 · 01 · 07 · 09 · 달력 · 부모님께 글이 같은 글 한 벌 */
export const attendText = (attend, reason = null) => { const n = attendName(attend); const r = reasonName(reason); return r ? `${n}(${r})` : n; };
/** 줄 차례((어30)(어32) · 원장님 2026-09-15 「숙제검사화면에서, 교재별로 묶어서, 루틴순서대로 나열할 것」 → 「숙제든 오늘학습이든 단원이 똑같은 것에 대해서는 단원을 먼저 제시하고 그에 대한 활동을 순서대로 나열」).
 *  교재(이름 차례) → 단원(교재 안 차례 · 단원 없는 줄은 맨 끝) → 활동(루틴 차례 = 그 판에서 그 교재 줄에 항목이 처음 나온 차례 · layRoutine 이 깐 차례 · 손으로 낸 줄은 그 단원 끝) → 오래된 날짜 → 깐 차례.
 *  all: 차례를 셀 때 보는 줄 전부(이미 검사한 줄도 · 첫 줄이 검사됐어도 차례가 안 흔들린다). 검사 줄(lib/day.js notYetChecked · shape)과 01 학습·숙제 카드(unitTree)가 같은 것을 쓴다(원칙-1)
 *  (어35) bySort: 오늘 학습·숙제(07·01)는 day_item.sort 가 곧 차례 · 교재 등수 = 그 교재 줄의 가장 작은 sort · 단원도 · 줄은 sort(검사 먼저 끝난 교재부터 → 다 끝나면 루틴 차례 → 시작한 줄 앞 · routine-plan orderToday 가 쓴 차례) */
export function itemOrder(rows = [], all = rows, { bySort = false } = {}) {
  const blk = (r) => `${r.day_sheet?.student_id ?? r.sheet_id ?? ""}|${r.day_sheet?.date ?? ""}|${r.units?.book_id ?? ""}`;
  const lines = new Map();
  for (const r of [...all].sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0))) { if (r.item_id == null) continue; const k = blk(r); if (!lines.has(k)) lines.set(k, []); const l = lines.get(k); if (!l.includes(r.item_id)) l.push(r.item_id); }
  const lineRank = (r) => { if (r.item_id == null) return 1e9; const i = (lines.get(blk(r)) ?? []).indexOf(r.item_id); return i < 0 ? 1e9 : i; };
  const book = (r) => r.units?.books?.name ?? null, unitKey = (r) => (r.units ? `${String(r.units.sort ?? 0).padStart(6, "0")}|${r.units.label ?? r.units.short ?? ""}|${r.units.id ?? r.unit_id ?? ""}` : "~");
  const rk = new Map(), uk = new Map();   // (어35) bySort 의 등수 · 교재 = 그 교재 줄의 가장 작은 sort · 단원 = 그 교재 그 단원 줄의 가장 작은 sort
  if (bySort) for (const r of all) { const b = r.units?.book_id ?? null; if (b == null) continue; const s = Number(r.sort ?? 0); if (!rk.has(b) || s < rk.get(b)) rk.set(b, s); const u = `${b}|${r.unit_id ?? ""}`; if (!uk.has(u) || s < uk.get(u)) uk.set(u, s); }
  const bookRank = (r) => (bySort && r.units?.book_id != null ? (rk.get(r.units.book_id) ?? 1e9) : 0), unitRank = (r) => (bySort && r.units?.book_id != null ? (uk.get(`${r.units.book_id}|${r.unit_id ?? ""}`) ?? 1e9) : 0);
  return [...rows].sort((a, b) => { const ba = book(a), bb = book(b); if ((ba == null) !== (bb == null)) return ba == null ? 1 : -1;
    return bookRank(a) - bookRank(b) || String(ba ?? "").localeCompare(String(bb ?? ""), "ko") || unitRank(a) - unitRank(b) || unitKey(a).localeCompare(unitKey(b)) || (bySort ? Number(a.sort ?? 0) - Number(b.sort ?? 0) : 0) || lineRank(a) - lineRank(b) || String(a.day_sheet?.date ?? "").localeCompare(String(b.day_sheet?.date ?? "")) || Number(a.sort ?? 0) - Number(b.sort ?? 0); });
}
/** 단원 나무((어32)) · itemOrder 로 세운 줄을 교재·대단원 → 단원 → 활동으로 자른다 · [{ key, book, chapter, units: [{ id, unit, rows }] }] · 단원 없는 줄은 맨 끝 한 올린 기록(book · chapter · unit 이 null). 쪽·문항은 단원마다(unitBits 로 그린다) */
/** (어42) 항목 나무 · 영역 › 📕 교재 › 대단원 › 단원 › 활동(원장님 9/15 「영역을 봐야 책을 보고 책을 봐야 단원을 보고 단원을 펼쳐봐야 항목검사를 할 거 아냐」) · unitTree(교재·대단원 › 단원 › 활동) 위에 영역·교재 마디를 얹는다 · 교재 없는 줄은 「기타」 마디(맨 끝) · 01 검사·학습·숙제 · 07 · 09 가 같은 나무(app/_shell/tree.js) */
export function itemForest(rows = [], all = rows, opts = {}) {
  const out = [];
  for (const ch of unitTree(rows, all, opts)) {
    const u = ch.units.find((g) => g.unit)?.unit ?? null, area = u?.books?.area ?? null, key = u ? `${area ?? ""}|${ch.book ?? ""}` : "~";
    let b = out[out.length - 1]; if (!b || b.key !== key) { b = { key, area, book: u ? ch.book : null, chapters: [] }; out.push(b); }
    b.chapters.push(ch);
  }
  return out;
}
export function unitTree(rows = [], all = rows, opts = {}) {
  const out = [];
  for (const r of itemOrder(rows, all, opts)) { const u = r.units ?? null, book = u?.books?.name ?? null, chapter = u?.chapter ?? null, key = u ? `${book ?? ""}|${chapter ?? ""}` : "~";
    let ch = out[out.length - 1]; if (!ch || ch.key !== key) { ch = { key, book, chapter, units: [] }; out.push(ch); }
    const id = u?.id ?? r.unit_id ?? null; let g = ch.units[ch.units.length - 1]; if (!g || g.id !== id) { g = { id, unit: u, rows: [] }; ch.units.push(g); }
    g.rows.push(r); }
  return out;
}

/** (어37) 지난 시간에 「다음 시간으로」 미룬 줄이 오늘로 넘어온 것 · 원본(carry_of)이 next 자리 줄이다. 교재 카드의 그 단원 밑에 「M/D 에서 넘어옴」 꼬리로 선다(검사 나머지 조각과 다르다) */
export const fromLast = (it) => Boolean(it?.carry_of && it?.carry?.slot === "next");
/** 교재 카드의 단원 밑에 서는 줄 · 루틴이 깐 줄(항목·단원 · 조각 아님) + 지난 시간에서 넘어온 줄 */
export const bookLine = (it) => Boolean(it?.item_id && it?.unit_id && (!it.carry_of || fromLast(it)));

/** (어47) 검사 줄 나누기(순수 · 원장님 9/16 「숙제검사가 완료된 건 접어서 스크롤줄이고(완료미흡미완료여부는 보이게표시)」 · 「교재보류는 접힌채로 아예 검사에서 맨밑으로」).
/** (어47)(어51) 검사 줄 나누기 — **줄은 자리를 안 옮긴다**(원장님 2026-09-16 「검사완료된걸 클릭하니까 위에 새로운 내용으로 다시 생기는거 구조가 비논리적이야 … 순서도 뒤엉켜잇어」).
 *  한 나무 한 차례로 그리고, 검사가 끝난 줄은 그 자리에서 한 줄로 접힌다(화면이 함) · 교재 보류 교재의 줄만 카드 맨 밑으로 뺀다 */
export function splitChecks(rows = [], { stopped = new Set() } = {}) {
  const isStopped = (r) => stopped.has(r.units?.book_id);
  return { live: rows.filter((r) => !isStopped(r)), stopped: rows.filter(isStopped) };
}

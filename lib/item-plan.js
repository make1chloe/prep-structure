/** 항목 줄의 글 한 벌(원칙-1 · (어27)) · 원장님 2026-09-15 「숙제에 이름없음이라고 되어있는건 뭐지? 교재와 진도, 숙제종류 내지 내용이 있어야함」.
 *  01 검사 줄이 range_note(손으로 쓴 글)만 보고 있어, 루틴이 깐 줄(항목 · 단원)이 「(이름 없음)」으로 섰다. 글을 만드는 자리가 11곳에 제각각이라 생긴 일 · 여기 한 벌로 모은다.
 *  제목 = 숙제 종류(항목 이름) › 손으로 쓴 글 › 단원 이름(목업 01 검사 줄 「클카 문장훈련 / CHAPTER 1 › PSS 1-3 …」).
 *  밑줄 = 교재 · 대단원 › 소단원 · 쪽 · 문항 · 「이번에 …」(손 글이 제목이 아닐 때) · 메모.
 *  셋 다 빈 줄은 앱이 못 만든다(addLine 은 빈 글을 막고 · 루틴은 항목·단원을 준다 · 검사 줄은 지난 숙제 줄을 그대로 물려받는다) · 그래도 오면 「(빈 줄)」이라 말한다(check-item 이 소스에서 「(이름 없음)」 0 을 잰다) */
/** (어67) 숙제 검사 줄의 손 넷 · 원장님 2026-09-16 「숙제검사는 그냥 이모지쓰지말자 · 삭제. 오늘. 남아서. 숙제. 이렇게 만드러줘」 → 「삭제 수업중 수업후 숙제 · 다시 이렇개바꿔줘」.
 *  검사 카드의 손에는 그림을 안 쓴다(글자가 곧 기능이다) · 그림 두 표(lib/emoji.js)는 검사 카드 바깥 몫이다.
 *  글은 **언제 하느냐**로 읽힌다 — 수업중(class · 오늘 학습) › 수업후(stay · 3b 「남」 줄 · 0141) › 숙제(home · 집에서). 셋은 나머지를 그 구분으로 넘긴다(carryRest · 조각이 원본을 가리킨다).
 *  「삭제」는 그 줄을 내린다(off · 지우지 않는다 · 대전제-6 · 복구 단추가 카드 밑에 선다). */
export const CHECK_MOVE = Object.freeze([["off", "삭제"], ["class", "수업중"], ["stay", "수업후"], ["home", "숙제"]]);
/** 검사 △ 의 「어디까지」 세 마디 · 검사 줄에만 쓴다(옛날엔 lib/homework.js 와 화면에 두 벌이었다 · 원칙-1) */
export const UPTO = Object.freeze(["시작만", "절반", "거의 다"]);
/** (어68) 이 검사 줄의 나머지가 **지금 어디에 서 있나** — 원장님 2026-09-17 「지금은 버튼을 눌러도 뭐가 변동이 없는 거 같애」.
 *  눌린 표시를 화면이 제 기억으로 그리면 새로고침에 사라진다(장식) · **서버가 준 판에서 읽는다**. 자리마다 둘 중 하나:
 *  ① own — 내가 세운 조각(carry_of 가 이 줄을 가리킨다 · 다시 누르면 취소된다)
 *  ② there — 조각은 없지만 **같은 활동·단원**이 그 자리에 이미 서 있다(루틴이 오늘 깔아 둔 것 · carryRest 가 합치는 것과 같은 열쇠 · lib/homework sameLine · 눌러도 새로 안 선다) */
export function movedTo(it, sheet) {
  const out = {};
  for (const where of ["class", "stay", "home"]) {
    const rows = (sheet?.[where] ?? []);
    if (rows.some((r) => r.carry_of === it?.id)) { out[where] = "own"; continue; }
    if (it?.item_id && it?.unit_id && rows.some((r) => r.item_id === it.item_id && r.unit_id === it.unit_id)) out[where] = "there";
  }
  return out;
}
/** 검사 줄 밑에 붙는 꼬리 — 「수업중으로 옮김」 · 「수업중에 이미 있음」(이름은 CHECK_MOVE 한 벌에서 온다) */
/** 받침이 있으면 「으로」, 없으면 「로」 — 「숙제으로」 같은 말이 화면에 안 나오게(수업중으로 · 수업후로 · 숙제로) */
const ro = (w) => { const c = String(w).charCodeAt(String(w).length - 1); const batchim = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; return batchim ? "으로" : "로"; };
export const movedText = (where, how) => { const name = CHECK_MOVE.find(([w]) => w === where)?.[1]; if (!name || !how) return ""; return how === "own" ? `${name}${ro(name)} 옮김` : `${name}에 이미 있음`; };
export const movedLine = (moved = {}) => Object.entries(moved).map(([w, how]) => movedText(w, how)).filter(Boolean).join(" · ");
export const pagesText = (u) => (u?.page_start ? `p.${u.page_start}${u.page_end && u.page_end !== u.page_start ? `-${u.page_end}` : ""}` : null);
const noteOf = (it) => (it?.range_note == null ? "" : String(it.range_note).trim());
/** 제목 · 항목 이름(숙제 종류) › 손으로 쓴 글 › 단원 이름 */
export function itemTitle(it) { return it?.learn_items?.name || noteOf(it) || it?.units?.label || it?.units?.short || "(빈 줄)"; }
/** 단원 여럿을 조각으로 · 교재 · 대단원 › 소단원(들) · 쪽(들) · 문항 합. 한 교재 카드 안(01 학습·숙제)에서는 book:false · 시험 범위(quiz-plan)는 쪽·문항 없이 pages:false · count:false */
export function unitBits(units = [], { book = true, pages = true, count = true } = {}) {
  const us = (units ?? []).filter(Boolean); if (!us.length) return null;
  const ps = pages ? us.map(pagesText).filter(Boolean) : [];
  const q = count ? us.reduce((n, u) => n + (u.q_count || 0), 0) : 0;
  return { book: book ? us[0].books?.name ?? null : null, chapter: us[0].chapter ?? null, subs: us.map((u) => u.short ?? u.label).filter(Boolean).join(" · "), pages: ps.length ? ps.join(" · ") : null, q: q ? `${q}문항` : null };
}
export const unitsText = (units = [], opts = {}) => { const b = unitBits(units, opts); return b ? [b.book, [b.chapter, b.subs].filter(Boolean).join(" › "), b.pages, b.q].filter(Boolean).join(" · ") : ""; };
/** 밑줄 · 단원 글(단원 머리 아래 줄은 unit:false · (어32)) · 「이번에 …」(손 글이 제목이 아닐 때) · 메모(학부모 화면은 memo:false) */
export function itemSub(it, { book = true, pages = true, memo = true, unit = true } = {}) {
  const n = noteOf(it);
  return [unit ? unitsText(it?.units ? [it.units] : [], { book, pages }) : null, n && n !== itemTitle(it) ? `이번에 ${n}` : null, memo && it?.memo ? String(it.memo).trim() : null].filter(Boolean).join(" · ");
}
/** 한 줄 글(칩·사유·달력처럼 제목만으로 모자랄 때) · 제목 · 손 글(제목과 다를 때만) */
export function itemLine(it) { const t = itemTitle(it), n = noteOf(it); return n && n !== t ? `${t} · ${n}` : t; }

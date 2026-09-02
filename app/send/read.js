/**
 * 발송 화면이 **읽는** 자리. 판단은 한 줄도 없다 — 묻고, `lib/` 을 부르고, 받은 것을 넘긴다.
 *
 * ── 판단은 전부 남의 것이다 (원칙 1). 여기서 다시 짜지 않는다:
 *    `lib/notify.js`  sinkOf        발송 스위치가 지금 무엇인가 — **읽는 곳은 거기 하나뿐이다**
 *                     findHole      안 채운 치환 자리(`{{…}}`)를 찾는다. 있으면 못 나간다
 *                     OPEN_TO_SEE   잠금화면에 **진짜로** 뜰 본문
 *    `lib/push.js`    pushReady     웹푸시 열쇠가 **쓸 수 있는 모양인가** (없으면 한 대도 못 쏜다)
 *    `lib/close.js`   sheetForFamily 「학부모가 지금 이 판을 볼 수 있나」 — 마감 술어가 여기 산다
 *                     familyDayLabel 못 보는 판에 학부모 화면이 띄우는 글
 *    `./sql.js`       DB 에 묻는 글월 (검사가 진짜 스키마에 PREPARE 한다)
 *
 * ── ⚠️ 조회 수 (계획 §속도 — 발송은 **조회 6 · 2단**. 지금 앱 `/report` 는 조회 ~30 · 직렬 17단)
 *    이 화면이 쓰는 조회는 **하나뿐이다.** 묶음 셋(데일리·하원·안내)과 예약·읽음·문구·닿는 길을
 *    **한 번에** 받는다. 탭이 없으므로 묶음을 오가도 다시 안 묻는다 (§속도 1).
 *    `scripts/check-screen-send.mjs` 5부가 진짜 DB 로 센다.
 */
import { sinkOf, findHole, OPEN_TO_SEE } from "../../lib/notify.js";
import { pushReady } from "../../lib/push.js";
import { sheetForFamily, familyDayLabel } from "../../lib/close.js";
import { Q_BOARD } from "./sql.js";
import { KINDS } from "./kinds.js";

/** 이 화면의 조회 상한 (계획 §속도 — 발송은 **조회 6 · 2단**) */
export const QUERY_CAP = 6;

/**
 * 「읽음」이 보는 **창** (속도-4).
 *
 * ⚠️ 속도-4 는 「줄 수 상한을 안 건다 — **학생·날짜로 좁혀 읽는다**」다.
 *    그래서 좁히는 것은 **그날 명단 + 이 날 수**이고, 아래 `READ_CAP` 은
 *    그 안에서도 터무니없이 많을 때를 위한 **안전망**이지 좁히는 수단이 아니다.
 * ⚠️ 상한에 닿으면 **화면이 그 사실을 말한다**(`readWin`). 조용히 자르지 않는다 —
 *    예전에는 머리의 총수와 몸통의 줄 수가 갈린 채 아무도 안 밝혔다.
 *
 * ⚠️ **14일은 지어낸 값이 아니라 「정한 값」이다.** 계획에 날 수가 안 적혀 있어
 *    원장님께 여쭐 것으로 `docs/원장님-정하실-것.md` 에 올렸다. 그때까지 이 값으로 돈다 —
 *    학부모가 며칠 뒤에 여는 일이 있어 그날 하루만 보면 「안 읽음」이 틀리게 굳는다.
 */
export const READ_DAYS = 14;
export const READ_CAP = 500;

/**
 * 그 갈래로 **진짜 나갈 글**.
 *
 * ⚠️⚠️ **문구가 없으면 여기서 기본값을 지어내지 않는다.** 데일리·하원의 기본 글은
 *    `lib/push.js` 가 이미 갖고 있다 — 여기 또 적으면 **화면에 보이는 글과 진짜 나가는 글이 갈린다.**
 *    그래서 문구가 없을 때 `title`·`body` 는 **`null` 이고, 화면은 「lib 기본값으로 나갑니다」라고 밝힌다.**
 * ⚠️ 안내(공지)는 공지 줄 자신이 제목·본문이다 — 문구 표를 안 지난다.
 *
 * @param tpl  `v2.msg_template` 줄들
 * @param row  안내일 때 그 공지 줄
 */
export function textFor(tpl = [], kind, row = null) {
  if (kind === "notice") {
    const title = row?.title ?? null;
    const body = row?.body ?? "";
    return { kind, title, body, fromTemplate: false, fromRow: true, hole: findHole(title ?? "", body) };
  }
  const t = (tpl ?? []).find((x) => x.kind === kind) ?? null;
  const title = String(t?.title ?? "").trim() || null;
  const body = String(t?.body ?? "").trim() || null;
  return { kind, title, body, fromTemplate: Boolean(t), fromRow: false, hole: findHole(title ?? "", body ?? "") };
}

/**
 * 「학부모가 지금 이 판을 볼 수 있나」 — **판단은 `lib/close.js` 것이다.**
 * 마감 술어를 화면이 다시 적으면 사고 #7 이 그대로 되살아난다.
 */
export function familyView(row) {
  const sheet = row.sheetId
    ? { id: row.sheetId, student_id: row.studentId, date: null, attend: row.attend, closed_at: row.closedAt }
    : null;
  const seen = sheetForFamily(sheet, { role: "parent" });
  return {
    visible: Boolean(seen?.visible),
    familyLabel: familyDayLabel(sheet, { hasContent: String(row.comment ?? "").trim() !== "" }),
  };
}

/**
 * 한 줄이 **지금 나갈 수 있나.** 못 나가면 까닭을 낱말 하나로 준다 — 화면은 그 낱말로만 판단한다.
 *
 * ⚠️ 이것은 **미리 보여 주는 것**이다. 진짜로 막는 것은 `lib/push.js` 의 `sendDaily`·`sendLate` 다
 *    (마감 전·이미 보냄을 그 자리에서 다시 본다). 화면만 믿고 서버가 안 보면 주소를 두드려 지나간다.
 * ⚠️ 「보낼 수 있나」를 여기와 화면 두 곳에서 세지 않는다 (`monthlyBoard` 가 겪은 사고 그대로 —
 *    보드와 게이트가 같은 물음에 다른 답을 내면 어느 쪽이 맞는지 아무도 못 가린다).
 */
export function blockOf(row, kind, text) {
  if (kind === "daily") {
    if (!row.sheetId) return "no_sheet";                 // 판이 없다 — 출결부터 찍어야 판이 선다
    if (!familyView(row).visible) return "not_closed";   // 마감 전엔 학부모가 못 본다 (사고 #7)
    if (row.sentAt) return "already_sent";               // 다시 보내려면 그 줄에서 따로 누른다
    if (!row.parents) return "no_parent";                // 보낼 곳이 없다 — 자취만 남는다
  }
  if (kind === "late") {
    if (!String(row.reason ?? "").trim()) return "no_reason";
    if (row.sentAt) return "already_sent";
    if (!row.parents) return "no_parent";
  }
  if (kind === "notice" && !String(row.title ?? "").trim()) return "no_title";
  if (text?.hole) return "hole";                          // 안 채운 치환 자리 — notify 가 되돌린다
  return null;
}

/**
 * 한 번에 다 읽는다. **조회 하나.**
 * @returns 화면이 바로 그릴 수 있는 모양 + `sink`(발송 스위치) + `ready`(열쇠가 있나)
 */
export async function loadBoard(db, on = null) {
  const j = (await db.query(Q_BOARD, [on || null, READ_DAYS, READ_CAP])).rows[0]?.j ?? {};
  const tpl = j.tpl ?? [];
  const text = Object.fromEntries(KINDS.filter((k) => k !== "notice").map((k) => [k, textFor(tpl, k)]));

  return {
    on: j.on ?? on ?? null,
    today: j.today ?? null,
    daily: (j.daily ?? []).map((r) => ({ ...r, ...familyView(r), block: blockOf(r, "daily", text.daily) })),
    late: (j.late ?? []).map((r) => ({ ...r, block: blockOf(r, "late", text.late) })),
    // 안내는 줄마다 제목·본문이 다르므로 **줄마다** 글을 짓는다
    notice: (j.notice ?? []).map((r) => {
      const t = textFor(tpl, "notice", r);
      return { ...r, hole: t.hole, block: blockOf(r, "notice", t) };
    }),
    sched: j.sched ?? [],
    reads: j.reads ?? [],
    // ⚠️ **자른 사실을 화면까지 들고 간다** (속도-4). 안 들고 가면 화면이 조용히 잘린 목록을 그린다
    readWin: j.readWin ?? { days: READ_DAYS, cap: READ_CAP, total: 0 },
    facts: j.facts ?? {},
    text,
    // ⚠️ 스위치를 읽는 곳은 `lib/notify.js` 하나뿐이다 (자동 검사 ⑦). 여기서는 그 답만 받는다
    sink: sinkOf(),
    // ⚠️ 「열쇠가 있나」도 `lib/push.js` 가 답한다. 없으면 **스위치를 켜도 한 대도 못 쏜다**
    ready: pushReady(),
    lockBody: OPEN_TO_SEE,
  };
}

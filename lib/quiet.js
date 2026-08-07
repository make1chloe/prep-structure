/**
 * **방해금지 시간** — 이 시각에는 알림을 안 보낸다.
 *
 * 원장님 (2026-08-07) — 「학부모 어플에서는 알림 켜기 끄기 방해금지 시간
 * 설정을 할 수 있도록」
 *
 * 알림을 아예 끄시면 급한 것까지 안 간다. 대부분은 **밤에 안 울리기를**
 * 바라시는 것이라, 시간만 비켜가는 길을 둔다.
 *
 * 여기에는 **계산만** 둔다 (화면도 서버도 같은 것을 봐야 한다).
 */

/**
 * **아무것도 안 정하셨을 때** (원장님, 2026-08-07 —
 * 「학부모 어플에 방해금지 모드는 오후 11시부터 오전 9시까지로 기본설정」).
 *
 * 알림은 선생님이 수업을 마치고 정리하시다가 나가는 일이 많아 **밤늦게**
 * 갈 수 있다. 그걸 그대로 두면 어머니는 잠결에 울리는 폰 때문에 알림을
 * **통째로 꺼버리시고**, 그러면 우리는 아무것도 못 알린다.
 *
 * 그래서 아무것도 안 정하신 분은 이 시간을 쓴다. 언제든 바꾸거나 지우실
 * 수 있다 — 다만 기본을 「없음」 으로 두면 아무도 안 정하시고, 그러면
 * 위의 일이 그대로 벌어진다.
 *
 * 선생님께 가는 알림은 이 규칙을 안 탄다 (pushToStaff).
 */
export const DEFAULT_QUIET = { from: "23:00", to: "09:00" };

/** "22:00" · "22:00:00" → 분 단위. 못 읽으면 null */
export function minsOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec((hhmm ?? "").toString().trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * 지금이 방해금지 시간인가.
 *
 * **밤을 넘기는 것이 보통이다** — 22:00~07:00 은 시작이 끝보다 늦다.
 * 그냥 `from <= now && now < to` 로 적으면 그 경우가 통째로 빠진다
 * (그리고 아무도 안 울리는 대신 **밤새 울린다**).
 *
 * 시작과 끝이 같으면 「없음」 으로 본다 — 하루 종일 막는 뜻이 아니다.
 *
 * @param now  "22:30" 또는 분(number)
 */
export function inQuiet(now, from, to) {
  const n = typeof now === "number" ? now : minsOf(now);
  const a = minsOf(from);
  const b = minsOf(to);
  if (n === null || a === null || b === null) return false;
  if (a === b) return false;
  return a < b ? n >= a && n < b : n >= a || n < b;
}

/** 서울 지금 시각을 분으로 */
export function nowMinsSeoul(d = new Date()) {
  const s = d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return minsOf(s);
}

/** 화면에 한 줄로 — 「밤 10:00 ~ 아침 7:00」 */
export function quietLabel(from, to) {
  const a = minsOf(from);
  const b = minsOf(to);
  if (a === null || b === null || a === b) return null;
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${hm(a)} ~ ${hm(b)}`;
}

/** 날짜 글자('2026-09-06')를 다루는 순수 한 벌 — 요일 · 며칠 뒤. 화면(브라우저)과 서버(Vercel 은 UTC)가 같이 쓴다.
 *  ⚠️ `new Date(d + "T00:00:00+09:00").getDay()` 는 **프로세스 시간대**의 요일이다 — UTC 서버에선 서울 자정이 전날 15시라 하루 전 요일이 나온다(2026-09-05 걷기 캡처가 「9월 6일 토」로 잡음).
 *  달력 날짜의 요일은 시간대와 무관하다 — UTC 자정으로 만들어 UTC 메서드로만 읽는다(0-2 · 검사-㊴) */
export const WEEKDAY = Object.freeze(["일", "월", "화", "수", "목", "금", "토"]);
const at = (date) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error(`날짜가 아닙니다: ${date}`); return new Date(`${date}T00:00:00Z`); };
/** 요일(0=일) — 어느 시간대에서 돌아도 같다 */
export const weekday = (date) => at(date).getUTCDay();
export const weekdayName = (date) => WEEKDAY[weekday(date)];
/** 며칠 뒤(음수면 전) 날짜 글자 */
export const plusDays = (date, n) => { const d = at(date); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** 지금 서울 시각의 시(0~23) — 프로세스 시간대와 무관(Intl · Asia/Seoul). 「늦은밤」 갈래가 이것으로 골라진다 */
export const seoulHour = (now = new Date()) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hour12: false }).format(now)) % 24;
/** 서울 시각 「HH:MM」 — ISO 글자(timestamptz)를 프로세스 시간대와 무관하게 읽는다(Intl · Asia/Seoul). 「보냄 21:41」이 이것으로 보인다 */
export const seoulTime = (ts) => { if (!ts) return null; const d = new Date(ts); if (Number.isNaN(d.getTime())) throw new Error(`시각이 아닙니다: ${ts}`); const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value])); return `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`; };
/** 서울의 그 날 그 시각(「HH:MM」)을 ISO 글자로 — 고정 +09:00 이라 어디서 돌아도 같은 순간이다. 원장님이 실제 하원(등원 걸음 4)을 고칠 때 쓴다 */
export const seoulStamp = (date, hhmm) => { at(date); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hhmm))) throw new Error(`시각이 아닙니다: ${hhmm} — 「22:05」처럼 적으세요`); return new Date(`${date}T${hhmm}:00+09:00`).toISOString(); };

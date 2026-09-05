/** 늦귀가 검사(확정-⑭ · 검사-㊷) — 순수 판단 lib/late-plan.js + lib/day-plan.js 의 시각 한 벌:
 *  예상(약속)과 실제 하원의 차이(세어 나온다 · 저장 안 함) · 「실제 하원 22:05 · 예상보다 25분 늦게」 · 되풀이 띠(3주 안 N번째 — 숙제량을 볼까요) · 안 보낸 채인가 · 마감 전에 한 번 묻는 것(둘 다면 한 상자) ·
 *  서울 시각 읽기·찍기가 프로세스 시간대와 무관한가(UTC 로 다시 돈다 — 검사-㊴와 같은 결) */
import { spawnSync } from "node:child_process";
import { diffMinutes, diffText, leftText, repeatBand, unsentLate, askBeforeClose, hhmm } from "../lib/late-plan.js";
import { seoulTime, seoulStamp } from "../lib/day-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
console.log("■ 예상 귀가와 실제 하원의 차이 — 세어 나온다(원칙-5)");
ok("22:05 − 21:40 = 25분 · 21:30 − 21:40 = −10분 · 같으면 0", diffMinutes("21:40:00", "22:05:00") === 25 && diffMinutes("21:40", "21:30") === -10 && diffMinutes("21:40:00", "21:40") === 0);
ok("하나라도 없으면 null (약속 없이 하원만 찍힌 날)", diffMinutes(null, "22:05") === null && diffMinutes("21:40", "") === null && diffMinutes("아홉시", "22:05") === null);
ok("말 — 늦게 · 일찍 · 예상대로 · 없음", diffText(25) === "예상보다 25분 늦게" && diffText(-10) === "예상보다 10분 일찍" && diffText(0) === "예상대로" && diffText(null) === "");
ok("실제 하원 줄 — 「실제 하원 22:05 · 예상보다 25분 늦게」 · 약속이 없었으면 시각만 · 아직 안 찍었으면 null", leftText({ until_at: "21:40:00" }, "22:05:00") === "실제 하원 22:05 · 예상보다 25분 늦게" && leftText(null, "22:05:00") === "실제 하원 22:05" && leftText({ until_at: "21:40:00" }, null) === null);
ok("hhmm — time 글자의 앞 다섯", hhmm("21:40:00") === "21:40" && hhmm(null) === "");
console.log("■ 되풀이 띠 — 「같은 아이가 3주 안에 세 번 남으면 앱이 먼저 묻는다」(SQL 이 세고 여기는 말만)");
const st = { stayed: 3, stayed_days: "9/3 · 9/4 · 오늘", repeat_at: 3, window_days: 21, ask: true };
ok("3주 안 3번째 → 「3주 안 3번째 남습니다 — 숙제량을 볼까요?」 + 날들", repeatBand(st)?.title === "3주 안 3번째 남습니다 — 숙제량을 볼까요?" && repeatBand(st).days === "9/3 · 9/4 · 오늘");
ok("4번째도 묻는다(SQL 의 ask 그대로) · 날수가 7의 배수가 아니면 「N일 안」", repeatBand({ ...st, stayed: 4 }).title.startsWith("3주 안 4번째") && repeatBand({ ...st, window_days: 10 }).title.startsWith("10일 안"));
ok("ask 가 아니면 null · 상태가 없어도 null", repeatBand({ ...st, ask: false }) === null && repeatBand(null) === null);
console.log("■ 안 보낸 채 마감 — 한 번 묻고 막지 않는다(확정-⑭) · AI 초안 그대로(확정-64)와 한 상자");
ok("예상 귀가를 적고 안 보냈으면 「안 보낸 채」", unsentLate({ until_at: "21:40:00", sent_at: null }) === true);
ok("보냈으면 아니다 · 예상 귀가가 없으면(사유만) 아니다 · 줄이 없으면 아니다", unsentLate({ until_at: "21:40:00", sent_at: "2026-09-05T12:41:00Z" }) === false && unsentLate({ reason: "단어 재시험이 남음", until_at: null }) === false && unsentLate(null) === false);
ok("묻는 것 — 없음 [] · 초안 그대로 [same] · 안 보냄 [late] · 둘 다 [same, late] (한 상자)", askBeforeClose({}).length === 0 && askBeforeClose({ same: true }).join() === "same" && askBeforeClose({ late: { until_at: "21:40" } }).join() === "late" && askBeforeClose({ same: true, late: { until_at: "21:40" } }).join() === "same,late");
console.log("■ 서울 시각 — 프로세스 시간대와 무관");
ok("seoulTime — 2026-09-05T12:41:00Z 는 서울 21:41 · 15:05Z 는 00:05(24 가 아니다) · 없으면 null", seoulTime("2026-09-05T12:41:00Z") === "21:41" && seoulTime("2026-09-05T15:05:00Z") === "00:05" && seoulTime(null) === null);
ok("seoulStamp — 2026-09-05 22:05 서울 = 13:05Z", seoulStamp("2026-09-05", "22:05") === "2026-09-05T13:05:00.000Z");
let threw = 0; for (const [d, t] of [["2026-09-05", "25:00"], ["2026-09-05", "9:05"], ["어제", "22:05"], ["2026-09-05", "22:60"]]) { try { seoulStamp(d, t); } catch { threw++; } }
ok("모양이 아니면 던진다(25:00 · 9:05 · 날짜 아님 · 22:60)", threw === 4, String(threw));
if (process.env.TZ !== "UTC" && !process.env.CHECK_LATE_INNER) {   // 같은 검사를 UTC 로 한 번 더 — Vercel 이 그렇게 돈다
  const r = spawnSync(process.execPath, [process.argv[1]], { env: { ...process.env, TZ: "UTC", CHECK_LATE_INNER: "1" }, encoding: "utf8" });
  ok("UTC 로 돌려도 전부 같다(검사-㊴와 같은 결)", r.status === 0, (r.stdout || "").split("\n").filter((l) => l.includes("❌")).join(" / "));
}
console.log(`\n■ 늦귀가 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

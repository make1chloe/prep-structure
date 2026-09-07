/** 늦귀가 검사(확정-⑭ · 검사-㊷) — 순수 판단 lib/late-plan.js + lib/day-plan.js 의 시각 한 벌:
 *  예상(약속)과 실제 하원의 차이(세어 나온다 · 저장 안 함) · 「실제 하원 22:05 · 예상보다 25분 늦게」 · 되풀이 띠(3주 안 N번째 — 숙제량을 볼까요) · 안 보낸 채인가 · 마감 전에 한 번 묻는 것(둘 다면 한 상자) ·
 *  서울 시각 읽기·찍기가 프로세스 시간대와 무관한가(UTC 로 다시 돈다 — 검사-㊴와 같은 결) */
import { spawnSync } from "node:child_process";
import { diffMinutes, diffText, leftText, repeatBand, unsentLate, askBeforeClose, hhmm, reasonChips, toggleReason, usualText, stayRows, stayCounts } from "../lib/late-plan.js";
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
console.log("■ 3b 사유 칩(목업 01 — 원본은 사유 한 줄 · 칩은 조각을 넣고 뺀다)");
{ const checks = [{ id: 1, status: "missing", learn_items: { name: "워크북" } }, { id: 2, status: "done", learn_items: { name: "단어" } }, { id: 3, status: "missing", range_note: "CHAPTER 1 · 10-18번", learn_items: { name: "교재" } }, { id: 4, status: "missing", learn_items: { name: "워크북" } }];
  const ch = reasonChips({ checks, warn: { today_disposal: "stay" }, reason: "워크북 미제출 · 늦게 와서" });
  ok("✕ 인 항목만 「이름 미제출」(검사 카드가 보이는 이름 — range_note 먼저 · 같은 이름은 하나) + 처분이 남아서면 「반성문 — 오늘 남아서」(고정) · 글에 든 조각은 on", ch.map((c) => c.text).join("|") === "워크북 미제출|CHAPTER 1 · 10-18번 미제출|반성문 — 오늘 남아서" && ch[0].on === true && ch[1].on === false && ch[2].fixed === true, JSON.stringify(ch));
  ok("✕ 도 처분도 없으면 칩 없음 · 처분이 숙제면 반성문 칩 없음", reasonChips({ checks: [checks[1]], warn: { today_disposal: "homework" } }).length === 0 && reasonChips().length === 0);
  ok("누르면 넣고(「 · 」로 잇는다) · 다시 누르면 뺀다 · 빈 글에 넣으면 조각만 · 손으로 쓴 글은 그대로 · 조각 안에 「 · 」가 있어도(범위 글) 글자 그대로 찾아 뺀다", toggleReason("늦게 와서", "워크북 미제출") === "늦게 와서 · 워크북 미제출" && toggleReason("늦게 와서 · 워크북 미제출", "워크북 미제출") === "늦게 와서" && toggleReason("", "워크북 미제출") === "워크북 미제출" && toggleReason("워크북 미제출", "워크북 미제출") === "" && toggleReason("늦게 와서 · CHAPTER 1 · 10-18번 미제출 · 반성문", "CHAPTER 1 · 10-18번 미제출") === "늦게 와서 · 반성문" && toggleReason("", "CHAPTER 1 · 10-18번 미제출") === "CHAPTER 1 · 10-18번 미제출");
}
// ── 5단계-②(0141) — 「평소 21:40」 · 3b 「남」 줄
ok("「평소 21:40」 — 반 끝 시각에서 · 없으면 null", usualText("21:40:00") === "평소 21:40" && usualText(null) === null);
const sr = stayRows([{ id: "a", slot: "stay", sort: 2, range_note: null, learn_items: { name: "클카 낭독" }, units: { chapter: "CHAPTER 1", short: "PSS 1-3" }, carry_of: "x", status: null }, { id: "b", slot: "stay", sort: 1, range_note: "워크북 복습 · 못 한 만큼", carry_of: null, status: "done" }, { id: "c", slot: "home", range_note: "숙제" }, { id: "d", slot: "stay", sort: 3, range_note: "단어", carry_of: "y", status: "missing" }]);
ok("「남」 줄 — stay 만 · sort 차례 · 이름(적은 글 › 항목 이름 › 단원) · 「숙제에서 옮겨옴」은 조각만 · 상태(아직·다 함·넘김) · 셈 「남 3 · 다 함 1 · 넘김 1 · 아직 1」", sr.length === 3 && sr[0].text === "워크북 복습 · 못 한 만큼" && sr[0].from === null && sr[0].state === "done" && sr[1].text === "클카 낭독" && sr[1].sub === "CHAPTER 1 › PSS 1-3" && sr[1].from === "숙제에서 옮겨옴" && sr[1].state === "open" && sr[2].state === "missing" && JSON.stringify(stayCounts(sr)) === JSON.stringify({ total: 3, done: 1, missing: 1, open: 1 }));
console.log(`\n■ 늦귀가 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

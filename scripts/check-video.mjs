/** 영상 판단 검사(검사-63) — lib/video-plan.js 순수 셈: 분:초 · 유튜브 아이디 · 길이 읽기 · + 영상 양식 · 배정 양식 · 상태(다 봄 · N% 봄 · 초 봄 · 아직 — 규칙 video.done_pct) · 셈(다 봄·보다 맒·안 봄 · 내린 배정 뺌) · 마감 글 · 아이 화면 줄(차례 · 지났어요 · 이어 볼 자리) · 재생기 구간 셈(잇기 · 뛰면 새 구간 · 20초마다 · 멈추면 닫기) */
import { mmss, youtubeId, parseLength, parseVideo, parseAssign, statusOf, counts, dueText, myRows, stepSpan } from "../lib/video-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };
console.log("■ 영상 판단(순수)");
ok("분:초 — 484 → 8:04 · 0 → 0:00 · 소수·음수도", mmss(484) === "8:04" && mmss(0) === "0:00" && mmss(61.7) === "1:02" && mmss(-5) === "0:00");
ok("유튜브 아이디 — watch?v= · youtu.be · shorts · embed · m. · 아니면 null", youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3") === "dQw4w9WgXcQ" && youtubeId("youtu.be/dQw4w9WgXcQ") === "dQw4w9WgXcQ" && youtubeId("https://youtube.com/shorts/abcdefghijk") === "abcdefghijk" && youtubeId("https://m.youtube.com/embed/abcdefghijk") === "abcdefghijk" && youtubeId("https://vimeo.com/123") === null && youtubeId("") === null);
ok("길이 — 「8:04」 484 · 「300」 300 · 빈 것 null · 「8분」은 던진다", parseLength("8:04") === 484 && parseLength("300") === 300 && parseLength("") === null && threw(() => parseLength("8분")));
ok("+ 영상 — 제목·유튜브 주소 없으면 던진다 · 폴더 비면 null", threw(() => parseVideo({ title: "", url: "https://youtu.be/abcdefghijk" })) && threw(() => parseVideo({ title: "x", url: "https://vimeo.com/1" })) && parseVideo({ title: " 간접의문문 ", url: "https://youtu.be/abcdefghijk", folder: "", length: "8:04" }).seconds === 484 && parseVideo({ title: "x", url: "https://youtu.be/abcdefghijk" }).folder === null);
ok("배정 — 아이 없으면 던진다 · 같은 아이 한 번 · 마감 꼴", threw(() => parseAssign({ studentIds: [] })) && parseAssign({ studentIds: ["11111111-1111-1111-1111-111111111111", "11111111-1111-1111-1111-111111111111"], dueOn: "" }).studentIds.length === 1 && threw(() => parseAssign({ studentIds: ["11111111-1111-1111-1111-111111111111"], dueOn: "9/8" })));
ok("상태 — 100% 다 봄 · 62% 봄 · 95(규칙)면 다 봄 · done_at 이면 다 봄 · 길이 몰라 %가 없으면 「1:30 봄」 · 0초는 아직", statusOf({ pct: 100 }).text === "다 봄" && statusOf({ pct: 62, secs: 300 }).text === "62% 봄" && statusOf({ pct: 95, secs: 1 }, 95).key === "done" && statusOf({ pct: 10, done_at: "x" }).key === "done" && statusOf({ pct: null, secs: 90 }).text === "1:30 봄" && statusOf({}).text === "아직");
const as = [{ pct: 100 }, { pct: 62, secs: 10 }, { pct: 8, secs: 5 }, { pct: 0, secs: 0 }, { pct: 100, state: "retired" }];
ok("셈 — 다 봄 1 · 보다 맒 2 · 안 봄 1 · 안 본 아이 3 · 내린 배정은 뺀다", JSON.stringify(counts(as)) === JSON.stringify({ done: 1, part: 2, none: 1, unwatched: 3, total: 4 }));
ok("마감 글 — 마감 9/8 · 오늘까지 · 지났어요 · 없으면 빈", dueText("2026-09-08", "2026-09-06") === "마감 9/8" && dueText("2026-09-06", "2026-09-06") === "오늘까지" && dueText("2026-09-03", "2026-09-06") === "마감 9/3 — 지났어요" && dueText(null, "2026-09-06") === "");
const rows = myRows([
  { id: "a1", video_id: "v1", due_on: "2026-09-08", state: "active", video: { title: "분사구문", url: "https://youtu.be/abcdefghijk", seconds: 300, state: "active" } },
  { id: "a2", video_id: "v2", due_on: "2026-09-03", state: "active", video: { title: "간접의문문", url: "https://youtu.be/abcdefghijk", seconds: 484, state: "active" } },
  { id: "a3", video_id: "v3", due_on: null, state: "active", video: { title: "다 본 것", url: "https://youtu.be/abcdefghijk", seconds: 100, state: "active" } },
  { id: "a4", video_id: "v4", due_on: null, state: "retired", video: { title: "내린 것", url: "x", state: "active" } },
  { id: "a5", video_id: "v5", due_on: null, state: "active", video: { title: "숨긴 영상", url: "x", state: "hidden" } },
], [{ video_id: "v2", secs: 300, pct: 62, last_pos: 372 }, { video_id: "v3", secs: 100, pct: 100, done_at: "x" }], 95, "2026-09-06");
ok("아이 화면 줄 — 내린 배정·숨긴 영상 빠짐 · 안 본 것이 먼저(마감 순) · 지난 마감은 late · 이어 볼 자리 · 다 본 것은 맨 뒤 · 유튜브 아이디", rows.map((r) => r.video.title).join() === "간접의문문,분사구문,다 본 것" && rows[0].late === true && rows[0].lastPos === 372 && rows[0].status.text === "62% 봄" && rows[1].status.text === "아직" && rows[2].status.key === "done" && rows[0].yt === "abcdefghijk", rows.map((r) => [r.video.title, r.status.text, r.late]).join(" | "));
let s = { from: null, to: null }, fl = [];
const tick = (t, playing = true) => { const r = stepSpan(s, t, playing); s = r.state; if (r.flush) fl.push(r.flush); };
for (let t = 0; t <= 25; t++) tick(t);   // 0~25 이어서 — 20초에서 한 번 내보낸다
ok("구간 셈 — 이어서 보면 20초마다 내보낸다([0,20)) · 남은 것은 상태에", JSON.stringify(fl) === JSON.stringify([{ from: 0, to: 20 }]) && s.from === 20 && s.to === 25, JSON.stringify({ fl, s }));
tick(200);   // 끌어다 놓음 — 지금까지([20,25))만 남기고 새 구간
ok("뛰면(끌어다 놓음) 지금까지만 내보내고 새 구간 — 200 부터", JSON.stringify(fl.at(-1)) === JSON.stringify({ from: 20, to: 25 }) && s.from === 200 && s.to === 200);
tick(201); tick(202); tick(202, false);
ok("멈추면 닫는다([200,202)) · 1초 미만은 버린다", JSON.stringify(fl.at(-1)) === JSON.stringify({ from: 200, to: 202 }) && s.from === null && stepSpan({ from: 5, to: 5 }, 5, false).flush === null);
tick(300); tick(299);   // 뒤로 뛰어도 새 구간
ok("뒤로 뛰어도 새 구간(지나간 것만 센다)", s.from === 299 && s.to === 299);
console.log(`\n■ 영상 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

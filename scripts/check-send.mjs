/** 발송 판단 검사(검사-㊾) — lib/send-plan.js · lib/notify-plan.js 순수 셈: 치환 자리(뼈대-11) · 예약 때(확정-㉕) · 묶음 넷의 상태 · 읽음 셈 · 자취 상태(리허설은 그렇게 말한다) · 방해금지 · 잠금화면 문구 · 기기 고르기 · 스위치 기본 off */
import { unfilled, whenAt, whenLabel, lateRows, dailyRows, autoRows, scheduledRows, sentRows, logStatus, readCounts, nowCount, closedCount, KINDS, placeholderRows } from "../lib/send-plan.js";
import { titleFor, payloadFor, OPEN_TO_SEE, sinkOf, mayPush, pickDevices, inQuiet, quietUntil, LABEL } from "../lib/notify-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
console.log("■ 발송 판단(순수)");
ok("뼈대-11 치환 자리 — {{다음달수업일}} 과 빈 {{}} 를 잡는다 · 없으면 빈 목록", JSON.stringify(unfilled("안녕 {{다음달수업일}} 에 {{ }}")) === JSON.stringify(["다음달수업일", "빈 자리"]) && unfilled("치환 없음").length === 0);
const rules = { "send.evening": "21:00", "send.morning": "09:00" };
ok("확정-㉕ 예약 때 — 오늘 21:00 · 내일 09:00 · 직접(서울 고정)", whenAt("evening", "2026-09-06", rules) === "2026-09-06T12:00:00.000Z" && whenAt("morning", "2026-09-06", rules) === "2026-09-07T00:00:00.000Z" && whenAt("custom", "2026-09-06", rules, { date: "2026-09-13", time: "14:00" }) === "2026-09-13T05:00:00.000Z");
let threw = false; try { whenAt("custom", "2026-09-06", rules, {}); } catch { threw = true; } ok("직접인데 날짜·시각이 비면 던진다", threw);
ok("예약 글 — 오늘 · 내일 · M/D", whenLabel("2026-09-06T12:00:00Z", "2026-09-06") === "오늘 21:00" && whenLabel("2026-09-07T00:00:00Z", "2026-09-06") === "내일 09:00" && whenLabel("2026-09-13T05:00:00Z", "2026-09-06") === "9/13 14:00");
const sheets = [
  { id: "s1", student_name: "가", closed_at: "2026-09-06T12:30:00Z", comment: "오늘 잘했습니다", comment_kind: "normal", comment_cap: 100, late: { until_at: "21:40:00", reason: "워크북", sent_at: "2026-09-06T10:00:00Z" } },
  { id: "s2", student_name: "나", closed_at: null, comment: "", late: { until_at: "22:00:00", reason: "", sent_at: null } },
  { id: "s3", student_name: "다", closed_at: "2026-09-06T12:00:00Z", comment: "{{다음달수업일}} 에 봅니다", late: null },
  { id: "s4", student_name: "라", closed_at: "2026-09-06T12:00:00Z", comment: "예약될 것", late: null },
  { id: "s5", student_name: "마", closed_at: "2026-09-06T12:00:00Z", comment: "나간 것", late: null },
];
const logs = [
  { id: 1, kind: "daily", sheet_id: "s5", student_id: "x", student_name: "마", sink: "live", created_at: "2026-09-06T12:10:00Z", sent_at: "2026-09-06T12:10:00Z", opened_at: "2026-09-06T12:20:00Z", open_count: 2 },
  { id: 2, kind: "late", sheet_id: "s1", student_name: "가", sink: "off", created_at: "2026-09-06T10:00:00Z", sent_at: null, open_count: 0 },
  { id: 3, kind: "arrival", student_name: "가", sink: "live", created_at: "2026-09-06T08:00:00Z", sent_at: null, failed_at: "2026-09-06T08:00:00Z", fail_why: "알림을 켠 기기가 없습니다", open_count: 0 },
  { id: 4, kind: "leave", student_name: "가", sink: "live", created_at: "2026-09-06T13:00:00Z", sent_at: "2026-09-06T13:00:00Z", opened_at: null, open_count: 0 },
];
const sch = [{ id: "c1", kind: "daily", sheet_id: "s4", at: "2026-09-07T00:00:00Z", sent_at: null, cancelled_at: null }];
const jobs = [
  { id: 11, kind: KINDS.plan, state: "wait", tries: 0, next_at: "2026-09-06T11:00:00Z", payload: { student_id: "x", date: "2026-09-10", kind: "absent" }, student_name: "가" },
  { id: 12, kind: KINDS.leave, state: "wait", tries: 1, next_at: "2026-09-07T00:00:00Z", last_error: "방해금지(23:00~09:00)라 미룸", payload: { student_id: "x" }, student_name: "가" },
  { id: 13, kind: KINDS.arrival, state: "done", tries: 1, next_at: "2026-09-06T08:00:00Z", payload: {}, student_name: "가" },
  { id: 14, kind: KINDS.plan, state: "fail", tries: 3, next_at: "2026-09-06T12:00:00Z", last_error: "손이 없는 일", payload: { kind: "late", date: "2026-09-11" }, student_name: "나" },
];
const now = "2026-09-06T12:00:00Z";
const late = lateRows(sheets, logs);
ok("🕘 지금 — 약속 있는 판만 · 보낸 것은 「HH:MM에 보냄」 + 자취 · 사유 빈 것은 noReason", late.length === 2 && late[0].sent === "19:00" && late[0].log?.rehearsal === true && late[1].sent === null && late[1].noReason === true && nowCount(late) === 1, JSON.stringify(late));
const daily = dailyRows(sheets, logs, sch, jobs);
ok("📨 마감하면 — ready(기본 고름) · open(마감 전) · holes(치환 자리) · scheduled · sent", daily.map((d) => d.state).join(",") === "ready,open,holes,scheduled,sent" && daily[0].checked === true && daily[2].holes[0] === "다음달수업일" && daily[3].scheduledId === "c1" && daily[4].logId === 1 && daily[4].log.read === true, daily.map((d) => d.state).join(","));
ok("📨 알약 — 마감 4 / 5", JSON.stringify(closedCount(daily)) === JSON.stringify({ closed: 4, total: 5 }));
const auto = autoRows(jobs, now);
ok("🔔 저절로 — 안 끝난 것만(대기 · 미룸 · 실패), 끝난 것은 빠진다 · 결석 예정은 ✕ 9/10", auto.length === 3 && auto[0].icon === "✕" && auto[0].what === "9/10 결석 예정 안내" && auto[0].state.text.startsWith("대기") && auto[1].state.text.includes("에 나감") && auto[2].state.cls === "bad", JSON.stringify(auto.map((a) => [a.icon, a.what, a.state.text])));
const scheduled = scheduledRows(sch, jobs, sheets, now, "2026-09-06");
ok("📢 예약된 것 — 예약 표(취소 가능) + 방해금지로 미뤄진 일(취소 못 함) · 때 순서", scheduled.length === 2 && scheduled[0].cancellable === true && scheduled[0].when === "내일 09:00" && scheduled[0].name === "라" && scheduled[1].cancellable === false && scheduled[1].when.includes("방해금지"), JSON.stringify(scheduled));
const sent = sentRows(logs);
ok("오늘 나간 것 — 읽음(2번 열어봄) · 리허설 🧪 · 못 보냄 ⚠️ · 안 읽음(다시 보내기 가능)", sent[0].status.text === "📨 21:10 보냄 · 👁️ 21:20 읽음 · 🔁 2번 열어봄" && sent[0].resendable === false && sent[1].status.rehearsal && sent[1].status.icon === "🧪" && sent[2].status.bad && sent[3].status.unread && sent[3].resendable, JSON.stringify(sent.map((s) => s.status.text)));
ok("읽음 셈 — 읽음 1 · 안 읽음 1 · 못 보냄 1 · 리허설 1", JSON.stringify(readCounts(logs)) === JSON.stringify({ read: 1, unread: 1, failed: 1, rehearsal: 1 }), JSON.stringify(readCounts(logs)));
ok("자취 상태 — 스위치 off 로 안 나간 것은 「리허설 — 실제로는 안 나감」(대전제-0)", logStatus(logs[1]).text.startsWith("리허설(off) — 실제로는 안 나감"));
console.log("■ 알림 판단(순수)");
ok("제목 — [클로이영어] 수업 안내 · 이미 붙어 있으면 다시 안 붙인다 · 갈래 열(첫 등원 안내는 3단계-8 등록 전환 · 영상 안내는 3단계-9 재촉)", titleFor("daily", "클로이영어") === "[클로이영어] 수업 안내" && titleFor("late", "클로이영어") === "[클로이영어] 늦은 귀가 안내" && titleFor("welcome", "클로이영어") === "[클로이영어] 첫 등원 안내" && titleFor("video", "클로이영어") === "[클로이영어] 영상 안내" && Object.keys(LABEL).length === 10);
threw = false; try { titleFor("nope"); } catch { threw = true; } ok("모르는 갈래는 던진다", threw);
const pl = payloadFor({ kind: "daily", academy: "클로이영어", tag: "daily-s1", r: 77 });
ok("짐 다섯 칸(sw.js 계약) — 본문은 늘 「앱에서 확인해주세요.」(잠금화면에 내용 없음)", JSON.stringify(Object.keys(pl)) === JSON.stringify(["title", "body", "tag", "url", "r"]) && pl.body === OPEN_TO_SEE && pl.url === "/parent" && pl.r === 77);
ok("스위치 — 기본 off · 이상한 값은 던진다 · off 는 아무 기기에도 안 보냄 · self 는 학원 사람 기기만 · live 는 전부", sinkOf({}) === "off" && sinkOf({ NOTIFY_SINK: "LIVE" }) === "live" && !mayPush("off", { staff: true }) && mayPush("self", { staff: true }) && !mayPush("self", { staff: false }) && mayPush("live", { staff: false }));
threw = false; try { sinkOf({ NOTIFY_SINK: "on" }); } catch { threw = true; } ok("NOTIFY_SINK=on 같은 값은 던진다(조용히 off 로 안 돈다)", threw);
const subs = [{ id: 1, profile_id: "p1", student_id: null, endpoint: "e1", revoked_at: null }, { id: 2, profile_id: "p1", student_id: null, endpoint: "e1", revoked_at: null }, { id: 3, profile_id: "p2", endpoint: "e3", revoked_at: "2026-09-01T00:00:00Z" }, { id: 4, profile_id: "kid", student_id: "st1", endpoint: "e4", revoked_at: null }, { id: 5, profile_id: "p9", endpoint: "e5", revoked_at: null }];
ok("기기 고르기 — 학부모 기기만 · 끈 기기 빠짐 · 같은 endpoint 한 번 · who=all 이면 아이 기기도", pickDevices({ subs, parents: ["p1", "p2"], studentId: "st1" }).map((d) => d.id).join() === "1" && pickDevices({ subs, parents: ["p1"], studentId: "st1", who: "all" }).map((d) => d.id).join() === "1,4");
ok("방해금지 — 23:30·08:59 는 안 · 09:00·12:00 은 밖 · 시작=끝이면 없음 · 낮 창(12:00~13:00)도", inQuiet("23:30", "23:00", "09:00") && inQuiet("08:59", "23:00", "09:00") && !inQuiet("09:00", "23:00", "09:00") && !inQuiet("12:00", "23:00", "09:00") && !inQuiet("23:30", "00:00", "00:00") && inQuiet("12:30", "12:00", "13:00"));
ok("미룰 때 — 서울 09:00 전이면 오늘 09:00 · 지났으면 내일 09:00", quietUntil("2026-09-05T15:30:00Z", "2026-09-06", "09:00") === "2026-09-06T00:00:00.000Z" && quietUntil("2026-09-06T14:30:00Z", "2026-09-06", "09:00") === "2026-09-07T00:00:00.000Z");
const phr = placeholderRows([{ key: "학생명", note: "아이 이름", example: "강민서" }, { key: "내용", note: "안내 본문", example: "" }]);
ok("뼈대-8 치환 자리 줄 — 표의 설명을 「{{학생명}} — 아이 이름(예: 강민서)」 꼴로 · 예가 없으면 설명만 · unfilled 가 같은 {{ }} 를 잡는다", phr[0].tag === "{{학생명}}" && phr[0].text === "{{학생명}} — 아이 이름(예: 강민서)" && phr[1].text === "{{내용}} — 안내 본문" && unfilled(phr[0].tag)[0] === "학생명");
console.log(`\n■ 발송 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

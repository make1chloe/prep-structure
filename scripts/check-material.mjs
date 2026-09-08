/** 받을 교재·학습지 검사(검사-㊼ · 목업 07 📚 · 07-2 ①) — 순수 판단 lib/material-plan.js: 단계 넷 · 갈래별 묶음(종류 차례) · 끝낸 것은 따로 · 스스로 정한 마감 글(까지 · 오늘까지 · 지났어요) · 달력의 🚩(끝낸 것은 안 뜬다) */
import { STAGES, stageName, isStage, groupGives, dueText, dueBad } from "../lib/material-plan.js";
import { dayMarks, dayDetail } from "../lib/cal-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const today = "2026-09-06";
ok("단계 넷 — 아직·받음·하는 중·완료 · 다른 값은 아니다", STAGES.map(([, v]) => v).join(",") === "아직,받음,하는 중,제출" && stageName("doing") === "하는 중" && isStage("got") && !isStage("lost"));
const rows = [
  { material_id: "a", stage: "none", material: { title: "2과 단어", material_type: { name: "클카 문장훈련", sort: 1 } } },
  { material_id: "b", stage: "doing", due_on: "2026-09-05", material: { title: "대의파악", material_type: { name: "너른터", sort: 2 } } },
  { material_id: "c", stage: "done", material: { title: "1과 단어", material_type: { name: "클카 문장훈련", sort: 1 } } },
  { material_id: "d", stage: "got", material: { title: "2과 본문", material_type: { name: "클카 문장훈련", sort: 1 } } },
];
const g = groupGives(rows);
ok("갈래별 묶음 — 클카 문장훈련(2과 단어 · 2과 본문) · 너른터(대의파악) · 종류 차례 · 끝낸 것 1 은 따로", g.groups.map((x) => `${x.name}:${x.items.map((i) => i.material?.title).join("+")}`).join(" / ") === "클카 문장훈련:2과 단어+2과 본문 / 너른터:대의파악" && g.done.length === 1 && g.done[0].material_id === "c", JSON.stringify(g.groups.map((x) => x.name)));
ok("마감 글 — 「9/9까지」 · 「오늘까지」 · 「9/5 — 지났어요」 · 없으면 빈 글 · 지난 것만 bad", dueText("2026-09-09", today) === "9/9까지" && dueText("2026-09-06", today) === "오늘까지" && dueText("2026-09-05", today) === "9/5 — 지났어요" && dueText(null, today) === "" && dueBad("2026-09-05", today) && !dueBad("2026-09-06", today));
ok("달력 — 마감 날에 🚩 · 끝낸 것의 마감은 안 뜬다 · 그날의 줄에 「🚩 내가 정한 마감 — 제목」", dayMarks("2026-09-09", { today, dues: [{ due_on: "2026-09-09", stage: "doing" }] }).map(([, c]) => c).join("") === "🚩" && dayMarks("2026-09-09", { today, dues: [{ due_on: "2026-09-09", stage: "done" }] }).length === 0 && dayDetail("2026-09-09", { today, dues: [{ due_on: "2026-09-09", stage: "got", material: { title: "대의파악" } }] }).rows[0].b === "🚩 내가 정한 마감 — 대의파악");
console.log(`\n■ 받을 학습지 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

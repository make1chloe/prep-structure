/**
 * **특강 셈(0164)이 정규와 안 겹치나** — 순수 함수를 바로 돌려본다 (특강 6단계).
 *
 * 화면 검사(click.mjs)는 「보이나」 까지만 본다. 여기서는 셈의 계약을 본다 —
 *   · summarize: 정규와 겹친 특강일을 **한 번만** 세나 (이중 셈 금지)
 *   · oneLiner: 특강일이 「수업 3회 미만이면 한 줄 평 안 씀」 문턱을 넘기지 않나
 *   · offSetFor: 전체 휴강 ∪ 이 특강만 쉬는 날 (반 휴강은 특강과 무관)
 *   · extraDatesBy: 휴강·결석(absent)을 빼고, makeup 은 남기나
 *   · toTermShape + meetsOn: 기간 밖 특강이 조용히 살아나지 않나
 *
 * DB 가 없어도 돈다 — lib 의 순수 함수만 부른다.
 */
import { summarize, oneLiner } from "../../lib/monthly.js";
import { offSetFor, extraDatesBy, toTermShape } from "../../lib/extraTerm.js";
import { meetsOn } from "../../lib/classTerm.js";
import { sessionDates } from "../../lib/tuition.js";

let bad = 0;
const ok = (m) => console.log(`  ${m}`);
const no = (m) => { bad++; console.log(`  ✗ ${m}`); };

console.log("\n== 특강 셈 (extraTerm · summarize) ==");

// 달력을 손으로 안 센다 — 요일 계산은 앱과 같은 함수(sessionDates)로 뽑는다
const YM = "2026-08";
const mons = sessionDates(YM, ["월"]);
const thus = sessionDates(YM, ["목"]);

// ① 정규(월요일 판)와 특강(같은 월요일 + 목요일)이 겹치면 — 그 월요일은 한 번만
{
  const s = summarize(
    [{ date: mons[0], attendance_kind: "present" }],
    [],
    [mons[0], thus[0]]
  );
  if (s.days === 2 && s.extraDays === 1 && s.regularDays === 1) {
    ok("겹친 월요일은 한 번만 센다 (days 2 · 특강 1 · 정규 1)");
  } else {
    no(`이중 셈 — days=${s.days} extraDays=${s.extraDays} regularDays=${s.regularDays} (2·1·1 이어야)`);
  }
}

// ② 같은 특강일이 두 번 와도 하루다 (중복 날짜 방어)
{
  const s = summarize([], [], [thus[0], thus[0]]);
  if (s.days === 1) ok("중복 특강일은 하루로 센다");
  else no(`중복 특강일이 ${s.days}일로 섰습니다`);
}

// ③ oneLiner 문턱은 **정규만** 본다 — 특강일이 문턱(3회)을 넘겨도 안 쓴다
{
  const rep = (d) => ({
    date: d, attendance_kind: "present",
    items: [{ status: "done" }],
  });
  const with3regular = summarize([rep(mons[0]), rep(mons[1]), rep(mons[2])], [], []);
  const with1regular = summarize([rep(mons[0])], [], [thus[0], thus[1], thus[2]]);
  if (!oneLiner(with3regular)) {
    no("정규 3회·숙제 100% 인데 한 줄 평이 안 나옵니다 (검사 전제가 깨짐)");
  } else if (with1regular.days >= 3 && oneLiner(with1regular) === "") {
    ok("정규 1회 + 특강 3일 — days 는 문턱을 넘지만 한 줄 평은 안 쓴다");
  } else {
    no(`특강일이 minDays 문턱을 넘겼습니다 (days=${with1regular.days}, one=「${oneLiner(with1regular)}」)`);
  }
}

// ④ offSetFor — 전체 휴강·이 특강만 쉬는 날은 담고, 반 휴강은 안 담는다
{
  const off = offSetFor(
    { off_dates: [thus[1]] },
    [{ scope: "all", date: mons[0] }, { scope: "class", class_id: "c1", date: mons[1] }]
  );
  if (off.has(mons[0]) && off.has(thus[1]) && !off.has(mons[1])) {
    ok("offSetFor — 전체 휴강 ∪ off_dates, 반 휴강은 무관");
  } else {
    no(`offSetFor 가 틀립니다 (${[...off].join(", ")})`);
  }
}

// ⑤ extraDatesBy — 휴강·결석(absent)은 빠지고 makeup 은 남는다
{
  const sched = {
    id: "s1", student_id: "stu", days: ["월", "목"],
    from_date: `${YM}-01`, to_date: `${YM}-31`, off_dates: [thus[1]],
  };
  const got = extraDatesBy(
    [sched], YM,
    [{ scope: "all", date: mons[0] }],
    [
      { schedule_id: "s1", date: thus[0], status: "absent" },
      { schedule_id: "s1", date: thus[2], status: "makeup" },
    ]
  ).get("stu") || [];
  const want = [...mons.slice(1), ...thus.filter((d) => d !== thus[0] && d !== thus[1])].sort();
  const gotS = [...got].sort();
  if (JSON.stringify(gotS) === JSON.stringify(want)) {
    ok("extraDatesBy — 전체 휴강·off_dates·결석은 빼고, makeup 날은 남긴다");
  } else {
    no(`extraDatesBy — ${gotS.join(",")} (기대: ${want.join(",")})`);
  }
}

// ⑥ toTermShape + meetsOn — 기간 밖은 죽는다 (종강 특강 잔존 금지)
{
  const shape = toTermShape({
    label: "검사", days: ["월"], from_date: mons[1], to_date: mons[2],
  });
  const inTerm = meetsOn(shape, mons[1], "월");
  const before = meetsOn(shape, mons[0], "월");
  const after = meetsOn(shape, mons[3] || `${YM}-31`, "월");
  if (inTerm && !before && !after) ok("meetsOn(toTermShape) — 기간 안만 산다");
  else no(`meetsOn — 기간 안 ${inTerm} · 개강 전 ${before} · 종강 뒤 ${after} (t·f·f 여야)`);
}

if (bad) { console.log("\n❌ 특강 셈이 계약과 다릅니다"); process.exit(1); }
console.log("\n✅ 특강 셈 통과");

/**
 * **방해금지 시간** (lib/quiet.js)
 *
 * 원장님 (2026-08-07) — 「방해금지 시간 설정을 할 수 있도록」
 *
 * 여기서 틀리면 **밤새 울리거나 하루 종일 안 울린다.** 둘 다 조용히
 * 일어나고, 알아채는 것은 학부모다. 그래서 못 박아 둔다.
 *
 * 쓰는 법:  node scripts/check-quiet.mjs
 */
import { inQuiet, minsOf, quietLabel, DEFAULT_QUIET } from "../lib/quiet.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};

console.log("== 시각 읽기 ==");
eq(minsOf("22:00"), 1320, "22:00");
eq(minsOf("07:30:00"), 450, "초까지 붙어 있어도 (DB 가 이렇게 준다)");
eq(minsOf(""), null, "빈 값");
eq(minsOf("25:00"), null, "없는 시각");

console.log("\n== 밤을 넘기는 것이 보통이다 ==");
// 22:00~07:00 은 시작이 끝보다 늦다. 그냥 from<=now<to 로 적으면 이 경우가
// 통째로 빠지고, 아무도 안 울리는 대신 **밤새 울린다**
eq(inQuiet("23:30", "22:00", "07:00"), true, "자정 전");
eq(inQuiet("03:00", "22:00", "07:00"), true, "새벽");
eq(inQuiet("06:59", "22:00", "07:00"), true, "끝나기 1분 전");
eq(inQuiet("07:00", "22:00", "07:00"), false, "끝나는 시각은 이미 아침이다");
eq(inQuiet("21:59", "22:00", "07:00"), false, "시작 1분 전");
eq(inQuiet("15:00", "22:00", "07:00"), false, "한낮");

console.log("\n== 낮에 거는 것도 된다 ==");
eq(inQuiet("14:00", "13:00", "16:00"), true, "13~16시 사이");
eq(inQuiet("16:00", "13:00", "16:00"), false, "끝나는 시각");
eq(inQuiet("09:00", "13:00", "16:00"), false, "그 전");

console.log("\n== 안 정했으면 안 막는다 ==");
// **여기가 제일 위험하다.** 못 읽는 값에 true 를 돌려주면 그 집은 알림이
// 통째로 끊긴다 — 오류도 안 나고, 아무도 모른다
eq(inQuiet("14:00", null, null), false, "정한 적 없음");
eq(inQuiet("14:00", "", ""), false, "빈 값");
eq(inQuiet("14:00", "22:00", ""), false, "한쪽만");
eq(inQuiet("14:00", "22:00", "22:00"), false, "시작과 끝이 같으면 없는 것으로");

console.log("\n== 화면에 보여줄 글자 ==");
eq(quietLabel("22:00:00", "07:00:00"), "22:00 ~ 07:00", "초는 떼고");
eq(quietLabel(null, null), null, "없으면 안 그린다");
eq(quietLabel("22:00", "22:00"), null, "같으면 없는 것");

console.log("\n== 아무것도 안 정하셨을 때 (기본값) ==");
/**
 * 원장님 (2026-08-07) — 「학부모 어플에 방해금지 모드는 오후 11시부터
 * 오전 9시까지로 기본설정해줘」
 *
 * 알림은 선생님이 수업을 마치고 정리하시다가 나가는 일이 많아 밤늦게 갈 수
 * 있다. 기본을 「없음」 으로 두면 아무도 안 정하시고, 잠결에 울리는 폰 때문에
 * **알림을 통째로 꺼버리신다** — 그러면 우리는 아무것도 못 알린다.
 */
eq(DEFAULT_QUIET, { from: "23:00", to: "09:00" }, "밤 11시 ~ 아침 9시");
eq(inQuiet("23:30", DEFAULT_QUIET.from, DEFAULT_QUIET.to), true, "밤 11시 반 — 안 울린다");
eq(inQuiet("07:00", DEFAULT_QUIET.from, DEFAULT_QUIET.to), true, "아침 7시 — 아직 안 울린다");
eq(inQuiet("09:00", DEFAULT_QUIET.from, DEFAULT_QUIET.to), false, "아침 9시 — 이제 울린다");
eq(inQuiet("21:00", DEFAULT_QUIET.from, DEFAULT_QUIET.to), false, "밤 9시 — 수업이 끝나는 때라 울려야 한다");

if (fail) { console.log("\n❌ 방해금지 시간 계산에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 방해금지 시간 통과");

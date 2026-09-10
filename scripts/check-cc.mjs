/** 🃏 클래스카드 받는 쪽 검사(검사-77 · (녀) 확정-⑩·⑱·55) — 확장이 보낸 짐을 읽는 판단(lib/cc-plan.js, 순수)과, 받는 길이 하나인가(글자):
 *  ① 3초훈련은 판정하지 않는다(확정-⑩ — 짐에 와도 버린다) ② 목표·실제는 확장이 보낸 그대로 보이고 **앱이 안 넘긴다**(확정-⑱)
 *  ③ 스크램블·드릴도 같은 줄(확정-55) ④ 못 쓸 줄은 막지 않고 버린다(한 줄이 나빠도 나머지는 들어간다) ⑤ 한 번에 받는 양 상한
 *  ⑥ 받는 길은 app/api/cc/route.js 하나 · 쓰는 손은 lib/cc.js 하나 · 열쇠는 답에 안 실린다(대전제-9) */
import { MODES, MODE_NAME, DROPPED, SET_TYPE, ALIAS, modeKey, tidyScores, readRow, parsePayload, modeLines, shortOf, shortText, plannerLine, MAX_ROWS, MAX_STUDENTS } from "../lib/cc-plan.js";
import { readFileSync } from "node:fs";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const src = (f) => strip(readFileSync(f, "utf8"));
console.log("■ 판단 — 확장이 보낸 짐");
ok("모드는 단어 넷(암기·리콜·매칭·스펠) · 문장 셋(낭독·녹음·문장암기) · 갈래를 안 가리는 둘(스크램블 · 드릴 순서배열 — 확정-55) · 세트 갈래는 1 단어 · 2 문장",
  MODES.length === 9 && MODE_NAME.match === "매칭" && MODE_NAME.scramble === "스크램블" && MODE_NAME.drill === "드릴 순서배열" && SET_TYPE[1] === "단어" && SET_TYPE[2] === "문장");
ok("**3초훈련은 판정하지 않는다**(확정-⑩) — 짐에 와도 버린다 · 숫자가 아닌 값도 버린다(확장이 「-」 를 보낼 때가 있다)",
  DROPPED.includes("speed") && !("speed" in tidyScores({ speed: 3, memorize: 100 })) && JSON.stringify(tidyScores({ memorize: 100, spell: "-", match: 3240 })) === JSON.stringify({ memorize: 100, match: 3240 }),
  JSON.stringify(tidyScores({ speed: 3, memorize: 100, spell: "-" })));
ok("(뎌-3) 클래스카드가 쓰는 이름을 우리 열쇠로 옮기는 곳은 **여기 한 곳**(ALIAS) — 확장은 긁은 이름을 그대로 보낸다(원칙-1)",
  modeKey("mem") === "memorize" && modeKey("speaking") === "read" && modeKey("matching") === "match" && modeKey("MEM") === "memorize"
  && modeKey("memorize") === "memorize" && modeKey("speed") === null && modeKey("zzz") === null
  && JSON.stringify(tidyScores({ mem: 100, speaking: 80, speed: 3, nope: 5 })) === JSON.stringify({ memorize: 100, read: 80 })
  && MODES.every(([k]) => ALIAS[k] === k),
  JSON.stringify(tidyScores({ mem: 100, speaking: 80, speed: 3, nope: 5 })));
ok("못 쓸 줄은 **막지 않고 버린다** — 날짜가 아니거나 세트 이름이 없으면 그 줄만 빠지고 까닭이 남는다",
  Boolean(readRow({ date: "어제", set_name: "가" }).bad) && Boolean(readRow({ date: "2026-09-10" }).bad) && Boolean(readRow({ date: "2026-09-10", set_name: "능률보카" }).row));
{ const p = parsePayload({ students: [{ cc_user_idx: "123", cc_login_id: "chloe_min", rows: [{ date: "2026-09-10", set_name: " 능률보카  Day 38-40 ", set_type: 1, complete: true, cards: 60, goals: { memorize: 100, spell: 100, speed: 9 }, got: { memorize: 100, spell: 82, speed: 3 } }, { date: "어제", set_name: "x" }] }, { cc_login_id: "아이디 없음" }] });
  ok("짐 읽기 — 아이마다 줄 여럿 · 세트 이름의 앞뒤·겹친 빈칸을 다듬는다 · 아이디 없는 사람과 못 쓸 줄은 버린 목록에 남는다",
    p.people.length === 1 && p.people[0].rows.length === 1 && p.people[0].rows[0].set_name === "능률보카 Day 38-40" && p.dropped.length === 2, JSON.stringify(p.dropped)); }
ok("한 번에 받는 양에 상한이 있다 — 아이 200 · 줄 600(확장이 폭주해도 DB 가 안 눕는다) · students 가 없으면 짐이 아니다",
  MAX_STUDENTS === 200 && MAX_ROWS === 600 && (() => { try { parsePayload({}); return false; } catch { return true; } })()
  && (() => { try { parsePayload({ students: Array.from({ length: 201 }, () => ({ cc_user_idx: "1" })) }); return false; } catch { return true; } })());
{ const lines = modeLines({ memorize: 100, match: 3000, spell: 100 }, { memorize: 100, match: 3240, spell: 82 });
  const by = Object.fromEntries(lines.map((l) => [l.key, l]));
  ok("목표 대 실제 — 백분율은 「스펠 82% · 목표 100%」 · 개수는 「매칭 3,240 · 목표 3,000」 · 넘었나(ok)는 **보여만 준다**(확정-⑱ 앱이 안 넘긴다)",
    by.spell.text === "스펠 82% · 목표 100%" && by.match.text === "매칭 3,240 · 목표 3,000" && by.memorize.ok === true && by.match.ok === true && by.spell.ok === false, lines.map((l) => l.text).join(" / "));
  ok("목표가 없으면 판정하지 않는다(ok 는 null · 실제만 보인다) · 못 넘긴 것만 따로 센다",
    modeLines({}, { scramble: 70 })[0].ok === null && modeLines({}, { scramble: 70 })[0].text === "스크램블 70%" && shortOf(lines).map((l) => l.key).join() === "spell"); }
ok("그날 한 줄 — 「능률보카 Day 38-40 · 단어 · 완료 · 60장」 · 다 넘었으면 allOk", (() => { const p = plannerLine({ set_name: "능률보카 Day 38-40", set_type: 1, complete: true, cards: 60, goals: { memorize: 100 }, got: { memorize: 100 } }); return p.title === "능률보카 Day 38-40 · 단어 · 완료 · 60장" && p.allOk === true && p.short.length === 0; })(), plannerLine({ set_name: "a", set_type: 1, complete: true, cards: 60 }).title);
console.log("■ 받는 길 — 하나인가 · 열쇠가 새지 않나");
{ const route = src("app/api/cc/route.js"), hand = src("lib/cc.js"), plan = src("lib/cc-plan.js");
  ok("받는 길은 app/api/cc/route.js 하나 — 열쇠를 견주고(Bearer) 짐 크기를 막고, 셈·쓰기는 lib/cc.js 에 맡긴다",
    /export async function POST/.test(route) && /sameToken\(/.test(route) && /MAX_BYTES/.test(route) && /receive\(/.test(route) && !/from\(["']cc_planner["']\)/.test(route));
  ok("열쇠 견주기는 시간이 안 새게(timingSafeEqual) · 열쇠는 답·자취 어디에도 안 실린다(대전제-9)",
    /timingSafeEqual/.test(hand) && !/Response\.json\([^)]*\btoken\b/.test(route) && !/console\.log\([^)]*token/i.test(route + hand));
  ok("cc_planner·cc_due·cc_student 에 쓰는 곳은 lib/cc.js 하나(대전제-4 · 화면은 손을 부른다)",
    /from\(["']cc_planner["']\)\s*\.upsert/.test(hand) && !/from\(["']cc_planner["']\)\s*\.(insert|update|upsert|delete)/.test(src("app/ops/students/board.js")));
  ok("순수 판단(lib/cc-plan.js)은 DB·열쇠를 모른다 — 화면도 가져다 쓸 수 있어야 한다", !/supabase|node:crypto|process\.env/.test(plan)); }
console.log("■ (뎌-4) 오늘 수업 01 의 🃏 카드 — 확장이 보낸 그대로 · 앱이 안 넘긴다(확정-⑱)");
ok("모드 칸은 값과 목표를 **따로** 낸다(화면이 다시 꾸미지 않는다) — 개수는 세 자리 쉼표 · 백분율은 반올림 · 목표가 없으면 목표 줄이 없다",
  (() => { const l = modeLines({ match: 3000 }, { match: 3240, memorize: 99.6 });
    const m = l.find((x) => x.key === "match"), me = l.find((x) => x.key === "memorize");
    return m.actualText === "3,240" && m.goalText === "목표 3,000" && me.actualText === "100%" && me.goalText === null && me.ok === null; })(),
  JSON.stringify(modeLines({ match: 3000 }, { match: 3240, memorize: 99.6 }).map((x) => [x.key, x.actualText, x.goalText])));
ok("못 넘긴 것만 말한다 — 「스펠 다시 돌립니다」 · 다 넘었으면 「다 넘었습니다」 · **잴 것이 없으면 아무 말도 안 한다**(거짓말 안 함)",
  shortText(modeLines({ spell: 100, match: 3000 }, { spell: 82, match: 3240 })) === "스펠 다시 돌립니다"
  && shortText(modeLines({ spell: 100 }, { spell: 100 })) === "다 넘었습니다" && shortText(modeLines({}, { spell: 82 })) === null && shortText([]) === null);
{ const row = src("app/today/row.js"), act = src("app/today/actions.js"), day = src("lib/day.js");
  ok("🃏 카드는 **판단을 안 한다** — 목표 대 실제·못 넘긴 것 글을 lib/cc-plan.js 에서 가져다 쓴다(원칙-1)",
    /plannerLine|shortText/.test(row) && !/목표 \$\{/.test(row) && !/toLocaleString\("ko-KR"\)[^;]*목표/.test(row));
  ok("**앱이 스스로 안 넘긴다**(확정-⑱) — 넘기기는 원장님이 누른 것만 적는다(손 하나 · 자동 부름이 없다)",
    /data-act="cc-skip"/.test(row) && /ccSkipAct/.test(act) && !/ccSkip\(/.test(day));
  ok("플래너 줄은 **화면 파도에 태운다**(속도-1) — lib/day.js 의 Promise.all 안에서 한 조회", /ccDay\(sb, p\.studentIds, date\)/.test(day) && /Promise\.all\(\[[\s\S]{0,4000}ccDay\(/.test(day));
  ok("걷기가 🃏 카드를 눌러본다 — 목표 대 실제 · 3초훈련 없음 · ⏭ 넘기고 되돌리기", (() => { const w = src("scripts/e2e/today.mjs");
    return /data-card=cc\]/.test(w) && /스펠 다시 돌립니다/.test(w) && /넘겼습니다 — 오늘은 안 셉니다/.test(w); })()); }
console.log(`\n■ 클래스카드 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

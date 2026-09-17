/** (어72) 아이가 제 **빈 칸**을 채운다 — 검사. 원장님 2026-09-17 「… 모두 내가 설정페이지에서 켰을때 그리고 칸이 비어있을때만」
 *  · 「아 그럼 반은 빼」 · 「알겠어 그러면학교도 빼」.
 *  지키는 것: ① 칸 목록이 한 곳 · 학교·반·수납은 **없다** ② 켠 것 **그리고** 빈 것만 ③ 손이 **서버에서 다시 잰다**
 *  ④ 규칙 쓰기는 lib/rule.js 한 곳 ⑤ 표가 네 칸만·비었을 때만 받는다 ⑥ 안 켜면 아이 화면에 카드가 없다 ⑦ chloe 막이는 한 곳 */
import { readFileSync } from "node:fs";
import { FILL, FILL_KEYS, RULE_KEYS, isOn, isEmpty, fillFields, filledLines, parseFill } from "../lib/mine-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const thr = (fn) => { try { fn(); return false; } catch { return true; } };
const T = (p) => readFileSync(p, "utf8");

console.log("■ 채울 칸 — 한 곳 · 원장님이 빼신 것은 없다");
ok("칸은 다섯(부모님 폰 · 학생 폰 · 학년 · 생일 · 클래스카드) · 규칙 열쇠는 me.fill.*",
  FILL_KEYS.join() === "parent_phone,phone,grade,birth,cc" && RULE_KEYS.every((k) => k.startsWith("me.fill.")), FILL_KEYS.join());
ok("**학교 · 반 · 수납은 없다**(원장님 「아 그럼 반은 빼」 · 「알겠어 그러면학교도 빼」)",
  !FILL_KEYS.some((k) => ["school_id", "school", "class", "class_id", "fee"].includes(k)) && !RULE_KEYS.some((k) => /school|class|fee/.test(k)));
ok("교재 진도 체크는 이 목록에 **없다** — 이미 설정 › 진도 체크가 정한다(students.progress_edit · 두 벌로 안 만든다)",
  !FILL_KEYS.includes("progress_edit") && /progress_edit/.test(T("lib/me.js")));

console.log("■ 켠 것 **그리고** 빈 것만");
{ const st = { phone: null, parent_phone: "01011112222", grade: null, birth: null }, on = Object.fromEntries(RULE_KEYS.map((k) => [k, "on"]));
  ok("안 켜면 한 칸도 안 뜬다(기본 꺼짐 — 원장님이 켜실 때까지 아이 화면에 카드가 없다)", fillFields(st, null, {}).length === 0);
  ok("켜도 **이미 찬 칸**은 안 뜬다(학부모 폰이 있으면 그 줄만 빠진다) · 이미 찬 것은 보기로만",
    fillFields(st, null, on).map((f) => f.key).join() === "phone,grade,birth,cc" && filledLines(st, null).map((f) => f.key).join() === "parent_phone");
  ok("클래스카드는 **줄 자체가 없는 것**이 빈 것이다(줄이 있으면 안 뜬다)",
    isEmpty(st, null, "cc") === true && isEmpty(st, { cc_user_idx: "min_kim" }, "cc") === false);
  ok("규칙 값은 「on」 하나만 켜짐(빈 값·모르는 값은 꺼짐)", isOn({ k: "on" }, "k") && !isOn({ k: "off" }, "k") && !isOn({}, "k") && !isOn({ k: "true" }, "k"));
  ok("값 읽기 — 전화 숫자 10~11 · 학년 1~6 · 생일 꼴·앞날·옛날은 막는다",
    parseFill("phone", "010-1234-5678") === "01012345678" && parseFill("grade", " 3 ") === 3 && parseFill("birth", "2015-03-21", "2026-09-17") === "2015-03-21"
    && thr(() => parseFill("phone", "0101")) && thr(() => parseFill("grade", "7")) && thr(() => parseFill("birth", "2015.03")) && thr(() => parseFill("birth", "2027-01-01", "2026-09-17")) && thr(() => parseFill("nope", "x"))); }

console.log("■ 손 — 화면을 우회해도 막힌다");
{ const m = T("lib/mine.js");
  ok("서버에서 **다시 잰다** — 켰나(ruleMap·isOn) · 비었나(isEmpty) · 제 줄인가(studentId)",
    /ruleMap\(sb, \["me\.fill\."\]\)/.test(m) && /isOn\(rules, f\[1\]\)/.test(m) && /isEmpty\(st, cc, key\)/.test(m));
  ok("클래스카드는 **넣기만**(insert) — 덮어쓰기는 원장님 몫(14 linkCc)", /from\("cc_student"\)\.insert\(/.test(m) && !/cc_student"\)\.(update|upsert)/.test(m));
  ok("chloe 막이는 **한 곳**에서 온다(lib/cc.js parseCcIdx) — 아이 쪽이 제 손으로 정규식을 안 적는다",
    /parseCcIdx/.test(m) && !/\/\^?chloe/i.test(m) && /export function parseCcIdx/.test(T("lib/cc.js")));   // 정규식을 제 손으로 적었나만 본다(주석의 낱말은 괜찮다)
  ok("0줄이면 실패로 센다(changed 한 벌 · 검사-⑪)", (m.match(/changed\(await/g) ?? []).length === 2); }

console.log("■ 규칙 쓰기는 lib/rule.js 한 곳(원칙 4-3 — 세 번째가 될 참이라 모았다)");
{ const files = ["lib/exam.js", "lib/send.js", "lib/mine.js", "app/settings/actions.js", "app/me/actions.js"];
  const stray = files.filter((f) => /from\("rule"\)\.(update|upsert|insert)/.test(T(f)));
  ok("lib/rule.js 밖에서 규칙 줄을 고치는 자리 0", stray.length === 0, stray.join(" · "));
  ok("lib/rule.js 에 setRule 이 있고 · 줄이 없으면 던진다(화면이 새 열쇠를 만들지 않는다)",
    /export async function setRule/.test(T("lib/rule.js")) && /규칙 줄이 없다/.test(T("lib/rule.js")));
  ok("옛 두 곳이 그리로 옮겨졌다(prep.stop_weeks · send.sms_kinds)", /setRule\(sb, `prep\.stop_weeks/.test(T("lib/exam.js")) && /setRule\(sb, "send\.sms_kinds"/.test(T("lib/send.js"))); }

console.log("■ 표 0175 — 네 칸만 · 비었을 때만 · 제 줄만");
{ const sql = T("supabase/migrations/0175_mine_fill.sql");
  ok("생일 칸을 파고 · 파기 목록에도 넣는다(개인정보)", /add column if not exists birth date/.test(sql) && /purge_map[\s\S]{0,120}'birth'/.test(sql));
  ok("스위치 다섯을 **꺼진 채로** 심는다(안 켜면 아무 일도 안 난다)",
    RULE_KEYS.every((k) => new RegExp(`'${k.replace(/\./g, "\\.")}',\\s*'off'`).test(sql)));
  ok("문지기 — 네 칸 말고 하나라도 달라지면 거절 · 이미 적힌 칸은 못 바꾼다 · 제 줄만 · 학원 사람과 서버 자신은 그대로(0082 와 같은 꼴 · 거절은 우리 말 + 42501)",
    /to_jsonb\(new\) - 'phone' - 'parent_phone' - 'grade' - 'birth' - 'updated_at'/.test(sql)
    && /이미 적힌 칸이다: 전화번호' using errcode = '42501'/.test(sql) && /이미 적힌 칸이다: 생년월일' using errcode = '42501'/.test(sql)
    && /new\.profile_id is distinct from 누구/.test(sql) && /if 누구 is null then return new; end if;/.test(sql) && /if v2\.is_staff\(\) then return new; end if;/.test(sql));
  ok("클래스카드는 읽기 + **넣기만** 연다(고치기 정책 0 — 「비었다」는 줄이 없는 것)",
    /create policy own_cc_read on v2\.cc_student for select/.test(sql) && /create policy own_cc_fill on v2\.cc_student for insert/.test(sql)
    && !/on v2\.cc_student for update/.test(sql));
  ok("학생 14 판에 생년월일을 실었다 — 아이가 채운 값을 원장님이 보신다(대전제-0)", /'birth', st\.birth/.test(sql)); }

console.log("■ 화면");
{ const me = T("app/me/page.js"), card = T("app/me/mine.js"), set = T("app/settings/page.js"), fill = T("app/settings/fill.js");
  ok("아이 07 — 채울 칸이 0이면 카드를 **아예 안 그린다**", /d\.fill\.length > 0 && <Card [^\n]*id="mine"[^\n]*><Mine /.test(me));
  ok("아이 07 카드는 칸을 **다시 안 고른다**(lib 이 고른 것을 받아 그린다 · 원칙-1)", /fields = \[\]/.test(card) && !/isOn\(|isEmpty\(/.test(card));
  ok("아이 07 의 눌리는 조각은 카드 틀을 **안 받는다**(서버가 함수를 건네면 07 이 통째로 안 열린다 · check-dom 이 지킨다)", !/\bCard\b/.test(card.replace(/\/\*[\s\S]*?\*\//g, "")) && /<Card [^\n]*><Mine /.test(me));
  ok("설정 카드는 **원장만** 보고 · 같은 파도에 태웠다(속도-1)", /principal \? ruleMap\(sb, \["me\.fill\."\]\)/.test(set) && /\{fillRules && <Fill/.test(set));
  ok("설정 칩은 누르면 먼저 바뀌고 실패하면 되돌린다(속도-3)", /setOpt\(\(o\) => \(\{ \.\.\.o, \[rk\]: next \}\)\)/.test(fill) && /setOpt\(\(o\) => \(\{ \.\.\.o, \[rk\]: !next \}\)\)/.test(fill)); }

console.log(`\n■ 내 정보 채우기 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

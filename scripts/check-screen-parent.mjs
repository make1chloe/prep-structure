/**
 * 학부모 화면(`app/parent`) 검사 — **글자로만 훑지 않고 판단을 실제로 돌린다.**
 *
 *  보는 것
 *    ① 파일이 제자리에 있는가
 *    ② ⚠️⚠️ **사고 #7** — 마감 전 그날 내용이 학부모 값에 실리지 않는가.
 *       원장 메모를 심은 가짜 판을 **진짜로 돌려** 「키째로 없는가」까지 본다
 *    ③ 화면이 **lib 을 지나는가** — 마감·수업일·지각 분·자료 판단을 제 손으로 짓지 않는가
 *    ④ ⚠️ 탭이 없는가 · 폰 규칙(fixed 잠금·pushState·portal·alert·투명도·새 색·새 글씨)
 *    ⑤ ⚠️ **조회 수가 상한 안인가** — 가짜 Supabase 를 끼워 `loadParent()` 를 실제로 돌린다
 *    ⑥ 달력 — 마감 안 한 날이 **「수업함 · 정리 중」**인가 · 앞날은 다음 달까지인가 ·
 *       지난 것은 재원 기간만인가 (계획 ⑯)
 *    ⑦ 원장님이 써 주신 두 줄이 **글자 그대로** 있는가 · 첫 안내가 「앞으로 할 것」을 밝히는가
 *    ⑧ ⚠️ 진도 레이스(순위)를 학부모에게 안 그리는가
 *    ⑨ 자료 보내기 — 30장 넘으면 **한 장도 안 가는가** · 형제면 먼저 묻는가 ·
 *       넣는 칸이 `lib/files.js` 의 `fileInsertSql()` 과 같은 벌인가 (계획 ㊸)
 *    ⑩ 월간 리포트 어댑터의 **근거가 아직 참인가** (`lib/monthly.js` 가 그 표를 그렇게 고르는가)
 *    ⑪ 320·390·768·1400px 에서 **진짜로 그려** 잰다 (크롬이 있을 때만)
 *
 *  ⚠️ 이 검사가 초록이어도 **지금 이 화면은 실제로 아무것도 못 읽는다.**
 *     끝에 「■ 코드로는 못 고치는 것」 으로 매번 세워 준다 — 그 줄을 지우지 마라.
 *
 *  돌리는 법:  node scripts/check-screen-parent.mjs
 */
import { readFileSync, existsSync, readdirSync, mkdtempSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileInsertSql, acceptBatch, MAX_FILES } from "../lib/files.js";
import { PREPARING, NOTHING, DAY_OPEN } from "../lib/close.js";
import { LATE_PRESETS } from "../lib/attend.js";

let fail = 0, n = 0;
const ok = (t, c, why = "") => {
  n++;
  if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
  else console.log(`   ✅ ${t}`);
};
/** ⚠️ 한 자리가 죽어도 나머지를 끝까지 본다 (안 감싸면 뒤의 진짜 실패를 아무도 못 본다) */
const sec = async (title, fn) => {
  console.log(title);
  try { await fn(); }
  catch (e) { n++; fail++; console.log(`   ❌ 이 자리가 도중에 죽었다 — ${e?.stack ?? e}`); }
};

const FILES = {
  page:    "app/parent/page.js",
  view:    "app/parent/view.js",
  read:    "app/parent/read.js",
  shape:   "app/parent/shape.js",
  actions: "app/parent/actions.js",
  words:   "app/parent/words.js",
  upload:  "app/parent/upload/route.js",
  self:    "scripts/check-screen-parent.mjs",
};
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
/** ⚠️ 주석 속 경고까지 「위반」으로 세면 경고를 적을수록 검사가 빨개진다 — 주석은 지우고 본다 */
const 코드만 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const src = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)]));
const code = Object.fromEntries(Object.entries(src).map(([k, s]) => [k, 코드만(s)]));
/** 화면 쪽 파일 전부의 **도는 코드**를 한 덩어리로 (검사 파일 자신은 뺀다) */
const 화면코드 = ["page", "view", "read", "shape", "actions", "words", "upload"]
  .map((k) => code[k]).join("\n");

/** `const css = ...` 로 적은 css 의 몸통 (`app/logout-button.js` 와 같은 꼴) */
const css몸통 = (s) => {
  const 머리 = "const css = `";
  const 시작 = s.indexOf(머리), 끝 = s.lastIndexOf("`;");
  return 시작 >= 0 && 끝 > 시작 ? s.slice(시작 + 머리.length, 끝) : null;
};

// ── 노드가 `@/…` 를 못 푼다. 갈고리로 풀어 준다 (코드는 한 줄도 안 고친다) ─────
const ROOT = pathToFileURL(process.cwd() + "/").href;
register("data:text/javascript," + encodeURIComponent(`
  const ROOT=${JSON.stringify(ROOT)};
  export function resolve(spec, ctx, next){
    if (spec.startsWith("@/")) return next(new URL(spec.slice(2) + ".js", ROOT).href, ctx);
    // 노드는 next 의 하위 이름을 못 푼다 — 확장자를 붙여 준다
    if (/^next\/(headers|cache|navigation|server)$/.test(spec)) return next(spec + ".js", ctx);
    return next(spec, ctx);
  }
`));

console.log("■ 학부모 화면 검사 — app/parent");

/* ══════════════════════════════════════════════════════════════════════ */
await sec("\n■ ① 파일이 제자리에 있는가", async () => {
  for (const [k, p] of Object.entries(FILES)) ok(p, src[k].length > 0, "없다");
});

/* ══════════════════════════════════════════════════════════════════════
 * ② ⚠️⚠️ 사고 #7 — **유일하게 밖으로 샌 사고**.
 *    옛 앱은 접근 규칙에 마감 술어가 없어 학생 70줄·학부모 122줄이 만들자마자 보였다.
 *    여기서는 「화면이 숨기는가」가 아니라 **「값에 아예 없는가」**를 본다.
 *    숨긴 것은 언젠가 그려지고, 없는 것은 그려질 수가 없다.
 * ══════════════════════════════════════════════════════════════════════ */
let shape;
await sec("\n■ ② ⚠️ 마감 전 그날 내용이 학부모 값에 안 실리는가 (사고 #7)", async () => {
  shape = await import(new URL("app/parent/shape.js", ROOT).href);

  const 안마감 = {
    id: "S1", student_id: "K1", class_id: null, date: "2026-09-10", attend: "present",
    closed_at: null, sent_at: null,
    comment: "오늘 관계대명사를 했습니다",
    staff_note: "⚠️ 어머니께 말하지 말 것 — 숙제 계속 안 해 옴",
  };
  const 마감 = { ...안마감, id: "S2", date: "2026-09-08", closed_at: "2026-09-08T13:00:00Z" };
  const items = new Map([
    ["S1", [{ id: "I1", slot: "home", status: "none", memo: "본책 12~15" }]],
    ["S2", [{ id: "I2", slot: "home", status: "done", memo: "본책 8~11" }]],
  ]);

  const out = shape.familyRows([안마감, 마감], items);
  const json = JSON.stringify(out);

  ok("원장 메모가 **키째로** 없다", !json.includes("staff_note"),
     `남아 있다: ${json.slice(0, 200)}`);
  ok("마감 전 판에는 `comment` 키가 아예 없다", !("comment" in out[0]),
     "null 로 두어도 안 된다 — 있으면 언젠가 그려진다");
  ok("마감 전 판의 줄이 0개다 (숨긴 것이 아니라 안 실린 것)", out[0].items.length === 0);
  ok(`마감 전 글이 lib 의 「${PREPARING}」 이다`, out[0].label === PREPARING);
  ok("마감 전 판은 visible=false", out[0].visible === false);
  ok("마감한 판은 그날 글이 실린다", out[1].comment === 안마감.comment && out[1].visible === true);
  ok("마감한 판의 줄은 그대로 실린다", out[1].items.length === 1);

  // ⚠️ **원장 역할로 부르면 다 보인다** — 그러면 이 함수를 지나는 것만으로는 안전하지 않다.
  //    화면이 'parent' 로 부르는지까지 본다
  ok("기본 역할이 'parent' 다 (화면이 깜빡해도 새지 않는다)", shape.ROLE === "parent");
  const 원장것 = shape.familyRows([안마감], items, "staff");
  ok("검사 자신이 옳다 — 원장 역할이면 원장 메모가 보인다(대조군)",
     JSON.stringify(원장것).includes("staff_note"),
     "이 대조군이 깨지면 위 검사가 늘 통과하는 헛검사가 된다");

  // 화면 코드 어디에도 그 칸 이름이 없어야 한다 (select 에서도 빼 둔다 — 두 겹으로 막는다)
  ok("화면 코드 어디에도 `staff_note` 가 없다", !/staff_note/.test(화면코드),
     "select 에 넣으면 lib 을 지나기 전에 이미 서버 메모리에 올라온다");
  ok("day_sheet 를 고를 때 그 칸을 안 가져온다",
     /from\("day_sheet"\)[\s\S]{0,200}?\.select\("([^"]*)"\)/.test(code.read) &&
     !/from\("day_sheet"\)[\s\S]{0,200}?staff_note/.test(code.read));
});

/* ══════════════════════════════════════════════════════════════════════ */
await sec("\n■ ③ 화면이 lib 을 지나는가 (판단을 제 손으로 짓지 않는가)", async () => {
  const 부른다 = (k, what, from) =>
    ok(`${FILES[k]} 가 ${what} 를 ${from} 에서 부른다`,
       new RegExp(`import[^;]*\\b${what}\\b[^;]*from\\s+["']${from.replace(/[/\\]/g, "\\$&")}`).test(code[k]),
       "여기서 다시 짜면 그날부터 규칙이 두 벌이다 (원칙 1)");

  부른다("shape", "sheetForFamily", "@/lib/close");
  부른다("shape", "itemsForFamily", "@/lib/close");
  부른다("read", "hideEmptyCards", "@/lib/close");
  부른다("read", "countDates", "@/lib/session");
  부른다("read", "sentView", "@/lib/monthly");
  부른다("actions", "lateMinutes", "@/lib/attend");
  부른다("upload", "acceptBatch", "@/lib/files");
  부른다("upload", "refuseReason", "@/lib/files");
  부른다("upload", "pathFor", "@/lib/files");
  부른다("upload", "purgeOnFor", "@/lib/files");
  부른다("view", "acceptBatch", "@/lib/files");

  // ⚠️ **서비스 열쇠는 화면에서 절대 안 쓴다** — 접근 규칙을 통째로 지나쳐
  //    학부모 폰에서 남의 아이 자료가 그대로 열린다
  ok("화면 어디에도 `serviceDb` 가 없다", !/serviceDb/.test(화면코드),
     "그걸 쓰면 RLS 밖으로 나간다 — 남의 아이 자료가 열린다");
  ok("화면 어디에도 서비스 열쇠 이름이 없다", !/SERVICE_ROLE/.test(화면코드));

  // ⚠️ 마감 판단을 화면이 하면 안 된다 — `lib/close.js` 의 몫이다
  ok("화면이 `closed_at` 으로 스스로 가르지 않는다",
     !/closed_at\s*(\?|&&|\|\||===|!==|==|!=)/.test(화면코드) && !/!\s*\w*\.?closed_at/.test(화면코드),
     "그 판단은 sheetForFamily() 한 곳에만 있어야 한다");

  // ⚠️ 출결을 화면이 쓰면 안 된다 — 여덟 갈래가 전부 lib/attend.js 를 지난다
  ok("화면이 `v2.day_sheet` 에 쓰지 않는다",
     !/from\("day_sheet"\)\s*\.\s*(insert|update|upsert|delete)/.test(화면코드),
     "학부모 요청은 v2.request 에 남기고, 출결은 원장님이 attendanceWrite 로 찍는다");

  // ⚠️ 내보내는 자리는 lib/notify.js 하나뿐이다. 학부모 화면은 아예 안 보낸다
  ok("화면이 알림을 직접 보내지 않는다", !/\bnotify\s*\(/.test(화면코드) && !/lib\/notify/.test(화면코드),
     "학부모 계정은 notify_log·job_queue 에 쓸 권한도 없다");

  // ⚠️ 지각 분·수업일을 화면이 세지 않는다
  ok("화면이 분 셈을 제 손으로 안 짠다 (`/ 60`·`* 60` 없음)",
     !/[/*]\s*60\b/.test(화면코드), "지각 「얼마나」는 lateMinutes() 한 곳이다");
  ok("화면이 「학원의 오늘」을 `new Date()` 로 세지 않는다",
     !/new Date\(\s*\)/.test(화면코드),
     "서버가 UTC 면 밤 9시부터 하루가 어긋난다 — v2.today() 를 읽는다");
});

/* ══════════════════════════════════════════════════════════════════════ */
await sec("\n■ ④ ⚠️ 탭이 없는가 · 폰 규칙을 지키는가", async () => {
  ok("탭이 없다", !/role=["']tab/.test(화면코드) && !/\btablist\b/.test(화면코드) &&
                  !/\b(setTab|activeTab|currentTab|tabIndex_)\b/.test(화면코드),
     "탭 전환은 화면 전체 재조회다 — 접기로 줄인다");
  ok("접기가 있다 (급한 순서로 한 화면에 세우고 접기로 줄인다)",
     /is-open/.test(code.view) && /accbd/.test(code.view));

  ok("`position:fixed` 스크롤 잠금이 없다", !/position\s*:\s*fixed/.test(화면코드));
  ok("`history.pushState` 로 닫지 않는다", !/pushState/.test(화면코드));
  ok("`createPortal` 이 없다", !/createPortal/.test(화면코드));
  ok("`alert(`·`confirm(` 이 없다", !/\b(window\.)?(alert|confirm)\s*\(/.test(화면코드));
  ok("`overflow:hidden` 으로 몸통을 잠그지 않는다", !/body[^{]*\{[^}]*overflow\s*:\s*hidden/.test(화면코드));

  const css = css몸middle();
  function css몸middle() { return css몸통(src.view); }
  ok("view.js 에 css 몸통이 있다", typeof css === "string" && css.length > 0);
  if (typeof css === "string") {
    // ⚠️ **새 색을 만들지 않는다** — 토큰만 쓴다
    const hex = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    ok(`새 색을 안 만든다 (${hex.join(" ") || "없음"})`, hex.length === 0,
       "app/globals.css 의 토큰(var(--…))만 쓴다");
    const rgb = [...css.matchAll(/\b(rgba?|hsla?)\(/g)].map((m) => m[0]);
    ok(`색 함수도 안 쓴다 (${rgb.join(" ") || "없음"})`, rgb.length === 0);
    // ⚠️ **새 글씨 크기를 만들지 않는다** — --fs1..10 뿐이다
    const px = [...css.matchAll(/font-size\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
    ok(`글씨 크기가 전부 토큰이다 (${px.join(" · ") || "없음"})`,
       px.every((v) => /^var\(--fs\d+\)$/.test(v)),
       "여기 없는 크기를 만들면 화면마다 글씨가 조금씩 달라진다");
    // ⚠️ **투명도로 흐리게 하지 않는다** (계획 ㉑)
    ok("`opacity` 로 흐리게 하지 않는다", !/opacity\s*:/.test(css),
       "「덜 중요함」은 색(--mute·--off-*)으로 말한다");
    // ⚠️ 한 낱말 상태 클래스는 이 저장소에서 **세 번** 터졌다
    const 한낱말 = [...css.matchAll(/\.(open|on|sel|active|hide|show)\b/g)].map((m) => m[0]);
    ok(`한 낱말 상태 클래스가 없다 (${한낱말.join(" ") || "없음"})`, 한낱말.length === 0,
       "상태는 `is-` 를 붙이고, 새 이름은 `pr-` 로 시작한다");
    // 새로 만든 클래스는 전부 `pr-` 로 시작한다 (globals 의 이름 대장을 안 어지럽힌다)
    const 새이름 = [...new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))];
    const 대장 = new Set([...read("app/globals.css").matchAll(/@이름\s+\.([A-Za-z][\w-]*)/g)].map((m) => m[1]));
    const 낯선것 = 새이름.filter((c) => !c.startsWith("pr-") && !대장.has(c));
    ok(`대장에 없는 이름은 전부 pr- 로 시작한다 (${낯선것.join(" ") || "없음"})`, 낯선것.length === 0);
    // ⚠️ 늘어나는 칸에 basis 가 있다 (오류 94 — flex:1 이면 390px 에서 26px 로 눌린다)
    const 맨1 = [...css.matchAll(/flex\s*:\s*1\s*(;|})/g)];
    ok(`basis 없는 \`flex:1\` 이 없다 (${맨1.length}건)`, 맨1.length === 0);
  }

  // ⚠️ 입력칸 글씨는 (pointer:coarse) 에서 16px 이상 — 폭으로 걸면 아이패드가 빠진다
  ok("입력칸 크기를 폭으로 가르지 않는다 (아이패드가 빠진다)",
     !/max-width\s*:\s*7\d\dpx/.test(String(css ?? "")),
     "`(pointer: coarse)` 로 가른다");
});

/* ══════════════════════════════════════════════════════════════════════
 * ⑤ ⚠️ 조회 수 — 지금 앱에서 화면 하나가 30건을 조회해 느려졌다.
 *    글자로 세면 못 센다(가지가 갈린다). **가짜 Supabase 를 끼워 진짜로 돌린다.**
 * ══════════════════════════════════════════════════════════════════════ */
let readMod;
const TODAY = "2026-09-15";

/** PostgREST 흉내 — 이어 부르기(chain)를 받고 마지막에 줄을 돌려준다 */
function 가짜Supabase(rows, opts = {}) {
  let hits = 0;
  const 표 = (t) => {
    const st = { filters: {}, single: false };
    const api = {
      select: () => api, order: () => api, limit: () => api, not: () => api,
      gte: () => api, lte: () => api,
      eq: (c, v) => { st.filters[c] = v; return api; },
      in: (c, v) => { st.filters[c] = v; return api; },
      maybeSingle: () => { st.single = true; return api; },
      insert: () => api,
      then: (res, rej) => {
        const got = (rows[t] ?? []).filter((r) =>
          Object.entries(st.filters).every(([c, v]) =>
            Array.isArray(v) ? v.includes(r[c]) : r[c] === v));
        const out = (opts.err ?? {})[t]
          ? { data: null, error: (opts.err ?? {})[t] }
          : st.single ? { data: got[0] ?? null, error: null } : { data: got, error: null };
        return Promise.resolve(out).then(res, rej);
      },
    };
    return api;
  };
  const sb = {
    from: (t) => { hits++; return 표(t); },
    rpc: (f) => { hits++; return Promise.resolve({ data: f === "today" ? (opts.today ?? TODAY) : null, error: null }); },
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: opts.uid ?? "P1" } }, error: null }) },
    schema: () => sb,
    storage: { from: () => ({ upload: async () => ({ error: { message: "Bucket not found" } }) }) },
    get hits() { return hits; },
  };
}

const 밑자료 = () => ({
  profiles: [{ id: "P1", role: "parent", state: "active" }],
  parent_student: [{ parent_profile_id: "P1", student_id: "K1" }, { parent_profile_id: "P1", student_id: "K2" }],
  students: [
    { id: "K1", name: "김첫째", grade: 2, state: "active", school_id: "SC1" },
    { id: "K2", name: "김둘째", grade: 5, state: "active", school_id: "SC1" },
  ],
  // ⚠️ 재원 시작이 **한참 전**이면 지난 달까지 그려지고, 여기서는 일부러 이 달 5일부터로 잡는다
  class_member: [{ class_id: "C1", student_id: "K1", from_date: "2026-09-05", to_date: null }],
  class_schedule: [{ class_id: "C1", from_date: "2026-01-01", to_date: null, weekdays: [1, 3, 5], start_time: "19:00:00", end_time: "20:30:00" }],
  day_sheet: [
    // 마감한 날 (지난 수업일)
    { id: "S1", student_id: "K1", class_id: "C1", date: "2026-09-09", attend: "present",
      closed_at: "2026-09-09T13:00:00Z", sent_at: null, comment: "오늘 관계대명사를 했습니다" },
    // ⚠️ 마감 안 한 날은 접근 규칙이 애초에 안 준다 → 여기 안 넣는다 (2026-09-11 이 그 날이다)
  ],
  day_item: [{ id: "I1", sheet_id: "S1", slot: "home", status: "none", range_note: "12~15",
               done_note: null, memo: null, sort: 1, learn_items: { name: "숙제채점" },
               units: { chapter: "1과", sub: "관계대명사", activity: "본책", books: { name: "3800제" } } }],
  monthly_report: [],
  request: [{ id: "R1", kind: "absence", body: "[결석 예정] 2026-09-18 · 결석합니다",
              at: "2026-09-12T01:00:00Z", seen_at: null, answered_at: null, answer: null, state: "open" }],
});

await sec("\n■ ⑤ ⚠️ 조회 수가 상한 안인가 — 가짜 Supabase 로 진짜 돌린다", async () => {
  readMod = await import(new URL("app/parent/read.js", ROOT).href);
  const db = 가짜Supabase(밑자료());
  const m = await readMod.loadParent({ supabase: db, studentId: "K2" });

  ok(`화면이 값을 받았다 (조회 ${m.reads}건)`, m.ok === true, JSON.stringify(m.problems));
  ok(`조회가 상한 ${readMod.MAX_READS} 안이다 (${m.reads}건 · 실제 두드림 ${db.hits}건)`,
     m.reads <= readMod.MAX_READS && db.hits <= readMod.MAX_READS,
     "한 건 더 붙이려면 합칠 수 있는지 먼저 본다");
  ok("형제 중 고른 아이가 나온다 (형 자료가 동생 칸에 안 들어간다)",
     m.student?.id === "K2" && m.children.length === 2);

  // ⚠️ 값 전체에 원장 메모가 없어야 한다 (깊이 훑는다)
  ok("내려보낸 값 전체에 원장 메모가 없다", !JSON.stringify(m).includes("staff_note"));

  // ⚠️ 역할이 학부모가 아니면 **값이 하나도 안 실린다** (문지기가 역할로 안 지켜 준다)
  const 학생db = 가짜Supabase({ ...밑자료(), profiles: [{ id: "P1", role: "student", state: "active" }] });
  const 학생 = await readMod.loadParent({ supabase: 학생db, studentId: "K1" });
  ok("학생 계정으로 열면 값이 하나도 안 실린다",
     학생.ok === false && 학생.recent.length === 0 && 학생.student === null,
     "문지기는 /parent 를 역할로 안 지킨다 — 실측 2026-09-02");

  // ⚠️ 못 읽었으면 **왜 비었는지**를 값에 싣는다 (예쁜 빈 화면을 만들지 않는다)
  const 막힘 = 가짜Supabase(밑자료(), { err: { day_sheet: { code: "PGRST106", message: "Invalid schema: v2" } } });
  const 막힌것 = await readMod.loadParent({ supabase: 막힘, studentId: "K1" });
  ok("못 읽으면 까닭이 값에 실린다", (막힌것.problems ?? []).some((p) => /설정|못 읽/.test(p)),
     "빈 화면만 그리면 원장님도 학부모도 왜 비었는지 모른다");

  // 상한을 낮춰 부르면 **그 자리에서 던진다** (조용히 느려지는 것이 제일 나쁘다)
  let 던졌나 = false;
  try { await readMod.loadParent({ supabase: 가짜Supabase(밑자료()), maxReads: 2 }); }
  catch { 던졌나 = true; }
  ok("상한을 넘으면 그 자리에서 던진다 (검사가 헛돌지 않는다)", 던졌나);
});

/* ══════════════════════════════════════════════════════════════════════ */
await sec("\n■ ⑥ 달력 — 계획 ⑯ 세 가지를 지키는가", async () => {
  const db = 가짜Supabase(밑자료());
  const m = await readMod.loadParent({ supabase: db, studentId: "K1" });

  ok(`앞날은 **다음 달까지만** (달 ${m.months.length}개 = 이번 달 + ${readMod.MONTHS_AHEAD})`,
     m.months.length === readMod.MONTHS_AHEAD + 1,
     "그 너머는 휴강·반 이동으로 자주 틀린다");
  ok("이 달과 다음 달이다", m.months[0].ym === "2026-09" && m.months[1].ym === "2026-10");

  const 칸 = new Map(m.months.flatMap((mo) => mo.days).map((d) => [d.date, d]));

  ok("지난 것은 **재원 기간만** (9/5 등록 → 9/4 는 안 그린다)",
     칸.get("2026-09-04")?.state === "out" && 칸.get("2026-09-04")?.attend == null,
     "퇴원생 학부모가 계속 보면 개인정보 파기와 부딪힌다");
  ok("마감한 수업일은 출결이 보인다 (9/9 수)", 칸.get("2026-09-09")?.state === "closed");
  ok(`마감 안 한 수업일이 「${DAY_OPEN}」 이다 (9/11 금)`,
     칸.get("2026-09-11")?.state === "open" && 칸.get("2026-09-11")?.label === DAY_OPEN,
     "빈 칸이면 「수업이 없었던 날」과 같아 보인다 (계획 ⑯ 1번)");
  ok("수업이 없는 날은 off 다 (9/10 목)", 칸.get("2026-09-10")?.state === "off");
  ok("앞날 수업일에서만 결석·지각을 고를 수 있다 (9/16 수)",
     칸.get("2026-09-16")?.state === "future" && 칸.get("2026-09-16")?.canTell === true);
  ok("앞날이라도 수업일이 아니면 못 고른다 (9/17 목)",
     칸.get("2026-09-17")?.state === "off" && 칸.get("2026-09-17")?.canTell !== true,
     "계획 ㉔ — 수업일만 고를 수 있다");
  ok("오늘까지는 앞날이 아니다 (9/15 월 = 오늘)",
     칸.get("2026-09-15")?.state !== "future");

  // ⚠️ 휴강은 학부모에게 0줄이라 못 뺀다 — **지어내지 않고 화면에 밝힌다**
  ok("휴강을 못 읽는다는 것을 화면에 밝힌다",
     (m.limits ?? []).some((t) => /휴강/.test(t)),
     "밝히지 않으면 휴강일에 「왜 수업이 있다고 하나」로 전화가 온다");

  // 지각 「얼마나」의 버튼은 lib 의 한 벌이다
  ok(`지각 버튼이 lib 의 ${LATE_PRESETS.join("·")}분 그대로다`,
     LATE_PRESETS.every((v) => new RegExp(`\\b${v}\\b`).test(code.view) || /LATE_PRESETS/.test(code.view)) &&
     /LATE_PRESETS/.test(code.view));
  ok("지각에 「도착 시각 직접」 자리가 있다", /arriveAt/.test(code.view) && /type="time"/.test(code.view));
});

/* ══════════════════════════════════════════════════════════════════════ */
await sec("\n■ ⑦ 원장님이 써 주신 글이 그대로 있는가", async () => {
  const words = await import(new URL("app/parent/words.js", ROOT).href);
  const 둘 = [
    "결석 예정을 미리 알려주시면 수업을 준비하는 데에 큰 도움이 됩니다.",
    "병원진료가 아닌 당일결석은 보강이 불가합니다.",
  ];
  for (const t of 둘)
    ok(`「${t}」 가 글자 그대로 있다`, words.LEAVE_NOTE.includes(t),
       "원장님 문장이다 — 다듬지 마라");
  ok("그 두 줄이 「남기실 말」 자리에 그려진다", /LEAVE_NOTE/.test(code.view) && /남기실 말/.test(code.view));

  // ⚠️ 안 밝히면 다음 주 숙제가 「아직」으로 보여 「이걸 아직도 안 했나」로 오해한다
  ok("첫 안내가 **앞으로 할 것도 같이 보인다**는 것을 밝힌다",
     words.FIRST_TIME.some((t) => /앞으로 할 것도 같이 보입니다/.test(t)),
     "실측 — 학부모 20명이 한 번도 로그인한 적이 없다. 이 화면은 늘 처음 보는 화면이다");
  ok("첫 안내가 「마감해야 그날 내용이 보인다」를 밝힌다",
     words.FIRST_TIME.some((t) => /정리를 마쳐야/.test(t)));
  ok("과제 목록에도 「앞으로 할 것」이라고 적혀 있다",
     /앞으로 할 것도 같이 있습니다/.test(src.view));
  ok("첫 안내가 화면 위쪽에 있다",
     src.view.indexOf("FIRST_TIME") < src.view.indexOf("최근 수업"));
});

/* ══════════════════════════════════════════════════════════════════════ */
await sec("\n■ ⑧ ⚠️ 진도 레이스(순위)를 학부모에게 안 그리는가", async () => {
  ok("화면에 순위·등수·레이스가 없다",
     !/순위|등수|레이스|랭킹|\brank\b|\bleaderboard\b/i.test(화면코드),
     "아이에게는 동기가 되지만 학부모에게 순위가 보이면 중하위권 가정에서 불만이 나온다");
  const db = 가짜Supabase(밑자료());
  const m = await readMod.loadParent({ supabase: db, studentId: "K1" });
  ok("내려보낸 값에도 순위가 없다", !/rank|순위|등수/.test(JSON.stringify(m)));
});

/* ══════════════════════════════════════════════════════════════════════ */
await sec("\n■ ⑨ 자료 보내기 (계획 ㊸)", async () => {
  // ⚠️ 30장이 넘으면 **한 장도 안 간다.** 앞에서 30장만 자르면 아무도 오류를 못 본다
  const 서른하나 = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ name: `p${i}.jpg`, mime: "image/jpeg", bytes: 100 }));
  const r = acceptBatch(서른하나, { already: 0 });
  ok(`${MAX_FILES + 1}장이면 한 장도 안 간다`, r.over === true && r.take.length === 0);
  ok("화면이 그 판단을 그대로 쓴다 (제 손으로 30을 안 적는다)",
     /acceptBatch/.test(code.view) && !/\b30\b/.test(code.view),
     "숫자를 화면에 박으면 lib 이 바뀌어도 화면만 옛 값으로 남는다");
  ok("서버도 다시 본다 (화면 값을 안 믿는다)", /acceptBatch/.test(code.upload) && /refuseReason/.test(code.upload));

  // ⚠️ 형제가 있으면 **누구 것인지 먼저 묻는다**
  ok("아이를 안 고르면 서버가 거절한다",
     /어느 아이의 자료인지 먼저 골라/.test(src.upload) &&
     /if\s*\(!studentId\)/.test(code.upload));
  ok("화면이 지금 누구 것으로 보내는지 적는다", /지금 <b>\{model\.student\?\.name\}<\/b>/.test(src.view) ||
     /model\.student\?\.name/.test(src.view));

  // ⚠️ 넣는 칸이 lib 의 한 벌과 같아야 한다 — 갈리면 원장 자료함과 학부모가 올린 것이 어긋난다
  const libCols = /insert into v2\.file\(([^)]*)\)/i.exec(fileInsertSql())[1]
    .split(",").map((s) => s.trim()).sort();
  const objTxt = /\.from\("file"\)\s*\.insert\(\{([\s\S]*?)\}\)/.exec(code.upload)?.[1] ?? "";
  const 화면칸 = objTxt.split(",").map((s) => /^\s*([a-z_]+)/.exec(s)?.[1]).filter(Boolean).sort();
  ok(`넣는 칸이 fileInsertSql() 과 같은 벌이다 (${화면칸.join(",")})`,
     JSON.stringify(libCols) === JSON.stringify(화면칸),
     `lib: ${libCols.join(",")}`);

  // ⚠️ 갈래는 학부모가 안 고른다 — 「방금 온 것」에만 있고 아무 데도 안 붙는다
  ok("학부모 쪽에서 자료함 묶음을 만들지 않는다",
     !/file_bin/.test(코드만(src.upload)) && !/file_link/.test(코드만(src.upload)),
     "묶음·갈래는 원장님 자리다 (학부모에게는 접근 규칙 자체가 없다)");
  ok("사진만 줄인다 (pdf·문서는 안 줄인다 — 글자가 뭉개진다)",
     /isImage/.test(code.view) && /MAX_EDGE/.test(code.view) && !/\b1600\b/.test(code.view));
});

/* ══════════════════════════════════════════════════════════════════════
 * ⑩ 월간 리포트 어댑터는 「lib/monthly.js 가 그 표를 (학생, 달)로 고른다」에 기대고 있다.
 *    그 근거가 무너지면 **어댑터가 거짓말을 하기 시작한다** — 오류는 안 난다.
 * ══════════════════════════════════════════════════════════════════════ */
await sec("\n■ ⑩ 월간 리포트 어댑터의 근거가 아직 참인가", async () => {
  const mon = read("lib/monthly.js");
  const one = /const\s+SQL_ONE\s*=\s*`([\s\S]*?)`/.exec(mon)?.[1] ?? "";
  ok("lib/monthly.js 에 SQL_ONE 이 아직 있다", one.length > 0);
  ok("그것이 v2.monthly_report 를 고른다", /v2\.monthly_report/.test(one));
  ok("고르는 열쇠가 (학생 $1, 달 $2) 다",
     /student_id\s*=\s*\$1/.test(one) && /ym\s*=\s*\$2/.test(one),
     "차례가 바뀌면 app/parent/read.js 의 어댑터가 **엉뚱한 달**을 돌려준다");
  ok("어댑터가 그 사실을 주석으로 적어 두었다", /sentView/.test(src.read) && /어댑터/.test(src.read));
});

/* ══════════════════════════════════════════════════════════════════════
 * ⑪ 진짜 브라우저 — 320·390·768·1400px 에서 그려 잰다.
 *    (`scripts/check-layout.mjs` 는 globals.css 만 본다. **이 화면의 css 는 아무도 안 쟀다.**)
 * ══════════════════════════════════════════════════════════════════════ */
const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => existsSync(p)) || null;

const 긴글 = "관계대명사 that 과 which 의 쓰임 구별 · 계속적 용법과 제한적 용법 (본책 12~15쪽)";
function 본보기() {
  const cal = (state, label) => `<button class="calday pr-cell pr-cell-${state}">
      <span class="num pr-daynum">18</span>
      ${label ? `<span class="pill pillwarn">${label}</span>` : ""}</button>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${read("app/globals.css")}</style><style>${css몸통(src.view) ?? ""}</style></head>
<body><main class="wrap stack"><h1>김첫째 학생</h1>
<div class="card pr-bad"><div class="cardhd">지금 안 되는 것</div>
  <ul class="pr-list"><li>⚠️ 앱 설정이 아직 덜 됐습니다 — 자료를 읽을 길이 안 열려 있습니다. 원장님께 알려주세요.</li></ul></div>
<nav class="card"><div class="cardhd">어느 아이</div>
  <div class="row"><a class="btn pr-on">김첫째 (2)</a><a class="btn">김둘째 (5)</a></div>
  <p class="muted pr-small">⚠️ 자료를 보내실 때 <b>누구 것인지 여기서 먼저 골라 주세요.</b></p></nav>
<section class="card acc is-open"><button class="pr-acchd"><span class="cardhd pr-acctitle">처음 오셨나요</span>
  <span class="chip num">4</span><span class="pr-caret">▲</span></button>
  <div class="accbd"><ul class="pr-list"><li>${FIRSTLINE}</li></ul></div></section>
<section class="card acc is-open"><button class="pr-acchd"><span class="cardhd pr-acctitle">과제</span>
  <span class="chip num">12</span><span class="pr-caret">▲</span></button>
  <div class="accbd"><ul class="pr-list">
   <li class="pr-hw"><span class="num pr-date">09-11</span><span class="pill pillinfo">다음에 할 것</span>
     <span class="pr-hwtxt"><b>3800제</b><span class="muted"> 1과</span> ${긴글}<span class="chip">본책</span><span class="chip">숙제채점</span><span class="num"> 12~15</span></span></li>
  </ul></div></section>
<section class="card"><div class="cardhd">2026년 9월</div>
 <div class="calwrap">
  <div class="cal pr-dowrow">${["일","월","화","수","목","금","토"].map((d) => `<div class="calday pr-dow">${d}</div>`).join("")}</div>
  <div class="cal">${cal("out", "")}${cal("off", "")}${cal("open", "수업함 · 정리 중")}${cal("closed", "")}${cal("future", "")}${cal("open", "수업함 · 정리 중")}${cal("off", "")}</div>
 </div>
 <p class="row pr-small"><span class="pill pillok">출석</span><span class="pill pillwarn">수업함 · 정리 중</span>
   <span class="pill pillinfo">예정</span><span class="muted">날짜를 누르면 그날 것이 아래에 열립니다.</span></p></section>
<section class="card mdl pr-picked"><div class="row"><b class="num">2026-09-18</b>
   <button class="btn btnghost pr-right">닫기</button></div>
 <form class="stack">
  <div class="row"><label class="btn"><input type="radio" class="pr-radio">결석합니다</label>
    <label class="btn"><input type="radio" class="pr-radio">늦습니다</label></div>
  <div class="row">${[10,20,30,60].map((m) => `<label class="btn"><input type="radio" class="pr-radio">${m}분</label>`).join("")}
    <label class="btn"><input type="radio" class="pr-radio">도착 시각</label></div>
  <label class="col"><span class="lbl">도착 시각</span><input type="time" class="fld"></label>
  <label class="col"><span class="lbl">까닭 (안 적으셔도 됩니다)</span><input type="text" class="fld" placeholder="예: 병원 진료"></label>
  <p class="muted pr-small">병원진료가 아닌 당일결석은 보강이 불가합니다.</p>
  <button class="btn btnmain">원장님께 미리 알리기</button>
  <p class="pr-bad pr-msg">${긴글}</p></form></section>
<section class="card acc is-open"><button class="pr-acchd"><span class="cardhd pr-acctitle">자료 보내기</span>
  <span class="pr-caret">▲</span></button><div class="accbd"><div class="stack">
  <input type="file" class="fld"><textarea class="fld pr-ta"></textarea>
  <button class="btn btnmain">3 보내기</button></div></div></section>
</main></body></html>`;
}
const FIRSTLINE = "⚠️ 지난 것뿐 아니라 <b>앞으로 할 것도 같이 보입니다.</b> 다음 시간에 할 숙제가 「아직」으로 뜨는 것은 안 한 것이 아니라 아직 할 때가 안 된 것입니다.";

/** 페이지 안에서 도는 잣대 — 넘침·겹침·세로로 쌓인 글자·작은 입력칸 */
const AUDIT = `(() => {
  const S = (e) => getComputedStyle(e);
  const nm = (e) => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\\s+/).join(".") : "");
  const scrollX = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const s = S(p); if (/(auto|scroll)/.test(s.overflowX)) return true; } return false; };
  const hit = [];
  const W = document.documentElement.clientWidth;
  for (const e of [...document.querySelectorAll("body *")]) {
    const s = S(e), r = e.getBoundingClientRect();
    if (s.display === "none" || s.visibility === "hidden" || r.width === 0) continue;
    if (!scrollX(e) && (r.left < -1 || r.right > W + 1)) hit.push({ k: "화면 밖", el: nm(e), w: Math.round(r.width) });
    const p = e.parentElement;
    if (p && !scrollX(e)) { const pr = p.getBoundingClientRect();
      if (r.right > pr.right + 1 || r.left < pr.left - 1) hit.push({ k: "부모 밖", el: nm(e) }); }
    const fs = parseFloat(s.fontSize);
    if (e.children.length === 0 && (e.textContent || "").trim().length > 1 && r.width > 0 && r.width < fs * 1.8 && r.height > fs * 2.5)
      hit.push({ k: "세로로 쌓임", el: nm(e), w: Math.round(r.width) });
    if (/^(input|select|textarea)$/i.test(e.tagName) && e.type !== "radio" && e.type !== "checkbox")
      hit.push({ k: "입력칸", el: nm(e), fs });
    if (/^button$/i.test(e.tagName) && r.height > 0 && r.height < 44) hit.push({ k: "작은 단추", el: nm(e), h: Math.round(r.height) });
    if (s.opacity !== "1" && !/is-drag/.test(String(e.className))) hit.push({ k: "투명도", el: nm(e), o: s.opacity });
  }
  return JSON.stringify({ bodyScroll: document.documentElement.scrollWidth > W + 1, W, hit });
})()`;

await sec("\n■ ⑪ 320·390·768·1400px 에서 진짜로 그려 잰다", async () => {
  if (!CHROME) {
    n++; console.log("   ⚠️ **브라우저가 없다 — 이 화면을 실제로 그려 보지 못했다.** (「있는 척」이 제일 나쁘다)");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "chk-parent-"));
  const proc = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "about:blank"],
    { stdio: ["ignore", "ignore", "ignore"] });
  try {
    let port = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const f = join(dir, "DevToolsActivePort");
      if (existsSync(f)) { const s = readFileSync(f, "utf8").split("\n"); if (s[0]?.trim()) { port = s[0].trim(); break; } }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!port) throw new Error("크롬이 디버깅 포트를 안 열었다");
    const html = 본보기();

    for (const [w, coarse] of [[320, true], [390, true], [768, true], [1400, false]]) {
      // ⚠️ **탭을 새로 연다.** 손가락 흉내는 한 번 켜면 그 탭에서 안 꺼진다 —
      //    안 그러면 1400px 도 손가락 규칙으로 재게 되어 PC 글씨 검사가 헛돈다
      const tgt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
      const ws = new WebSocket(tgt.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
      let id = 0; const waiting = new Map();
      ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
      const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
      await send("Page.enable"); await send("Runtime.enable");
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: coarse });
      if (coarse) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await send("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) });
      await new Promise((r) => setTimeout(r, 350));
      const res = await send("Runtime.evaluate", { expression: AUDIT, returnByValue: true });
      const got = JSON.parse(res.result?.result?.value ?? '{"hit":[]}');
      const 깨짐 = got.hit.filter((h) => ["화면 밖", "부모 밖", "세로로 쌓임", "작은 단추", "투명도"].includes(h.k));
      ok(`${w}px — 깨진 곳이 0건 (${깨짐.length})`, 깨짐.length === 0,
         깨짐.slice(0, 4).map((h) => `${h.k} ${h.el}`).join(" / "));
      ok(`${w}px — 몸통이 가로로 안 구른다`, got.bodyScroll === false);
      const 입력 = got.hit.filter((h) => h.k === "입력칸").map((h) => h.fs);
      const 밑 = coarse ? 16 : 14;
      ok(`${w}px — 입력칸 글씨가 ${밑}px 이상 (${[...new Set(입력)].join("/") || "없음"})`,
         입력.length > 0 && 입력.every((v) => v >= 밑),
         coarse ? "16 밑이면 아이폰이 확대하고 닫아도 확대가 남는다" : "PC 는 14px");
      try { ws.close(); } catch { /* 닫히면 그만이다 */ }
      try { await fetch(`http://127.0.0.1:${port}/json/close/${tgt.id}`); } catch { /* 위와 같다 */ }
    }
  } finally { proc.kill(); }
});

/* ── 코드로는 못 고치는 것 (⚠️ 이 자리를 지우지 마라) ───────────────────── */
const 막힌것 = [];
const env = read(".env.local");
if (!/NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(env))
  막힌것.push("NEXT_PUBLIC_SUPABASE_ANON_KEY 가 .env.local 에 없다 → 학부모가 **로그인 자체를 못 한다**");
막힌것.push("PostgREST 가 v2 스키마를 안 내보내면 이 화면은 **한 줄도 못 읽는다** " +
            "(Settings → API → Exposed schemas 에 v2). 화면은 그때 「지금 안 되는 것」으로 까닭을 띄운다");
막힌것.push("Storage 버킷 `files` 와 그 정책이 아직 없다(계획 0단계 9번 — 전환일 적용 파일) → " +
            "자료 보내기는 「저장 공간 미개설」로 정직하게 실패한다");
막힌것.push("`v2.holiday` 에 학부모 읽기 규칙이 없어 **휴강한 날이 달력에 수업일로 보인다** — " +
            "화면이 그 사실을 밝히지만, 규칙 한 줄이면 없어진다");
막힌것.push("`v2.request` 에 날짜·지각 분 칸이 없어 결석·지각 예정이 **글로만** 남는다 — " +
            "원장 화면이 기계로 읽으려면 칸이 필요하다");

console.log("\n■ 코드로는 못 고치는 것 (이 검사는 초록이어도 아래가 남아 있으면 화면이 빈다)");
막힌것.forEach((x) => console.log(`   ⚠️ ${x}`));

console.log(`\n■ 학부모 화면 검사 ${n}건 · 실패 ${fail} · 못 고치는 것 ${막힌것.length}건`);
process.exit(fail ? 1 : 0);

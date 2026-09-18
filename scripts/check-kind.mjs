/** (어80)-B 업무 분류를 표로 — 원장님 2026-09-18:
 *   「업무 칸반보드에 분류자체를 추가/수정/삭제가 되게해줘」
 *   「세부내용의 일괄처리 · 분류 옮기기가능하게」
 *   「업무-메모에 학사일정이 다 들어가있는데 이건 원하지않아. 학교별 일정에 필요해」
 *  ONE_PLACE — 분류는 v2.todo_kind 한 곳에 산다. lib/todo-plan.js KINDS 는 그 표의 **씨앗**이라
 *  한 글자라도 어긋나면 두 벌이 된다(원칙-1) — 이 검사가 그것을 막는다. */
import { readFileSync } from "node:fs";
import { KINDS, kindList, columnsOf, SHOW_ON } from "../lib/todo-plan.js";
const read = (p) => readFileSync(p, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };

const sql = read("supabase/migrations/0179_todo_kind.sql");
const plan = strip(read("lib/todo-plan.js")), todo = strip(read("lib/todo.js")), board = strip(read("app/schedule/todo/board.js"));
const acts = strip(read("app/schedule/todo/actions.js")), page = strip(read("app/schedule/todo/page.js")), err = strip(read("lib/sqlError.js"));
const walk = read("scripts/e2e/today.mjs");

console.log("■ (어80)-B 분류는 표 한 곳에 산다 — 0179 씨앗 = lib KINDS");
/* 0179 의 insert 줄을 그대로 읽는다: ('make','📄 자료 만들기','nb-orange', 10, true), */
const seed = [...sql.matchAll(/\(\s*'([a-z_]+)',\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*(true|false)(?:,\s*'([a-z]+)')?\s*\)/g)]
  .map((m) => ({ kind: m[1], name: m[2], cls: m[3], ord: Number(m[4]), app: m[5] === "true", showOn: m[6] ?? "todo" }));
const app10 = seed.filter((s) => s.app);
ok(`0179 씨앗의 앱 분류가 열 벌 · lib KINDS 와 **한 글자도 안 다르다**(열쇠 · 이름 · 색 · 차례)`,
  app10.length === KINDS.length && KINDS.every(([k, nm, cls], i) => app10[i].kind === k && app10[i].name === nm && app10[i].cls === cls)
  && app10.every((s, i) => s.ord === (i + 1) * 10),
  app10.map((s, i) => (KINDS[i] && s.name === KINDS[i][1] ? "" : `${s.kind}:${s.name}≠${KINDS[i]?.[1]}`)).filter(Boolean).join(" · "));
ok("씨앗은 **덮어쓰지 않는다**(do nothing) — 원장님이 이름을 고치신 뒤 다시 돌아도 되돌아가지 않는다",
  /on conflict \(kind\) do nothing/.test(sql) && !/on conflict \(kind\) do update/.test(sql));
ok("앱 분류는 app=true 로 잠근다 — 지우면 앱이 만드는 카드가 갈 곳을 잃는다", /update v2\.todo_kind set app = true/.test(sql));
ok("지우는 권한이 없다(대전제-6) · RLS 는 학원 사람만", /grant select, insert, update on v2\.todo_kind/.test(sql) && !/grant[^;]*delete[^;]*todo_kind/.test(sql)
  && /enable row level security/.test(sql) && /create policy todo_kind_staff[\s\S]{0,120}v2\.is_staff\(\)/.test(sql));

console.log("\n■ (어80)-B 옛 학사일정 226줄이 업무에서 빠진다 — 원장님 「학교별 일정에 필요해」");
ok("🏛️ 학교 행사 분류가 서고 · 일정 12 쪽에만 보인다(show_in='schedule')", /'school_event', '🏛️ 학교 행사'[\s\S]{0,60}'schedule'/.test(sql));
ok("옮기는 줄을 **짐작하지 않는다** — v2.todo.id = public.tasks.id(0110 ⑨)로 그 줄만 · public 은 읽기만(check-v2only)",
  /to_regclass\('public\.tasks'\)/.test(sql) && /update v2\.todo d set kind = 'school_event'[\s\S]{0,200}t\.kind = 'schedule'/.test(sql)
  && !/(update|insert into|delete from)\s+public\./i.test(sql));

ok("kind 를 여덟 값에 가두던 옛 제약(0131 todo_kind_choice)을 **표 참조**로 바꾼다 — 안 바꾸면 분류를 만들어도 DB 가 옮기기를 튕긴다(게이트 걷기가 잡은 것)",
  /alter table v2\.todo drop constraint if exists todo_kind_choice/.test(sql)
  && /foreign key \(kind\) references v2\.todo_kind\(kind\)/.test(sql) && /validate constraint todo_kind_ref/.test(sql));
/* ⚠️ 2026-09-18 원장님 실측 — 옛 제약을 **옮기기보다 뒤에** 풀어서 실 DB 가 통째로 되돌아갔다:
   「new row for relation "todo" violates check constraint "todo_kind_choice"」.
   눌러보기 DB 에는 옛 앱 줄(public.tasks)이 **비어 있어** 옮기기가 빈손으로 지나갔고 걷기가 못 봤다.
   **옛 자료를 건드리는 줄은 걷기가 못 본다 — 차례를 글자로 잰다.** */
{ const 푼데 = sql.indexOf("drop constraint if exists todo_kind_choice");
  const 옮긴데 = sql.indexOf("set kind = 'school_event'"), 잰데 = sql.indexOf("validate constraint todo_kind_ref");
  ok("옛 제약을 **옮기기보다 먼저** 푼다 · 참조 검증은 **옮긴 뒤**에 한다(눌러보기 DB 는 옛 자료가 비어 있어 걷기가 못 잡는 자리다)",
    푼데 > 0 && 옮긴데 > 0 && 잰데 > 0 && 푼데 < 옮긴데 && 옮긴데 < 잰데, `푼데 ${푼데} · 옮긴데 ${옮긴데} · 잰데 ${잰데}`); }

console.log("\n■ (어80)-B 칸은 표에서 오고, 카드는 사라지지 않는다");
const KS = [{ kind: "note", name: "📋 메모", cls: "", ord: 10, app: true, show_in: "todo", state: "active" },
  { kind: "school_event", name: "🏛️ 학교 행사", cls: "nb-blue", ord: 20, app: false, show_in: "schedule", state: "active" },
  { kind: "off1", name: "내린 것", cls: "", ord: 30, app: false, show_in: "todo", state: "off" }];
const CARDS = [{ id: "a", kind: "note", state: "todo" }, { id: "b", kind: "school_event", state: "todo" }, { id: "c", kind: "off1", state: "todo" }, { id: "d", kind: "몰라", state: "todo" }];
const t = columnsOf(CARDS, "2026-09-18", KS), sch = columnsOf(CARDS, "2026-09-18", KS, "schedule");
ok("업무 05 판에는 일정 전용 분류가 **안 선다**(원장님 「업무-메모에 학사일정이 다 들어가있는데 이건 원하지않아」)",
  !t.some((c) => c.kind === "school_event") && sch.some((c) => c.kind === "school_event"), t.map((c) => c.kind).join(","));
ok("내린 분류라도 그 칸에 업무가 남아 있으면 칸이 남는다(대전제-0) · 표에 없는 분류의 카드도 제 칸을 얻는다",
  t.some((c) => c.kind === "off1" && c.state === "off") && t.some((c) => c.kind === "몰라"), t.map((c) => c.kind).join(","));
ok("표가 없으면 씨앗 열 벌 그대로(대전제-27) · 어디에 보이나 셋(업무 · 일정 · 둘 다)",
  columnsOf([], "2026-09-18").length === KINDS.length && kindList(null).length === KINDS.length && SHOW_ON.length === 3);

console.log("\n■ (어80)-B 앱은 DB 보다 앞서지 않는다");
ok("표가 아직 없는 DB 에서는 listKinds 가 null 을 준다 — 05 가 죽지 않는다((어78) 사고)",
  /export async function listKinds/.test(todo) && /could not find the table\|PGRST205\|does not exist/i.test(todo) && /return null;/.test(todo));
ok("표가 없으면 화면이 분류를 고치는 자리를 **감춘다** — 없는 것을 있는 척하지 않는다(대전제-0)",
  /\{kinds && <button[\s\S]{0,140}kind-edit/.test(board) && /\{kinds && <div className="nb-col" data-g="kind-new"/.test(board));
ok("표가 없을 때 무엇을 하실지 화면이 말한다(TBL_PASTE)", /todo_kind: \["0179"/.test(err));
ok("분류 목록은 판과 **같은 파도**에서 읽는다(속도-1)", /Promise\.all\(\[todoBoard\(sb, date\), listKinds\(sb\)\]\)/.test(page));

console.log("\n■ (어80)-B 더하고 · 고치고 · 내리고 · 옮긴다");
ok("손 여섯(추가 · 수정 · 차례 · 삭제 · 복구 · 옮기기)이 lib 한 곳에 있다",
  ["addKind", "editKind", "moveKindOrder", "dropKind", "restoreKind", "moveKind"].every((f) => new RegExp(`export async function ${f}\\b`).test(todo)));
ok("앱이 만드는 분류는 **못 내린다** · 지우지 않고 state='off' 로 내린다(대전제-6) · 복구가 짝이다",
  /if \(cur\.app\) throw new Error/.test(todo) && /update\(\{ state: "off" \}\)/.test(todo) && /update\(\{ state: "active" \}\)/.test(todo));
ok("고른 업무를 **한 문장**으로 옮긴다 — 옛 학사일정 226줄을 한 줄씩 부르면 화면이 멈춘다",
  /from\("todo"\)\.update\(\{ kind: k \}\)\.in\("id", list\)/.test(todo));
ok("손 여섯의 화면 쪽 짝이 다 있다(actions)",
  ["addKindAct", "editKindAct", "dropKindAct", "restoreKindAct", "kindOrderAct", "moveKindAct"].every((f) => new RegExp(`export async function ${f}\\b`).test(acts)));
ok("넣기와 수정이 **같은 양식**이다(원칙-1 · 대전제-19) · 그 자리에서 편다(대전제-22)",
  /const kindForm = \(col\) =>/.test(board) && /data-act=\{col \? "kind-save" : "kind-add"\}/.test(board) && /data-g="kind-form"/.test(board));
ok("띠에 「분류 옮기기」가 있다(원장님 「세부내용의 일괄처리 · 분류 옮기기가능하게」)", /data-act="move-kind"/.test(board));

console.log("\n■ 걷기가 눈으로 본다");
ok("걷기가 ① 분류 만들기 ② 분류로 옮기기 ③ 분류 삭제를 본다",
  /kind-add/.test(walk) && /move-kind/.test(walk) && /kind-drop/.test(walk));


/* (어90b) 원장님 2026-09-18 「업무 칸반 서로 이동이 안돼 가로 순서변경」 —
   칸 순서 손 ◀▶ 이 ✏️ 수정 양식 **안**에 있어 못 찾으셨다. 누르는 자리(칸 머리)에 둔다. */
{ const board = readFileSync("app/schedule/todo/board.js", "utf8");
  ok("(어90b) 칸 순서 ◀▶ 이 **칸 머리**에 있다(✏️ 를 열지 않아도 보인다 · 대전제-22)",
     /data-g="kind-order"[\s\S]{0,400}data-act="kind-up"[\s\S]{0,400}data-act="kind-down"/.test(board)
     && /<div className="nb-colh">[\s\S]{0,900}data-g="kind-order"/.test(board));
  ok("(어90b) 맨 앞 칸은 ◀ 이, 맨 뒤 칸은 ▶ 이 꺼진다(눌러도 안 되는 단추 0 · 원장님 9/18 「눌리지도않음」)",
     /data-act="kind-up"[^>]*disabled=\{pending \|\| i === 0\}/.test(board.replace(/\n/g, " ")) || /disabled=\{pending \|\| i === 0\}[\s\S]{0,120}data-act="kind-up"/.test(board));
  ok("(어90b) 순서 손은 **한 곳**이다 — ✏️ 양식 안에 또 두지 않는다(원칙-1)",
     (board.match(/data-act="kind-up"/g) ?? []).length === 1 && (board.match(/data-act="kind-down"/g) ?? []).length === 1); }
console.log(`\n■ (어80)-B 업무 분류 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

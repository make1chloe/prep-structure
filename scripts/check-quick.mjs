/** (어78) 📌 퀵 메모 — 어느 화면에서나 한 줄 적어 업무로 · 첨부 · 붙여넣기 · 마감·시작일.
 *  원장님 2026-09-17:
 *   「어느 페이지에서나 갑자기 할 일이 떠올랐을 때 메모장에 기능으로 할 일을 추가 할 수 있게 해줘
 *     퀵 메모 첨부 파일로 사진 PDF 등 파일 올릴 수 있고 클립보드에서 사진 붙여넣기 가능해야 되고
 *     필요하면 마감 날짜도 설정할 수 있고 시작일과 종료일의 개념도 추가 할 수 있게 해줘. 필요하면.」
 *   「가장 중요한 기능은 어느 페이지에서나 갑자기 작성 가능하게. 할일 목록에 추가되게 하는 것. 사진 붙여넣기가 가능한 것. 3가지야」
 *   「업무페이지 상단에 바로 내용입력할 수 있게, 현재는 1클릭필요함」
 *  글자만 본다 — 실제로 그러는지는 걷기(e2e/today)가 본다. */
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };

const sql = read("supabase/migrations/0178_quick_memo.sql");
const sched = read("lib/schedule.js"), todoLib = read("lib/todo.js"), files = read("lib/files.js");
const api = read("app/api/files/route.js"), up = read("app/_shell/upload.js");
const qm = read("app/_shell/quickmemo.js"), shell = read("app/_shell/shell.js"), b05 = read("app/schedule/todo/board.js");
const acts = read("app/schedule/todo/actions.js"), css = read("app/globals.css"), mock = read("docs/목업/클로이영어-화면-목업.html");
const walk = read("scripts/e2e/today.mjs"), prep = read("scripts/e2e/prep.mjs"), emoji = read("lib/emoji.js");

console.log("■ (어78) 표 — 새 표를 안 만든다(퀵 메모 = 업무 한 줄)");
ok("0178 은 v2.todo 에 start_on 을 더하고 · 시작일 ≤ 마감을 묶고 · VALIDATE 하고 · 스키마를 다시 읽힌다",
  /alter table v2\.todo add column if not exists start_on date/.test(sql)
  && /check \(start_on is null or due_on is null or start_on <= due_on\)/.test(sql)
  && /validate constraint todo_span_chk/.test(sql) && /notify pgrst, 'reload schema'/.test(sql));
ok("새 표가 없다 — 퀵 메모는 업무(v2.todo) 한 줄이다(따로 표를 두면 05 가 두 곳을 합쳐 그린다 · 원칙-1)",
  !/create table/i.test(sql));
ok("첨부는 file_link 에 칸 하나(todo_id) · **유일 짝에도 그 칸이 든다**(안 넣으면 같은 파일이 엉뚱하게 겹친다)",
  /alter table v2\.file_link add column if not exists todo_id uuid references v2\.todo\(id\) on delete cascade/.test(sql)
  && /unique nulls not distinct \(file_id, bin_id, day_item_id, notice_id, consult_id, todo_id\)/.test(sql));
ok("유일 짝을 **이름으로 짐작하지 않는다** — 정의를 보고 찾아 바꾼다(이름은 DB 마다 다를 수 있다)",
  /pg_get_constraintdef\(oid\)/.test(sql) && !/drop constraint if exists file_link_file_id_bin/.test(sql));
ok("붙이는 규칙은 학원 사람만(staff_todo_link · insert)", /create policy staff_todo_link on v2\.file_link for insert/.test(sql) && /todo_id is not null and v2\.is_staff\(\)/.test(sql));
ok("0178 은 v2 만 건드린다", !/(update|insert into|alter table)\s+(storage|auth)\./i.test(sql));
ok("업무 판(todo_board)이 시작일과 붙은 파일을 실어 준다(앞 정의의 키는 check-redefine 이 본다)",
  /'start_on', t\.start_on/.test(sql) && /'files', \(select coalesce\(jsonb_agg/.test(sql) && /fl\.todo_id = t\.id/.test(sql));

console.log("\n■ 마감은 없어도 된다 — 떠오른 것부터 적는 자리");
ok("addTodo 가 마감 없이도 넣는다(전에는 없으면 터졌다) · 날짜 꼴은 있을 때만 본다",
  /export async function addTodo\(sb, \{ title, kind = null, dueOn = null/.test(sched) && /if \(dueOn && !isDate\(dueOn\)\)/.test(sched));
ok("시작일도 받는다 · 시작일이 마감보다 늦으면 그 자리에서 막는다(대전제-0)",
  /startOn = null \}\)/.test(sched) && /startOn > dueOn/.test(sched) && /if \(startOn\) payload\.start_on = startOn/.test(sched));
ok("addNote·noteAct 가 그대로 흘려 보낸다 — 손은 하나다(05 와 퀵 메모가 같은 것을 쓴다 · 원칙-1)",
  /addNote = \(sb, \{ title, kind = null, dueOn = null/.test(todoLib) && /startOn: f\?\.startOn \|\| null/.test(acts));
ok("마감 없는 줄을 오늘로 몰래 안 넣는다(화면·손 어디에도 dueOn 기본값이 오늘이 아니다)",
  !/dueOn: *today/.test(strip(qm)) && !/dueOn: *today/.test(strip(b05)));

console.log("\n■ 붙여넣기 · 첨부 — 올리는 길은 그대로 한 곳");
ok("붙여넣기는 **문서에 귀를 단다**(칸을 누르고 있지 않아도 Ctrl+V 가 붙는다) · 부품이 떠 있는 동안만",
  /document\.addEventListener\("paste"/.test(up) && /removeEventListener\("paste"/.test(up) && /clipboardData\?\.files/.test(up));
ok("붙여넣은 것은 고른 것에 **덧붙는다**(먼저 고른 파일을 안 지운다)", /setFiles\(\(old\) => \[\.\.\.old, \.\.\.fs\]\)/.test(up));
ok("퀵 메모는 **업무를 세운(고친) 뒤** 그 줄에 붙인다(붙을 자리가 있어야 붙는다) · 올리는 길은 /api/files 하나",
  /const id = edit \? edit\.todoId : r\.id/.test(qm) && /sendRef\.current\.send\(id\)/.test(qm) && /fetch\("\/api\/files"/.test(up) && !/fetch\(/.test(strip(qm)));
ok("서버도 다시 본다 — 업무에 붙이는 것은 학원 사람뿐(붙이는 자리 정책 + 길 둘 다)",
  /if \(todo && !isStaff\(me\.role\)\) return say\(403/.test(api) && /if \(todo && !\/\^\[0-9a-f-\]\{36\}\$\/\.test\(todo\)\)/.test(api));
ok("붙이기는 **유일 짝의 칸 이름을 안 부른다**(넣어 보고 「이미 있다」면 넘어간다) — 이름을 외우면 붙는 자리가 하나 늘 때마다 앱이 먼저 깨진다((어78) 사고)",
  !/onConflict:/.test(files.replace(/\/\*[\s\S]*?\*\//g, " ")) && /async function linkOnce/.test(files) && /duplicate key\|23505/.test(files) && /export async function attachTodo/.test(files));

console.log("\n■ 어느 화면에서나 · 표를 안 읽는다");
ok("퀵 메모 단추는 학원 사람 화면 어디에나(껍질) · 아이·학부모에겐 없다",
  /isStaff\(me\.role\) && <QuickMemo \/>/.test(shell));
ok("띠에서는 **표를 한 줄도 안 읽는다**(속도-4 · 모든 화면이 내는 세금) — 아이 고르개는 명단을 이미 읽은 05 에서만",
  !/db\(|\.from\(|\.rpc\(/.test(strip(qm)) && /students = null/.test(qm) && /whoPicks\(b\)/.test(b05) && /<QuickMemo inline students=\{picks\}/.test(b05));   /* (어95) 05 는 **이미 읽은** 명단을 고르개 꼴로만 옮겨 내려준다(whoPicks · 조회 0) */
ok("그림은 ACT 한 곳에서(📌) · 단추 이름은 「퀵 메모」", /quick: "📌"/.test(emoji) && /\{ACT\.quick\}/.test(qm) && /icon\("퀵 메모"\)/.test(qm));
ok("한 줄 적고 **Enter 면 끝**(날짜·아이·첨부는 「자세히」를 펴야 나온다)",
  /e\.key === "Enter"/.test(qm) && /const \[more, setMore\] = useState\(Boolean\(edit\)\)/.test(qm)   /* (어80) 넣기는 접힌 채 · **고치기는 펴진 채**(이미 적힌 것을 보여야 고친다) */);
ok("05 는 맨 위에 **이미 펴진 한 줄**(원장님 「현재는 1클릭필요함」) · 옛 「📋 메모」 양식은 없앴다(두 벌 금지)",
  /<QuickMemo inline/.test(b05) && !/new-note/.test(b05) && !/data-act="note-save"/.test(b05));
ok("뜬 창이 아니라 상단 띠의 한 줄로 편다(목업이 원본 · globals 는 옮긴 것)",
  /\.appbar \.quickbox\{order:3;flex-basis:100%/.test(mock) && /\.appbar \.quickbox\{order:3;flex-basis:100%/.test(css));

console.log("\n■ 걷기가 눈으로 본다");
ok("걷기가 ① 05 맨 위 한 줄 ② 마감 없이 넣기 ③ **대시보드에서 적고 05 에서 확인**을 본다",
  /data-g=quickmemo\]\[data-where=page/.test(walk) && /zz_마감 없는 메모/.test(walk) && /zz_어디서나 메모/.test(walk) && /data-where=bar/.test(walk));
ok("동선 걷기(prep)도 새 한 줄을 쓴다(옛 「글로 적기」 길은 없다)", /quick-title/.test(prep) && !/new-note/.test(prep));

console.log(`\n■ (어78) 퀵 메모 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

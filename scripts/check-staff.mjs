/** (어64) 직원 계정 검사 — 원장님 2026-09-16 「원장말고 다른 테스트 계정도 추가해줘 역할 선생님 권한 - 설정페이지에서 열람페이지 조절가능하게」 · 「근데 선생님조교어디서추가해」.
 *  지키는 것 일곱: ① 손은 lib/staff.js 하나 ② 원장 역할은 못 준다 ③ 지우지 않는다(대전제-6) ④ 아이디 꼴이 표(0171)와 글자까지 같다
 *  ⑤ 그 아이디로 로그인이 된다(toLoginEmail 을 실제로 불러 본다) ⑥ 원장만 연다 ⑦ 볼 것은 여기서 안 정한다(🔐 누가 무엇을 보나 한 곳 · 원칙-1). */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { STAFF_ID, toLoginEmail, INTERNAL_DOMAIN, ROLES } from "../lib/roles.js";
import { STAFF_ROLES, isStaffRole, parseStaffLoginId, staffIdNag } from "../lib/staff-plan.js";
import { RESET_KID, RESET_STAFF } from "../lib/student-plan.js";   // (어74) 되돌릴 수 있는 역할 한 벌
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 폰-5 · 주석을 먼저 지운다
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p, out) : /\.js$/.test(p) && out.push(p); } return out; };
const src = [...walk("app").filter((p) => !p.includes("/api/")), ...readdirSync("lib").filter((f) => f.endsWith(".js")).map((f) => "lib/" + f)].map((p) => [p.replace(/\\/g, "/"), strip(readFileSync(p, "utf8"))]);
const text = (p) => src.find(([f]) => f === p)?.[1] ?? "";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
console.log("■ 직원(선생님·조교) 계정 · 원장님이 앱에서 낸다((어64))");

// ① 손은 한 곳
const staff = text("lib/staff.js");
const makers = src.filter(([, s]) => /auth\.admin\.createUser\(/.test(s)).map(([p]) => p);
ok(`인증 계정을 만드는 자리는 lib/student.js 하나(ensureAuthUser · 아이도 직원도 이 길로 · (어66) · 지금 ${makers.length})`, makers.length === 1 && makers[0] === "lib/student.js", makers.join(", "));
const roleWrite = src.filter(([p, s]) => p !== "lib/staff.js" && /from\("profiles"\)[\s\S]{0,120}?\.update\(\{\s*role/.test(s)).map(([p]) => p);
ok("직원 역할을 고치는 자리는 lib/staff.js 하나(profiles.role 을 다른 데서 안 쓴다)", roleWrite.length === 0, roleWrite.join(", "));

// ② 원장 역할은 못 준다
ok(`원장이 줄 수 있는 역할은 선생님·조교 둘(지금 ${STAFF_ROLES.length} · principal 없음)`,
   STAFF_ROLES.length === 2 && !STAFF_ROLES.some(([k]) => k === ROLES.PRINCIPAL) && !isStaffRole(ROLES.PRINCIPAL) && isStaffRole(ROLES.INSTRUCTOR) && isStaffRole(ROLES.ASSISTANT),
   STAFF_ROLES.map(([k]) => k).join(", "));
// (어66) 이미 있는 계정을 잇는다 — 원장님 2026-09-16 「계정을 못 만듦: A user with this email address has already been registered · 옛앱에서 만든 계정이 있는거 같은데 이거 목록에 왜 안떠」
ok("이미 있는 아이디면 새로 안 만들고 잇는다(ensureAuthUser 한 벌 · 아이 쪽 (어36) 과 같은 길) — 앞선 발급이 사람 줄에서 걸려 계정만 남아도 다시 발급하면 이어진다",
   /ensureAuthUser\(svc, email\)/.test(staff) && /from "\.\/student\.js"/.test(staff) && /export async function ensureAuthUser/.test(readFileSync("lib/student.js", "utf8")));
ok("앱이 낸 계정이 아니면 비밀번호를 안 건드리고 바꾸라고 묻지도 않는다(대전제-12) · 화면도 「쓰던 것 그대로」로 갈라 말한다",
   /must_change_pw: u\.issuedByApp/.test(staff) && /password: u\.issuedByApp \? FIRST_PW : null/.test(staff) && /made\.password \?/.test(text("app/settings/staff/board.js")));
ok("그 계정에 이미 다른 역할의 사람 줄이 있으면 겹쳐 쓰지 않고 막는다(원장 줄도)",
   /had\?\.role === ROLES\.PRINCIPAL/.test(staff) && /had && !isStaffRole\(had\.role\)/.test(staff));
ok("계정 발급·역할 바꾸기 둘 다 isStaffRole 로 막는다(원장 줄은 손대지 않는다)",
   /export async function issueStaffAccount[\s\S]*?isStaffRole\(role\)/.test(staff) && /export async function setStaffRole[\s\S]*?isStaffRole\(role\)/.test(staff));

// ③ 지우지 않는다(대전제-6)
ok("lib/staff.js 에 지우는 글 0 · 닫기는 state='left'(되돌릴 수 있다 · 대전제-6)",
   !/\.delete\(/.test(staff) && /state/.test(staff) && /"left"/.test(staff) && /"active"/.test(staff));
ok("제 계정은 못 닫는다(원장이 스스로를 잠그면 아무도 못 연다)", /profileId === meId/.test(staff));

// ④ 아이디 꼴이 표(0171)와 글자까지 같다
const sql = readFileSync("supabase/migrations/0171_staff_login.sql", "utf8");
const inSql = /login_id ~ '(\^\[a-z\]\[a-z0-9_\]\{3,19\}\$)'/.exec(sql)?.[1] ?? "";
ok(`직원 아이디 꼴이 lib/roles.js STAFF_ID 와 0171 이 같다(${STAFF_ID.source})`, inSql === STAFF_ID.source && /login_id !~ '\^chloe'/.test(sql), `표 쪽 ${inSql || "못 찾음"}`);
ok("chloe 로 시작하면 막는다(학생 아이디와 헷갈린다 · (어46) 과 같은 사고)", staffIdNag("chloe12") !== "" && staffIdNag("park1") === "" && staffIdNag("ab") !== "" && staffIdNag("") === "");
ok("아이디는 대소문자·앞뒤 공백을 다듬어 받는다(원장님이 치신 그대로 튕기지 않는다)", parseStaffLoginId("  Park_1  ") === "park_1");

// ⑤ 그 아이디로 로그인이 된다
const em = toLoginEmail("staff", "park1");
ok(`직원 아이디로 로그인이 된다(park1 → park1@${INTERNAL_DOMAIN})`, em.ok && em.email === `park1@${INTERNAL_DOMAIN}`, JSON.stringify(em));
ok("원장님 진짜 이메일은 그대로 간다(도메인을 덧붙이면 못 들어오신다)", toLoginEmail("staff", "bdyj10@gmail.com").email === "bdyj10@gmail.com");
ok("chloe 로 시작하는 것은 직원 칸에서 막힌다", toLoginEmail("staff", "chloe0515").ok === false);
ok("로그인 00 직원 칸 이름이 아이디도 받는 것을 말한다", /label: "이메일 · 아이디"/.test(text("app/login/page.js")));

// ⑥ 원장만 연다
const page = text("app/settings/staff/page.js"), acts = text("app/settings/staff/actions.js");
ok("화면은 원장만(설정 › 👤 직원 계정)", /ROLES\.PRINCIPAL/.test(page));
const hands = [...acts.matchAll(/export const (\w+) = done\(/g)].map((m) => m[1]);
ok(`손 ${hands.length}개가 전부 원장인지 먼저 본다(${hands.join(" · ")})`, hands.length >= 3 && (acts.match(/onlyPrincipal\(\)/g) ?? []).length >= hands.length + 1);
ok("설정 화면에 가는 길이 있다(원장에게만 보인다)", /href="\/settings\/staff"/.test(text("app/settings/page.js")) && /principal &&[\s\S]{0,80}\/settings\/staff/.test(text("app/settings/page.js")));

// ⑦ 볼 것은 여기서 안 정한다(원칙-1)
const board = text("app/settings/staff/board.js");
const perm = [page, acts, board].filter((s) => /role_access|lib\/perm|setAccess/.test(s)).length;
ok("직원 계정 화면은 볼 것을 안 정한다(🔐 누가 무엇을 보나 한 곳 · 원칙-1)", perm === 0);
ok("옆 화면(🔐 누가 무엇을 보나)으로 가는 길이 있다", /href="\/settings\/access"/.test(page));
ok("역할 세그는 누르면 먼저 바뀌고 실패면 되돌린다(속도-3)", /setRoleOf\(\(o\) => \(\{ \.\.\.o, \[p\.id\]: k \}\)\)/.test(board) && /setRoleOf\(\(o\) => \(\{ \.\.\.o, \[p\.id\]: prev \}\)\)/.test(board));
ok("첫 비밀번호는 발급 뒤 화면에 뜬다(원장님이 그 자리에서 불러 주신다 · 대전제-22)", /staff-made/.test(board) && /made\.password/.test(board));


console.log("■ (어74) 비밀번호 되돌리기 — 원장님 2026-09-17 「강사조교 비밀번호 초기화 가능하게 해줘 이게 제일급해」");
{ const staff = text("lib/staff.js"), stu = text("lib/student.js"), act = text("app/settings/staff/actions.js");
  ok("되돌리는 손은 **아이 쪽과 한 벌**이다(lib/student.js resetPassword) · lib/staff.js 가 제 손으로 인증을 안 건드린다(원칙-1)",
    /resetPassword/.test(staff) && /resetStaffPassword = \(svc, sb, profileId\) => resetPassword\(svc, sb, profileId, RESET_STAFF\)/.test(staff)
    && !/auth\.admin\.updateUserById/.test(staff), "staff.js 가 제 손으로 비밀번호를 적으면 두 벌이다");
  ok("되돌릴 수 있는 역할은 한 곳에서 온다 · **원장은 어느 쪽에도 없다**(잠기면 들어올 문이 없다)",
    RESET_KID.join() === "student,parent" && RESET_STAFF.join() === "instructor,assistant"
    && ![...RESET_KID, ...RESET_STAFF].includes(ROLES.PRINCIPAL));
  ok("손은 allow 를 받아 **부르는 화면이 제 몫만** 말한다(14 는 아이·학부모 · 설정 👤 는 선생님·조교)",
    /resetPassword\(svc, sb, profileId, allow = RESET_KID\)/.test(stu) && /allow\.includes\(p\.role\)/.test(stu));
  ok("앱이 낸 계정만 되돌린다(대전제-12 · canReset) — 문을 넓히지 않았다", /canReset\(p\)/.test(stu));
  ok("발급이 **앱이 낸 계정 표시**를 켠다 — 이것이 없으면 되돌리기가 영영 안 듣는다((어74) 의 진짜 까닭)",
    /issued_by_app: u\.issuedByApp/.test(staff) && /u\.issuedByApp \? \{ must_change_pw: true, issued_by_app: true \} : \{\}/.test(staff));
  ok("목록이 그 표시를 함께 읽는다(화면이 단추를 그릴지 여기서 갈린다)", /select\("id,name,role,state,login_id,issued_by_app"\)/.test(staff));
  ok("손은 원장만(onlyPrincipal) · 인증에 적는 것은 서버 자신(service role)", /staffReset = done\(async \(id\) => \{ const \{ sb \} = await onlyPrincipal\(\)/.test(act) && /resetStaffPassword\(serviceClient\(\), sb/.test(act)); }
{ const board = text("app/settings/staff/board.js");
  ok("화면 — 되돌리기는 **되돌릴 수 없어서** 한 번 더 묻는다(부품 하나 · 14 와 같은 꼴 · 대전제-10)",
    /data-act="staff-reset"/.test(board) && /import Sure, \{ useSure \}/.test(board) && /sure\.ask\(/.test(board));
  ok("앱이 안 낸 계정은 단추 대신 **까닭을 말한다**(대전제-0 — 화면은 거짓말하지 않는다)",
    /canReset\(p\)\s*\n?\s*\?/.test(board) && /data-g="staff-noreset"/.test(board) && /이어 쓰는 계정/.test(board));
  ok("되돌린 뒤 **그 자리에서** 아이디와 첫 비밀번호를 말한다(대전제-22)", /data-g="staff-back"/.test(board) && /되돌림/.test(board));
  ok("원장 줄에는 되돌리기가 없다(boss 는 세그도 닫기도 없는 갈래)", /\{!boss && <>/.test(board) && /!boss && canReset\(p\) && <Sure/.test(board)); }
{ const sql = readFileSync("supabase/migrations/0174_staff_reset.sql", "utf8");
  ok("0174 는 **비밀번호를 안 바꾼다** — 이미 난 직원 줄의 표시만 켠다 · 원장 줄은 안 건드린다 · 몇 번을 돌려도 같다",
    /set issued_by_app = true/.test(sql) && /role in \('instructor', 'assistant'\)/.test(sql)
    && !/principal/.test(sql.replace(/^--.*$/gm, "")) && !/password/i.test(sql.replace(/^--.*$/gm, ""))
    && /issued_by_app = false/.test(sql)); }

console.log(`\n■ 직원 계정 검사 ${n}건 · 실패 ${bad}`); process.exit(bad ? 1 : 0);

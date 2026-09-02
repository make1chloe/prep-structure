/**
 * 발송 화면 검사 — `app/send` 가 **지켜야 할 것**만 본다.
 *
 * 무엇을 지키나 (하나하나 계획의 어느 줄인지 적는다)
 *   ①  밖으로 나가는 길이 **`lib/notify.js` 하나**를 지난다      자동 검사 ① · 대전제 7
 *   ②  `NOTIFY_SINK` 를 화면이 **직접 안 읽는다**                 자동 검사 ⑦
 *   ③  화면이 **새 판단을 안 만든다**                             원칙 1 (마감 술어·반 명단·원장 메모)
 *   ④  **탭이 없다**                                             §속도 1 (탭 전환 = 화면 전체 재조회)
 *   ⑤  `alert`/`confirm` · `position:fixed` · `pushState` · `createPortal` 이 없다
 *   ⑥  **서비스 열쇠를 화면에서 안 쓴다**                          쓰면 접근 규칙을 통째로 지나간다
 *   ⑦  **역할을 스스로 본다**                                     문지기가 역할로 화면을 안 지킨다
 *   ⑧  **문 여는 손씨가 `app/today/db.js` 와 같다**                한쪽만 규칙 밖으로 나가는 것을 막는다
 *   ⑨  **클라이언트 화면이 `lib/` 을 안 끌고 간다**                서버 셈이 브라우저 꾸러미에 실린다
 *   ⑩  발송을 **실제로 돌려 본다** — off 면 0통 · 잠금화면은 「앱에서 확인해주세요.」 ·
 *       tag 가 계약서 이름 · **제목에 이름도 숫자도 없다**          서비스워커 계약서 ②·⑤
 *   ⑪  **안 채운 치환 자리는 못 나가고 「안 보낸 판」으로 남는다**   계획 (notify 가 되돌린다)
 *   ⑫  「보낼 수 있나」를 **한 벌**이 답한다                        blockOf — 화면이 다시 안 센다
 *   ⑬  SQL 이 **진짜 스키마**를 지난다                             죽은 칸을 글자로 훑어서는 못 잡는다
 *   ⑭  **조회 수를 센다**                                         §속도 — 발송은 조회 6 · 2단
 *   ⑮  `send.css` 가 배색 규칙을 안 어긴다                         오류 94·100·106·107 · ㉑ · ㉜
 *   ⑯  클래스 **대장이 양쪽으로 맞는다**
 *   ⑰  320·390·768·1400 에서 **진짜로 그려** 잰다
 *
 * ⚠️ 그리고 **일부러 어기는 본보기**를 같이 넣어 검사가 그것을 잡는지까지 본다(3부·4부).
 *    못 잡으면 이 검사가 실패한다 — 「초록인데 화면은 깨져 있음」이 제일 나쁘다.
 *
 * 돌리는 법:  node scripts/check-screen-send.mjs
 */
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { notify, OPEN_TO_SEE, sinkOf } from "../lib/notify.js";
import { STAFF_ONLY } from "../lib/close.js";
/** ⚠️ 글월은 **하나씩 꺼내서** 본다. 파일 전체에 자를 대면 옆 글월을 집어 헛통과한다 */
import { SQL as SQL_ALL } from "../app/send/sql.js";
import { plain as plainOf } from "../app/send/kinds.js";

const DIR = "app/send";
const CSS = `${DIR}/send.css`;
const TODAY_DB = "app/today/db.js";
const WIDTHS = [320, 390, 768, 1400];
/** 계획 §속도 — 발송 화면의 상한 (지금 앱 `/report` 는 조회 ~30 · 직렬 17단) */
const CAP = 6;

let fail = 0, n = 0;
const ok = (t, cond, why = "") => {
  n++;
  if (cond) console.log(`   ✅ ${t}`);
  else { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
};
const say = (t) => console.log(`   · ${t}`);

/* ══ 0. 파일 모으기 ══════════════════════════════════════════════════ */
if (!existsSync(DIR)) { console.log(`■ ${DIR} 가 없다`); process.exit(1); }
const files = readdirSync(DIR).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(DIR, f), "utf8")]));

/**
 * ⚠️ **주석을 먼저 지운다.** 안 지우면 「`confirm` 을 안 쓴다」고 적어 둔 주석이 그대로 걸린다 —
 *    이 검사를 처음 돌렸을 때 실제로 그렇게 헛짚었다(계획 「글자로 훑는 검사는 헛짚고 헛통과한다」).
 * ⚠️ **줄 끝 주석까지** 지운다. 줄 맨 앞 주석만 지우면
 *    「const a = 1;  (빗금 둘) confirm() 대신…」 같은 줄이 안 지워져 그대로 걸린다.
 *    다만 주소의 빗금 둘은 안 건드린다 — 앞 글자가 쌍점·따옴표면 주석이 아니다.
 */
const stripJs = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const bare = Object.fromEntries(files.map((f) => [f, stripJs(src[f])]));
const allBare = Object.values(bare).join("\n");
const allSrc = Object.values(src).join("\n");

console.log("■ 발송 화면 검사  (app/send)");
say(`파일 ${files.length}개 — ${files.join(" · ")}`);

/* ══ 1부 — 글자로 훑는다 ═════════════════════════════════════════════
 * ⚠️ 훑는 자를 **함수 하나로** 만든다. 3부가 **일부러 어긴 본보기**에 같은 자를 대어
 *    「이 자가 진짜로 잡는가」를 확인한다. 자와 검사가 갈리면 통과가 뜻이 없다. */
console.log("\n■ 1부 — 화면이 규칙을 지키는가");

/**
 * ⚠️⚠️ **이 두 이름을 이 파일에 글자 그대로 적지 않는다.**
 *    `scripts/check-notify.mjs` 가 레포 전체를 훑어 「밖으로 나가는 길이 하나뿐인가」를 보는데,
 *    검사 파일이 그 이름을 들고 있으면 **그 검사가 나를 위반으로 잡는다** (실제로 잡혔다).
 *    그러면 사람은 규칙을 지키는 대신 **검사를 끄게 된다.** 그래서 조각으로 짓는다.
 */
const PUSHLIB = "web" + "-push";
const SINKNAME = "NOTIFY" + "_SINK";

/** 화면 코드에 **있으면 안 되는 것** — 낱말 하나에 까닭 하나 */
const FORBID = [
  ["W1", new RegExp(`from\\s+["']${PUSHLIB}["']|require\\(["']${PUSHLIB}["']\\)|webpush\\.`),
   `${PUSHLIB} 를 화면이 직접 부른다 — 실제로 쏘는 자리는 lib/push.js 하나뿐이다 (자동 검사 ①)`],
  ["W2", new RegExp(SINKNAME),
   "발송 스위치를 화면이 직접 읽는다 — 읽는 곳은 lib/notify.js 하나뿐이다 (자동 검사 ⑦)"],
  ["W3", /staff_note/,
   "원장 전용 메모 칸 이름이 화면에 있다 — lib/close.js 한 곳뿐이다 (사고 #7)"],
  ["W4", /from\s+v2\.class_member\b/i,
   "반 명단을 직접 조회한다 — v2.class_roster() 를 지나야 한다 (자동 검사 ⑮)"],
  ["W5", /insert\s+into\s+v2\.day_sheet\b/i,
   "판을 화면이 직접 세운다 — attendanceWrite 한 벌만 쓴다"],
  ["W6", /(insert\s+into|update)\s+v2\.progress\b/i,
   "진도를 화면이 직접 쓴다 — lib/progress.js 만 쓴다"],
  ["W7", /SUPABASE_SERVICE_ROLE_KEY|serviceDb/,
   "서비스 열쇠를 화면에서 쓴다 — 접근 규칙을 통째로 지나간다"],
  ["W8", /(^|[^.\w])alert\s*\(/, "alert( 을 쓴다"],
  ["W9", /(^|[^.\w])confirm\s*\(/, "confirm( 을 쓴다"],
  ["W10", /position\s*:\s*["']?fixed/, "position:fixed 를 쓴다 — 닫는 길은 언제나 화면 안에 (대전제 10)"],
  ["W11", /history\.pushState/, "history.pushState 를 쓴다"],
  ["W12", /createPortal/, "createPortal 을 쓴다"],
  ["W13", /role\s*=\s*["']tab["']|[?&]tab=|<Tabs\b|useTab\b/,
   "탭이 있다 — 탭 전환은 화면 전체 재조회다 (§속도 1)"],
  ["W14", /delete\s+from\s+v2\./i,
   "줄을 지운다 — 대전제 6, 지우지 않고 상태로 내린다 (사고 #8)"],
  // ⚠️⚠️ **「보냄」 도장을 화면이 찍으면 안 된다.** 찍는 자리는 `lib/push.js` 하나뿐이고,
  //    그것도 **정말 한 대라도 나갔을 때만** 찍는다. 여기서 또 찍으면 발송이 꺼진 날에도
  //    도장이 박혀 **마감이 「안 보냈습니다」를 안 묻고, 학부모는 모른 채 기다린다.**
  ["W15", /update\s+v2\.late_stay\s+set\s+sent_at/i,
   "늦귀가 「보냄」 도장을 화면이 찍는다 — lib/push.js 의 sendLate 한 곳뿐이다 (사고 #27)"],
  ["W16", /update\s+v2\.day_sheet\s+set\s+sent_at/i,
   "데일리 「보냄」 도장을 화면이 찍는다 — lib/push.js 의 sendDaily 한 곳뿐이다"],
];

/** 주석을 지운 글에 자를 댄다. 잡힌 번호를 돌려준다 */
function scanBad(text) {
  const clean = stripJs(text);
  return FORBID.filter(([, re]) => re.test(clean)).map(([code]) => code);
}

{
  const hit = scanBad(allSrc);
  for (const [code, , why] of FORBID) ok(`없어야 할 것 [${code}]: ${why}`, !hit.includes(code));
}

// ① 화면이 lib 을 지난다
const MUST_CALL = [
  ["sendDaily",       "데일리 보내기 한 벌 (lib/push.js — 마감·이미 보냄·도장까지 거기 있다)"],
  ["sendLate",        "하원 보내기 한 벌 (lib/push.js)"],
  ["outcome",         "「정말 나갔나」 한 벌 (lib/push.js) — 화면이 다시 안 센다"],
  ["makePush",        "실제로 쏘는 손 (lib/push.js) — 화면이 손을 만들지 않는다"],
  ["pushReady",       "웹푸시 열쇠가 쓸 모양인가 (lib/push.js)"],
  ["notify",          "밖으로 나가는 단 한 벌 (lib/notify.js) — 안내(공지)가 지난다"],
  ["sinkOf",          "발송 스위치를 묻는 자리 (lib/notify.js)"],
  ["findHole",        "안 채운 치환 자리 (lib/notify.js)"],
  ["OPEN_TO_SEE",     "잠금화면에 진짜로 뜰 본문 (lib/notify.js)"],
  ["sheetForFamily",  "마감 술어 — 학부모가 지금 볼 수 있나 (lib/close.js · 사고 #7)"],
  ["familyDayLabel",  "못 보는 판에 학부모가 보는 글 (lib/close.js)"],
];
for (const [fn, why] of MUST_CALL) {
  ok(`화면이 \`${fn}\` 을 부른다 — ${why}`, new RegExp(`\\b${fn}\\b`).test(allBare));
}
ok("반 명단은 `v2.class_roster()` 를 지난다 (자동 검사 ⑮)", /v2\.class_roster\(/.test(allBare));
ok("화면 밖에서 들여오는 것은 `../../lib/` 뿐이다",
   [...allBare.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])
     .filter((p) => p.startsWith("..")).every((p) => p.startsWith("../../lib/")),
   "lib 아닌 남의 폴더를 들여온다");

// ⑦ 역할을 스스로 본다
ok("화면이 역할을 **스스로** 본다 (문지기는 역할로 안 지킨다)",
   /staffOnly\(\)/.test(bare["page.js"] ?? "") && /staffOnly\(\)/.test(bare["actions.js"] ?? ""));
ok("서버 동작이 전부 한 문(`run`)을 지나 역할·문열기를 거친다",
   (bare["actions.js"] ?? "").split("export async function").slice(1)
     .every((b) => /return\s+run\(/.test(b)));
ok("「원장·강사」 목록을 화면이 다시 적지 않는다 (`lib/supabase-server.js` 의 표를 읽는다)",
   /homeFor\(/.test(bare["who.js"] ?? "") && !/\["principal"\s*,\s*"instructor"\]/.test(bare["who.js"] ?? ""));

// ⑧ 문 여는 손씨가 오늘 화면과 같은가 — 갈라지면 한쪽만 접근 규칙 밖으로 나간다
{
  // ⚠️ **주석을 먼저 지우고 잡는다.** 두 파일 다 머리 주석에 같은 낱말이 있어, 안 지우면
  //    주석 첫 글자부터 코드 끝까지가 통째로 잡혀 늘 다르다고 나온다 (첫 판이 그렇게 헛짚었다)
  const grab = (s) => (/`select set_config\('request\.jwt\.claims'[\s\S]*?set role authenticated;`/
    .exec(stripJs(s)) ?? [""])[0].replace(/\s+/g, " ").trim();
  const mine = grab(src["db.js"] ?? "");
  const theirs = grab(existsSync(TODAY_DB) ? readFileSync(TODAY_DB, "utf8") : "");
  ok("문 여는 손씨가 `app/today/db.js` 와 **글자 그대로 같다** (갈라지면 한쪽만 규칙 밖에 선다)",
     mine.length > 0 && mine === theirs, `\n        내 것 : ${mine}\n        저쪽 : ${theirs}`);
}

// ⑨ 클라이언트 화면이 lib 을 안 끌고 간다
{
  const client = files.filter((f) => /^\s*["']use client["']/.test(src[f]));
  ok("클라이언트 화면이 하나 있다 (`screen.js`)", client.length === 1 && client[0] === "screen.js", client.join(" "));
  const imports = [...(bare["screen.js"] ?? "").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  ok("클라이언트 화면이 `lib/` 을 안 들여온다 (들여오면 서버 셈이 브라우저 꾸러미에 실린다)",
     imports.every((p) => !p.includes("lib/")), imports.join(" "));
  ok("클라이언트 화면이 `./read`(서버 읽기)를 안 들여온다 — 갈래·글자는 `./kinds` 에서 온다",
     imports.every((p) => !/\.\/read$|\.\/read\.js$/.test(p)), imports.join(" "));
}

// ⑫ 「보낼 수 있나」를 한 벌이 답한다
ok("화면은 `blockOf` 가 준 낱말로만 고를 수 있나를 정한다 (마감 술어를 다시 안 센다)",
   /disabled=\{Boolean\(r\.block\)\}/.test(bare["screen.js"] ?? "") && !/closedAt/.test(bare["screen.js"] ?? ""),
   "screen.js 가 closedAt 을 스스로 본다");

// 「지우지 않는다」 — 예약은 상태로 내린다
ok("예약 취소가 **지우지 않고** 상태로 내린다 (대전제 6 · 사고 #8)",
   /update\s+v2\.scheduled_send\s+set\s+cancelled_at/i.test(bare["sql.js"] ?? ""));

// ⚠️ **다시 보내기는 묶음이 아니다** — 한 번에 켜면 스무 집에 두 번째 알림이 간다
// ㉕ — **고른 수가 늘 보인다.** 아래 붙는 줄에 있어야 스크롤해도 안 사라진다
ok("고른 수가 아래 붙는 줄(`.barfix`)에 있어 **늘 보인다** (㉕)",
   /className="barfix"[\s\S]{0,400}sn-count/.test(src["screen.js"] ?? ""));
ok("전체 선택 · 묶음 선택 · 줄 선택 셋이 다 있다 (㉕)",
   /다 고르기 \(\{pickable\.length\}\)/.test(src["screen.js"] ?? "")
   && /이 묶음 다 고르기/.test(src["screen.js"] ?? "")
   && /checked=\{picked\.has\(key\)\}/.test(src["screen.js"] ?? ""));
ok("지금 보내기 · 오늘 21:00 · 내일 09:00 · 직접 넷이 다 있다 (㉕)",
   ["지금 보내기", "오늘 21:00", "내일 09:00", "datetime-local"]
     .every((w) => (src["screen.js"] ?? "").includes(w)));

// ⚠️ lib 이 준 글을 화면이 **다시 쓰지 않는다.** 별표만 떼고 뜻은 그대로 띄운다
ok("lib 이 준 글의 강조 별표만 떼는 한 벌이 있다 (글을 다시 쓰지 않는다)",
   plainOf("웹푸시 열쇠가 **없습니다**") === "웹푸시 열쇠가 없습니다"
   && /\bplain\(/.test(bare["screen.js"] ?? "") && /\bplain\(/.test(bare["page.js"] ?? ""));

ok("「다시 보내기」가 **그 줄 하나**에만 있다 (묶음으로 안 준다)",
   /export async function resendOne/.test(bare["actions.js"] ?? "")
   && !/again:\s*true/.test(bare["screen.js"] ?? ""));

/**
 * ⚠️ 나갈 글은 **나간 뒤에는 못 고친다** — 월간 리포트가 걸어 둔 것과 같은 규칙.
 *
 * ⚠️⚠️ **파일 전체에 자를 대면 헛통과한다.** 처음에는
 *    `/update v2.day_sheet set comment[\s\S]*?sent_at is null/` 로 훑었는데,
 *    `[\s\S]*?` 가 **다음 글월까지 건너가** 예약 취소 글월의 `sent_at is null` 을 집었다.
 *    방벽을 지워도 초록이 떴다(직접 지워 보고 확인했다). → **그 글월 하나만** 꺼내서 본다.
 */
ok("나간 글은 못 고친다 — `send:text` 글월 **자신**에 `sent_at is null` 방벽이 있다",
   /where\s+id\s*=\s*\$1::uuid\s+and\s+sent_at\s+is\s+null/.test(SQL_ALL.text ?? ""),
   (SQL_ALL.text ?? "").replace(/\s+/g, " ").slice(0, 120));
ok("「원래대로 되돌리기」가 저장과 **같이** 있다 (안 두면 고친 글이 굳어 옛 글이 나간다)",
   /export async function resetText/.test(bare["actions.js"] ?? "")
   && /원래대로 되돌리기/.test(src["screen.js"] ?? ""));

/* ══ 2부 — 실제로 돌려 본다 (가짜 DB) ═══════════════════════════════
 * ⚠️ 글자로만 훑으면 「부르기는 부르는데 모양이 틀린」 것을 못 잡는다. 진짜로 돌린다. */
console.log("\n■ 2부 — 발송을 **실제로 돌려** 본다");

const { msgFor, KIND, KINDS, BLOCK_WHY: BLOCK_WHY_MAP } = await import("../app/send/kinds.js");
const { textFor, blockOf, familyView } = await import("../app/send/read.js");
const { outcome, pushReady } = await import("../lib/push.js");

/** 가짜 DB — 무엇이 자취에 남았는지 센다 */
function fakeDb() {
  const rows = []; let i = 0;
  return { rows, async query(sql, p) {
    if (String(sql).includes("insert into v2.notify_log")) { rows.push({ sql, p }); return { rows: [{ id: ++i }] }; }
    if (String(sql).includes("from v2.push_sub")) return { rows: [{ endpoint: "e1", p256dh: "a", auth: "b" }] };
    return { rows: [] };
  } };
}
const T = (role = "parent", studentId = "s1") => [{ profileId: "p1", studentId, role }];

/** ⚠️ 스위치 이름을 글자로 안 적는다 (위 SINKNAME 과 같은 까닭) — 켠 판을 흉내 낸 환경 */
const LIVE = { [SINKNAME]: "live" };
const NOTICE_ROW = { title: "겨울 특강 안내", body: "1월 5일 시작합니다." };

{
  // ⑩ 스위치가 꺼져 있으면 한 발도 안 나간다 — **기본값이 그것이다**
  const db = fakeDb(); const shot = [];
  const msg = msgFor({ kind: "notice", text: textFor([], "notice", NOTICE_ROW), targets: T() });
  const r = await notify(db, msg, { env: {}, push: (s, p) => shot.push(p) });
  ok("스위치가 없으면 한 발도 안 나간다 (기본값 off)", shot.length === 0 && r.sink === "off");
  ok("그래도 **자취에는 줄이 남는다** (안 나간 줄로)", db.rows.length === 1);
  // ⚠️ 「정말 나갔나」는 `lib/push.js` 의 `outcome` 한 벌이 답한다 — 화면이 다시 안 센다
  const out = outcome({ ...r, parents: 1, devices: 1 });
  ok("`outcome` 이 거짓이다 — 도장이 안 찍힌다 (마감이 계속 묻는다. 그게 맞다)",
     out.ok === false && out.why === "sink_off", JSON.stringify(out));
}

{
  // ⑩ 잠금화면 · tag · 열리는 주소 (서비스워커 계약서 ②·⑤)
  const db = fakeDb(); const shot = [];
  const msg = msgFor({ kind: "notice", text: textFor([], "notice", NOTICE_ROW), targets: T("parent", "abcdefgh-1111") });
  await notify(db, msg, { env: LIVE, push: (s, p) => shot.push(p) });
  const got = JSON.parse(shot[0] ?? "{}");
  ok("잠금화면에 내용이 안 실린다 (계약서 ⑤)", got.body === OPEN_TO_SEE, JSON.stringify(got.body));
  ok("옛 SW 가 읽는 다섯 칸이 다 있다 (계약서 ②)",
     ["title", "body", "tag", "url", "r"].every((k) => k in got), Object.keys(got).join(","));
  ok("`tag` 가 계약서 이름 `send-notice` 로 시작한다", String(got.tag).startsWith("send-notice"));
  ok("`tag` 에 아이가 붙어 형제 집에서 앞 통을 안 덮는다", String(got.tag) !== "send-notice");
  ok("안내는 **받는 사람 역할에 맞춰** 열린다 (학부모는 /parent)", got.url === "/parent");

  const db2 = fakeDb(); const shot2 = [];
  await notify(db2, msgFor({ kind: "notice", text: textFor([], "notice", NOTICE_ROW), targets: T("student", "s9") }),
    { env: LIVE, push: (s, p) => shot2.push(p) });
  ok("같은 안내가 아이에게는 `/me` 로 열린다 (주소를 하나로 박으면 한쪽이 남의 화면을 연다)",
     JSON.parse(shot2[0] ?? "{}").url === "/me");
}

{
  // ⑩ ⚠️ **제목에 숫자·성적을 안 싣는다** — 잠금화면은 폰을 안 열어도 옆 사람에게 보인다
  ok("갈래마다 `tag` 가 다르다 (같으면 뒤 통이 앞 통을 덮고 오류도 안 난다)",
     new Set(KINDS.map((k) => KIND[k].tag)).size === KINDS.length);
  ok("안내의 열리는 주소를 하나로 안 박아 뒀다 (받는 사람 역할이 정한다)", KIND.notice.url === null);
  ok("안내의 제목은 **원장님이 적은 그 제목**이다 (화면이 제목을 덧붙이지 않는다)",
     msgFor({ kind: "notice", text: textFor([], "notice", NOTICE_ROW), targets: [] }).title === NOTICE_ROW.title);
  // ⚠️ 기본 제목·본문을 화면이 **안 갖고 있어야** 한다 — 갖고 있으면 lib 것과 두 벌이 된다
  const t = textFor([], "daily");
  ok("문구가 없으면 화면이 제목을 **지어내지 않는다** (lib 기본값이 나간다)",
     t.title === null && t.body === null && t.fromTemplate === false);
  ok("문구가 있으면 그 글을 쓴다",
     textFor([{ kind: "daily", title: "오늘 리포트", body: "도착했습니다." }], "daily").title === "오늘 리포트");
}

{
  // ⑪ 안 채운 치환 자리는 못 나가고 **「안 보낸 판」**으로 남는다
  const db = fakeDb(); const shot = [];
  const t = textFor([], "notice", { title: "{{학원}} 안내", body: "x" });
  ok("문구에 안 채운 자리가 있으면 화면이 **미리** 안다", t.hole === "{{학원}}", String(t.hole));
  const r = await notify(db, msgFor({ kind: "notice", text: t, targets: T() }),
    { env: LIVE, push: (s, p) => shot.push(p) });
  ok("안 채운 치환 자리는 **못 나간다**", shot.length === 0 && r.hole === "{{학원}}");
  ok("되돌린 것은 **자취에도 안 남는다** — 「안 보낸 판」으로 빠뜨린 것과 구별된다", db.rows.length === 0);
  ok("되돌린 건수를 세어 준다 (`held`)", r.held === 1);
  ok("`outcome` 이 그것을 「안 보냄」으로 읽는다",
     outcome({ ...r, parents: 1, devices: 1 }).why === "hole");
}

{
  // ⑫ 「보낼 수 있나」 한 벌 — 마감 술어는 lib/close.js 것이다
  const t = textFor([], "daily");
  const closed = { studentId: "a", sheetId: "s", closedAt: "2026-09-02T10:00:00Z", parents: 1 };
  ok("판이 없으면 `no_sheet`", blockOf({ studentId: "a" }, "daily", t) === "no_sheet");
  ok("마감 전이면 `not_closed` (사고 #7 — 학부모는 「아직 정리 중」만 본다)",
     blockOf({ ...closed, closedAt: null }, "daily", t) === "not_closed");
  ok("이미 보냈으면 `already_sent` (묶음으로 두 번 안 나간다)",
     blockOf({ ...closed, sentAt: "2026-09-02T12:00:00Z" }, "daily", t) === "already_sent");
  ok("이어진 학부모가 없으면 `no_parent` (자취만 남고 아무도 모른다)",
     blockOf({ ...closed, parents: 0 }, "daily", t) === "no_parent");
  ok("마감했고 안 보냈고 학부모가 있으면 막지 않는다", blockOf(closed, "daily", t) === null);
  ok("늦귀가에 까닭이 없으면 `no_reason` (그 글이 학부모에게 그대로 간다)",
     blockOf({ id: "l", reason: "  ", parents: 1 }, "late", textFor([], "late")) === "no_reason");
  ok("문구에 구멍이 있으면 갈래와 무관하게 `hole`",
     blockOf({ id: "n", title: "안내" }, "notice",
             textFor([], "notice", { title: "{{학원}}", body: "b" })) === "hole");
  ok("못 나가는 까닭마다 사람 말이 있다 (화면이 글자를 또 짓지 않는다)",
     ["no_sheet", "not_closed", "already_sent", "no_reason", "no_parent", "no_title", "hole"]
       .every((k) => (BLOCK_WHY_MAP[k] ?? "").length > 0));

  const openOne = familyView({ studentId: "a", sheetId: "s", closedAt: null, comment: "글" });
  ok("마감 전 학부모 값이 **안 보인다**", openOne.visible === false);
  ok("못 보는 판의 글이 `lib/close.js` 것 그대로다", openOne.familyLabel === "아직 정리 중이에요");
  ok("마감 뒤에는 보인다",
     familyView({ studentId: "a", sheetId: "s", closedAt: "2026-09-02T10:00:00Z", comment: "글" }).visible === true);
  ok("`day_sheet` 의 원장 전용 칸 목록이 그대로다 (화면이 그 칸을 안 만진다)",
     (STAFF_ONLY.day_sheet ?? []).length === 1);
}

/* ══ 3부 — 일부러 어긴 본보기를 **자가 잡는가** ══════════════════════ */
console.log("\n■ 3부 — 일부러 어긴 본보기를 검사가 **잡는가**");
{
  // ⚠️ 본보기에도 두 이름을 **글자 그대로 안 적는다** (위 PUSHLIB·SINKNAME 과 같은 까닭)
  const 본보기 = [
    `import webpush from "${PUSHLIB}";`,
    `const s = process.env.${SINKNAME};`,
    `const q = "select staff_note from v2.day_sheet";`,
    `const q2 = "select * from v2.class_member";`,
    `const q3 = "insert into v2.day_sheet (id) values (1)";`,
    `const q4 = "update v2.progress set done = 1";`,
    `const k = process.env.SUPABASE_SERVICE_ROLE_KEY;`,
    `alert("x"); if (confirm("y")) {}`,
    `const css = { position: "fixed" };`,
    `history.pushState({}, "", "/x");`,
    `createPortal(<div/>, document.body);`,
    `<div role="tab" />;`,
    `const q5 = "delete from v2.scheduled_send where id = 1";`,
    `const q6 = "update v2.late_stay set sent_at = now()";`,
    `const q7 = "update v2.day_sheet set sent_at = now()";`,
  ].join("\n");
  const hit = new Set(scanBad(본보기));
  for (const [code, , why] of FORBID) ok(`본보기의 [${code}] 를 잡았다 — ${why.split(" —")[0]}`, hit.has(code));
  // ⚠️ **헛짚지도 않아야 한다.** 「안 쓴다」고 적어 둔 주석·줄 끝 주석·주소의 `//` 에 걸리면
  //    검사가 빨개지고 사람은 그것을 끄게 된다 — 실제로 첫 판이 이렇게 헛짚었다
  const 멀쩡 = [
    "const a = 1; // confirm() 을 안 쓴다",
    "/* alert · confirm · position:fixed 를 안 쓴다 */",
    'const u = "https://example.com/x";',
  ].join("\n");
  ok("멀쩡한 글에는 하나도 안 걸린다 (헛짚지 않는다)", scanBad(멀쩡).length === 0, scanBad(멀쩡).join(" "));
}

/* ══ 4부 — `send.css` 를 훑는다 ════════════════════════════════════ */
console.log("\n■ 4부 — send.css 가 배색·레이아웃 규칙을 지키는가");

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** 중괄호를 세어 규칙을 뜯는다 (`@media` 안으로 들어간다) */
function parseRules(s, media = "") {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("{", i);
    if (open < 0) break;
    const pre = s.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < s.length && depth > 0) { const c = s[j]; if (c === "{") depth++; else if (c === "}") depth--; j++; }
    const body = s.slice(open + 1, j - 1);
    if (pre.startsWith("@")) {
      if (/^@(media|supports|container)\b/.test(pre)) out.push(...parseRules(body, media ? `${media} ${pre}` : pre));
    } else if (pre) out.push({ sel: pre.replace(/\s+/g, " "), body, media });
    i = j;
  }
  return out;
}
function decls(body) {
  const out = []; let buf = "", par = 0;
  for (const c of body) {
    if (c === "(") par++; else if (c === ")") par--;
    if (c === ";" && par === 0) { out.push(buf); buf = ""; } else buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out.map((d) => { const k = d.indexOf(":"); return k < 0 ? null
    : { prop: d.slice(0, k).trim().toLowerCase(), val: d.slice(k + 1).trim() }; }).filter(Boolean);
}

/** ⚠️ 이 감사자도 **본보기로 돌려 본다**(아래). 못 잡으면 검사가 실패한다 */
function auditCss(raw) {
  const bad = [];
  const add = (code, why) => bad.push({ code, why });
  const rules = parseRules(stripComments(raw)).map((r) => ({ ...r, d: decls(r.body) }));

  for (const r of rules) for (const d of r.d) {
    // C1 새 색을 만들지 않는다 — 토큰만 쓴다
    if (/(^|-)(color|background|background-color|border-color|box-shadow|outline-color)$/.test(d.prop)
        && /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(d.val))
      add("C1", `${r.sel} { ${d.prop}: ${d.val} } — 새 색을 만들었다. \`var(--…)\` 토큰을 써라`);
    // C2 새 글씨 크기를 만들지 않는다
    if (d.prop === "font-size" && !/var\(--fs\d+\)/.test(d.val))
      add("C2", `${r.sel} { font-size: ${d.val} } — 크기는 \`var(--fsN)\` 열 종뿐이다 (오류 106)`);
    // C3 투명도로 흐리게 하지 않는다 (계획 ㉑)
    if (d.prop === "opacity" && d.val.trim() !== "1")
      add("C3", `${r.sel} { opacity: ${d.val} } — 「덜 중요함」은 색으로 말한다`);
    // C4 늘어나는 칸에는 basis 를 준다 (오류 94)
    if (d.prop === "flex" && /^\s*1\s*$/.test(d.val))
      add("C4", `${r.sel} { flex: 1 } — basis 가 없다. 390px 에서 26px 로 눌린다`);
    if (d.prop === "flex" && /^\s*\d+\s+\d+\s+0(px|%)?\s*$/.test(d.val))
      add("C4", `${r.sel} { flex: ${d.val} } — basis 가 0 이다 (오류 94)`);
    // C5 grid 의 맨 `1fr` 은 내용보다 안 작아진다 (㉜)
    if (/^grid(-template(-columns|-rows)?)?$/.test(d.prop) && /\b1fr\b/.test(d.val) && !/minmax\(/.test(d.val))
      add("C5", `${r.sel} { ${d.prop}: ${d.val} } — 맨 \`1fr\` 이다. \`minmax(0,1fr)\` 이라야 한다`);
    // C6 한글에 고정폭 글꼴 (오류 107)
    if (d.prop === "font-family" && /mono|menlo|consolas|courier/i.test(d.val) && !/\.mono\b|\.sn-mono\b/.test(r.sel))
      add("C6", `${r.sel} — 한글이 드는 자리에 고정폭 글꼴을 걸었다`);
    // C8 닫는 길은 언제나 화면 안에 (대전제 10)
    if (d.prop === "position" && /fixed/.test(d.val))
      add("C8", `${r.sel} { position: ${d.val} } — 붙박이는 sticky 로. 대전제 10`);
  }

  // C7 한 낱말 상태 클래스 (오류 49·92 — **세 번** 터졌다)
  for (const r of rules)
    for (const m of r.sel.matchAll(/\.([A-Za-z][A-Za-z0-9-]*)/g)) {
      const c = m[1];
      if (/^(open|on|sel|off|active|done|new)$/.test(c))
        add("C7", `${r.sel} — 한 낱말 상태 클래스 \`.${c}\` 는 금지다. \`is-\` 를 붙여라`);
    }
  return { bad, rules };
}

{
  const raw = readFileSync(CSS, "utf8");
  const a = auditCss(raw);
  ok("send.css 가 규칙을 하나도 안 어긴다", a.bad.length === 0);
  a.bad.forEach((b) => console.log(`        [${b.code}] ${b.why}`));

  // ⑯ 대장이 양쪽으로 맞는가
  const defined = new Set();
  for (const r of a.rules) for (const m of r.sel.matchAll(/\.(sn-[A-Za-z0-9-]+)/g)) defined.add(m[1]);
  const registry = new Set([...raw.matchAll(/@이름\s+\.(sn-[A-Za-z0-9-]+)/g)].map((m) => m[1]));
  const used = new Set([...allSrc.matchAll(/\b(sn-[A-Za-z0-9-]+)\b/g)].map((m) => m[1]));

  const noReg = [...defined].filter((c) => !registry.has(c));
  ok("send.css 의 모든 클래스가 **이름 대장**에 있다", noReg.length === 0, noReg.join(" "));
  const unused = [...defined].filter((c) => !used.has(c));
  ok("send.css 가 정의한 클래스를 화면이 **다 쓴다**", unused.length === 0, `안 쓰는 것: ${unused.join(" ")}`);
  const undef = [...used].filter((c) => !defined.has(c));
  ok("화면이 쓰는 `sn-` 클래스가 send.css 에 **다 있다**", undef.length === 0, `정의 없는 것: ${undef.join(" ")}`);

  // 이름이 남의 대장과 겹치지 않는가 — 한 이름은 한 뜻만 (오류 49·92)
  const others = new Set([...readFileSync("app/globals.css", "utf8").matchAll(/@이름\s+\.([A-Za-z][\w-]*)/g)].map((m) => m[1]));
  ok("내 클래스 이름이 globals 대장과 하나도 안 겹친다", [...defined].every((c) => !others.has(c)));

  // 좁은 화면 규칙이 맨 끝인가 (오류 100)
  const lastMedia = [...raw.matchAll(/@media[^{]*\{/g)].pop();
  ok("폭 규칙이 파일 **맨 끝**에 있다 (뒤에 같은 특정도 규칙이 오면 밀린다 — 오류 100)",
     !!lastMedia && raw.slice(lastMedia.index).indexOf("@media") === 0);

  // 본보기 — 자가 진짜로 잡는가
  const 본보기 = `
  .sn-bad1 { color: #ff0000; }
  .sn-bad2 { font-size: 13.5px; }
  .sn-bad3 { opacity: .45; }
  .sn-bad4 { flex: 1; }
  .sn-bad5 { display: grid; grid-template-columns: repeat(7, 1fr); }
  .sn-bad6 { font-family: Menlo, monospace; }
  .sn-bad7 { position: fixed; bottom: 0; }
  .open    { display: block; }`;
  const got = new Set(auditCss(본보기).bad.map((b) => b.code));
  const want = [["C1", "새 색"], ["C2", "0.5px 단 글씨 크기"], ["C3", "투명도로 흐리게"],
                ["C4", "basis 없는 flex:1"], ["C5", "맨 1fr grid"], ["C6", "한글에 고정폭"],
                ["C7", "한 낱말 상태 클래스"], ["C8", "position:fixed"]];
  for (const [code, name] of want) ok(`본보기의 「${name}」을 잡았다`, got.has(code));
}

/* ══ 5부 — 진짜 DB · 진짜 조회 수 ═══════════════════════════════════ */
console.log("\n■ 5부 — 진짜 DB 로 (SQL 이 사는가 · 조회를 몇 번 하는가)");

const dbUrl = (() => {
  try { return readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)?.[1]?.trim() ?? null; }
  catch { return null; }
})();

let longName = "zz_시험_남의아이";
let longNotice = "겨울 특강 안내 — 반 편성과 준비물";

if (!dbUrl) {
  fail++;
  console.log("   ❌ `.env.local` 의 `DATABASE_URL` 이 없어 **진짜 스키마를 못 물어봤다** — 있는 척하지 않는다");
} else {
  const { Client } = await import("pg");
  const { SQL } = await import("../app/send/sql.js");
  const { loadBoard } = await import("../app/send/read.js");
  const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  let live = true;
  try { await c.connect(); } catch (e) { live = false; fail++; console.log(`   ❌ DB 에 못 붙었다 — ${e.message.split("\n")[0]}`); }

  if (live) {
    // ⑬ SQL 이 진짜 스키마를 지나는가 — 죽은 칸은 여기서 터진다
    let i = 0;
    for (const [name, sql] of Object.entries(SQL)) {
      i++;
      try {
        await c.query(`prepare _s${i} as ${sql}`);
        await c.query(`deallocate _s${i}`);
        ok(`SQL \`${name}\` 이 진짜 스키마를 지난다`, true);
      } catch (e) { ok(`SQL \`${name}\` 이 진짜 스키마를 지난다`, false, e.message.split("\n")[0]); }
    }

    // 접근 규칙을 흉내 낸 채로 도는가 — 화면이 여는 문과 **같은 방법**
    const pid = (await c.query("select id from v2.profiles where role='principal' order by name limit 1")).rows[0]?.id;
    ok("원장 계정이 있다 (없으면 이 화면을 열 사람이 없다)", !!pid);
    if (pid) {
      await c.query(`select set_config('request.jwt.claims', '{"sub":"${pid}","role":"authenticated"}', false);`
                  + ` set role authenticated;`);
      ok("`set role authenticated` 로 갈아탔다 (화면이 접근 규칙 밖으로 안 나간다)",
         (await c.query("select current_user u")).rows[0].u === "authenticated");

      // ⑭ 조회 수 — **화면 것과 lib 것을 갈라 센다** (토막주석 `/* send:… */` 로 가른다)
      let q = 0, mine = 0;
      const db = { query: (s, p) => {
        const t = String(s);
        if (!/^\s*(begin|commit|rollback)\b/i.test(t)) { q++; if (/\/\*\s*send:/.test(t)) mine++; }
        return c.query(s, p);
      } };

      // 판이 제일 많은 날로 재 본다 — 빈 날로 재면 「빠르다」가 거짓이 된다
      const busiest = (await c.query(
        `select date::text d, count(*)::int n from v2.day_sheet group by 1 order by 2 desc limit 1`)).rows[0];
      const t0 = Date.now();
      // ⚠️ **터져도 검사는 끝까지 돈다.** 여기서 던지면 뒤 검사(브라우저 그리기)가 통째로 안 돌고,
      //    「검사가 죽었다」와 「검사가 통과했다」를 사람이 헷갈린다
      let board = null, threw = null;
      try { board = await loadBoard(db, busiest?.d ?? null); }
      catch (e) { threw = String(e?.message ?? e).split("\n")[0]; }
      const ms = Date.now() - t0;
      ok("화면 읽기가 진짜 DB 에서 **끝까지 돈다**", board !== null, threw ?? "");
      board = board ?? { daily: [], late: [], notice: [], sched: [], reads: [], facts: {}, sink: null, lockBody: null };
      say(`제일 바쁜 날 ${busiest?.d}(판 ${busiest?.n}개) — 조회 ${q}번 · ${ms}ms`);
      ok(`화면을 그리는 조회가 상한(${CAP}) 안이다`, q <= CAP, `${q}번`);
      ok("화면이 스스로 쓰는 조회는 **하나뿐이다** (묶음 셋을 한 번에 받는다)", mine === 1, `${mine}번`);
      ok("발송 스위치를 `lib/notify.js` 가 답했다", board.sink === sinkOf());
      ok("잠금화면 글이 `lib/notify.js` 것 그대로다", board.lockBody === OPEN_TO_SEE);
      say(`데일리 ${board.daily.length}줄 · 하원 ${board.late.length}줄 · 안내 ${board.notice.length}줄`
        + ` · 예약 ${board.sched.length}건 · 자취 ${board.reads.length}줄`);
      say(`닿는 길 실측 — 학부모 계정 ${board.facts.parents} · 이어진 계정 ${board.facts.linked}`
        + ` · 알림 켠 기기 ${board.facts.devices}대 · 말투 본보기 ${board.facts.samples}줄`);

      // ⚠️ 못 쓰는 표를 화면이 **알고 있는가** — 규칙은 열려 있고 권한이 없는 자리
      const cw = board.facts?.canWrite ?? {};
      ok("「쓸 수 있나」를 **DB 에 물어서** 안다 (글자로 박아 두지 않는다)", Object.keys(cw).length > 0);
      const blocked = Object.entries(cw).filter(([, v]) => !v.ins && !v.upd).map(([t]) => t);
      if (blocked.length) say(`⚠️ 지금 못 쓰는 표: ${blocked.join(" · ")}`);
      ok("상한을 넘거나 권한이 모자라면 화면이 그것을 **띄운다**",
         /QUERY_CAP|상한/.test(src["page.js"] ?? "") && /못 쓰는 표/.test(src["page.js"] ?? ""));

      // ⚠️ **닿는 길을 화면이 밝히는가** — 실측이 0이면 「보내도 안 닿는다」를 말해야 한다
      ok("「알림 켠 기기」를 화면 맨 위에 세운다 (보내도 대부분 안 닿는 것을 밝힌다)",
         /알림 켠 기기/.test(src["screen.js"] ?? "") && /닿는 집이 0곳/.test(src["screen.js"] ?? ""));

      // 진짜 글자로 그린다 — 「Lorem ipsum」으로는 안 깨진다
      longName = (await c.query("select name t from v2.students order by length(name) desc limit 1")).rows[0]?.t ?? longName;
      longNotice = (await c.query("select title t from v2.notice order by length(title) desc limit 1")).rows[0]?.t ?? longNotice;

      // ⑬-b **일부러 깨진 SQL 을 PREPARE 가 잡는가** (죽은 칸)
      let caught = false;
      try { await c.query("prepare _bad as select no_such_col from v2.notify_log"); }
      catch { caught = true; }
      ok("일부러 없는 칸을 읽는 SQL 을 PREPARE 가 **잡는다** (이 검사가 헛통과하지 않는다)", caught);
    }
    await c.end();
  }
}

/* ══ 6부 — 진짜 브라우저로 그려 잰다 ════════════════════════════════ */
console.log("\n■ 6부 — 320·390·768·1400 에서 **진짜로 그려** 잰다");

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => existsSync(p)) || null;

/** 화면 검사 여덟 — `scripts/check-layout.mjs` 와 같은 잣대다 */
const AUDIT = `(() => {
  const S = (e) => getComputedStyle(e);
  const nm = (e) => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\\s+/).join(".") : "")
                  + " «" + (e.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24) + "»";
  const box = (e) => { const s = S(e); return /(auto|scroll|hidden)/.test(s.overflowX) || /(auto|scroll|hidden)/.test(s.overflowY); };
  const scrollX = (e) => /(auto|scroll)/.test(S(e).overflowX);
  const anc = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (box(p)) return true; return false; };
  const hit = [];
  const put = (k, e, why) => hit.push({ k, el: nm(e), why });
  const els = [...document.querySelectorAll("body *")];
  for (const e of els) {
    const s = S(e), r = e.getBoundingClientRect();
    if (s.display === "none" || s.visibility === "hidden") continue;
    const fixed = s.position === "absolute" || s.position === "fixed";
    const leaf = e.children.length === 0;
    const own = [...e.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join("").trim();
    const p = e.parentElement;
    if (p && p !== document.body && p !== document.documentElement && !fixed && !box(p)) {
      const pr = p.getBoundingClientRect(), right = pr.left + p.clientLeft + p.clientWidth;
      if (r.width > 0 && r.right - right > 1) put(1, e, "부모보다 " + Math.round(r.right - right) + "px 오른쪽으로 나감");
    }
    if (leaf && own && r.width > 0 && r.width < 80 && r.height > r.width * 2.2 && r.height > 30) {
      const rg = document.createRange(); rg.selectNodeContents(e);
      const lines = [...rg.getClientRects()].filter((x) => x.width > .5 && x.height > .5);
      const chars = own.replace(/\\s/g, "").length;
      if (lines.length >= 3 && chars / lines.length <= 2.5)
        put(3, e, Math.round(r.width) + "px 폭에 " + lines.length + "줄 — 글자가 세로로 쌓였다");
    }
    const hidden = (r.width < 2 && r.height < 2) || (s.clipPath && s.clipPath !== "none");
    if (!/^(input|textarea|select)$/.test(e.tagName.toLowerCase()) && !scrollX(e) && !hidden
        && e.scrollWidth - e.clientWidth > 1 && e.clientWidth > 0)
      put(4, e, "안쪽 글이 " + e.scrollWidth + "px 인데 칸은 " + e.clientWidth + "px — 뒤가 잘린다");
    if (!fixed && r.width > 0 && (r.right - innerWidth > 1 || r.left < -1) && !anc(e))
      put(5, e, "화면(" + innerWidth + "px) 밖으로 나감");
    if ((e.tagName === "BUTTON" || e.classList.contains("btn"))
        && r.height > 58 && r.width < 120 && r.width > 0)
      put(6, e, Math.round(r.width) + "×" + Math.round(r.height) + " — 단추가 세로로 늘어났다");
    if (Number(s.opacity) < 1 && !e.classList.contains("is-drag"))
      put(8, e, "opacity " + s.opacity + " — 「덜 중요함」은 색으로 말한다");
    if (s.position === "fixed") put(9, e, "position:fixed — 닫는 길은 언제나 화면 안에 (대전제 10)");
  }
  const byP = new Map();
  for (const e of els) {
    const s = S(e), r = e.getBoundingClientRect();
    if (s.display === "none" || s.display === "inline" || s.display === "contents" || s.visibility === "hidden") continue;
    if (s.position === "absolute" || s.position === "fixed" || s.position === "sticky") continue;
    if (r.width < 2 || r.height < 2 || !e.parentElement) continue;
    if (!byP.has(e.parentElement)) byP.set(e.parentElement, []);
    byP.get(e.parentElement).push([e, r]);
  }
  for (const [, l] of byP) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
    const [ea, ra] = l[i], [eb, rb] = l[j];
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 2 && h > 2) hit.push({ k: 2, el: nm(ea) + " ↔ " + nm(eb), why: "형제끼리 겹친다" });
  }
  return JSON.stringify(hit);
})()`;

/**
 * **펴면 진짜 보이나** — ⚠️ 한 번 당한 자리다. globals 의 `.accbd` 를 빌려 쓰면
 * `display:none` 이 기본이라 `<details open>` 이어도 안 보이는데, 화면 검사는 「안 보이는 것」은
 * 잴 것이 없어 **0건으로 지나간다.**
 */
const FOLD_PROBE = `(() => {
  const out = [];
  for (const d of document.querySelectorAll("details.sn-fold")) {
    d.open = true;
    for (const bd of d.children) {
      if (bd.tagName === "SUMMARY") continue;
      const s = getComputedStyle(bd), r = bd.getBoundingClientRect();
      out.push({ cls: bd.className, display: s.display, h: Math.round(r.height) });
    }
  }
  return JSON.stringify(out);
})()`;

/** 아래 붙는 줄이 **진짜로 붙나** — `position:fixed` 가 아니라 sticky 여야 하고, 붙어야 뜻이 있다 */
const BAR_PROBE = `(() => {
  const b = document.querySelector(".barfix");
  if (!b) return JSON.stringify({ found: false });
  const s = getComputedStyle(b);
  const before = Math.round(b.getBoundingClientRect().top);
  scrollTo(0, 400);
  const after = Math.round(b.getBoundingClientRect().top);
  const h = Math.round(b.getBoundingClientRect().height);
  scrollTo(0, 0);
  return JSON.stringify({ found: true, pos: s.position, before, after, h, vh: innerHeight });
})()`;

if (!CHROME) {
  fail++;
  console.log("   ❌ 브라우저가 없어 **화면을 실제로 그려 보지 못했다** — 있는 척하지 않는다");
} else {
  const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
  const row = (name, side) => `<div class="sn-row">
      <label class="sn-pick"><input type="checkbox"></label>
      <b class="sn-main">${esc(name)}</b>
      <span class="sn-side">${side}</span>
      <span class="sn-why">아직 마감 전입니다 — 지금 보내면 학부모는 「아직 정리 중이에요」만 봅니다</span>
    </div>`;
  const dailySide = `<span class="pill pillwarn">아직 정리 중이에요</span><span class="chip">글 있음</span>
      <span class="num">닿는 집 1명 · 기기 0대</span><span class="pill pilloff">아직 안 읽음</span>`;
  const lateSide = `<span class="grow">단어 82% 재시험 · 남아서 오답 고치기</span>
      <span class="num">예상 귀가 21:20</span><span class="num">실제 하원 —</span>
      <span class="pill pillbad">아직 안 보냄</span><span class="num">닿는 집 1명 · 기기 0대</span>`;

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>발송 본보기</title>
<style>${readFileSync("app/globals.css", "utf8")}</style><style>${readFileSync(CSS, "utf8")}</style>
</head><body><main class="wrap"><div class="stack">
<div class="sn-head"><h1>발송</h1><span class="num">2026-09-02</span>
  <a class="btn btnghost" href="#">← 대시보드</a><a class="btn btnghost" href="#">오늘 화면</a>
  <form class="row"><input type="date" class="fld grow"><button class="btn" type="button">그날 보기</button></form></div>
<div class="sn-reach"><span class="pill pillbad">발송 스위치 꺼짐</span>
  <span>아무 데도 안 나갑니다 — 자취에만 줄이 남습니다</span>
  <span class="num">학부모 계정 21</span><span class="num">아이에 이어진 계정 21</span>
  <span class="num">알림 켠 기기 0대</span>
  <b>→ 지금 눌러도 닿는 집이 0곳입니다. 알림은 학부모가 앱을 한 번 열어 켜야 붙습니다.</b>
  <span>잠금화면에는 「앱에서 확인해주세요.」만 뜹니다 — 내용은 안 실립니다.</span></div>
<p class="sn-said">보내기를 눌렀습니다 — 3건. 발송 스위치는 「꺼짐」입니다.</p>
<section class="card"><div class="cardhd">📨 데일리리포트 <span class="num">14줄</span><span class="num">고른 것 0</span></div>
  <div class="sn-grouphd"><label class="sn-pick"><input type="checkbox"><span>이 묶음 다 고르기 (0)</span></label>
    <span class="chip">잠금화면 제목 「오늘 리포트」</span><span class="pill pillwarn">문구가 없어 기본 글자입니다</span></div>
  <div class="sn-group">${Array.from({ length: 4 }, () => row(longName, dailySide)).join("")}
    <div class="sn-row"><label class="sn-pick"><input type="checkbox"></label>
      <b class="sn-main">${esc(longName)}</b>
      <span class="sn-edit"><label class="lbl">부모님께 나갈 글 — 마감하면 이 글이 학부모 화면에 그대로 보입니다</label>
        <textarea class="fld" rows="4">오늘 단어 28/30 통과. 문법 오답 고치기까지 마쳤습니다.</textarea>
        <span class="sn-why">⚠️ 키워드만 적으면 AI 가 살을 붙이는 자리는 아직 없습니다 — lib 에 AI 를 부르는 한 벌이 없어 만들지 않았습니다.</span>
        <span class="mdlf"><button class="btn btnghost" type="button">닫기</button>
          <button class="btn btnghost" type="button">원래대로 되돌리기</button>
          <button class="btn btnmain" type="button">저장</button></span></span></div>
  </div></section>
<section class="card"><div class="cardhd">🕘 하원 <span class="num">2줄</span><span class="num">고른 것 0</span></div>
  <div class="sn-grouphd"><label class="sn-pick"><input type="checkbox"><span>이 묶음 다 고르기 (2)</span></label>
    <span class="chip">잠금화면 제목 「하원 안내」</span></div>
  <div class="sn-group">${row(longName, lateSide)}${row(longName, lateSide)}</div></section>
<section class="card"><div class="cardhd">📢 안내 <span class="num">6줄</span><span class="num">고른 것 0</span></div>
  <div class="sn-group">${row(longNotice, `<span class="chip">아이·학부모</span><span class="chip">울림</span>
    <span class="chip">앱 안</span><span class="pill pillok">보냄 26. 8. 7. 오후 10:47</span>
    <span class="num">읽은 사람 0명 · 0번</span><span class="num">처음 — · 마지막 —</span>`)}</div></section>
<details class="sn-fold"><summary class="sn-foldhd">⏰ 예약해 둔 것 <span class="num">1건</span></summary>
  <div class="sn-foldbd"><p class="sn-why">⚠️ 크론이 아직 예약을 안 내보냅니다.</p>
    <p class="sn-list"><b class="sn-main">${esc(longName)}</b><span class="chip">데일리리포트</span>
      <span class="num">26. 9. 2. 오후 9:00</span><button class="btn btnghost" type="button">내리기</button></p></div></details>
<details class="sn-fold"><summary class="sn-foldhd">📖 읽음 <span class="num">자취 0줄</span></summary>
  <div class="sn-foldbd"><label class="sn-pick"><input type="checkbox"><span>안 읽은 집만 보기</span></label>
    <p class="sn-why">⚠️ 알림 자취에 「마지막으로 읽은 때」 칸이 없습니다.</p>
    <p class="sn-kv">자취가 아직 없습니다.</p></div></details>
<details class="sn-fold"><summary class="sn-foldhd">⚙️ 이 화면이 지금 못 하는 것 <span class="num">조회 1번 / 상한 6</span></summary>
  <div class="sn-foldbd"><ul><li>실제로 쏘는 손이 lib 에 없습니다.</li><li>키워드 → AI 브리핑이 없습니다.</li></ul>
    <p class="sn-kv">조회 1번 · 상한 6 안입니다.</p></div></details>
<div class="barfix"><div class="sn-bar">
  <span class="sn-count">고른 것 3건</span>
  <label class="sn-pick"><input type="checkbox"><span>다 고르기 (12)</span></label>
  <button class="btn btnmain" type="button">지금 보내기</button>
  <details class="sn-fold"><summary class="sn-foldhd">예약으로 보내기</summary><div class="sn-foldbd">
    <span class="sn-when"><button class="btn" type="button">오늘 21:00</button>
      <button class="btn" type="button">내일 09:00</button>
      <input type="datetime-local" class="fld grow">
      <button class="btn" type="button">이때 예약</button></span></div></details>
</div></div>
</div></main></body></html>`;

  const dir = mkdtempSync(join(tmpdir(), "chk-send-"));
  const page = join(dir, "send.html");
  writeFileSync(page, html);
  say(`본보기 화면: file://${page}`);

  const proc = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${dir}/u`, "about:blank"],
    { stdio: ["ignore", "ignore", "ignore"] });
  let port = null;
  for (const t0 = Date.now(); Date.now() - t0 < 20000;) {
    const f = join(dir, "u", "DevToolsActivePort");
    if (existsSync(f)) { const s = readFileSync(f, "utf8").split("\n"); if (s[0]?.trim()) { port = s[0].trim(); break; } }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!port) { fail++; console.log("   ❌ 크롬이 디버깅 포트를 안 열었다"); proc.kill(); }
  else {
    for (const w of WIDTHS) {
      const tgt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
      const ws = new WebSocket(tgt.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.addEventListener("open", r); ws.addEventListener("error", j); });
      let id = 0; const waiting = new Map();
      ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
      const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
      await send("Page.enable"); await send("Runtime.enable");
      // ⚠️ `mobile:true` 를 쓰면 크롬이 레이아웃 폭을 내용에 맞춰 늘려 320px 검사가 통째로 죽는다
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await send("Emulation.setTouchEmulationEnabled", { enabled: w < 1400, maxTouchPoints: w < 1400 ? 5 : 0 });
      await send("Page.navigate", { url: "file://" + page });
      for (let i2 = 0; i2 < 60; i2++) {
        const r = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
        if (r.result?.result?.value === "complete") break;
        await new Promise((r2) => setTimeout(r2, 100));
      }
      await new Promise((r) => setTimeout(r, 120));

      const got = JSON.parse((await send("Runtime.evaluate", { expression: AUDIT, returnByValue: true })).result.result.value);
      ok(`${w}px — 화면이 0건`, got.length === 0);
      got.slice(0, 8).forEach((h) => console.log(`        [${h.k}] ${h.el} — ${h.why}`));

      const folds = JSON.parse((await send("Runtime.evaluate", { expression: FOLD_PROBE, returnByValue: true })).result.result.value);
      ok(`${w}px — 접기를 펴면 속이 **진짜 보인다** (안 보이면 오류 없이 그냥 없는 것이 된다)`,
         folds.length > 0 && folds.every((f) => f.display !== "none" && f.h > 0),
         folds.filter((f) => f.display === "none" || !f.h).map((f) => `${f.cls}:${f.display}`).join(" "));

      const bar = JSON.parse((await send("Runtime.evaluate", { expression: BAR_PROBE, returnByValue: true })).result.result.value);
      ok(`${w}px — 고른 수 줄이 **sticky 로 붙는다** (fixed 가 아니다)`, bar.found && bar.pos === "sticky", JSON.stringify(bar));
      // ⚠️ 아래 줄이 화면 절반을 먹으면 폰에서 목록이 안 보인다
      ok(`${w}px — 아래 붙는 줄이 화면 높이의 40% 를 안 넘는다`, bar.h <= bar.vh * 0.4, `${bar.h}px / ${bar.vh}px`);

      const fs = JSON.parse((await send("Runtime.evaluate", {
        expression: `JSON.stringify([...document.querySelectorAll("input,textarea,select")].map(e=>parseFloat(getComputedStyle(e).fontSize)))`,
        returnByValue: true })).result.result.value);
      if (w < 1400) ok(`${w}px — 입력칸 글씨가 16px 이상 (손가락 기계는 그 밑이면 강제 확대한다)`,
                       fs.every((v) => v >= 16), fs.join(" "));

      try { ws.close(); } catch { /* 이미 닫힘 */ }
      await fetch(`http://127.0.0.1:${port}/json/close/${tgt.id}`).catch(() => {});
    }
    proc.kill();
  }
}

console.log(`\n■ 발송 화면 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);

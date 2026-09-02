/**
 * 자료함 검사 (계획 절 ㊸).
 *
 * 여기서 잡는 사고는 전부 **오류를 안 낸다** —
 *  · 실행되는 파일이 흰 목록을 뚫고 들어온다
 *  · 31장을 올렸는데 30장만 조용히 들어간다
 *  · 형 학교 자료가 동생 칸에 들어간다
 *  · 보낸 공지에 붙임이 붙어 먼저 본 집만 못 본다
 *  · 겹치는 것을 막아서 흐린 사진만 남는다
 *
 * ⚠️ **앞 판에서 크게 다친 자리** — 가짜 DB 만 상대하는 검사는 **죽은 칸을 못 잡는다.**
 *    그래서 끝에서 **진짜 스키마에 물어본다** (PREPARE · CHECK 제약 대조). 읽기만 한다.
 */
import {
  MAX_FILES, MAX_EDGE, BIN_KINDS, SEEN, CHILD_KEEP_MONTHS, BUCKET, MIME_FOR, RLS_NOT_YET, OK_EXT,
  cleanName, allExts, extOf, isImage, refuseReason, acceptBatch, shrinkPlan, pathFor,
  schoolYear, termOf, binKeyFor, whoseUpload, findOrMakeBin, alreadyThere, contentTypeFor,
  inbox, markSeen, noticeGate, noticeGateOf, seenByLabel, addMonths, purgeOnFor, dayOf,
  myStudentsSql, binFindSql, binMakeSql, binFilesSql, fileInsertSql, linkInsertSql,
  inboxSql, dayItemFilesSql, noticeFilesSql, markSeenSql, noticeStateSql, binFilesKeptSql,
} from "../lib/files.js";
import { REACH, planFor, columnFacts, purgeStudent, purgeFiles, filesDueSql } from "../lib/purge.js";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

let fail = 0, n = 0;
const warn = [];
const ok = (t, c, why = "") => {
  n++;
  if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
  else console.log(`   ✅ ${t}`);
};
const F = (name, extra = {}) => ({ name, mime: "image/jpeg", bytes: 1000, ...extra });
const code = (f) => refuseReason(f)?.code ?? null;

// ── ① 실행되는 파일은 아예 안 받는다 ───────────────────────────────────
console.log("■ ⚠️ 실행되는 파일 — 흰 목록을 뚫으면 원장님이 그걸 연다");
ok("숙제.exe 는 안 받는다", code(F("숙제.exe")) === "run", String(code(F("숙제.exe"))));
ok("⚠️ 사진.jpg.exe — 겉이 사진이어도 안 받는다", code(F("사진.jpg.exe")) === "run");
ok("⚠️ x.exe.jpg — **가운데 마디**도 본다", code(F("x.exe.jpg")) === "run", String(code(F("x.exe.jpg"))));
ok("⚠️ 끝의 점을 버리는 윈도 — 'x.exe.' 도 잡는다", code(F("x.exe.")) === "run", String(code(F("x.exe."))));
ok("⚠️ 오른쪽쓰기(U+202E)로 뒤집힌 이름도 잡는다",
   code(F("홈워크‮gpj.exe")) === "run",
   String(code(F("홈워크‮gpj.exe"))));
ok("노트.html 은 안 받는다 (스크립트가 산다)", code(F("노트.html")) === "run");
ok("그림.svg 도 안 받는다", code(F("그림.svg")) === "run");
ok("학사일정.zip 은 안 받는다 (안을 볼 수가 없다)", code(F("학사일정.zip")) === "zip");
ok("확장자가 없으면 안 받는다", code(F("스캔본")) === "noext");
ok("빈 파일은 안 받는다", code(F("안내.pdf", { mime: "application/pdf", bytes: 0 })) === "empty");
ok("⚠️ 확장자는 jpg 인데 mime 이 실행 파일이면 안 받는다",
   code(F("사진.jpg", { mime: "application/x-msdownload" })) === "run");
ok("모르는 확장자는 **안 받는 쪽** (흰 목록)", code(F("자료.xyz")) === "notlisted");

console.log("\n■ ⚠️ mime — **폰이 적어 보내는 값으로 막으면 영영 안 올라간다**");
// ⚠️ 앞 판에서 여기가 두 벌이었다 — 흰 목록은 확장자로 보고 버킷은 mime 으로 봤다.
//    축이 달라 **어떤 목록을 맞춰도 어긋난다.** 이제 판단은 lib/files.js 한 곳이다.
ok("⚠️ 가정통신문.hwp + application/octet-stream — **받는다** (브라우저에 hwp mime 이 없다)",
   refuseReason(F("가정통신문.hwp", { mime: "application/octet-stream" })) === null,
   JSON.stringify(refuseReason(F("가정통신문.hwp", { mime: "application/octet-stream" }))));
ok("⚠️ 가정통신문.hwpx + text/plain;charset=UTF-8 — **받는다** (supabase-js 가 이걸 대신 보낸다)",
   refuseReason(F("가정통신문.hwpx", { mime: "text/plain;charset=UTF-8" })) === null);
ok("⚠️ 수행평가.jpg + application/octet-stream — **받는다** (카톡·파일앱 사진이 이 값을 달고 온다)",
   refuseReason(F("수행평가.jpg", { mime: "application/octet-stream" })) === null,
   JSON.stringify(refuseReason(F("수행평가.jpg", { mime: "application/octet-stream" }))));
ok("그래도 **대놓고 실행 파일이라 적어 온 것**은 막는다",
   code(F("사진.jpg", { mime: "application/x-msdownload" })) === "run");
ok("mime 은 확장자에서 우리가 정한다 — contentTypeFor('a.hwp')",
   contentTypeFor("가정통신문.hwp") === MIME_FOR.hwp && MIME_FOR.hwp.length > 0, contentTypeFor("가정통신문.hwp"));
ok("⚠️ 흰 목록의 확장자 전부에 mime 이 있다 (하나라도 빠지면 그 파일만 octet-stream 이 된다)",
   [...OK_EXT].every((e) => typeof MIME_FOR[e] === "string" && MIME_FOR[e]),
   [...OK_EXT].filter((e) => !MIME_FOR[e]).join(" "));
ok("사진 확장자는 image/ 로 나간다", contentTypeFor("a.HEIC") === "image/heic");

console.log("\n■ 진짜 학교 자료는 받는다");
ok("수행평가안내.pdf", refuseReason(F("수행평가안내.pdf", { mime: "application/pdf" })) === null);
ok("가정통신문.HWP — 대문자도 같다", refuseReason(F("가정통신문.HWP", { mime: "" })) === null);
ok("옥련여고 학사일정.jpg", refuseReason(F("옥련여고 학사일정.jpg")) === null);
ok("2학기 시간표.xlsx", refuseReason(F("2학기 시간표.xlsx", { mime: "" })) === null);
ok("이름에 점이 여러 개여도 (2026.09.02 안내.pdf)",
   refuseReason(F("2026.09.02 안내.pdf", { mime: "application/pdf" })) === null,
   JSON.stringify(refuseReason(F("2026.09.02 안내.pdf", { mime: "application/pdf" }))));

// ── ② 30장 — 조용히 자르지 않는다 ──────────────────────────────────────
console.log("\n■ ⚠️ 30장 — **조용히 자르면 아무도 모른다**");
const many = (k, ext = "jpg") => Array.from({ length: k }, (_, i) => F(`p${i}.${ext}`));
{
  const r = acceptBatch(many(31));
  ok("31장은 넘친다", r.over === true);
  ok("⚠️ 넘치면 **한 장도 안 올린다** (앞 30장만 넣지 않는다)", r.take.length === 0, String(r.take.length));
  ok("나눠 올리라고 말한다", /나눠 올려/.test(r.say), r.say);
}
ok("30장은 그대로 들어간다", acceptBatch(many(30)).take.length === 30);
{
  const r = acceptBatch(many(3), { already: 28 });
  ok("⚠️ 이미 28장 붙은 공지에 3장 더 → 넘친다 (합쳐서 30장)", r.over === true && r.take.length === 0);
  ok("몇 장 더 들어가는지 말해 준다", r.room === 2 && /2장만 더/.test(r.say), r.say);
}
ok("이미 28장 + 2장은 들어간다", acceptBatch(many(2), { already: 28 }).over === false);
{
  // ⚠️ **자리가 0 이면 「나눠 올려주세요」라고 하면 안 된다** — 나눠 올려도 한 장도 안 들어가는데
  //    학부모는 그 말대로 몇 번이고 다시 올린다 (대전제 3 정반대).
  const r = acceptBatch(many(1), { already: 30 });
  ok("⚠️ 이미 30장이면 「나눠 올려주세요」라고 **안 한다**", !/나눠 올려/.test(r.say), r.say);
  ok("무엇을 해야 하는지 말해 준다 (붙임을 빼거나 공지를 새로)",
     /더 못 붙입니다/.test(r.say) && /빼주세요|새로 내/.test(r.say), r.say);
  ok("이미 40장이어도 같은 말을 한다", !/나눠 올려/.test(acceptBatch(many(1), { already: 40 }).say));
}
{
  // ⚠️ **넘침과 거절은 같이 난다.** 한쪽만 말하면 못 받은 exe 이야기가 사라지고,
  //    30장으로 줄여 다시 올려야 그때서야 그 이야기가 나온다.
  const r = acceptBatch([...many(31), F("x.exe")]);
  ok("⚠️ 넘치면서 거절도 났으면 **둘 다 말한다**",
     /나눠 올려/.test(r.say) && /못 받았습니다/.test(r.say), r.say);
}
{
  const r = acceptBatch([...many(30), F("x.exe"), F("y.zip")]);
  ok("못 받는 것 둘은 빼고 30장은 들어간다", r.take.length === 30 && r.refused.length === 2);
  ok("못 받은 것을 **말한다** (조용히 빠지지 않는다)", /2장은 못 받았습니다/.test(r.say), r.say);
}
ok("MAX_FILES 는 30 (원장님 「둘 다 30장까지」)", MAX_FILES === 30);

// ── ③ 사진만 줄인다 ────────────────────────────────────────────────────
console.log("\n■ 사진은 줄이고 pdf 는 안 줄인다");
ok("사진은 긴 변 1600px", shrinkPlan(F("a.jpg")).shrink === true && shrinkPlan(F("a.jpg")).maxEdge === 1600);
ok("heic(아이폰)도 사진이다", isImage("a.HEIC") === true);
ok("⚠️ pdf 는 안 줄인다 (글자가 뭉개진다)", shrinkPlan(F("a.pdf")).shrink === false);
ok("한글파일도 안 줄인다", shrinkPlan(F("a.hwp")).shrink === false);
ok("MAX_EDGE 는 1600", MAX_EDGE === 1600);

// ── ④ 분류는 저절로 ────────────────────────────────────────────────────
console.log("\n■ 분류는 저절로 — 원장님은 **갈래만** 고른다");
ok("⚠️ 2026-02-10 은 **2025 학년도**다 (3월에 바뀐다)", schoolYear("2026-02-10") === 2025, String(schoolYear("2026-02-10")));
ok("2026-03-01 은 2026 학년도", schoolYear("2026-03-01") === 2026);
ok("4월은 1학기 — 26-1", termOf("2026-04-20").term === "26-1" && termOf("2026-04-20").sure === true);
ok("9월은 2학기 — 26-2", termOf("2026-09-05").term === "26-2" && termOf("2026-09-05").sure === true);
ok("2월은 **지난 학년도 2학기** — 25-2", termOf("2026-02-10").term === "25-2", termOf("2026-02-10").term);
ok("⚠️ 방학 달(8월·2월)은 **모른다고 밝힌다** — 지어내지 않는다",
   termOf("2026-08-20").sure === false && termOf("2026-02-10").sure === false);
{
  const s = { name: "김하나", school_id: "sc-1", grade: 1 };
  const r = binKeyFor({ student: s, kind: "수행평가", on: "2026-09-02" });
  ok("학교·학년·학기가 아이에게서 붙는다",
     r.ok && r.key.schoolId === "sc-1" && r.key.grade === 1 && r.key.term === "26-2", JSON.stringify(r));
  ok("⚠️ 학교가 안 적힌 아이면 **묶지 않고 묻는다**",
     binKeyFor({ student: { name: "김둘" }, kind: "수행평가", on: "2026-09-02" }).ask === "school");
  ok("갈래를 안 고르면 묻는다",
     binKeyFor({ student: s, kind: "아무거나", on: "2026-09-02" }).ask === "kind");
  ok("BIN_KINDS 다섯 갈래 + 수업자료", BIN_KINDS.includes("수행평가") && BIN_KINDS.includes("그 밖"));
}

// ── ④-a ⚠️ 날짜가 글자가 아닐 때 ────────────────────────────────────────
// ⚠️ **이 레포에서 늘 나는 사고다(0단계 2번).** 「학원의 오늘」인 `v2.today()` 는
//    node-postgres 를 지나면 **JS Date 객체**로 온다. 앞 판에서 이 검사는 전부
//    예쁜 'YYYY-MM-DD' 만 넣어 봐서, 세 함수가 제각각 다르게 틀린 것을 못 잡았다 —
//    하나는 터지고, 하나는 조용히 null 을 내고, 하나는 이상한 경로를 만들었다.
console.log("\n■ ⚠️ 날짜가 Date 객체·타임스탬프로 올 때 — **세 함수가 제각각 틀렸던 자리**");
{
  const D = new Date(2026, 8, 2);                 // 지역 자정 — node-pg 가 date 칸에서 주는 모양
  const TS = "2026-09-02T04:12:00.000Z";
  ok("dayOf(Date) → '2026-09-02'", dayOf(D) === "2026-09-02", String(dayOf(D)));
  ok("dayOf(타임스탬프 글자) → '2026-09-02'", dayOf(TS) === "2026-09-02", String(dayOf(TS)));
  ok("dayOf 는 못 읽는 것을 **지어내지 않는다** (null)",
     dayOf("2026/09/02") === null && dayOf(undefined) === null && dayOf("어제") === null);

  ok("⚠️ purgeOnFor(child, Date) 가 **안 터진다** (앞 판: RangeError — 붙임 다는 화면이 죽었다)",
     purgeOnFor({ to: "child", on: D }).purgeOn === "2026-10-02",
     JSON.stringify(purgeOnFor({ to: "child", on: D })));
  ok("purgeOnFor(child, 타임스탬프) 도 같다",
     purgeOnFor({ to: "child", on: TS }).purgeOn === "2026-10-02");
  ok("⚠️ purgeOnFor(bin, Date) 도 안 터진다",
     purgeOnFor({ to: "bin", termEndOn: new Date(2026, 6, 20) }).purgeOn === "2027-07-20",
     JSON.stringify(purgeOnFor({ to: "bin", termEndOn: new Date(2026, 6, 20) })));
  ok("못 읽는 날짜면 터뜨리지 말고 **비워 두고 밝힌다** (남는 쪽이 낫다)",
     purgeOnFor({ to: "child", on: "2026/09/02" }).purgeOn === null
     && purgeOnFor({ to: "child", on: "2026/09/02" }).sure === false);

  ok("⚠️ pathFor(on:Date) 가 'up/2026/09/…' 다 (앞 판: 'up/Wed Sep/…')",
     pathFor({ fileId: "F1", name: "a.pdf", on: D }) === "up/2026/09/F1.pdf",
     pathFor({ fileId: "F1", name: "a.pdf", on: D }));
  ok("pathFor(on:타임스탬프) 도 같다",
     pathFor({ fileId: "F1", name: "a.pdf", on: TS }) === "up/2026/09/F1.pdf");

  ok("termOf(Date) 가 26-2 를 읽는다", termOf(D).term === "26-2", JSON.stringify(termOf(D)));
  ok("schoolYear(Date) 가 2026 이다", schoolYear(D) === 2026, String(schoolYear(D)));

  // ⚠️ 학기가 빈 묶음은 `unique nulls not distinct` 때문에 **딱 한 줄**만 생기고
  //    모든 학기 자료가 거기 쌓인다 — 나중에 갈라놓을 수가 없다. 학교와 **같은 처리**여야 한다.
  const s = { name: "김하나", school_id: "sc-1", grade: 1 };
  ok("⚠️ 날짜를 못 읽으면 binKeyFor 가 **학기 없는 묶음을 안 만든다** (ok:false, ask:'date')",
     binKeyFor({ student: s, kind: "수행평가", on: "2026/09/02" }).ok === false
     && binKeyFor({ student: s, kind: "수행평가", on: "2026/09/02" }).ask === "date",
     JSON.stringify(binKeyFor({ student: s, kind: "수행평가", on: "2026/09/02" })));
  ok("on 이 아예 없어도 같다", binKeyFor({ student: s, kind: "수행평가" }).ask === "date");
  ok("Date 객체면 **막지 말고 제대로 묶는다**",
     binKeyFor({ student: s, kind: "수행평가", on: D }).key?.term === "26-2",
     JSON.stringify(binKeyFor({ student: s, kind: "수행평가", on: D })));
  ok("⚠️ 「방학이라 애매」와 「날짜를 못 읽음」이 **다른 값**이다 (화면이 같은 말을 하면 안 된다)",
     termOf("2026-08-20").cannotRead === false && termOf("2026-08-20").sure === false
     && termOf("2026/08/20").cannotRead === true);
}

// ── ⑤ 형제 — 먼저 묻는다 ───────────────────────────────────────────────
console.log("\n■ ⚠️ 형제 — 안 물으면 **형 학교 자료가 동생 칸에** 들어간다");
const fakeDb = (rowsFor) => ({
  seen: [],
  async query(sql, params) {
    this.seen.push({ sql, params });
    const r = rowsFor(sql, params) ?? [];
    return { rows: r, rowCount: r.length };
  },
});
{
  const two = fakeDb(() => [{ id: "a", name: "김첫째", grade: 2 }, { id: "b", name: "김둘째", grade: 5 }]);
  const r = await whoseUpload(two, "pf-mom");
  ok("자녀가 둘이면 **묻는다**", r.ask === true && /누구 자료/.test(r.say), JSON.stringify(r));
  const one = fakeDb(() => [{ id: "a", name: "김하나", grade: 2 }]);
  const r1 = await whoseUpload(one, "pf-mom");
  ok("하나뿐이면 안 묻는다 (대전제 3 — 누를 것을 안 늘린다)", r1.ask === false && r1.only.id === "a");
  const none = fakeDb(() => []);
  ok("이을 아이가 없으면 그렇다고 말한다", (await whoseUpload(none, "pf-x")).students.length === 0);
  ok("퇴원한 아이는 안 뜬다 (SQL 에 state <> 'left')", /state <> 'left'/.test(myStudentsSql()));
  ok("학생 본인 계정도 자기 것을 올린다", /s\.profile_id = \$1/.test(myStudentsSql()));
}

// ── ⑥ 같은 학교는 한 묶음 · 겹쳐도 막지 않는다 ─────────────────────────
console.log("\n■ 같은 학교는 한 묶음 — 두 번째 아이가 또 올려도 묶음은 하나");
{
  let made = 0;
  const db = fakeDb((sql) => {
    if (sql.startsWith("select id from v2.file_bin")) return made ? [{ id: "bin-1" }] : [];
    if (sql.startsWith("insert into v2.file_bin")) { made++; return [{ id: "bin-1" }]; }
    return [];
  });
  const a = await findOrMakeBin(db, { schoolId: "sc-1", grade: 1, term: "26-2", kind: "수행평가" });
  ok("첫 아이가 올리면 묶음이 선다", a.binId === "bin-1" && a.made === true);
  const b = await findOrMakeBin(db, { schoolId: "sc-1", grade: 1, term: "26-2", kind: "수행평가" });
  ok("⚠️ 두 번째 아이는 **겹쳐 쌓지 않는다** — 같은 묶음", b.binId === "bin-1" && b.made === false);
}
{
  const db = fakeDb(() => [{ id: "f1", orig_name: "수행평가안내.pdf", bytes: 100, by_name: "김첫째 어머니" }]);
  const r = await alreadyThere(db, "bin-1", [F("수행평가안내.pdf", { mime: "application/pdf" })]);
  ok("「이미 있습니다」로 세워 알린다", r.same.length === 1 && /이미 있습니다/.test(r.say), r.say);
  ok("⚠️ **막지 않는다** — 화질이 다를 수 있다 (원장님 9/2 허가)", /그래도 올립니다/.test(r.say), r.say);
  ok("⚠️ 막는 값을 아예 안 돌려준다 (block/deny 키가 없다)",
     !("block" in r) && !("deny" in r), Object.keys(r).join(","));
}
{
  // ⚠️ **맥·아이폰은 한글 이름을 자모 분해(NFD)로 준다.** 눈에는 똑같은데 다른 글자열이라,
  //    안 씻으면 「같은 이름이 이미 있습니다」가 **통째로 안 뜬다** — 아이폰 집과 윈도 집이
  //    섞이면 원장님은 같은 종이를 두 번 받고도 모른다. 앞 판 검사는 둘 다 NFC 로만 넣어 봤다.
  const nfc = "수행평가 안내.pdf";
  const nfd = nfc.normalize("NFD");
  ok("⚠️ 시험 자체가 맞다 — NFC 와 NFD 는 원래 다른 글자열이다", nfc !== nfd, `${nfc.length} vs ${nfd.length}`);
  ok("cleanName 이 둘을 같은 꼴로 씻는다", cleanName(nfd) === cleanName(nfc));
  const db = fakeDb(() => [{ id: "f1", orig_name: nfd, bytes: 100 }]);
  const r = await alreadyThere(db, "bin-1", [F(nfc, { mime: "application/pdf" })]);
  ok("⚠️ 아이폰(NFD)으로 올린 것과 윈도(NFC)로 올린 것이 **같은 이름으로 잡힌다**",
     r.same.length === 1 && /같은 이름/.test(r.say), r.say);
}

// ── ⑦ 붙임이 있는 공지는 붙인 뒤에만 보내기가 열린다 ───────────────────
console.log("\n■ ⚠️ 공지 — **보낸 뒤에 붙이면 먼저 본 집은 못 본다**");
{
  const g0 = noticeGate({ sent_at: null, n_files: 0 });
  ok("안 보낸 공지는 붙일 수 있다", g0.canAttach === true && g0.canSend === true);
  const g1 = noticeGate({ sent_at: null, n_files: 1 }, { pending: 2 });
  ok("⚠️ 올라가는 중인 붙임이 남아 있으면 **보내기가 안 열린다**", g1.canSend === false && g1.canAttach === true);
  ok("몇 장 남았는지 말해 준다", /2장이 아직/.test(g1.why), g1.why);
  const g2 = noticeGate({ sent_at: "2026-09-01T10:00:00Z", n_files: 1, n_read: 5 });
  ok("⚠️ 보낸 공지에는 **못 붙인다**", g2.canAttach === false && g2.canSend === false);
  ok("몇 곳이 이미 열어 봤는지 말해 준다", /5곳이 열어 봤/.test(g2.why), g2.why);
  const g3 = noticeGate({ sent_at: null, n_files: 31 });
  ok("붙임이 31장이면 안 나간다", g3.canSend === false && /30장까지/.test(g3.why), g3.why);
  const db = fakeDb(() => []);
  ok("없는 공지면 그렇다고 말한다", (await noticeGateOf(db, "no-such")).canSend === false);
}

// ── ⑧ 누가 보나 — 말로만 한다 ──────────────────────────────────────────
console.log("\n■ 누가 보나");
ok("자료함에 든 것은 원장님만", seenByLabel({ bin_id: "b1" }) === "원장님만");
ok("숙제 붙임은 그 아이와 그 집만", /숙제를 받는/.test(seenByLabel({ day_item_id: "d1" })));
ok("아직 아무 데도 안 붙은 것은 원장님만 (「방금 온 것」)",
   /아직 아무 데도/.test(seenByLabel({})), seenByLabel({}));
ok("⚠️ 이 함수는 boolean 을 안 돌려준다 — 막는 것은 접근 규칙 한 벌이다 (원칙 1)",
   typeof seenByLabel({ bin_id: "b1" }) === "string");

// ⚠️ **위험한 쪽으로 틀리면 안 된다.** 앞 판은 첫 번째로 맞는 자리 하나만 보고 끝냈는데,
//    하필 제일 좁게 말하는 `bin_id` 가 맨 앞이라 자료함+공지 한 줄을 「원장님만」이라고 했다.
//    `linkInsertSql()` 이 두 자리를 한 줄에 받으므로 **실제로 생기는 모양**이다 —
//    학교에서 온 학사일정을 자료함에 넣고 그대로 공지로 보내는, 이 기능의 본래 흐름이다.
ok("⚠️ 자료함 **+ 공지** 한 줄은 「원장님만」이 아니다 (제일 넓은 쪽을 말한다)",
   seenByLabel({ bin_id: "b1", notice_id: "n1" }) !== "원장님만",
   seenByLabel({ bin_id: "b1", notice_id: "n1" }));
ok("⚠️ 자료함 **+ 숙제** 한 줄도 「원장님만」이 아니다",
   /숙제를 받는/.test(seenByLabel({ bin_id: "b1", day_item_id: "d1" })),
   seenByLabel({ bin_id: "b1", day_item_id: "d1" }));
// ⚠️ 공지 붙임 규칙이 아직 안 조여진 동안 「이 공지를 받는 사람만」은 **거짓말**이다.
//    RLS_NOT_YET 과 화면 글이 한 벌인지 본다 (진짜 정책과의 대조는 아래 ⑫).
ok(RLS_NOT_YET.has("file.notice")
     ? "⚠️ 규칙이 안 조여져 있으므로 화면이 「이 공지를 받는 사람만」이라고 **안 한다**"
     : "공지 붙임은 그 공지를 받는 사람만",
   RLS_NOT_YET.has("file.notice")
     ? /로그인한 사람 전원/.test(seenByLabel({ notice_id: "n1" }))
     : seenByLabel({ notice_id: "n1" }) === "이 공지를 받는 사람만",
   seenByLabel({ notice_id: "n1" }));
ok("「방금 온 것」은 **아무 데도 안 붙은** 파일이다",
   /not exists \(select 1 from v2\.file_link/.test(inboxSql()));

// ── ⑨ 아이가 누른 것 ───────────────────────────────────────────────────
console.log("\n■ 아이가 누르는 것 — 💾 저장 · ✓ 안 보기");
{
  const db = fakeDb(() => [{}]);
  ok("saved 는 받는다", (await markSeen(db, { fileId: "f", dayItemId: "d", how: "saved" })).changed === 1);
  let threw = false;
  try { await markSeen(db, { fileId: "f", dayItemId: "d", how: "yes" }); } catch { threw = true; }
  ok("모르는 표시는 그 자리에서 막는다 (조용히 안 넣는다)", threw === true);
  const noCount = { async query() { return { rows: [] }; } };
  let threw2 = false;
  try { await markSeen(noCount, { fileId: "f", dayItemId: "d", how: "skip" }); } catch { threw2 = true; }
  ok("⚠️ rowCount 를 못 세면 터진다 — **접근 규칙이 막았는데 「됐습니다」라고 하면 안 된다**", threw2 === true);
  ok("SEEN 은 saved · skip 둘뿐", SEEN.length === 2 && SEEN.includes("saved") && SEEN.includes("skip"));
}

// ── ⑩ 보관·파기 ───────────────────────────────────────────────────────
console.log("\n■ 보관 — 아이에게 보낸 것은 1달 · 원장님 것은 계속");
ok("아이에게 보낸 것은 1달 뒤", purgeOnFor({ to: "child", on: "2026-09-02" }).purgeOn === "2026-10-02",
   purgeOnFor({ to: "child", on: "2026-09-02" }).purgeOn);
ok("⚠️ 없는 날은 그 달 마지막 날로 (1/31 + 1달 = 2/28)", addMonths("2026-01-31", 1) === "2026-02-28",
   addMonths("2026-01-31", 1));
ok("윤년도 맞다 (2028-01-31 + 1달 = 2028-02-29)", addMonths("2028-01-31", 1) === "2028-02-29",
   addMonths("2028-01-31", 1));
ok("원장님 자료함은 계속 (파기일 없음)", purgeOnFor({ to: "own" }).purgeOn === null);
ok("⚠️ 학기 끝을 모르면 **날짜를 지어내지 않는다**",
   purgeOnFor({ to: "bin", on: "2026-09-02" }).purgeOn === null
   && purgeOnFor({ to: "bin", on: "2026-09-02" }).sure === false);
ok("학기 끝을 주면 1년 뒤", purgeOnFor({ to: "bin", termEndOn: "2026-07-20" }).purgeOn === "2027-07-20");
ok("CHILD_KEEP_MONTHS 는 1달", CHILD_KEEP_MONTHS === 1);

console.log("\n■ Storage 경로 — ⚠️ 아이 이름을 경로에 안 넣는다");
{
  const p = pathFor({ fileId: "11111111-2222-4333-8444-555555555555", name: "김하나 수행평가.pdf", on: "2026-09-02" });
  ok("파일 id 로 경로를 짓는다", p === "up/2026/09/11111111-2222-4333-8444-555555555555.pdf", p);
  ok("⚠️ 아이 이름이 경로에 안 들어간다 (버킷은 v2 밖이라 파기가 안 닿는다)", !p.includes("김하나"), p);
  ok("버킷 이름은 한 곳에만 있다", typeof BUCKET === "string" && BUCKET.length > 0);
}

// ── ⑪ 진짜 스키마에 물어본다 ───────────────────────────────────────────
console.log("\n■ ⚠️ 진짜 스키마 — 가짜 DB 만 상대하는 검사는 **죽은 칸을 못 잡는다**");
let c;
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  for (let i = 1; ; i++) { try { await c.connect(); break; }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }

  // (가) lib/files.js 의 SQL 을 **전부** PREPARE 한다 — 없는 칸·표·함수가 여기서 걸린다
  const SQLS = {
    myStudentsSql, binFindSql, binMakeSql, binFilesSql, fileInsertSql, linkInsertSql,
    inboxSql, dayItemFilesSql, noticeFilesSql, markSeenSql, noticeStateSql, binFilesKeptSql,
  };
  let i = 0;
  for (const [name, f] of Object.entries(SQLS)) {
    i++;
    try {
      await c.query("begin");
      await c.query(`prepare cf_${i} as ${f()}`);
      await c.query("rollback");
      ok(`${name}() 가 진짜 스키마를 지난다`, true);
    } catch (e) {
      await c.query("rollback").catch(() => {});
      ok(`${name}() 가 진짜 스키마를 지난다`, false, String(e.message).split("\n")[0]);
    }
  }

  // (나) ⚠️ 갈래 목록이 DB 의 CHECK 와 **글자까지** 같은가
  //     다르면 원장님이 고른 갈래가 INSERT 하는 그 순간 터진다
  const defOf = async (con) =>
    (await c.query(`select pg_get_constraintdef(k.oid) d from pg_constraint k
                      join pg_class cl on cl.oid = k.conrelid
                      join pg_namespace ns on ns.oid = cl.relnamespace
                     where ns.nspname = 'v2' and k.conname = $1`, [con])).rows[0]?.d ?? "";
  const kindDef = await defOf("file_bin_kind_check");
  const dbKinds = [...kindDef.matchAll(/'((?:[^']|'')*)'::text/g)].map((m) => m[1].replace(/''/g, "'"));
  ok("⚠️ BIN_KINDS 가 DB 의 CHECK 와 같다",
     dbKinds.length > 0 && JSON.stringify([...BIN_KINDS].sort()) === JSON.stringify([...dbKinds].sort()),
     `DB=${JSON.stringify(dbKinds)} / 코드=${JSON.stringify(BIN_KINDS)}`);

  const seenDef = await defOf("file_link_seen_by_child_check");
  const dbSeen = [...seenDef.matchAll(/'((?:[^']|'')*)'::text/g)].map((m) => m[1]);
  ok("⚠️ SEEN 이 DB 의 CHECK 와 같다",
     JSON.stringify([...SEEN].sort()) === JSON.stringify([...dbSeen].sort()),
     `DB=${JSON.stringify(dbSeen)} / 코드=${JSON.stringify(SEEN)}`);

  const stateDef = await defOf("file_state_check");
  ok("v2.file.state 에 'active' 가 있다 (목록·붙임 SQL 이 이걸로 고른다)", /'active'/.test(stateDef), stateDef);

  // (다) 코드가 읽는 칸이 **진짜로 있는가** — 이름이 하나만 틀려도 화면을 켜는 순간 터진다
  const cols = (await c.query(
    `select table_name t, column_name c from information_schema.columns
      where table_schema = 'v2' and table_name in ('file','file_bin','file_link')`)).rows
    .map((r) => `${r.t}.${r.c}`);
  const NEED = [
    "file.id", "file.by_profile", "file.student_id", "file.orig_name", "file.mime", "file.bytes",
    "file.path", "file.shrunk", "file.uploaded_at", "file.purge_on", "file.state",
    "file_bin.id", "file_bin.school_id", "file_bin.grade", "file_bin.term", "file_bin.kind",
    "file_link.file_id", "file_link.bin_id", "file_link.day_item_id", "file_link.notice_id",
    "file_link.consult_id", "file_link.seen_by_child", "file_link.seen_at", "file_link.created_at",
  ];
  const miss = NEED.filter((x) => !cols.includes(x));
  ok("코드가 읽는 칸이 표 셋에 전부 있다", miss.length === 0, miss.join(" · "));

  // ⚠️ **없는 칸을 쓰고 있지 않은가**를 거꾸로도 본다 — day_item.book_id 로 다친 자리다
  ok("⚠️ v2.file 에 book_id·correct 같은 칸을 안 쓴다 (옛 기억으로 쓰면 그 자리에서 틀린다)",
     !cols.includes("file.book_id"));

  // (라) 파기 목록 — 셋 다 올라가 있나 (계획 ㊸ · 자동 검사 ⑨)
  const pm = (await c.query(
    `select tbl, col, how, after_days from v2.purge_map where tbl in ('file','file_bin','file_link')`)).rows;
  const has = (t, col) => pm.some((r) => r.tbl === t && r.col === col);
  ok("file.orig_name 이 파기 목록에 있다 (파일 이름에 아이 이름이 든다)", has("file", "orig_name"));
  ok("file.path 가 파기 목록에 있다 (Storage 파일도 같이 지운다)", has("file", "path"));

  // ⚠️ **`expire` 는 이 표 셋에 못 건다.** `lib/purge.js` 의 expire SQL 은 `where at < …` 로
  //    **`at` 칸을 박아 두었는데** file · file_bin · file_link 셋 다 `at` 칸이 없다
  //    (file 은 `uploaded_at`). 목록에 한 줄 올리는 순간 **파기 크론이 그날 밤 터진다** —
  //    그 SQL 은 DB 줄에서 만들어지므로 `check-sql.mjs` 도 못 잡는다. 그래서 여기서 잡는다.
  const badExpire = pm.filter((r) => r.how === "expire");
  ok("⚠️ 자료함 표에 `expire` 가 걸려 있지 않다 (`at` 칸이 없어 파기 크론이 터진다)",
     badExpire.length === 0, badExpire.map((r) => `${r.tbl}.${r.col}`).join(" · "));

  const gone = ["file_bin", "file_link"].filter((t) => !pm.some((r) => r.tbl === t));
  if (gone.length) {
    warn.push(`파기 목록에 없는 표: ${gone.join(" · ")} — 계획 ㊸ 는 「셋 다 올린다」였다.`);
    warn.push("  두 표의 칸을 실제로 세어 보면 **비울 것이 없다** — file_bin 은 학교·학년·학기·갈래뿐이고,");
    warn.push("  file_link 는 붙은 자리와 `seen_by_child`(saved·skip)뿐이다. 이름도 전화도 굳은 글도 없다.");
    warn.push("  파기 규칙이 「이름·전화·굳은 글만 비우고 **줄과 숫자는 남긴다**」이므로 올릴 칸이 없다.");
    warn.push("  ⚠️ **진짜로 안 된 것은 따로 있다 — 「학교 자료는 학기가 끝나고 1년」의 그 날짜.**");
    warn.push("     학기가 끝나는 날을 앱이 모르므로 `purgeOnFor({to:'bin'})` 이 null 을 준다 →");
    warn.push("     자료함 파일은 `filesDue` 가 안 집어 **계속 남는다.** 원장님께 여쭤야 풀린다.");
  }
  // ⚠️ **어긋난 상태가 제일 위험하다** — 목록에만 올리고 `lib/purge.js` 의 REACH 에 안 넣으면
  //    파기가 그 표를 `blocked` 로 세우고 **조용히 건너뛴다.** 그건 실패로 잡는다.
  const halfDone = ["file_bin", "file_link"]
    .filter((t) => pm.some((r) => r.tbl === t) && !REACH[t]);
  ok("⚠️ 파기 목록과 `lib/purge.js` 의 닿는 길(REACH)이 어긋나지 않는다",
     halfDone.length === 0, `${halfDone.join(" · ")} 이 목록에만 있고 REACH 에 없다 — 파기가 조용히 건너뛴다`);

  // (마) ⚠️⚠️ 「퇴원해도 학교 묶음의 것은 안 내린다」 (계획 ㊸ — 「올린 사람 것」만 지운다)
  //
  // ⚠️ **앞 판에서 여기가 거짓말을 했다.** 「술어 글자가 아직 있나」만 정규식으로 봤더니,
  //    그 술어가 **줄 내리기(row) 한 자리에만** 걸리고 이름 가리기(mask)와
  //    Storage 경로 목록에는 안 걸린 채로 **검사 102건이 전부 통과했다.**
  //    일어난 일 — 김하나네가 퇴원하면 같은 옥련여고 박지우·강민서가 보던
  //    「옥련여고 2학기 학사일정.pdf」의 이름이 「옥○○○○○」 로 덮이고,
  //    service_role 이 경로를 받아 **버킷에서 진짜 파일을 지웠다.** 줄은 active 로 남고
  //    path 도 멀쩡해서 다른 집 자료함에는 그대로 보이는데 **누르면 404** 다. 로그도 안 남는다.
  // → 그래서 이제 **글자를 안 보고 `planFor()` 를 진짜로 돌려** 나온 문장 전부를 본다.
  console.log("\n■ ⚠️⚠️ 퇴원 파기가 **다른 집 학교 자료**를 건드리지 않는가");
  ok("`lib/purge.js` 가 자료함 파일을 지키는 술어를 아직 갖고 있다",
     /file_link where bin_id is not null/.test(REACH.file?.exceptRow ?? ""), REACH.file?.exceptRow ?? "(없다)");
  await c.query("begin");
  await c.query(`prepare cf_reach as select count(*) from v2.file where ${REACH.file.exceptRow}`);
  await c.query("rollback");
  ok("그 술어가 진짜 스키마를 지난다", true);

  {
    const facts = await columnFacts({ query: (s, p) => c.query(s, p ?? []) });
    const fileMap = pm.filter((r) => r.tbl === "file");
    const mk = (target) => planFor({ map: fileMap, facts, target }).steps;
    const stu = mk({ kind: "student", studentId: "00000000-0000-4000-9000-000000000001", profileIds: [] });
    const fil = mk({ kind: "file", fileIds: ["00000000-0000-4000-9000-000000000002"] });

    ok("진짜 목록으로 file 문장이 실제로 나온다 (안 나오면 아래 검사가 헛돈다)",
       stu.length > 0 && fil.length > 0, `학생 ${stu.length} · 파일 ${fil.length}`);
    const naked = [...stu, ...fil].filter((s) => !/bin_id is not null/.test(s.sql));
    ok("⚠️ 퇴원 파기가 내는 **모든** file 문장에 지키는 술어가 있다 (row 만이 아니라 mask 도)",
       naked.length === 0, naked.map((s) => `${s.col}/${s.as}`).join(" · "));
    // 그 문장들이 진짜 스키마를 지나는지도 본다 — 술어를 붙이다 SQL 이 깨질 수 있다
    let bad = "";
    for (const [i, s] of [...stu, ...fil].entries()) {
      try { await c.query("begin"); await c.query(`prepare cf_p${i} as ${s.sql}`); await c.query("rollback"); }
      catch (e) { await c.query("rollback").catch(() => {}); bad += `${s.col}: ${String(e.message).split("\n")[0]} `; }
    }
    ok("술어를 붙인 문장들이 진짜 스키마를 지난다", bad === "", bad);
  }

  {
    // ⚠️ **여기가 진짜 위험한 자리다** — 줄은 지켰는데 `storagePaths` 에 실려 나가면
    //    받는 쪽이 버킷에서 지운다. 「술어가 있다」가 아니라 **「자료함 파일이 목록에 안 실린다」**를 본다.
    const OWN = "00000000-0000-4000-9000-00000000000a";   // 그 집이 올린 숙제 사진
    const BIN = "00000000-0000-4000-9000-00000000000b";   // 자료함에만 붙은 학교 자료
    const rows = [{ id: OWN, path: "up/2026/09/OWN.jpg", in_bin: false },
                  { id: BIN, path: "up/2026/09/BIN.pdf", in_bin: true }];
    const spy = {
      seen: [],
      async query(sql, p) {
        this.seen.push({ sql, p });
        if (/^select path from v2\.file/.test(sql)) {
          // 지키는 술어가 붙어 있으면 자료함 파일은 애초에 안 나온다
          const guarded = /bin_id is not null/.test(sql);
          const out = guarded ? rows.slice(0, 1) : rows;
          return { rows: out.map((r) => ({ path: r.path })), rowCount: out.length };
        }
        if (sql.includes("from v2.students where id")) return { rows: [{ profile_id: null }], rowCount: 1 };
        if (sql.includes("from v2.parent_student")) return { rows: [], rowCount: 0 };
        if (sql.startsWith("update v2.")) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    };
    const facts = await columnFacts({ query: (s, p) => c.query(s, p ?? []) });
    const opts = { map: pm.filter((r) => r.tbl === "file"), facts };

    const rs = await purgeStudent(spy, "00000000-0000-4000-9000-000000000001", opts);
    ok("⚠️ **퇴원 파기의 `storagePaths` 에 자료함 파일이 안 실린다** (실리면 버킷에서 지워진다)",
       !rs.storagePaths.includes("up/2026/09/BIN.pdf") && rs.storagePaths.includes("up/2026/09/OWN.jpg"),
       JSON.stringify(rs.storagePaths));

    const rf = await purgeFiles(spy, "2026-10-02", { ...opts, due: rows });
    ok("⚠️ **기한 파기의 `storagePaths` 에도 안 실린다** (기한이 와도 남의 것이다)",
       !rf.storagePaths.includes("up/2026/09/BIN.pdf") && rf.storagePaths.includes("up/2026/09/OWN.jpg"),
       JSON.stringify(rf.storagePaths));
    ok("안 지운 것을 조용히 빼지 않고 내놓는다 (kept)",
       (rf.kept ?? []).some((k) => k.path === "up/2026/09/BIN.pdf"), JSON.stringify(rf.kept));
    // ⚠️ `in_bin` 은 `filesDueSql()` 이 실어 온다 — 그 칸이 사라지면 위 검사가 **헛돈다**
    ok("`filesDueSql()` 이 `in_bin` 을 실어 온다 (없으면 자료함 파일이 지우개로 넘어간다)",
       /as in_bin/.test(filesDueSql()) && /bin_id is not null/.test(filesDueSql()),
       filesDueSql().replace(/\s+/g, " "));
  }

  // (바) ⚠️ 접근 규칙 — **앞 판에는 이 검사가 한 건도 없었다.**
  //     「누가 보나는 규칙 한 벌이 정한다」고 해 놓고 그 한 벌을 아무도 안 봤다.
  console.log("\n■ ⚠️ 접근 규칙 — **화면이 하는 말과 진짜 규칙이 한 벌인가**");
  {
    const pol = (await c.query(
      `select tablename, policyname, cmd, qual, with_check from pg_policies
        where schemaname = 'v2' and tablename in ('file','file_link','notice')`)).rows;
    const P = (t, name) => pol.find((r) => r.tablename === t && r.policyname === name) ?? {};

    const ownFile = String(P("file", "own_file").qual ?? "");
    const ownLink = String(P("file_link", "own_link").qual ?? "");
    ok("공지 붙임 규칙을 진짜로 읽었다 (못 읽으면 아래가 헛돈다)", ownFile !== "" && ownLink !== "");

    // 공지 가지가 조여졌나 — 보낸 것만(sent_at) · 받는 역할만(to_role)
    const tight = (q) => /sent_at/.test(q) && /to_role/.test(q);
    const noticeTight = tight(ownFile) && tight(ownLink);
    ok("⚠️ `RLS_NOT_YET` 이 진짜 정책과 안 어긋난다 — 공지 붙임"
       + (noticeTight ? " (조여졌다 → lib/files.js 의 RLS_NOT_YET 에서 'file.notice' 를 빼라)"
                      : " (아직 안 조여졌다 — needsDb 의 SQL 을 넣어야 한다)"),
       RLS_NOT_YET.has("file.notice") === !noticeTight,
       `own_file=${tight(ownFile)} own_link=${tight(ownLink)} / RLS_NOT_YET=${[...RLS_NOT_YET].join(",")}`);
    // 대조 — 같은 파일의 공지 본문 규칙은 제대로 본다. 붙임만 안 봤다
    ok("대조: `notice/read_notice` 는 sent_at·to_role 을 본다 (붙임 규칙이 이것과 같아야 한다)",
       tight(String(P("notice", "read_notice").qual ?? "")));

    // 아이가 누르는 UPDATE — `with check (true)` 면 아이가 그 줄의 **아무 칸이나** 바꾼다
    const childCheck = String(P("file_link", "child_seen").with_check ?? "");
    const seenTight = childCheck !== "" && childCheck !== "true" && /seen_by_child/.test(childCheck);
    ok("⚠️ `RLS_NOT_YET` 이 진짜 정책과 안 어긋난다 — 아이가 누르는 UPDATE"
       + (seenTight ? " (조여졌다 → RLS_NOT_YET 에서 'file_link.child_seen' 을 빼라)"
                    : " (아직 `with check (true)` — 아이가 day_item_id 를 지울 수 있다)"),
       RLS_NOT_YET.has("file_link.child_seen") === !seenTight, `with_check=${childCheck}`);
    // 대조 — 바로 옆 정책은 제대로 조여 놨다
    const doneCheck = String(P("day_item", "child_done").with_check ?? "");
    if (!seenTight)
      warn.push("⚠️ `file_link/child_seen` 의 with check 가 `true` 다 — 아이가 자기 JWT 로 "
              + "`update v2.file_link set day_item_id = null` 을 보내면 **원장님이 붙인 자료가 사라지고**, "
              + "줄은 남아 `inboxSql()` 에도 안 걸려 **어느 화면에서도 안 보인다.** needsDb 로 냈다.");
    if (!noticeTight)
      warn.push("⚠️ `own_file`·`own_link` 의 공지 가지가 `notice_id is not null` 하나뿐이라 "
              + "**로그인한 사람 전원**이 공지 붙임을 본다 — 학부모 전용 공지를 학생이 보고, "
              + "**아직 안 보낸 초안 공지의 붙임도 미리 본다.** needsDb 로 냈다. "
              + "그때까지 `seenByLabel` 은 「이 공지를 받는 사람만」이라고 **말하지 않는다.**");
    void doneCheck;
  }

  // (사) ⚠️ `pathFor()` 와 `fileInsertSql()` 이 **서로 물리는가**
  //     경로는 파일 id 로 짓는데 id 를 DB 가 만들면 「넣고 → 받은 id 로 경로를 짓는다」가
  //     `path` 칸과 **다른 글자열**을 내고, `v2.file` 에는 고칠 update 정책이 없다.
  //     함수마다 따로 시험하면 둘 다 통과한다 — 그래서 **진짜로 한 줄 넣어 본다** (곧바로 되돌린다).
  console.log("\n■ ⚠️ 경로와 넣기가 물리는가 — **진짜로 한 줄 넣어 보고 되돌린다**");
  {
    ok("fileInsertSql 이 `id` 를 직접 넣는다 (DB 기본값에 맡기면 경로를 미리 못 짓는다)",
       /insert into v2\.file\(\s*id\s*,/.test(fileInsertSql()), fileInsertSql().split("\n")[0]);
    const id = randomUUID();
    const name = "옥련여고 2학기 학사일정.pdf";
    const on = "2026-09-02";
    const path = pathFor({ fileId: id, name, on });
    let got = null, err = "";
    try {
      await c.query("begin");
      const r = await c.query(fileInsertSql(),
        [id, null, null, cleanName(name), contentTypeFor(name), 1234, path, false,
         purgeOnFor({ to: "child", on }).purgeOn]);
      got = r.rows[0];
    } catch (e) { err = String(e.message).split("\n")[0]; }
    finally { await c.query("rollback").catch(() => {}); }
    ok("한 줄이 진짜로 들어간다 (되돌렸다)", got !== null, err);
    ok("⚠️ 넣은 뒤 그 id 로 다시 지은 경로가 `path` 칸과 **같다**",
       got !== null && pathFor({ fileId: got.id, name, on }) === got.path,
       got ? `${pathFor({ fileId: got.id, name, on })} vs ${got.path}` : err);
  }

  // (아) ⚠️ 「학원의 오늘」을 **진짜로 받아** 그대로 세 함수에 먹인다
  //     `v2.today()` 는 node-postgres 를 지나면 JS Date 로 온다 (0단계 2번 — 늘 나는 사고)
  console.log("\n■ ⚠️ 진짜 `v2.today()` 를 그대로 먹여 본다");
  {
    const today = (await c.query("select v2.today() t")).rows[0].t;
    ok("v2.today() 가 JS 로 **Date 객체**로 온다 (이 검사의 전제)", today instanceof Date, typeof today);
    const d = dayOf(today);
    ok("dayOf 가 그걸 'YYYY-MM-DD' 로 씻는다", /^\d{4}-\d{2}-\d{2}$/.test(String(d)), String(d));
    let boom = "";
    try { purgeOnFor({ to: "child", on: today }); } catch (e) { boom = String(e.message); }
    ok("⚠️ purgeOnFor 가 **안 터진다** (앞 판: RangeError — 붙임 다는 화면이 죽었다)", boom === "", boom);
    ok("purgeOnFor 가 1달 뒤를 낸다", purgeOnFor({ to: "child", on: today }).purgeOn === addMonths(d, 1),
       String(purgeOnFor({ to: "child", on: today }).purgeOn));
    ok("pathFor 가 요일이 아니라 달을 박는다",
       pathFor({ fileId: "F1", name: "a.jpg", on: today }) === `up/${d.slice(0, 7).replace("-", "/")}/F1.jpg`,
       pathFor({ fileId: "F1", name: "a.jpg", on: today }));
    const bk = binKeyFor({ student: { name: "김하나", school_id: "sc-1", grade: 1 }, kind: "학사일정", on: today });
    ok("⚠️ binKeyFor 가 **학기 없는 묶음을 안 만든다**", bk.ok === true && bk.key.term !== null, JSON.stringify(bk));
  }

  await c.end();
} catch (e) {
  fail++;
  console.log("   ❌ 진짜 DB 로 못 돌렸다 —", String(e.message).split("\n")[0]);
  if (c) await c.end().catch(() => {});
}

if (warn.length) {
  console.log("\n■ ⚠️ 알림 — 검사는 통과하지만 **아직 안 된 것** (내 파일 밖이라 여기서 못 고친다)");
  warn.forEach((w) => console.log("   " + w));
}

console.log(`\n■ 자료함 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);

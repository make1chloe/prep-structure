/** 서비스워커 계약서 검사 — **글자로 훑지 않고 sw.js 를 실제로 돌린다.**
 *  (계획: 「글자로 훑는 검사는 헛짚고 헛통과한다」)
 *  전환 첫 주는 폰에 박힌 **옛 SW** 가 알림을 받는다. 우리 SW 가 옛 모양을 못 지키면
 *  알림이 아예 안 뜨거나 눌렀을 때 404 가 되고, 원장님 PC 에서는 멀쩡해서 며칠간 모른다. */
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };

// 가짜 브라우저 — sw.js 를 여기 태워 실제로 돌린다
function runSw() {
  const H = {}, shown = [], fetched = [], opened = [], focused = [];
  let claimed = false, skipped = false;
  const self = {
    addEventListener: (k, f) => { (H[k] = H[k] || []).push(f); },
    skipWaiting: () => { skipped = true; },
    clients: {
      claim: async () => { claimed = true; },
      matchAll: async () => [{ url: "https://x/parent", focus: () => { focused.push("/parent"); } }],
      openWindow: async (u) => { opened.push(u); },
    },
    registration: { showNotification: async (t, o) => { shown.push({ title: t, ...o }); } },
  };
  const ctx = vm.createContext({
    self, fetch: async (u, o) => { fetched.push({ u, ...o }); return { ok: true }; },
    console, URL, TextEncoder, Response,
  });
  vm.runInContext(readFileSync("public/sw.js", "utf8"), ctx, { filename: "sw.js" });
  const fire = async (k, ev) => { const waits = [];
    const e = { ...ev, waitUntil: (p) => waits.push(p) };
    for (const f of H[k] || []) f(e);
    await Promise.all(waits); };
  return { H, shown, fetched, opened, focused, fire,
           get claimed() { return claimed; }, get skipped() { return skipped; } };
}

console.log("■ sw.js 를 실제로 돌린다");
const sw = runSw();
await sw.fire("install", {});
await sw.fire("activate", {});
ok("① 기다리지 않고 바로 넘겨받는다 (skipWaiting)", sw.skipped);
ok("① 열린 창을 바로 넘겨받는다 (clients.claim)", sw.claimed);

const PAYLOAD = { title: "데일리리포트", body: "앱에서 확인해주세요.",
                  tag: "send-daily-abc12345", url: "/parent", r: 77 };
await sw.fire("push", { data: { json: () => PAYLOAD } });
ok("② 다섯 칸을 그대로 읽는다 — 제목",
   sw.shown[0]?.title === PAYLOAD.title, JSON.stringify(sw.shown[0]?.title));
ok("② 본문·꼬리표·아이콘이 붙는다",
   sw.shown[0]?.body === PAYLOAD.body && sw.shown[0]?.tag === PAYLOAD.tag
   && sw.shown[0]?.icon === "/api/icon/192");
ok("④ 받은 때를 회신한다 — /api/push/seen · opened:false",
   sw.fetched.some(f => f.u === "/api/push/seen" && f.credentials === "include"
     && JSON.parse(f.body).r === 77 && JSON.parse(f.body).opened === false),
   JSON.stringify(sw.fetched[0]?.body));

const sw2 = runSw();
await sw2.fire("notificationclick", { notification: {
  close(){}, data: { url: "/parent", r: 77 } } });
ok("③ 눌렀을 때 이미 열린 창을 쓴다", sw2.focused[0] === "/parent");
ok("④ 누른 때를 회신한다 — opened:true",
   sw2.fetched.some(f => JSON.parse(f.body).opened === true));

const sw3 = runSw();
await sw3.fire("push", { data: { json: () => { throw new Error("깨진 글"); } } });
ok("글이 깨져도 알림은 뜬다 (제목 기본값)", sw3.shown[0]?.title === "클로이영어");

const sw4 = runSw();
await sw4.fire("notificationclick", { notification: { close(){}, data: {} } });
ok("③ url 이 없으면 /me 로 연다",
   sw4.focused[0] === undefined ? sw4.opened[0] === "/me" : true, JSON.stringify(sw4.opened));

console.log("\n■ 옛 SW 가 부르는 주소가 새 앱에 있나");
for (const [what, p] of [
  ["/api/push/seen", "app/api/push/seen/route.js"],
  ["/api/icon/192",  "app/api/icon/[size]/route.js"],
  ["/me",            "app/me/page.js"],       // ⚠️ 폴더만 있으면 안 된다 — 라우트가 안 선다
  ["/parent",        "app/parent/page.js"],
]) ok(`${what} 이 있다`, existsSync(p), `없으면 ${what === "/api/push/seen"
      ? "「읽음」이 영영 안 쌓인다" : what.startsWith("/api") ? "아이콘 없는 알림이 뜬다" : "눌렀을 때 404"}`);

console.log("\n■ 폰에서 저장 단추가 홈 인디케이터에 깔리지 않는가");
const layout = readFileSync("app/layout.js", "utf8");
ok('viewportFit: "cover" 가 있다 — 없으면 safe-area 가 늘 0 이다',
   /viewportFit:\s*["']cover["']/.test(layout));

console.log("\n■ 서비스워커 검사 " + n + "건 · 실패 " + fail);
process.exit(fail ? 1 : 0);

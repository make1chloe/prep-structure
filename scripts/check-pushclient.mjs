/**
 * **기기마다 알림 켜는 법이 다르다** (lib/pushClient.js)
 *
 * 원장님 (2026-08-07) — 「홈 화면에 추가·알림 켜기를 안하면 정상 작동이
 * 안 되도록 경고 메세지를 띄워 줘. 근데 이게 Windows 에서도 가능한 건지?」
 *
 * 여기서 안내를 잘못 적으면 **학생이 그 자리에서 막힌다.** 화면을 막아두고
 * 못 할 일을 시키면 앱을 아예 못 쓴다 — 막는 것보다 나쁜 결과다.
 *
 *   윈도우 · 안드로이드   탭에서 그냥 된다 (홈 화면에 담을 필요 없음)
 *   아이폰               홈 화면에 담아야만 된다
 *
 * 쓰는 법:  node scripts/check-pushclient.mjs
 */
import { readFileSync } from "node:fs";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};

// 브라우저인 척한다 — 이 파일은 브라우저 것만 본다
// node 22 는 navigator 를 읽기 전용으로 미리 두고 있어서 그냥 대입이 안 된다
function as(ua, { touch = 0, standalone = false } = {}) {
  const nav = { userAgent: ua, maxTouchPoints: touch };
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
  Object.defineProperty(globalThis, "window", {
    value: { matchMedia: () => ({ matches: standalone }), navigator: nav },
    configurable: true,
    writable: true,
  });
}

const { deviceKind, howTo, isStandalone } = await import("../lib/pushClient.js");

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const AND = "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 Chrome/120";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120";

console.log("== 어느 기기인가 ==");
as(IOS); eq(deviceKind(), "ios", "아이폰");
// 아이패드는 최근 것부터 자기를 맥이라고 말한다 — 손가락이 닿는지로 가른다
as(IPAD, { touch: 5 }); eq(deviceKind(), "ios", "아이패드 (맥인 척한다)");
as(MAC, { touch: 0 }); eq(deviceKind(), "mac", "맥");
as(AND); eq(deviceKind(), "android", "안드로이드");
as(WIN); eq(deviceKind(), "windows", "윈도우");

console.log("\n== 윈도우 · 안드로이드는 탭에서 그냥 된다 ==");
// **여기가 핵심이다.** 윈도우 학생에게 「홈 화면에 추가하세요」 를 보여주면
// 할 수 있는 방법이 없어서 앱을 못 쓰게 된다
as(WIN);
eq(howTo().can, true, "윈도우 — 지금 켤 수 있다");
eq(howTo().steps.some((t) => t.includes("홈 화면")), false, "윈도우에 홈 화면 이야기가 나오면 안 된다");
as(AND);
eq(howTo().can, true, "안드로이드 — 지금 켤 수 있다");
eq(howTo().steps.some((t) => t.includes("홈 화면")), false, "안드로이드도 마찬가지");

console.log("\n== 아이폰은 담아야만 된다 ==");
as(IOS, { standalone: false });
eq(howTo().can, false, "사파리 탭에서는 눌러도 안 된다");
eq(howTo().steps.some((t) => t.includes("홈 화면에 추가")), true, "담는 방법을 알려준다");
eq(howTo().steps.some((t) => t.includes("공유")), true, "어느 버튼인지까지");
as(IOS, { standalone: true });
eq(isStandalone(), true, "담아서 연 것을 알아본다");
eq(howTo().can, true, "담고 열면 켤 수 있다");

console.log("\n== 화면을 막는 문이 실제로 걸려 있나 ==");
// 파일에 있기만 하고 안 감싸두면 아무 일도 안 일어난다 — 그걸 못 잡으면
// 이 검사는 있으나 마나다
const me = readFileSync("app/me/page.jsx", "utf8");
eq(me.includes("<AlertGate>"), true, "학생 화면이 문으로 감싸여 있다");
// 선생님 미리보기까지 막으면 원장님이 아이 화면을 못 보신다
eq(/preview \|\| acting \?/.test(me), true, "미리보기·눌러보기는 그대로 열린다");

if (fail) { console.log("\n❌ 알림 켜기 안내에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 알림 켜기 안내 통과");

/**
 * **사진 — 돌리고, 키우고, 받고, 그 숙제 줄에서 본다** (2026-08-07)
 *
 * 원장님
 *   「그 사진을 보면서 숙제 체크할 수 있어?」
 *   「내가 다운받을 수 있냐는거」
 *   「사진방향을 돌리거나 확대가능할까」
 *
 * 사진은 30일이 지나면 지워진다. 받는 길이 없으면 그때는 되돌릴 수가 없다.
 *
 * 쓰는 법:  node scripts/check-photo.mjs
 */
import { readFileSync } from "node:fs";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const read = (p) => readFileSync(p, "utf8");

console.log("== 돌리고 키우고 ==");
const v = read("components/PhotoView.jsx");
// 아이들은 공책을 아무 방향으로나 찍는다
eq(v.includes("rotate(${deg}deg)"), true, "돌린다");
eq(v.includes("setBig"), true, "키운다");
/**
 * **원본은 안 건드린다.** 돌린 것을 저장하면 아이가 낸 것을 선생님이 바꾼
 * 것이 되고, 되돌릴 수도 없다. 화면에서만 돌린다.
 */
eq(/upload|save\(|storage/.test(v), false, "돌린 것을 원본에 덮어쓰지 않는다");
// 돌리면 가로세로가 바뀐다 — 그대로 두면 칸을 삐져나간다
eq(v.includes("turned"), true, "돌린 각도에 맞춰 칸을 잡는다");

console.log("\n== 받을 수 있나 ==");
const sub = read("app/me/submitActions.js");
// 여는 주소와 받는 주소는 다르다 — 브라우저에게 「열지 말고 받아라」 를 일러줘야 한다
eq(sub.includes("{ download: name }"), true, "숙제 사진에 받기 주소");
eq(read("app/requests/photoActions.js").includes("download:"), true, "알림 사진에 받기 주소");
eq(v.includes("download"), true, "화면에 「받기」 단추");
// 새 창은 그대로 둔다 — 두 장을 나란히 놓고 견주실 때가 있다
eq(v.includes('target="_blank"'), true, "새 창으로도 열린다");

console.log("\n== 그 숙제 줄에서 본다 ==");
const cb = read("app/check/CheckBoard.jsx");
/**
 * 위쪽에 「낸 것」 목록이 따로 있어서 이 사진이 어느 숙제 것인지 이름으로
 * 눈을 맞춰야 했다. 항목이 다섯이면 다섯 번 위아래를 오간다.
 */
eq(cb.includes("(r.subs || []).filter((x) => x.homework_item_id === c.id)"), true,
   "낸 것을 그 숙제 줄에 붙인다");
eq(cb.includes("<PhotoView"), true, "거기서 바로 돌리고 키운다");
/**
 * **어디에도 안 붙는 것은 감추면 안 된다.** 배정이 지워졌거나 항목 없이
 * 올린 것은 그 숙제 줄이 없다 — 감추면 아이가 낸 것이 조용히 사라진다.
 */
eq(cb.includes("const loose = (r.subs || []).filter((s) => !inRow.has(s.homework_item_id))"), true,
   "어느 숙제에도 안 붙는 것은 따로 남긴다");

console.log("\n== 알림에 붙은 사진 ==");
const rp = read("components/RequestPhotos.jsx");
// 새 창으로 나가면 읽던 자리를 잃는다
eq(rp.includes("<PhotoView"), true, "누르면 그 자리에서 열린다");
eq(rp.includes("saves"), true, "받기 주소를 같이 받아온다");
// PDF 는 브라우저가 여는 것이 낫다
eq(rp.includes("isPdf"), true, "PDF 는 새 창으로");

if (fail) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 사진 통과");

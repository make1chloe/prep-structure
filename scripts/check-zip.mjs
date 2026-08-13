/**
 * **zip 묶기가 진짜 zip 인가** (원장님, 2026-08-11 — 「파일 여러개 한번에
 * 다운받기 가능하게해줘」).
 *
 * 규격을 직접 쓴 자리라, 시스템의 unzip 으로 **실제로 풀어서** 내용까지
 * 견준다. 우리 코드끼리만 맞으면 우리끼리만 맞는 zip 이 된다.
 *
 * 쓰는 법:  node scripts/check-zip.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeZip, crc32, uniqueNames } from "../lib/zip.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};

console.log("== 검사값 (crc32) ==");
// 널리 알려진 답과 견준다 — "123456789" 의 crc32 는 0xCBF43926 이다
eq(crc32(new TextEncoder().encode("123456789")).toString(16), "cbf43926", "교과서 값");
eq(crc32(new Uint8Array(0)).toString(16), "0", "빈 것");

console.log("\n== 겹친 이름 ==");
eq(uniqueNames(["a.pdf", "a.pdf", "a.pdf", "b.jpg"]),
   ["a.pdf", "a (2).pdf", "a (3).pdf", "b.jpg"], "확장자 앞에 (2) (3) — 확장자를 살려야 열린다");
eq(uniqueNames(["확장자없음", "확장자없음"]), ["확장자없음", "확장자없음 (2)"], "확장자가 없어도");

console.log("\n== 시스템 unzip 으로 진짜 풀리나 ==");
{
  const zip = makeZip([
    { name: "가정통신문.pdf", bytes: new TextEncoder().encode("PDF-내용-첫째") },
    { name: "시간표.jpg", bytes: new TextEncoder().encode("그림-내용") },
    { name: "시간표.jpg", bytes: new TextEncoder().encode("둘째-그림") },
  ]);
  const dir = mkdtempSync(join(tmpdir(), "zipchk-"));
  try {
    writeFileSync(join(dir, "t.zip"), zip);
    try {
      // -t 는 검사값(crc)까지 본다 — 상했으면 여기서 걸린다
      execFileSync("unzip", ["-t", join(dir, "t.zip")], { stdio: "pipe" });
      execFileSync("unzip", ["-o", join(dir, "t.zip"), "-d", dir], { stdio: "pipe" });
    } catch {
      // 맥의 Apple unzip(6.00)은 한글(UTF-8) 이름 파일을 못 만든다
      // (Illegal byte sequence). 같은 시스템 도구인 bsdtar 로 다시 푼다 —
      // 리눅스(컨테이너)에서는 위의 unzip 이 그대로 쓰인다.
      execFileSync("tar", ["-xf", join(dir, "t.zip"), "-C", dir], { stdio: "pipe" });
    }
    eq(readFileSync(join(dir, "가정통신문.pdf"), "utf8"), "PDF-내용-첫째", "한글 이름 그대로");
    eq(readFileSync(join(dir, "시간표.jpg"), "utf8"), "그림-내용", "첫째 내용");
    eq(readFileSync(join(dir, "시간표 (2).jpg"), "utf8"), "둘째-그림", "겹친 이름도 둘 다 나온다");
  } catch (e) {
    console.log(`  ✗ unzip 이 풀지 못했다 — ${e.message}`);
    fail = 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (fail) { console.log("\n❌ zip 묶기에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ zip 묶기 통과");

/** @type {import('next').NextConfig} */
export default {
  // ⚠️⚠️ `xlsx` 를 번들에 넣지 않는다 — **안 넣으면 엑셀 왕복이 런타임에 죽는다.**
  //    까닭(2026-09-02 실측): `lib/excel.js` 는 `import XLSX from "xlsx"` 로 **기본 내보내기**를
  //    받는데, `xlsx` 꾸러미의 ESM 빌드(`xlsx.mjs` — package.json 의 `module`)에는
  //    `export default` 가 **한 줄도 없다**(실측 0건). Node 로 그냥 부르면 `main`(CJS)이 잡혀
  //    되므로 `scripts/check-excel.mjs` 는 **초록인데**, 웹팩은 `module` 을 잡아 `XLSX` 가
  //    `undefined` 가 된다. 빌드는 **경고만** 내고 지나가고 진짜로 부르는 순간 터진다 —
  //      실측: `GET /api/probe-books` → `TypeError: Cannot read properties of undefined (reading 'utils')`
  //      (`makeWorkbook` 안의 `XLSX.utils.aoa_to_sheet`)
  //    → 서버 바깥 꾸러미로 두면 `require("xlsx")`(CJS)가 되어 기본 내보내기가 산다.
  //    ⚠️ 진짜 고칠 자리는 `lib/excel.js` 의 `import * as XLSX from "xlsx"` **한 낱말**이다.
  //       그 파일을 고칠 수 있는 판이 고치면 이 줄은 없어도 된다.
  serverExternalPackages: ["xlsx"],

  // ⚠️ 옛 서비스워커가 `/sw.js` 루트 스코프에 박혀 있다. 새 SW 도 같은 자리로 낸다 —
  //    스코프가 좁아지거나 옛 등록이 지워지면 **그 폰의 구독이 죽는다.**
  async headers() {
    return [{ source: "/sw.js", headers: [
      { key: "Service-Worker-Allowed", value: "/" },
      { key: "Cache-Control", value: "no-cache" },
    ]}];
  },
};

/** @type {import('next').NextConfig} */
export default {
  // ⚠️ 옛 서비스워커가 `/sw.js` 루트 스코프에 박혀 있다. 새 SW 도 같은 자리로 낸다 —
  //    스코프가 좁아지거나 옛 등록이 지워지면 **그 폰의 구독이 죽는다.**
  async headers() {
    return [{ source: "/sw.js", headers: [
      { key: "Service-Worker-Allowed", value: "/" },
      { key: "Cache-Control", value: "no-cache" },
    ]}];
  },
};

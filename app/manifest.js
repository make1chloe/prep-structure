/**
 * manifest 를 **코드로 만든다.**
 *
 * 아이콘을 원장님이 설정에서 바꿀 수 있게 되면서 (0080), 아이콘 주소가
 * 고정 파일이 아니라 `/api/icon/...` 이 됐다. 그 주소를 여기서 가리킨다.
 * 예전의 public/manifest.json 은 지웠다 — 같은 것이 두 군데 있으면
 * 언젠가 한쪽만 고치게 된다.
 */
export default function manifest() {
  return {
    name: "클로이영어",
    short_name: "클로이영어",
    start_url: "/me",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#00175c",
    icons: [
      { src: "/api/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      // 안드로이드는 아이콘을 동그랗게 잘라낸다 — 여백을 더 준 판을 따로 준다
      { src: "/api/icon/192m", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/api/icon/512m", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

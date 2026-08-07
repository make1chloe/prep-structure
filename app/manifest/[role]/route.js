import { homeFor } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * 역할마다 **다른 앱**으로 홈 화면에 담는다.
 *
 * 원장님 (2026-08-05) — 「원장용, 부모님과 학생용 3개 따로 홈 화면에 저장한 뒤
 * 각각 계정 다르게 로그인해서 테스트하면서 사용할 수 없어?」
 *
 * 담기는 것 자체는 여기서 갈라 준다. 아이콘 이름과 시작 주소가 다르면 폰은
 * **다른 앱**으로 친다 (아이콘이 세 개 생기고, 이름도 따로 뜬다).
 *
 * **다만 로그인까지 갈라지는지는 폰이 정한다.** 같은 주소(도메인)의 앱이라
 * 쿠키를 나눠 쓰는 폰에서는 한 곳에서 로그인하면 나머지도 같이 바뀐다.
 * 아이폰은 홈 화면 앱마다 따로 두는 편이지만 버전에 따라 다르다 — 그래서
 * /install 화면에서 **직접 확인하는 방법**을 알려드린다. 되는지 안 되는지를
 * 제가 단정해서 말씀드리면, 안 될 때 원장님이 헤매시게 된다.
 */
/**
 * **짧은 이름이 알림에도 쓰인다** (원장님, 2026-08-07 —
 * 「뭔가 알림제목이 이상하, from은 뭐야」).
 *
 * 아이폰은 홈 화면에 담은 앱의 알림에 「제목 — from 〈짧은 이름〉」 을 붙인다.
 * 짧은 이름이 「학부모」 라서 **「전달사항 from 학부모」** 로 읽혔다 —
 * 어머니가 보내신 것처럼 보인다. 어디서 온 알림인지가 거꾸로 된 것이다.
 *
 * 학원 이름이 앞에 와야 한다. 그리고 **「…용」** 을 붙인다 —
 * 「from 클로이 학부모」 는 여전히 「학부모가 보낸 것」 으로 읽히지만,
 * 「from 클로이 학부모용」 은 **학부모용 앱이 받았다** 로 읽힌다.
 *
 * 아이폰이 붙이는 이 말은 **누가 보냈나가 아니라 어느 앱이 받았나**다.
 * 없앨 수는 없으므로, 오해가 덜 생기게 적는다.
 * (아이콘 밑에도 이 이름이 적히므로 길면 잘린다 — 이 정도가 둘 다 된다)
 */
const ROLES = {
  principal: { name: "클로이영어 원장용", short: "클로이 원장용", role: "principal" },
  parent: { name: "클로이영어 학부모용", short: "클로이 학부모용", role: "parent" },
  student: { name: "클로이영어 학생용", short: "클로이 학생용", role: "student" },
};

export async function GET(_req, { params }) {
  const key = (params?.role || "").replace(/[^a-z]/gi, "");
  const r = ROLES[key];
  if (!r) return new Response("없는 앱", { status: 404 });

  // 시작 주소가 서로 달라야 폰이 **다른 앱**으로 친다.
  // ?app= 는 우리가 보는 표시이기도 하다 — 어느 아이콘으로 들어왔는지 안다.
  const start = `${homeFor(r.role)}?app=${key}`;

  return Response.json({
    id: `/install/${key}`,
    name: r.name,
    short_name: r.short,
    start_url: start,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#00175c",
    icons: [
      { src: "/api/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/icon/192m", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/api/icon/512m", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

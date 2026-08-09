/**
 * **영상 엑셀 올리기** (원장님, 2026-08-09 — 「영상 엑셀로 한 번에 넣을 수
 * 있게 해 줘」).
 *
 * 지금은 유튜브 주소를 한 줄씩 붙여넣는다. 문법 강의 한 단원이 스무 개면
 * 스무 번을 붙여넣어야 하고, 그 사이에 폴더를 잘못 고르면 어디에 들어갔는지
 * 찾느라 또 한참이다.
 *
 * ── 무엇이 있어야 한 줄인가 ────────────────────────────
 *
 * **주소만 있으면 된다.** 제목은 유튜브가 알고 있고(키가 있으면 받아온다),
 * 없으면 주소를 제목으로 둔다 — 나중에 「제목 받아오기」 로 채워진다.
 * 그래서 거르는 기준은 주소 하나다. 제목이 비었다고 줄을 버리면
 * **원장님이 주소만 죽 붙여넣은 파일이 통째로 사라진다.**
 *
 * 폴더는 이름으로 적는다. 없는 이름이면 그 이름으로 폴더를 만든다 —
 * 「폴더를 먼저 만들고 오세요」 라고 돌려보내면 엑셀을 쓰는 뜻이 없다.
 *
 * 여기에는 **읽기만** 둔다 (망을 안 탄다). 넣는 것은 app/videos/actions.js.
 */

const HEADER_MAP = {
  제목: "title",
  영상제목: "title",
  영상이름: "title",
  이름: "title",
  주소: "url",
  링크: "url",
  url: "url",
  URL: "url",
  유튜브: "url",
  유튜브주소: "url",
  영상주소: "url",
  폴더: "folder",
  묶음: "folder",
  분류: "folder",
  카테고리: "folder",
  메모: "note",
  비고: "note",
  설명: "note",
};

export const VIDEO_HEADERS = ["제목", "주소", "폴더", "메모"];

export const VIDEO_FIELD_LABEL = {
  title: "제목",
  url: "주소",
  folder: "폴더",
  note: "메모",
};

export function parseVideoAoA(aoa) {
  if (!Array.isArray(aoa) || aoa.length < 2) {
    return { headers: [], fields: [], rows: [] };
  }
  const headers = (aoa[0] || []).map((h) => String(h ?? "").trim());
  const fields = headers.map((h) => HEADER_MAP[h.replace(/\s/g, "")] || null);
  const rows = aoa
    .slice(1)
    .map((cells) => {
      const o = {};
      fields.forEach((f, i) => {
        if (f) o[f] = String(cells?.[i] ?? "").trim();
      });
      return o;
    })
    // **주소가 있는 줄만.** 제목은 없어도 된다 (유튜브가 알고 있다)
    .filter((o) => (o.url || "").trim() !== "");
  return { headers, fields, rows };
}

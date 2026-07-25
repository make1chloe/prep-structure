// 교재 엑셀 업로드용 파싱. 첫 줄은 열 이름(제목).

const HEADER_MAP = {
  교재명: "name",
  교재: "name",
  이름: "name",
  영역: "area",
  레벨: "target_grade",
  적정학년: "target_grade",
  대상학년: "target_grade",
  전체페이지: "total_pages",
  전체페이지수: "total_pages",
  페이지수: "total_pages",
  페이지: "total_pages",
  교재비: "price",
  가격: "price",
  비용: "price",
  단어범위: "word_range",
  구매링크: "purchase_url",
  구입링크: "purchase_url",
  구매url: "purchase_url",
  비고: "feature",
  특징: "feature",
  메모: "feature",
};

export const TEXTBOOK_HEADERS = [
  "교재명",
  "영역",
  "레벨",
  "전체페이지",
  "교재비",
  "단어범위",
  "구매링크",
  "비고",
];

export const TB_FIELD_LABEL = {
  name: "교재명",
  area: "영역",
  target_grade: "레벨",
  total_pages: "페이지",
  price: "교재비",
  word_range: "단어범위",
  purchase_url: "구매링크",
  feature: "비고",
};

export function parseTextbookAoA(aoa) {
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
    .filter((o) => (o.name || "").trim() !== "");
  return { headers, fields, rows };
}

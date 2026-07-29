// 교재 단원 엑셀 업로드용 파싱
// 열: 교재명 / 출판년도 / 대단원 / 중단원 / 소단원 / 단원명 / 활동명 / 시작페이지 / 끝페이지 / 총분량

const HEADER_MAP = {
  교재명: "textbook",
  교재: "textbook",
  출판년도: "pub_year",
  출판연도: "pub_year",
  연도: "pub_year",
  대단원: "big",
  중단원: "mid",
  소단원: "small",
  문제번호: "question_no",
  문제: "question_no",
  번호: "question_no",
  문항: "question_no",
  문항번호: "question_no",
  단원명: "name",
  활동명: "activity",
  활동: "activity",
  시작페이지: "page_start",
  시작p: "page_start",
  시작: "page_start",
  끝페이지: "page_end",
  끝p: "page_end",
  종료페이지: "page_end",
  총분량: "total_pages",
  "총분량(총페이지)": "total_pages",
  총페이지: "total_pages",
  분량: "total_pages",
};

export const UNIT_HEADERS = [
  "교재명",
  "출판년도",
  "대단원",
  "중단원",
  "소단원",
  "단원명",
  "문제번호",
  "활동명",
  "시작페이지",
  "끝페이지",
  "총분량",
];

export const UNIT_FIELD_LABEL = {
  textbook: "교재명",
  pub_year: "출판년도",
  big: "대단원",
  mid: "중단원",
  small: "소단원",
  name: "단원명",
  question_no: "문제번호",
  activity: "활동명",
  page_start: "시작p",
  page_end: "끝p",
  total_pages: "총분량",
};

const num = (v) => {
  const d = (v ?? "").toString().replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : null;
};

export function parseUnitAoA(aoa) {
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
      o.pub_year = num(o.pub_year);
      o.page_start = num(o.page_start);
      o.page_end = num(o.page_end);
      o.total_pages = num(o.total_pages);
      // 총분량이 비어 있으면 페이지 범위로 계산
      if (!o.total_pages && o.page_start && o.page_end) {
        o.total_pages = o.page_end - o.page_start + 1;
      }
      return o;
    })
    // 교재명은 반드시 있어야 하고, 단원 이름이 될 값이 하나라도 있어야 한다
    .filter((o) => (o.textbook || "").trim() !== "")
    .filter((o) =>
      [o.big, o.mid, o.small, o.name, o.question_no].some((v) => (v || "").trim() !== "")
    );

  return { headers, fields, rows };
}

// 화면 표시용: 이 줄이 만들 단원의 최종 이름과 깊이
export function unitLabel(r) {
  const leaf = r.small || r.mid || r.big || "";
  const name = (r.name || "").trim();
  const q = (r.question_no || "").trim();
  // 문제번호가 있으면 그 줄이 만드는 것은 **문제**다 (한 겹 더 아래)
  let depth = r.small ? 2 : r.mid ? 1 : 0;
  if (name) depth += 1;
  if (q) depth += 1;
  return { label: q ? `${q}번` : name || leaf, depth };
}

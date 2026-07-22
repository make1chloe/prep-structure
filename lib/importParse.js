// 엑셀/노션에서 복사한 표(탭 또는 콤마 구분)를 학생 레코드로 파싱한다.
// 첫 줄은 헤더(열 이름). 아래 이름들을 우리 앱 필드로 매핑한다.

const HEADER_MAP = {
  이름: "name",
  학생이름: "name",
  성명: "name",
  학교: "school",
  학년: "grade",
  생년월일: "birth_year",
  생년: "birth_year",
  생일: "birth_year",
  학생전화: "student_phone",
  학생연락처: "student_phone",
  학생전화번호: "student_phone",
  학부모전화: "parent_phone",
  학부모연락처: "parent_phone",
  학부모전화번호: "parent_phone",
  상태: "status",
  재원상태: "status",
  성별: "gender",
  등원시작일: "enrolled_on",
  입회일: "enrolled_on",
  등록일: "enrolled_on",
  선택과목: "electives",
  특이사항: "note",
  메모: "note",
  공지: "note",
};

const STATUS_MAP = {
  예비: "prospect",
  재원: "enrolled",
  휴원: "paused",
  퇴원: "withdrawn",
};

export const FIELD_LABEL = {
  name: "이름",
  school: "학교",
  grade: "학년",
  birth_year: "생년월일",
  student_phone: "학생전화",
  parent_phone: "학부모전화",
  status: "상태",
  gender: "성별",
  enrolled_on: "등원시작일",
  electives: "선택과목",
  note: "특이사항",
};

export function normalizeStatus(v) {
  const t = (v || "").trim();
  if (STATUS_MAP[t]) return STATUS_MAP[t];
  if (["prospect", "enrolled", "paused", "withdrawn"].includes(t)) return t;
  return "enrolled";
}

export function normalizeDate(v) {
  const t = (v || "").trim();
  if (!t) return null;
  const m = t.match(/(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function normalizeGender(v) {
  const t = (v || "").trim();
  if (!t) return null;
  if (t.startsWith("남") || t.toLowerCase() === "m") return "남";
  if (t.startsWith("여") || t.toLowerCase() === "f") return "여";
  return t;
}

// text -> { headers, fields, rows }
export function parseTable(text) {
  const lines = (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) return { headers: [], fields: [], rows: [] };

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delim).map((h) => h.trim());
  const fields = headers.map((h) => HEADER_MAP[h.replace(/\s/g, "")] || null);

  const rows = lines
    .slice(1)
    .map((line) => {
      const cells = line.split(delim);
      const obj = {};
      fields.forEach((f, i) => {
        if (f) obj[f] = (cells[i] || "").trim();
      });
      obj.status = normalizeStatus(obj.status);
      if ("birth_year" in obj) obj.birth_year = normalizeDate(obj.birth_year);
      if ("enrolled_on" in obj) obj.enrolled_on = normalizeDate(obj.enrolled_on);
      if ("gender" in obj) obj.gender = normalizeGender(obj.gender);
      return obj;
    })
    .filter((o) => (o.name || "").trim() !== "");

  return { headers, fields, rows };
}

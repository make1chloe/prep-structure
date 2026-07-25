// 반(수업) 엑셀 업로드용 파싱

const HEADER_MAP = {
  반이름: "name",
  수업이름: "name",
  반: "name",
  이름: "name",
  요일: "days",
  수업요일: "days",
  시작시간: "start_time",
  시작: "start_time",
  종료시간: "end_time",
  종료: "end_time",
  수업시간: "time_range", // "5:00-7:30" 형태를 시작/종료로 나눔
  분류: "category",
  레벨: "level",
  초중고: "school_level",
  강의실: "room",
  정원: "capacity",
  최대인원: "capacity",
};

export const CLASS_HEADERS = [
  "반이름",
  "요일",
  "수업시간",
  "분류",
  "레벨",
  "초중고",
  "강의실",
  "정원",
];

export const CLASS_FIELD_LABEL = {
  name: "반이름",
  days: "요일",
  start_time: "시작",
  end_time: "종료",
  category: "분류",
  level: "레벨",
  school_level: "초중고",
  room: "강의실",
  capacity: "정원",
};

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

// "월,수" / "월수" / "월 수" → ["월","수"]
function parseDays(v) {
  const t = (v || "").toString();
  return DAYS.filter((d) => t.includes(d));
}

// "5:00-7:30" / "17:00~19:30" → { start, end } (24시간 형식)
function parseTimeRange(v) {
  const t = (v || "").toString().trim();
  if (!t) return { start: null, end: null };
  const parts = t.split(/[-~–—]/).map((s) => s.trim());
  return { start: toTime(parts[0]), end: toTime(parts[1]) };
}

// "5:00" → "17:00" (학원 수업은 오후가 기본이므로 1~11시는 오후로 본다)
function toTime(v) {
  const t = (v || "").toString().trim();
  if (!t) return null;
  const m = t.match(/(\d{1,2})\s*[:시]\s*(\d{0,2})/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h >= 1 && h <= 11) h += 12; // 오후로 해석
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function parseClassAoA(aoa) {
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

      o.days = parseDays(o.days);
      if (o.time_range) {
        const { start, end } = parseTimeRange(o.time_range);
        o.start_time = o.start_time ? toTime(o.start_time) : start;
        o.end_time = o.end_time ? toTime(o.end_time) : end;
        delete o.time_range;
      } else {
        o.start_time = toTime(o.start_time);
        o.end_time = toTime(o.end_time);
      }
      const cap = (o.capacity || "").replace(/[^\d]/g, "");
      o.capacity = cap ? parseInt(cap, 10) : null;
      o.category = o.category || "정규반";
      return o;
    })
    .filter((o) => (o.name || "").trim() !== "");

  return { headers, fields, rows };
}

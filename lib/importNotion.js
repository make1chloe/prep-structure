// 노션에서 CSV 로 내보낸 파일을 그대로 읽는다.
// 열 이름은 노션 컬럼명을 그대로 쓰고, 없으면 건너뛴다.

// "07/20/월 김서은 DP" → { date: "2026-07-20", name: "김서은" }
export function parseTitle(title, fallbackYear) {
  const t = (title || "").toString().trim();
  const m = t.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  let date = null;
  if (m) {
    const y = fallbackYear || new Date().getFullYear();
    date = `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  // 날짜·요일·꼬리표를 떼고 남는 한글 이름
  const name =
    t
      .replace(/\d{1,2}\s*\/\s*\d{1,2}(\s*\/\s*[가-힣])?/g, " ")
      .replace(/\b(DP|하원숙제|숙제|리포트)\b/gi, " ")
      .replace(/[()[\]]/g, " ")
      .trim()
      .split(/\s+/)
      // 한자·영문이 섞인 이름도 인식 (박民준, Kevin 등)
      .find((w) => /^[가-힣\u3400-\u9FFF][가-힣\u3400-\u9FFFA-Za-z]{1,5}$/.test(w)) || "";
  return { date, name };
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k].toString().trim() !== "") {
      return row[k].toString().trim();
    }
  }
  return "";
}
function toInt(v) {
  const d = (v ?? "").toString().replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : null;
}
// 노션 다중선택은 "독해,문법" 처럼 콤마로 나온다
function multi(v) {
  return (v || "")
    .toString()
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

const ATT_MAP = {
  정시출석: "present",
  정시: "present",
  지각: "late",
  "지각(학교일정)": "late",
  조퇴: "early_leave",
  결석: "absent",
  보강: "makeup",
  온라인: "online",
  숙제검사: "present",
};

// 노션의 -단어T / -문장T 는 **틀린 개수**다. 우리는 맞은 개수로 저장하므로 전체에서 뺀다.
function correctFromWrong(wrong, total) {
  if (total === null) return null;
  if (wrong === null) return total;
  return Math.max(0, total - wrong);
}

/** 데일리리포트 CSV 한 줄 → 우리 구조 */
export function parseReportRow(row, year) {
  const title = pick(row, ["제목", "이름", "Name"]);
  const { date: fromTitle, name } = parseTitle(title, year);
  const date = pick(row, ["수업날짜", "date:수업날짜:start", "날짜"]) || fromTitle;

  const wordWrong = toInt(pick(row, ["-단어T"]));
  const wordTotal = toInt(pick(row, ["/단어T", "단어전체개수"]));
  const sentWrong = toInt(pick(row, ["-문장T", "\b-문장T"]));
  const sentTotal = toInt(pick(row, ["/문장T"]));

  return {
    name,
    date: (date || "").slice(0, 10),
    attendance: ATT_MAP[pick(row, ["출결"])] || null,
    wordWrong,
    sentWrong,
    wordCorrect: correctFromWrong(wordWrong, wordTotal),
    wordTotal,
    sentCorrect: correctFromWrong(sentWrong, sentTotal),
    sentTotal,
    notice: pick(row, ["공지"]),
    result: pick(row, ["결과"]),
    done: multi(pick(row, ["완료O"])),
    weak: multi(pick(row, ["미흡△"])),
    missing: multi(pick(row, ["미제출X"])),
    progress: pick(row, ["개별진도", "특강진도"]),
    written: pick(row, ["[리포트]완료"]) === "Yes" || pick(row, ["[리포트]완료"]) === "__YES__",
  };
}

// 하원숙제 열 이름 → 우리 학습 항목 이름
export const HW_COLUMNS = [
  ["단어숙제", "단어"],
  ["독해숙제", "독해"],
  ["문법숙제", "문법"],
  ["노트숙제", "노트"],
  ["듣기숙제", "듣기"],
  ["영작숙제", "영작"],
  ["테스트숙제", "테스트"],
  ["내신온라인숙제", "내신온라인"],
  ["시험대비", "시험대비"],
  ["특강숙제", "특강숙제"],
];

/** 하원숙제 CSV 한 줄 → 우리 구조 */
export function parseHomeworkRow(row, year) {
  const title = pick(row, ["제목", "이름", "Name"]);
  const { date: fromTitle, name } = parseTitle(title, year);
  const date = pick(row, ["수업날짜", "date:수업날짜:start"]) || fromTitle;
  const checkOn = pick(row, ["숙제검사일", "date:숙제검사일:start"]);

  const items = [];
  HW_COLUMNS.forEach(([col, itemName]) => {
    const v = pick(row, [col]);
    if (v) items.push({ name: itemName, detail: v });
  });

  const yes = (v) => v === "Yes" || v === "__YES__" || v === "true";
  return {
    name,
    date: (date || "").slice(0, 10),
    checkOn: (checkOn || "").slice(0, 10) || null,
    notice: pick(row, ["공지"]),
    items,
    sent: yes(pick(row, ["발송완료"])),
    checked: yes(pick(row, ["검사완료"])),
  };
}

/** 시트(AoA) → 객체 배열 */
export function sheetToRows(aoa) {
  if (!aoa || aoa.length === 0) return [];
  const headers = (aoa[0] || []).map((h) => (h ?? "").toString().trim());
  return aoa
    .slice(1)
    .filter((r) => (r || []).some((c) => (c ?? "").toString().trim() !== ""))
    .map((r) => {
      const o = {};
      headers.forEach((h, i) => {
        if (h) o[h] = r[i];
      });
      return o;
    });
}

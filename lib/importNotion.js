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
  const date =
    parseDate(pick(row, ["수업날짜", "date:수업날짜:start", "날짜"]), year) || fromTitle;

  const wordWrong = toInt(pick(row, ["-단어T"]));
  const wordTotal = toInt(pick(row, ["/단어T", "단어전체개수"]));
  const sentWrong = toInt(pick(row, ["-문장T", "\b-문장T"]));
  const sentTotal = toInt(pick(row, ["/문장T"]));

  return {
    name,
    date: date || "",
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
  const date = parseDate(pick(row, ["수업날짜", "date:수업날짜:start"]), year) || fromTitle;
  const checkOn = parseDate(pick(row, ["숙제검사일", "date:숙제검사일:start"]), year);

  const items = [];
  HW_COLUMNS.forEach(([col, itemName]) => {
    const v = pick(row, [col]);
    if (v) items.push({ name: itemName, detail: v });
  });

  const yes = (v) => v === "Yes" || v === "__YES__" || v === "true";
  return {
    name,
    date: date || "",
    checkOn: checkOn || null,
    notice: pick(row, ["공지"]),
    items,
    sent: yes(pick(row, ["발송완료"])),
    checked: yes(pick(row, ["검사완료"])),
  };
}

// ------------------------------------------------------------------
// 일정 · 할일
//
// 두 가지를 다 받는다
//   · 노션 학사일정DB CSV  (이름 / 날짜 / 3학교DB)
//   · 직접 만든 엑셀       (제목 / 종류 / 분류 / 날짜 / 끝날 / 메모)
// 열 이름이 다르면 없는 것으로 보고 넘어간다.
// ------------------------------------------------------------------

// "2026-05-07", "05/07", "2026. 5. 7." 을 모두 받는다
export function parseDate(v, fallbackYear) {
  const s = (v ?? "").toString().trim();
  if (!s) return null;

  // 노션을 한국어로 쓰면 "2025년 6월 2일" 로 나온다. 뒤에 시간이 붙기도 한다
  const ko = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (ko) {
    return `${ko[1]}-${ko[2].padStart(2, "0")}-${ko[3].padStart(2, "0")}`;
  }
  // 2025-06-02 · 2025/6/2 · 2025. 6. 2.
  const iso = s.match(/(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  // "June 2, 2025" 같은 영어 표기
  const en = s.match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s*(\d{4})/i
  );
  if (en) {
    const mm =
      ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
        en[1].toLowerCase()
      ) + 1;
    return `${en[3]}-${String(mm).padStart(2, "0")}-${en[2].padStart(2, "0")}`;
  }
  // 연도 없이 "6/2" 만 있는 경우
  const md = s.match(/^(\d{1,2})[-./](\d{1,2})/);
  if (md) {
    const y = fallbackYear || new Date().getFullYear();
    return `${y}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
  }
  return null;
}

// 제목에서 종류를 짐작한다 (엑셀에 '종류' 열이 없을 때)
function guessKind(title, hasRange) {
  const t = (title || "").toString();
  if (hasRange) return "schedule";
  if (/고사|시험|방학|개학|종업|휴업|동아리|체험|축제|수학여행|모의고사|창체|직보|여행|결석/.test(t)) {
    return "schedule";
  }
  return "todo";
}

function guessCategory(title) {
  const t = (title || "").toString();
  if (/고사|시험|모의고사|수행/.test(t)) return "시험";
  if (/방학|개학|종업|휴업|재량/.test(t)) return "학사일정";
  if (/동아리|체험|축제|수학여행|창체|건강|체육/.test(t)) return "학교행사";
  if (/결석|여행|보강/.test(t)) return "출결";
  return "기타";
}

/** 일정·할일 CSV 한 줄 → 우리 구조 */
export function parseTaskRow(row, year) {
  const title = pick(row, ["제목", "이름", "할일", "일정", "Name", "title"]);
  const from =
    parseDate(pick(row, ["날짜", "date:날짜:start", "마감일", "시작", "due", "일자"]), year) || null;
  const to =
    parseDate(pick(row, ["끝날", "date:날짜:end", "종료", "끝", "end"]), year) || null;

  const kindRaw = pick(row, ["종류", "구분", "kind"]);
  const kind =
    /할일|todo/i.test(kindRaw) ? "todo"
    : /일정|schedule/i.test(kindRaw) ? "schedule"
    : guessKind(title, !!to);

  return {
    title: title.trim(),
    kind,
    category: pick(row, ["분류", "카테고리", "category"]) || guessCategory(title),
    due_on: from,
    end_on: to && to !== from ? to : null,
    note: pick(row, ["메모", "note", "비고", "내용"]) || null,
    school: pick(row, ["학교", "3학교DB"]) || null,
  };
}

// ------------------------------------------------------------------
// 결석 · 보강 (노션 보강문자DB)
//
//   결석날짜는 노션에서 '생성 일시' 라서 실제 결석일과 다를 수 있다.
//   제목이 "07/14/화 장원우 결석" 형태면 거기서 날짜를 먼저 읽고,
//   없을 때만 결석날짜를 쓴다.
// ------------------------------------------------------------------
export function parseAbsenceRow(row, year) {
  const title = pick(row, ["제목", "이름", "Name"]);
  const { date: fromTitle, name: fromTitleName } = parseTitle(title, year);

  // 관계 열에는 학생 이름이 들어온다 (여러 명이면 첫 번째)
  const rel = pick(row, ["3재원생DB", "재원생", "학생", "학생이름"]);
  const name = (rel.split(",")[0] || "").trim() || fromTitleName;

  const created = parseDate(pick(row, ["결석날짜", "생", "생성 일시"]), year);
  const makeup = parseDate(pick(row, ["보강날짜", "date:보강날짜:start"]), year);

  const yes = (v) => v === "Yes" || v === "__YES__" || v === "true";
  const why = multi(pick(row, ["사유"]));

  return {
    name,
    // 제목에 날짜가 있으면 그게 진짜 결석일
    absentOn: fromTitle || created,
    absentGuessed: !fromTitle,          // 생성일로 때운 것 — 화면에 표시해준다
    makeupOn: makeup,
    reason: why.join(", ") || null,
    // '결석보강' 계열만 진짜 결석이다. 재시험·추가학습은 결석이 아니다
    isAbsence: why.some((w) => w.includes("결석")) || /결석/.test(title),
    done: yes(pick(row, ["보강완료"])),
    none: yes(pick(row, ["보강없음"])),
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

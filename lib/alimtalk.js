// 알림톡 변수 연결
//
// 알림톡은 **승인받은 템플릿**으로만 나간다. 본문은 못 바꾸고 #{변수} 만 채운다.
// 우리 앱은 문구를 통째로 만들어 두었으므로, 그 값을 템플릿 변수에 **붙여주면** 된다.
//
//   설정 → 문자 문구 → (문자 하나) → 알림톡
//     #{학생명}  ←  {{학생명}}
//     #{내용}    ←  {{본문}}
//
// 붙이는 일은 설정 화면에서 하고, 코드는 붙여둔 대로 값을 넣기만 한다.

/** 앱이 내어줄 수 있는 값들 — 설정 화면의 고르는 목록이기도 하다 */
export const SOURCES = [
  ["{{학원명}}", "학원 이름"],
  ["{{학생명}}", "학생 이름"],
  ["{{날짜}}", "그 날짜 (7월 27일)"],
  ["{{본문}}", "앱이 만든 문구 전체"],
  ["{{본문내용}}", "앱이 만든 문구에서 맨 윗줄(제목)을 뺀 것"],
  ["{{학원전화}}", "설정에 적어둔 전화"],
  ["{{학원주소}}", "설정에 적어둔 주소"],
];

/**
 * 앱이 지금 내어줄 수 있는 값.
 * 안내 문자처럼 내가 쓰는 문자는 여기에 그 문자의 {{변수}} 값들을 더해서 넘긴다.
 */
export function autoValues({ academy, name, date, body, phone, address } = {}) {
  const text = body || "";
  const lines = text.split("\n");
  // 맨 윗줄이 제목([학원명] … 안내)이면 그 줄과 뒤따르는 빈 줄을 뺀다
  let rest = lines;
  if (lines[0]?.startsWith("[")) {
    rest = lines.slice(1);
    while (rest[0] === "") rest.shift();
  }
  return {
    "{{학원명}}": academy || "",
    "{{학생명}}": name || "",
    "{{날짜}}": date || "",
    "{{본문}}": text,
    "{{본문내용}}": rest.join("\n"),
    "{{학원전화}}": phone || "",
    "{{학원주소}}": address || "",
  };
}

/**
 * 연결해둔 대로 알림톡 변수를 채운다.
 * @param map    { "#{이름}": "{{학생명}}" }  — 설정에 저장된 연결
 * @param values { "{{학생명}}": "김O윤" }    — 지금 값
 * @returns      { "#{이름}": "김O윤" }
 *
 * 값이 비어 있으면 그 변수는 뺀다. 알림톡은 빈 변수를 싫어한다.
 */
export function buildVariables(map = {}, values = {}) {
  const out = {};
  Object.entries(map || {}).forEach(([slot, src]) => {
    if (!slot) return;
    // 연결하지 않고 고정 문구를 적어둔 경우도 그대로 쓴다
    const v = src in values ? values[src] : src;
    if (v === undefined || v === null || `${v}`.trim() === "") return;
    out[slot] = `${v}`;
  });
  return out;
}

/** 템플릿의 #{변수} 를 찾아낸다 — 설정 화면에서 연결할 칸을 만들 때 쓴다 */
export function slotsIn(text = "") {
  const out = [];
  (text || "").replace(/#\{\s*([^}]+?)\s*\}/g, (_, k) => {
    const slot = `#{${k.trim()}}`;
    if (!out.includes(slot)) out.push(slot);
    return "";
  });
  return out;
}

/** 이 문자를 알림톡으로 보낼 준비가 됐나 */
export function ready(tpl, pfId) {
  return !!(pfId && tpl?.alimtalk_id);
}

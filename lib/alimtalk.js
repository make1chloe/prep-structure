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

/**
 * 앱이 보내는 것들 — **어느 것이 반복이고 어느 것이 아닌가.**
 *
 * 원장님 규칙: **반복되는 것은 알림톡, 그때그때 다른 것은 문자.**
 *   반복  매 수업·매 달 같은 모양으로 나간다 → 템플릿을 승인받아 알림톡
 *   불규칙 그때 쓰는 내용이라 모양이 없다 → 문자
 *
 * 왜 그런가 (알림톡의 성질이 그렇다)
 *   알림톡은 **승인받은 문구로만** 나간다. 본문을 마음대로 못 쓰고 #{변수} 만
 *   채운다. 그래서 「같은 모양이 반복되는 것」만 알림톡이 될 수 있다.
 *   공지처럼 매번 다른 글은 애초에 템플릿을 만들 수가 없다.
 *
 * key 는 message_templates.key 와 같아야 한다 (그 줄에 템플릿 코드를 붙인다).
 */
export const SEND_KINDS = [
  { key: "report",   label: "데일리리포트", repeat: true,  when: "수업 있는 날마다 학부모께" },
  { key: "homework", label: "숙제 문자",    repeat: true,  when: "수업 있는 날마다 학생에게" },
  { key: "late",     label: "늦은 귀가 안내", repeat: true, when: "늦게 갈 때 학부모께" },
  { key: "monthly",  label: "월간리포트",   repeat: true,  when: "달마다 학부모께" },
  { key: null,       label: "공지 · 안내문자", repeat: false, when: "그때그때 — 내용이 매번 다릅니다" },
];

/**
 * 지금 무엇이 알림톡으로 나가고 무엇이 문자로 나가나.
 *
 * @param rows message_templates 줄들 (key · alimtalk_id 를 들고 있다)
 * @param pfId 발신프로필. 없으면 **전부 문자로 나간다**
 * @returns [{ key, label, when, repeat, channel, why }]
 *          channel: alimtalk | sms
 */
export function channelPlan(rows = [], pfId = "") {
  const byKey = new Map((rows || []).filter((r) => r.key).map((r) => [r.key, r]));
  return SEND_KINDS.map((k) => {
    if (!k.repeat) {
      return { ...k, channel: "sms", why: "내용이 매번 달라 템플릿을 만들 수 없어요." };
    }
    const tpl = byKey.get(k.key);
    if (!pfId) {
      return { ...k, channel: "sms", tpl, why: "발신프로필(pfId)이 없어서 전부 문자로 나갑니다." };
    }
    if (!tpl) {
      return { ...k, channel: "sms", why: "이 문구가 아직 없어요. SQL 을 실행하면 생깁니다." };
    }
    if (!tpl.alimtalk_id) {
      return { ...k, channel: "sms", tpl, why: "템플릿 코드를 아직 안 붙였어요." };
    }
    return { ...k, channel: "alimtalk", tpl, why: `템플릿 ${tpl.alimtalk_id}` };
  });
}

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

/**
 * 앱이 내어줄 수 있는 값들 — 설정 화면의 고르는 목록이기도 하다.
 *
 * **묶음으로 나눈다.** 한 줄로 죽 늘어놓으면 {{본문}} 과 {{본문내용}} 이
 * 나란히 붙어서 무엇이 다른지 알 수가 없다. 성격이 다른 것은 갈라 놓고,
 * 헷갈리는 짝은 **예시로** 구별해준다.
 */
export const SOURCE_GROUPS = [
  {
    label: "누구 · 언제",
    items: [
      ["{{학생명}}", "학생 이름", "김서은"],
      ["{{날짜}}", "그 날짜", "7월 27일"],
      ["{{학원명}}", "학원 이름", "클로이영어"],
    ],
  },
  {
    label: "문구 통째로",
    hint: "템플릿에 큰 칸 하나만 있을 때",
    items: [
      ["{{본문}}", "앱이 만든 문구 전체", "[클로이영어] 김서은 학생 …\\n· 출결: 정시 등원 …"],
      ["{{본문내용}}", "제목 줄을 뺀 나머지", "· 출결: 정시 등원 …"],
    ],
  },
  {
    label: "수업 기록",
    hint: "데일리리포트가 아는 것",
    kinds: ["report"],
    items: [
      ["{{출결}}", "출결", "정시 등원"],
      ["{{단어시험}}", "단어 테스트 결과", "90% (2개 틀림)"],
      ["{{문장시험}}", "문장 테스트 결과", "85% (3개 틀림)"],
      ["{{숙제검사}}", "숙제 검사 결과", "단어 완료 / 워크북 보충 필요"],
      ["{{진도}}", "그날 나간 진도", "리딩튜터 Unit 5"],
      ["{{태도}}", "수업 태도", "⭐⭐⭐⭐"],
      ["{{학부모공지}}", "그날 학부모님께 적은 공지", "다음주 시험 대비 시작합니다"],
    ],
  },
  {
    label: "숙제",
    hint: "숙제 문자가 아는 것",
    kinds: ["report", "homework"],
    items: [
      ["{{다음숙제}}", "다음 수업 숙제 (줄바꿈)", "독해 — Unit 6, p.30~35\n단어 — Day 12"],
      ["{{숙제한줄}}", "다음 수업 숙제 (한 줄)", "독해 Unit 6, 단어 Day 12"],
      ["{{보충숙제}}", "미제출·미흡한 숙제", "워크북 미제출"],
    ],
  },
  {
    label: "늦은 귀가",
    hint: "하원 안내가 아는 것",
    kinds: ["late"],
    items: [
      ["{{하원사유}}", "왜 늦게 가는지", "단어 재시험(70%), 워크북 마무리"],
      ["{{하원시각}}", "예상 하원 시각", "21:30"],
    ],
  },
  {
    label: "학원 정보",
    items: [
      ["{{학원전화}}", "설정에 적어둔 전화", "032-000-0000"],
      ["{{학원주소}}", "설정에 적어둔 주소", "인천 연수구 …"],
    ],
  },
];

/** 한 줄 목록 — 예전 코드가 쓰던 모양 그대로 (짝 [값, 설명]) */
export const SOURCES = SOURCE_GROUPS.flatMap((g) => g.items.map(([v, d]) => [v, d]));

/**
 * **이 문자가 채울 수 있는 것만** 보여준다.
 *
 * 늦은 귀가 안내에 {{단어시험}} 을 붙여봐야 그 문자는 그 값을 모른다.
 * 목록에 있으면 붙이게 되고, 붙이면 빈 채로 나간다 — 그러면 왜 비었는지
 * 알 수가 없다. 애초에 안 보이는 편이 낫다.
 *
 * @param key message_templates.key (report | homework | late | monthly)
 *            내가 쓰는 문자(key 없음)는 그날 기록을 모르므로 공통 것만 준다.
 */
export function sourcesFor(key) {
  return SOURCE_GROUPS.filter((g) => !g.kinds || (key && g.kinds.includes(key)));
}

/** 값 하나의 설명·예시 — 고른 뒤에 밑에 보여준다 */
export function describeSource(v) {
  for (const g of SOURCE_GROUPS) {
    const hit = g.items.find(([k]) => k === v);
    if (hit) return { group: g.label, desc: hit[1], example: hit[2] || "" };
  }
  return null;
}

/**
 * 앱이 지금 내어줄 수 있는 값.
 * 안내 문자처럼 내가 쓰는 문자는 여기에 그 문자의 {{변수}} 값들을 더해서 넘긴다.
 */
export function autoValues({ academy, name, date, body, phone, address, parts } = {}) {
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
    // 템플릿이 잘게 나뉘어 있을 때 쓰는 조각들 (lib/reportText 의 reportParts).
    // 통짜 본문과 **같은 값에서 나온다** — 문자와 알림톡이 어긋나면 안 된다.
    ...(parts || {}),
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
  const known = new Set(SOURCES.map(([v]) => v));
  Object.entries(map || {}).forEach(([slot, src]) => {
    if (!slot) return;
    let v;
    if (src in values) {
      v = values[src];
    } else if (known.has(src)) {
      // **앱의 값인데 그날은 비어 있는 것.** 예전에는 여기서 소스 이름을
      // 그대로 값으로 썼다 — 문장시험을 안 본 날 학부모님께
      // 「{{문장시험}}」 이라는 글자가 나갈 뻔했다. 비면 그냥 뺀다.
      v = "";
    } else {
      // 목록에 없는 것은 **직접 적어둔 고정 문구**다. 그대로 쓴다
      v = src;
    }
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

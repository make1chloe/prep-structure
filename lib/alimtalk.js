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
export function sourcesFor(key, body = "") {
  const base = SOURCE_GROUPS.filter((g) => !g.kinds || (key && g.kinds.includes(key)));
  if (key) return base;

  // 내가 쓰는 문자는 **자기 본문에 적어둔 {{변수}}** 를 쓴다
  // (교재 구매 안내의 {{교재목록}}, 지각 안내의 {{시간}} …).
  // 그 값들은 보낼 때 채워지므로 알림톡 칸에도 그대로 붙일 수 있다.
  const mine = [...new Set((body || "").match(/\{\{[^}]+\}\}/g) || [])]
    .filter((v) => !SOURCES.some(([k]) => k === v));
  if (mine.length === 0) return base;
  return [
    base[0],
    {
      label: "이 문자의 값",
      hint: "본문에 적어둔 것 — 보낼 때 채웁니다",
      items: mine.map((v) => [v, "이 문자에서 채우는 값", ""]),
    },
    ...base.slice(1),
  ];
}

/**
 * 미리보기용 예시값 — **보내면 이렇게 나갑니다** 를 보여주는 데 쓴다.
 * 이름만 봐서는 {{본문}} 과 {{본문내용}} 을 구별할 수 없다.
 */
export const EXAMPLE = Object.fromEntries(
  SOURCE_GROUPS.flatMap((g) => g.items.map(([v, , ex]) => [v, ex || ""]))
);

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
  Object.entries(map || {}).forEach(([slot, src]) => {
    if (!slot) return;
    const v = fillTemplate(src, values);
    if (!v.trim()) return;          // 빈 변수는 아예 뺀다 (알림톡이 싫어한다)
    out[slot] = v;
  });
  return out;
}

/**
 * 한 칸에 **여러 값을 합쳐** 넣는다.
 *
 * 원장님은 노션에서 수식으로 여러 값을 이어붙여 하나의 변수로 쓰셨다.
 * 알림톡 템플릿도 그렇다 — #{내용} 한 칸에 출결·단어·숙제를 다 넣는 식이다.
 * 그래서 붙이는 값을 **하나만 고르는 것**이 아니라 글로 둔다.
 *
 *   "{{출결}} · {{단어시험}}"        → "정시 등원 · 90% (2개 틀림)"
 *   "출결 {{출결}}\n단어 {{단어시험}}" → 줄마다 하나씩
 *   "문의 032-000-0000"              → 변수가 없으면 그대로 (고정 문구)
 *
 * **빈 값이 있으면 그 자리를 접는다.**
 *   문장시험을 안 본 날 「정시 등원 ·  」 처럼 구분자만 남으면 안 된다.
 *   변수가 있던 줄인데 전부 비었으면 **그 줄을 통째로 뺀다.**
 */
export function fillTemplate(tmpl, values = {}) {
  const text = tmpl === undefined || tmpl === null ? "" : `${tmpl}`;
  if (!text) return "";

  const out = [];
  for (const line of text.split("\n")) {
    const slots = line.match(/\{\{[^}]*\}\}/g) || [];
    if (slots.length === 0) { out.push(line); continue; }

    let filled = line;
    let any = false;
    for (const s of slots) {
      // 모르는 변수는 **빈 것**으로 본다. 이름이 그대로 나가면
      // 학부모님께 「{{문장시험}}」 이라는 글자가 간다.
      const raw = s in values ? values[s] : "";
      const v = raw === undefined || raw === null ? "" : `${raw}`;
      if (v.trim()) any = true;
      filled = filled.split(s).join(v);
    }
    if (!any) continue;                      // 이 줄은 통째로 뺀다
    out.push(tidySeparators(filled));
  }
  return out.join("\n").trim();
}

/** 값이 빠져서 덩그러니 남은 구분자를 정리한다 */
function tidySeparators(s) {
  return s
    .replace(/[ \t]{2,}/g, " ")                       // 연속 공백
    .replace(/(\s*[·,/|—-]\s*){2,}/g, (m) => m.trim().slice(0, 1) + " ")  // 구분자 연달아
    .replace(/^\s*[·,/|—-]\s*/, "")                   // 맨 앞 구분자
    .replace(/\s*[·,/|—-]\s*$/, "")                   // 맨 뒤 구분자
    .trim();
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
 * **재원생에게 가는 문구.** 이것들은 전부 앱으로 나간다.
 *
 * 화면(안내 문자)에서 「재원생」 탭으로 고르는 것과 같은 목록이다 —
 * 두 군데에 적어두면 언젠가 한쪽만 고치게 된다.
 */
export const TO_STUDENT_KINDS = ["book", "makeup", "exam", "late_in"];

/**
 * 지금 무엇이 어디로 나가나.
 *
 * **받는 사람이 정한다** (원장님, 2026-08-06).
 *   재원생 · 그 학부모 → **앱.** 문자·알림톡은 한 통도 안 나간다.
 *   신규 상담         → 문자, 템플릿 코드가 붙어 있으면 알림톡.
 *
 * (그 전에는 문구마다 「템플릿 코드가 붙었으면 알림톡」 이었다. 지금은 그보다
 *  앞에 오는 규칙이 하나 생긴 것이다 — 앱을 갖고 계신 분께는 앱으로 간다.
 *  교재·보강·늦은 귀가 안내에 붙여둔 템플릿 코드는 그대로 두어도 된다.
 *  안 쓰일 뿐이고, 나중에 규칙이 바뀌면 다시 쓰인다.)
 *
 * @param rows message_templates 줄들 (name · key · kind · alimtalk_id)
 * @param pfId 발신프로필. 없으면 상담 문자는 **전부 문자로 나간다**
 */
export function channelPlan(rows = [], pfId = "") {
  const when = {
    report: "수업 있는 날마다 학부모께",
    homework: "수업 있는 날마다 학생에게",
    late: "늦게 갈 때 학부모께",
    monthly: "달마다 학부모께",
  };
  return (rows || [])
    .filter((r) => r.active !== false)
    .map((r) => {
      const base = {
        id: r.id,
        key: r.key || null,
        label: r.name || "(이름 없음)",
        when: r.key ? when[r.key] || "" : "발송 → 안내 문자에서 골라 보냅니다",
        auto: !!r.key,          // 앱이 본문을 만드는 것인가
        tpl: r,
      };
      // 앱이 본문을 만드는 것(리포트·숙제·하원·월간)은 전부 재원생 학부모께 간다
      if (r.key || TO_STUDENT_KINDS.includes(r.kind)) {
        return {
          ...base,
          channel: "app",
          why: "재원생·학부모께는 앱 공지와 알림으로 나갑니다 (문자 안 씀).",
        };
      }
      if (!pfId) {
        return { ...base, channel: "sms", why: "발신프로필(pfId)이 없어서 문자로 나갑니다." };
      }
      if (!r.alimtalk_id) {
        return { ...base, channel: "sms", why: "템플릿 코드를 아직 안 붙였어요." };
      }
      return { ...base, channel: "alimtalk", why: `템플릿 ${r.alimtalk_id}` };
    });
}

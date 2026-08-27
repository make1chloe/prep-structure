/**
 * **공지 다섯 갈래** — 이름과 성질을 여기 한 곳에만 적는다.
 *
 * 원장님 (2026-08-07) — 「공지를 다시 세분화할게」
 *   · 학생 숙제 문자에 포함되는 공지
 *   · 학생 필요시 불규칙 공지
 *   · 학부모 데일리리포트에 포함되는 공지
 *   · 학부모 불규칙 공지
 *   · 수업시간 중 대면으로 전달사항
 *
 * ── 왜 나누나 ────────────────────────────────────────────
 *
 * 예전에는 두 갈래(`deliver` · `notice`)였는데, `deliver` 하나가 **두 가지
 * 일**을 하고 있었다 — 수업 중 얼굴 보고 말하는 메모이면서, 동시에 그날
 * 숙제 안내에 실려 나가는 글이었다. 그래서 「이건 나가는 거야 안 나가는
 * 거야」 를 매번 다시 생각해야 했다.
 *
 * 그리고 **지금 당장 알려야 하는 일**을 적을 자리가 아예 없었다. 오늘
 * 휴원, 지금 오지 마세요 — 이건 리포트에 실어 보낼 수가 없다. 그래서
 * 발송 화면으로 건너가서 따로 보내셨다. 자리가 없으니 동선이 꼬였다.
 *
 * ── 이름 (원장님이 고르신 것) ────────────────────────────
 *
 *   숙제 공지     학생 · 숙제 안내 문자에 실림   (따로 안 울림)
 *   학생 알림     학생 · 지금 바로              (울림)
 *   리포트 공지   학부모 · 데일리리포트에 실림   (따로 안 울림)
 *   학부모 알림   학부모 · 지금 바로            (울림)
 *   수업 메모     아무 데도 안 나감 · 하원 전 체크
 *
 * **울리는 것과 안 울리는 것을 이름으로 갈랐다.** 「공지」 로 끝나면
 * 실려 나가고, 「알림」 으로 끝나면 지금 울린다. 「메모」 는 안 나간다.
 */

export const NOTICE_KINDS = [
  {
    key: "homework",
    label: "숙제 공지",
    to: "student",
    push: false,
    hint: "그날 숙제 안내 문자·앱에 함께 나갑니다. 따로 알림은 울리지 않습니다.",
  },
  {
    key: "alert_student",
    label: "학생 알림",
    to: "student",
    push: true,
    hint: "지금 바로 학생 앱에 알림이 울립니다. 오늘 휴원처럼 당장 알아야 할 일에만 쓰세요.",
  },
  {
    key: "notice",
    label: "리포트 공지",
    to: "parent",
    push: false,
    hint: "그날 데일리리포트에 함께 나갑니다. 따로 알림은 울리지 않습니다.",
  },
  {
    key: "alert_parent",
    label: "학부모 알림",
    to: "parent",
    push: true,
    hint: "지금 바로 학부모 앱에 알림이 울립니다. 리포트를 기다릴 수 없는 일에만 쓰세요.",
  },
  {
    key: "memo",
    label: "수업 메모",
    to: "staff",
    push: false,
    hint: "아무 데도 안 나갑니다. 수업 중 얼굴 보고 말할 것 — 하원 전에 전달했는지 체크합니다.",
  },
];

/**
 * **옛 이름 `deliver` 를 어떻게 다루나.**
 *
 * `deliver` 는 위의 「숙제 공지」 와 「수업 메모」 를 겸하고 있었다.
 * 이미 적혀 있는 줄들이 있으니, 그것들은 **예전 그대로** 둔다 —
 * 체크 목록에도 뜨고, 숙제 안내에도 실린다. 새로 적는 것만 갈라진다.
 *
 * 표를 고치지 않는다 (SQL 없음). 옛 줄을 한쪽으로 몰아버리면 오늘
 * 적어두신 것이 조용히 사라진다.
 */
export const LEGACY = "deliver";

/** 하원 전 체크 목록에 뜨는가 (수업 메모 · 옛 deliver) */
export function isMemo(kind) {
  return kind === "memo" || kind === LEGACY;
}

/** 숙제 안내에 실리는가 (숙제 공지 · 옛 deliver) */
export function inHomework(kind) {
  return kind === "homework" || kind === LEGACY;
}

/** 적는 즉시 울리는가 */
export function isAlert(kind) {
  return kind === "alert_student" || kind === "alert_parent";
}

/**
 * **아이·어머니 화면에 뜨나.**
 *
 * 「수업 메모」 는 어디에도 안 뜬다 — 원장님이 교실에서 말하려고 적어둔
 * 것이라, 아이가 앱에서 먼저 읽으면 그 말을 할 이유가 없어진다.
 * (옛 `deliver` 는 아이 화면에 떴었다. 겸하고 있었으므로 그대로 둔다)
 *
 * 학부모용은 아이에게 안 보인다 (0050 과 같은 이유 — 어머니께 드리는 말이
 * 아이 화면에 뜨면 그 자리에서 집안 이야기가 된다).
 */
export function showsTo(kind, role) {
  if (kind === "memo") return false;
  if (role === "parent") return true;
  return kind === "homework" || kind === "alert_student" || kind === LEGACY;
}

/** 표에 넣어도 되는 값인가 — 모르는 값이 오면 가장 안전한 쪽(안 나감)으로 */
export function safeKind(key) {
  if (NOTICE_KINDS.some((k) => k.key === key)) return key;
  return "memo";
}

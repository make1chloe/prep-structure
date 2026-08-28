/**
 * **보냈나 · 열어봤나 — 아이콘 규칙 한 벌** (원장님 2026-08-28 —
 * 「정보 표시에 아이콘? 이모지?를 적극 활용해. 선생님이 리포트를
 *  발송했는지, 학부모가 열람했는지 여부를 아이콘으로 표시해주는 거야」).
 *
 * 왜 여기 한 벌인가
 *   같은 뜻이 화면마다 다른 모양이면 원장님이 화면마다 뜻을 새로 배운다.
 *   지금도 「보냄」 이 발송 탭·다시 보내기 탭·월간·하원 안내 네 자리에
 *   따로 적혀 있었다 (발송 실측 2026-08-28). 규칙은 한 곳에 두고
 *   화면은 그려주기만 한다 (원칙 1 · check-dup ONE_PLACE).
 *
 * 지키는 것
 *   1. **아이콘만으로 뜻을 나르지 않는다.** 늘 말(label)이 붙고,
 *      마우스를 올리면 더 긴 말(title)이 나온다 (화면 규칙 2).
 *   2. **색만으로 뜻을 나르지 않는다** (노안 규칙 · 화면 규칙 3).
 *      초록=됨 · 회색=아직 · 빨강=안 됨. 색을 못 봐도 아이콘과 말이 남는다.
 *   3. **「안 봄」 이 「무시했다」 로 읽히면 안 된다.** 폰 알림만 보고 앱에
 *      안 들어오시는 경우가 많다. 그래서 「안 봄」 이 아니라 **「아직」**,
 *      마우스를 올리면 왜 그럴 수 있는지까지 말해준다.
 *   4. **「없다」 와 「못 읽었다」 를 구별한다** (A25). 0180 SQL 을 아직
 *      안 돌린 DB 에서는 「아직」 이 아니라 **「열람 모름」** 이다 —
 *      안 본 것처럼 그리면 화면이 거짓말을 한다.
 *   5. **없는 것은 안 그린다** (A11). 안 보낸 리포트에 열람을 묻지 않는다.
 */

/** M/D HH:MM — 짧게 (resend 화면이 쓰던 모양 그대로) */
export function markTime(at) {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * **보냈나** — daily_reports.sent_at · homework_sent_at · late_sent_at ·
 * monthly_reports.sent_at 이 모두 같은 뜻이라 같은 아이콘을 쓴다.
 *
 * 네 자리 사다리다. 발송 탭은 이 넷을 다 쓰고, 다시 보내기·하원 안내·
 * 월간은 「기록 전」 이 없어 written 을 안 넘긴다 (기본 true).
 *
 * **여기 오기 전에는 같은 말이 다른 뜻이었다** — 발송 탭의 「안 보냄」 은
 * *보내지 않기로 한 것*(skip)이고, 다시 보내기 탭의 「안 보냄」 은 *아직
 * 안 보낸 것*이었다. 한 벌로 모으면서 뜻을 갈랐다 (전수 조사 2026-08-28).
 *
 * @param at   보낸 시각 (없으면 안 보낸 것)
 * @param opt  { what: "리포트"|"숙제 안내"|… , count: 보낸 횟수,
 *               skip: 「안 보냄」 처리했나, written: 기록을 마쳤나 }
 * @returns { icon, label, title, cls }
 */
export function sentMark(at, opt = {}) {
  const what = opt.what || "리포트";
  if (at) {
    const n = Number(opt.count) || 0;
    return {
      icon: "📤",
      label: `보냄${n > 1 ? ` · ${n}회` : ""}`,
      title: `${markTime(at)}에 ${what}를 보냈어요${n > 1 ? ` (${n}회)` : ""}`,
      cls: "tag tag-mint",
    };
  }
  if (opt.skip) {
    return {
      icon: "🚫",
      label: "안 보냄",
      title: `이 ${what}는 보내지 않기로 해두셨어요`,
      cls: "tag tag-muted",
    };
  }
  if (opt.written === false) {
    return {
      icon: "⬜",
      label: "기록 전",
      title: `아직 오늘 수업 기록을 안 마치셨어요 — ${what}는 그다음이에요`,
      cls: "tag tag-amber",
    };
  }
  return {
    icon: "📝",
    label: "보낼 것",
    title: `${what}를 아직 안 보냈어요`,
    cls: "tag tag-sky",
  };
}

/**
 * **학부모가 열어봤나** — 0180 report_reads.
 *
 * @param at    열어본 시각 (report_reads.read_at 중 가장 이른 것)
 * @param opt   { sentAt: 보낸 시각, known: 0180 을 돌린 DB 인가 }
 * @returns { icon, label, title, cls } · 그릴 것이 없으면 null
 */
export function readMark(at, opt = {}) {
  // 못 읽었다 ≠ 안 봤다 (A25) — 0180 전 DB 는 「모른다」 고 말한다
  if (opt.known === false) {
    return {
      icon: "❔",
      label: "열람 모름",
      title: "열람 기록 SQL(0180)을 아직 안 돌리셨어요 — 설정 → 관리자에서 확인하세요",
      cls: "tag tag-muted",
    };
  }
  // 안 보낸 것에 열람을 묻지 않는다 (A11)
  if (!opt.sentAt && !at) return null;
  if (!at) {
    return {
      icon: "⏳",
      label: "아직",
      title:
        "아직 열어보지 않으셨어요. 문자 알림만 보시고 앱에 안 들어오시는 경우가 많아요 — 안 읽으신 것과는 다릅니다",
      cls: "tag tag-muted",
    };
  }
  return {
    icon: "👀",
    label: "봄",
    title: `어머니가 ${markTime(at)}에 열어보셨어요`,
    cls: "tag tag-mint",
  };
}

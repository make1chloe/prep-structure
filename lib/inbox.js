/**
 * **아직 안 본 것이 몇 건인가** — 위 메뉴의 「대시보드」 옆에 붙는 숫자.
 *
 * 원장님 (2026-08-07) — 「확인 안 한 알람이 있으면 카톡처럼 대시보드 메뉴에
 * 배지로 확인 안 한 갯수를 표시해줘」
 *
 * ── 무엇을 셀 것인가 ─────────────────────────────────────
 *
 * **사람이 보낸 것만** 센다. 결석 알림 · 문의 · 리포트 댓글 — 저쪽에서
 * 말을 걸어온 것들이다. 이건 답을 안 하면 저쪽이 기다리고 있다.
 *
 * **할 일은 안 센다.** 보강 잡을 것 · 안 보낸 리포트 · 반성문 대상은
 * 내가 해야 하는 일이지 누가 기다리는 것이 아니다. 그걸 같이 세면 숫자가
 * 늘 두 자리라, 카톡의 빨간 점처럼 「새 것이 왔다」 는 뜻을 잃는다.
 * 그 일들은 이미 대시보드 안에 각각 자리가 있다.
 *
 * 세는 규칙을 여기 한 곳에 둔다 — 화면과 숫자가 어긋나면 배지가 거짓이 된다.
 */

/**
 * @returns { total, requests, comments }
 *
 * 표가 없거나(SQL 전) 읽기가 막히면 **0 으로 본다.** 배지가 안 뜨는 것이
 * 잘못된 숫자가 뜨는 것보다 낫다.
 */
/**
 * **20초 안에는 다시 안 센다** — lib/menuBadges 의 메모와 똑같은 까닭·규칙.
 * 배지의 나머지 반쪽만 매 화면 다시 돌고 있었다 (한쪽만 고친 반쪽 수리였다).
 */
const _memo = { at: 0, value: null };
const MEMO_MS = 20 * 1000;

export async function unreadForStaff(supabase) {
  const memoOn = process.env.NODE_ENV === "production";
  if (memoOn && _memo.value && Date.now() - _memo.at < MEMO_MS) return _memo.value;
  const out = await _unreadForStaff(supabase);
  _memo.at = Date.now();
  _memo.value = out;
  return out;
}

async function _unreadForStaff(supabase) {
  const zero = { total: 0, requests: 0, comments: 0 };
  if (!supabase) return zero;

  const count = async (fn) => {
    try {
      const { count: n, error } = await fn();
      return error ? 0 : n || 0;
    } catch {
      return 0;
    }
  };

  const [requests, comments] = await Promise.all([
    // 학부모·학생이 보낸 것 중 아직 확인 안 누른 것
    count(() =>
      supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "new")
    ),
    // 리포트에 달린 댓글 중 아직 안 읽은 것 (선생님이 쓴 것은 뺀다)
    count(() =>
      supabase
        .from("report_comments")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .neq("author_role", "staff")
    ),
  ]);

  return { total: requests + comments, requests, comments };
}

/** 배지에 적을 글자 — 「99+」 로 자른다 (세 자리가 되면 메뉴가 밀린다) */
export function badgeText(n) {
  if (!n || n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}

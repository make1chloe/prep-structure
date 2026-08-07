/**
 * **신규 상담이 접수되면 선생님 폰으로.**
 *
 * 원장님 (2026-08-07) — 「접수알림도 해줘」
 *
 * ── 여기만 방법이 다르다 ─────────────────────────────────
 *
 * 다른 알림은 전부 **로그인한 사람**이 일으킨다. 학생이 부르고, 어머니가
 * 결석을 알리고, 선생님이 리포트를 올린다. 그래서 0104 처럼 「우리 학원
 * 사람인지 확인하고 보낼 곳을 알려주는 함수」 를 두면 끝난다.
 *
 * **신규 상담 양식은 로그인이 없다.** 인터넷의 누구나 열 수 있는 화면이다.
 * 그러니 같은 방법을 쓰면 — 아무나 그 함수를 불러 **알림 열쇠(개인키)를
 * 가져갈 수 있다.** 그 열쇠를 쥐면 원장님 폰으로 아무 알림이나 보낼 수 있다.
 * 자료가 새는 것보다 오히려 성가신 일이 된다. 그래서 그 길은 막았다.
 *
 * ── 그럼 어떻게 ─────────────────────────────────────────
 *
 * 보내는 일을 **서버만 아는 열쇠**로 한다. Vercel 환경변수에 넣어둔
 * `SUPABASE_SERVICE_ROLE_KEY` 는 브라우저로 절대 안 내려간다 (이 파일은
 * 서버에서만 돈다). 그 열쇠로 알림 키와 선생님 기기를 직접 읽는다.
 *
 * **그 값이 없으면 알림만 안 간다 — 접수는 그대로 된다.** 접수를 놓치는
 * 것이 제일 나쁘다. 대신 켜졌는지 아닌지를 설정 화면에서 보실 수 있게
 * `inquiryAlertReady()` 로 내어준다 (조용히 안 가는 것이 제일 무섭다).
 */

import { SUPABASE_URL } from "@/lib/supabase/env";
import { pushToAll } from "@/lib/push";
import { slotText } from "@/lib/applySlots";

/**
 * 이름을 **몇 가지 받아준다.**
 *
 * Vercel 에 넣으실 때 이름을 조금 다르게 적으시면 앱은 그냥 「없다」 고 본다.
 * 값이 틀린 것과 이름이 틀린 것은 고치는 법이 다른데, 화면에는 똑같이
 * 「꺼짐」 으로만 보여서 어느 쪽인지 알 수가 없다. 흔한 이름을 다 받는다.
 */
const NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SERVICE_ROLE_KEY",
];

const KEY = () => {
  for (const n of NAMES) {
    const v = (process.env[n] || "").trim();
    if (v) return v;
  }
  return "";
};

/** 설정 화면이 「켜져 있나」 를 물어볼 때 — 값은 절대 안 내보낸다 */
export function inquiryAlertReady() {
  return Boolean(KEY());
}

/**
 * 어느 이름으로 들어와 있나 (설정 화면이 보여준다).
 * **값이 아니라 이름만** 돌려준다. 값은 서버 밖으로 나가면 안 된다.
 */
export function inquiryAlertName() {
  return NAMES.find((n) => (process.env[n] || "").trim()) || null;
}

async function rest(path) {
  const key = KEY();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * @param row 방금 접수된 내용 (DB 에 넣은 그 모양 그대로)
 * @returns { sent, error } — 부르는 쪽은 이 결과로 아무것도 하지 않는다
 */
export async function pushNewInquiry(row = {}) {
  if (!KEY()) return { sent: 0, error: null };

  const cfg = await rest("integrations?id=eq.push&select=config");
  const keys = cfg?.[0]?.config;
  if (!keys?.privateKey) return { sent: 0, error: null };   // 알림을 아직 안 켜신 상태

  const staff = await rest(
    "profiles?select=id&role=in.(principal,instructor,assistant)"
  );
  const ids = (staff || []).map((p) => p.id).filter(Boolean);
  if (ids.length === 0) return { sent: 0, error: null };

  const subs = await rest(
    `push_subscriptions?select=id,endpoint,p256dh,auth&profile_id=in.(${ids.join(",")})`
  );
  if (!subs?.length) return { sent: 0, error: null };

  // **한 줄에 알아야 할 것을 다 넣는다.** 알림을 눌러서 열어보기 전에
  // 「누가 · 몇 학년 · 어느 시간표」 가 보여야 그 자리에서 판단하신다
  const who = [row.name, row.grade, row.school].filter(Boolean).join(" · ");
  const when = slotText(row.want_slots);
  const body = [who, when && `희망 ${when}`, row.phone].filter(Boolean).join("\n");

  const res = await pushToAll(keys, subs, {
    title: "🌱 신규 상담 접수",
    body: body || "새 상담 신청이 들어왔습니다.",
    url: "/consult",
  });
  return { sent: res.sent, error: res.error };
}

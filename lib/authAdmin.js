/**
 * **계정을 만드는 손** — Supabase Admin API 를 부르는 자리는 여기 하나다.
 *
 * 원래 이 다섯(도메인 · 첫 비번 · 이메일 만들기 · 열쇠 읽기 · admin 호출)은
 * `app/students/accountActions.js` 안에만 있었다. 학생·학부모 계정만 만들 수
 * 있었으니 그래도 됐다. 선생님 계정을 만드는 자리가 생기면서 **같은 다섯을
 * 두 벌로 적을 뻔했다** — 도메인이 한쪽만 바뀌면 그 계정들은 영영 못 들어온다
 * (원칙 1: 같은 값 두 번 적지 않는다).
 *
 * `accountActions.js` 는 `"use server"` 파일이라 **async 함수 말고는
 * 내보낼 수가 없다**(`emailOf` 같은 것을 export 하면 빌드가 죽는다). 그래서
 * 보통 모듈인 여기로 내렸다. 하는 일은 한 줄도 안 바꿨다 — 사는 자리만 옮겼다.
 */

import { SUPABASE_URL } from "@/lib/supabase/env";

/** 실제로 메일이 가는 곳이 아니다 — Supabase 로그인이 이메일만 받아서 붙이는 꼬리 */
export const LOGIN_DOMAIN = "chloe-eng.internal";

/**
 * **학생·학부모의 첫 비밀번호는 0000** (원장님, 2026-08-06).
 * 왜 하나로 통일했는지는 `app/students/accountActions.js` 머리말에 그대로 있다.
 * 요지: 0000 으로는 아무것도 못 한다 — 들어오면 바꾸는 화면부터 뜬다
 * (must_change_pw · app/me/ChangePw).
 */
export const INIT_PW = "0000";

export function makePw() {
  return INIT_PW;
}

/**
 * **선생님 비밀번호만 다르다 — 강제로 바꾸게 하는 화면이 없기 때문이다.**
 *
 * 실측 (2026-08-28): `app/me/page.jsx:146` 과 `app/parent/page.jsx:101` 의
 * 「비밀번호부터 바꾸세요」 화면은 둘 다 `&& !isStaff` 다. 즉 **스태프는
 * must_change_pw 를 켜 두어도 그 화면을 지나가지 않는다.** 앱 어디에도
 * 선생님이 자기 비번을 바꾸는 자리가 없다(`app/me/pwActions.js` 는 그 화면
 * 안에서만 불린다).
 *
 * 그래서 선생님에게 0000 을 주면 **0000 인 채로 영영 남는다.** 학생 계정은
 * 「0000 으로는 아무것도 못 한다」 가 안전의 근거였는데, 선생님 계정은 그
 * 근거가 통째로 없다 — 게다가 열리는 것이 학생 화면이 아니라 학원 전체다.
 *
 * 그래서 여기서만 **무작위로 만들어 한 번 보여준다.** 헷갈리는 글자
 * (i·l·1·o·0)는 뺐다 — 원장님이 소리 내어 불러주시는 일이 있다.
 */
export function makeStaffPw() {
  const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";   // 31자
  const n = new Uint32Array(12);
  crypto.getRandomValues(n);
  const s = Array.from(n, (v) => ALPHA[v % ALPHA.length]).join("");
  // 넉 자씩 끊어 읽기 쉽게 (하이픈도 비밀번호의 일부다)
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export function emailOf(loginId) {
  return `${(loginId || "").trim().toLowerCase()}@${LOGIN_DOMAIN}`;
}

/** 설정에 넣어둔 service_role 키 */
export async function serviceKey(supabase) {
  const { data } = await supabase
    .from("integrations").select("config").eq("id", "supabase_service").maybeSingle();
  return (data?.config?.key || "").trim();
}

export async function admin(key, path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let json = null;
  try { json = await res.json(); } catch { /* 본문이 없을 수도 있다 */ }
  return { ok: res.ok, status: res.status, json };
}

/**
 * 열쇠가 없을 때 — **조용히 실패하지 않는다.** 무엇을 만들려다 막혔는지와
 * 어디에 넣으면 되는지를 같이 말해준다.
 */
export function keyMissing(what = "학생 계정") {
  return {
    error:
      `${what}을 만들려면 Supabase service_role 키가 필요해요. ` +
      "설정 → 학생 계정 키 에 넣어주세요 (대화창에는 절대 붙여넣지 마세요).",
  };
}

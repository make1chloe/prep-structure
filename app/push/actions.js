"use server";

import { createClient } from "@/lib/supabase/server";
import { OPEN_TO_SEE } from "@/lib/notify";
import { generateKeys, pushToAll } from "@/lib/push";
import { inQuiet, nowMinsSeoul, DEFAULT_QUIET } from "@/lib/quiet";
import { randomUUID } from "node:crypto";

// 알림 키 — 설정 화면에서 한 번 만들면 계속 쓴다
export async function ensurePushKeys() {
  const supabase = createClient();
  const { data } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "push")
    .maybeSingle();
  if (data?.config?.publicKey) return { publicKey: data.config.publicKey, error: null };

  const keys = generateKeys();
  const { error } = await supabase.from("integrations").upsert(
    { id: "push", enabled: true, config: keys, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) return { publicKey: null, error: error.message };
  return { publicKey: keys.publicKey, error: null };
}

/**
 * 화면에서 알림을 켤 때 필요한 공개키.
 *
 * **표에서 바로 읽으면 학생·학부모는 못 읽는다** (원장님, 2026-08-07 —
 * 「허용 눌렀는데 이래」). `integrations` 는 원장님만 읽게 잠겨 있다 (0015,
 * 솔라피 비밀키가 같이 들어 있어서). 그래서 —
 *
 *   원장님 폰    읽힌다 → 알림 켜짐
 *   학생·학부모   RLS 가 막는다 → null → 「알림 준비가 아직 안 됐어요」
 *
 * **오류가 안 난다.** 표는 그냥 「없다」 고 답하고, 화면은 그것을 「아직
 * 키를 안 만드셨다」 로 읽었다. 원장님은 설정에서 「알림 준비됨」 을
 * 보시면서도 아이들은 못 켜는 상태가 이어졌다.
 *
 * 0110 이 낸 문으로 **공개키 한 칸만** 받아온다. 공개키는 감출 것이 아니다 —
 * 이것만으로는 아무에게도 알림을 못 보낸다 (보내려면 비밀키가 있어야 하고,
 * 그건 여전히 선생님만 읽는다).
 */
export async function getPushPublicKey() {
  const supabase = createClient();

  const rpc = await supabase.rpc("push_public_key");
  if (!rpc.error) {
    return {
      publicKey: rpc.data || null,
      error: rpc.data ? null : "아직 알림 키를 안 만들었어요. 원장님께 말씀해주세요.",
    };
  }

  // 0110 전이면 옛 길로 — 원장님 화면에서는 그대로 된다
  const { data, error } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "push")
    .maybeSingle();
  if (error) return { publicKey: null, error: "0016 SQL을 먼저 실행해주세요." };
  const key = data?.config?.publicKey || null;
  return {
    publicKey: key,
    // **못 읽은 것과 없는 것을 가른다.** 예전에는 둘 다 「준비가 안 됐어요」
    // 였고, 그래서 진짜 원인(권한)이 몇 주 동안 안 보였다
    error: key ? null : "설정 → 관리자 → Supabase SQL 에서 0110 을 실행해주세요.",
  };
}

// 기기 등록 / 해제
export async function saveSubscription(sub, ua) {
  if (!sub?.endpoint) return { error: "구독 정보가 없어요." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      student_id: student?.id || null,
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh || "",
      auth: sub.keys?.auth || "",
      ua: (ua || "").slice(0, 200),
    },
    { onConflict: "endpoint" }
  );
  return { error: error ? error.message : null };
}

export async function removeSubscription(endpoint) {
  if (!endpoint) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { error: error ? error.message : null };
}

// ---------- 보내기 ----------

/**
 * 보낼 때 쓸 열쇠.
 *
 * `integrations` 는 **원장님만** 읽는다 (0015). 그래서 강사·조교가 리포트를
 * 올리거나 댓글을 다시면 여기가 **빈 값**으로 와서 조용히 안 보내졌다 —
 * 학생 알림이 안 왔던 것과 똑같은 병이다. 0104 의 `push_keys()` 가
 * 표 주인 자격으로 꺼내 준다 (선생님에게만 답한다).
 */
async function keysOf(supabase) {
  const { data } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "push")
    .maybeSingle();
  if (data?.config?.privateKey) return data.config;

  const { data: rows, error } = await supabase.rpc("push_keys");
  if (error || !rows?.length) return data?.config || null;   // 0104 전이면 예전 그대로
  const k = rows[0];
  return { publicKey: k.public_key, privateKey: k.private_key, contact: k.contact };
}

async function subsOf(supabase, studentIds) {
  if (!studentIds?.length) return [];
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, profile_id, student_id")
    .in("student_id", studentIds);
  return data || [];
}

/** 학생 여러 명에게 알림 */
/**
 * **알림 제목 앞에 학원 이름을 붙인다** (원장님, 2026-08-07 —
 * 「받는 사람이 학부모인데 왜 from 학부모야. 그냥 다 빼.
 *  [클로이영어] 공지사항 이거면 됐지」).
 *
 * 아이폰이 붙이는 「from ○○」 는 **우리가 지울 수 있는 것이 아니다** —
 * 홈 화면에 담은 앱의 이름을 폰이 알아서 적는다. 그래서 두 가지를 한다.
 *
 *   1. 제목을 「[클로이영어] 공지사항」 으로 — 한 줄만 읽어도 어디서 온
 *      무슨 알림인지 안다
 *   2. 앱 이름을 「클로이영어」 로 (manifest) — 그러면 폰이 붙이는 말도
 *      「from 클로이영어」 가 되어 거슬리지 않는다
 *
 * 이미 「[클로이영어]」 로 시작하는 제목에는 다시 안 붙인다.
 */
async function withAcademy(supabase, payload) {
  let name = "";
  try {
    const { data } = await supabase
      .from("integrations").select("config").eq("id", "academy").maybeSingle();
    name = (data?.config?.name || "").trim();
  } catch {
    // 학원 이름을 못 읽어도 알림은 가야 한다
  }
  const title = (payload?.title || "").trim();
  if (!name || title.startsWith(`[${name}]`)) return payload;
  return { ...payload, title: `[${name}] ${title}`.trim() };
}

export async function pushToStudents(studentIds, payload) {
  const supabase = createClient();
  const keys = await keysOf(supabase);
  if (!keys?.privateKey) return { sent: 0, error: null }; // 알림을 안 쓰는 상태면 조용히 넘어간다

  let subs = await subsOf(supabase, studentIds);
  if (subs.length === 0) return { sent: 0, error: null };
  // 방해금지 시간과 자취 남기기는 학생 알림에도 똑같이 (0105)
  subs = await awake(supabase, subs);
  if (subs.length === 0) return { sent: 0, error: null, quiet: true };
  // 아이 폰도 잠금화면에는 내용을 안 띄운다 (2026-08-07)
  const safe = { ...(await withAcademy(supabase, payload)), body: OPEN_TO_SEE };
  subs = await withReceipts(supabase, subs, safe);

  const res = await pushToAll(keys, subs, safe);
  if (res.gone.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", res.gone);
  }
  return { sent: res.sent, error: res.error };
}

/**
 * **한 집으로 알림** — 아이 폰과 어머니 폰.
 *
 * 원장님 (2026-08-06) — 알림톡으로 알리던 것을 전부 앱 안에서 해결하기로 했다.
 * 알림톡은 어머니 폰으로 갔다. 그러니 앱 알림도 어머니께 닿아야 한다. 아이
 * 폰에만 보내면 「앱에 올렸습니다」 가 어머니께는 안 간 것과 같다.
 *
 * **누구에게 보낼지는 그 글이 누구에게 보이는지로 정한다.**
 *   who="all"     아이도 어머니도 보는 것 (일정 · 전달사항 · 숙제)
 *   who="parent"  어머니만 보는 것 (교재 · 보강 · 늦은 귀가 · 수업/월간 리포트)
 *
 * 보이지도 않는 것을 알리면 안 된다. 아이가 알림을 눌렀는데 아무것도 없으면
 * 그다음부터 알림을 안 누른다 — 정작 자기 숙제 알림까지 같이 죽는다.
 *
 * 알림을 안 켠 기기는 그냥 없는 것이다 — 조용히 넘어간다.
 */
export async function pushToFamilies(studentIds, payload, who = "all") {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (ids.length === 0) return { sent: 0, error: null };

  /**
   * **잠금화면에 내용을 안 띄운다** (원장님, 2026-08-07 —
   * 「미리보기에서 내용 알 수 없게 해줘. 그냥 공지사항 전달사항. 눌러서
   * 어플 들어와야 알 수 있게」).
   *
   * 알림 미리보기는 **폰을 안 열어도 보인다.** 옆 사람에게도 보이고,
   * 형제 폰에 어머니가 로그인해 두신 집에서는 아이가 보게 된다. 거기
   * 「단어 6/20」 이나 「오늘 태도가…」 가 적히면 그건 우리가 흘린 것이다.
   *
   * 그래서 **무엇이 왔는지만** 말한다 — 내용은 앱을 열어야 보인다.
   * 여기 한 군데에서 지운다: 부르는 곳이 여덟 군데라 각자 조심하게 하면
   * 언젠가 한 곳이 빠지고, 그 한 곳이 사고가 된다.
   *
   * 선생님께 가는 알림(pushToStaff)은 그대로 둔다 — 그건 원장님 폰이고,
   * 무슨 일인지 바로 보여야 답을 하실 수 있다.
   */
  const safe = { ...(await withAcademy(supabase, payload)), body: OPEN_TO_SEE };

  const supabase = createClient();
  const keys = await keysOf(supabase);
  if (!keys?.privateKey) return { sent: 0, error: null };   // 알림을 안 쓰면 조용히

  // 아이 기기
  const { data: mine } = who === "parent"
    ? { data: [] }
    : await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, profile_id, student_id")
        .in("student_id", ids);

  // 그 아이의 학부모 기기 (학부모 계정은 student_id 가 안 붙는다 — profile_id 로 찾는다)
  const { data: links } = await supabase
    .from("parent_student")
    .select("parent_profile_id, student_id")
    .in("student_id", ids);
  const parents = [...new Set((links || []).map((l) => l.parent_profile_id).filter(Boolean))];
  const { data: theirs } = parents.length
    ? await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, profile_id, student_id")
        .in("profile_id", parents)
    : { data: [] };

  // 한 기기에 두 번 보내지 않는다 (아이 폰에 어머니가 로그인해 두신 집이 있다)
  const byId = new Map();
  [...(mine || []), ...(theirs || [])].forEach((s) => byId.set(s.id, s));
  let subs = [...byId.values()];
  if (subs.length === 0) return { sent: 0, error: null };

  subs = await awake(supabase, subs);
  if (subs.length === 0) return { sent: 0, error: null, quiet: true };

  // 학부모 기기에는 어느 아이 이야기인지가 안 붙어 있다 — 링크로 채운다
  const childOf = new Map();
  (links || []).forEach((l) => {
    if (!childOf.has(l.parent_profile_id)) childOf.set(l.parent_profile_id, l.student_id);
  });
  subs = await withReceipts(supabase, subs, safe, childOf);

  const res = await pushToAll(keys, subs, safe);
  await markFailed(supabase, subs, res.fails);
  if (res.gone.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", res.gone);
  }
  return { sent: res.sent, error: res.error };
}

/**
 * **못 간 통에 표시를 남긴다** (0105).
 *
 * 이걸 안 하면 거절당한 통이 「미확인」 으로 남는다 — 안 본 것과 아예 못
 * 간 것은 다음에 할 일이 다른데, 화면에는 똑같이 보인다.
 */
async function markFailed(supabase, subs, fails = []) {
  if (!fails?.length) return;
  const ids = subs.map((s) => s.payload?.r).filter(Boolean);
  if (ids.length === 0) return;
  // 어느 통이 어느 기기였는지까지는 pushToAll 이 안 알려준다.
  // **다 실패했을 때만** 표시한다 — 반만 갔는데 전부 오류로 적으면 더 나쁘다
  if (fails.length < subs.length) return;
  await supabase
    .from("push_receipts")
    .update({ failed_at: new Date().toISOString(), fail_why: `${fails[0].who}: ${fails[0].code || "?"}` })
    .in("id", ids);
}

/**
 * **지금 안 울렸으면 하는 분은 빼고** (0105).
 *
 * 원장님 (2026-08-07) — 「방해금지 시간 설정을 할 수 있도록」
 *
 * 알림을 아예 끄시면 급한 것까지 안 간다. 대부분은 밤에 안 울리기를
 * 바라시는 것이라, **시간만 비켜간다.**
 *
 * 0105 전 DB 에서는 표가 없다 — 그때는 아무도 안 정한 것으로 보고 다 보낸다
 * (여기서 막아버리면 SQL 하나 안 돌렸다고 알림이 통째로 끊긴다).
 */
async function awake(supabase, subs) {
  const pids = [...new Set(subs.map((s) => s.profile_id).filter(Boolean))];
  if (pids.length === 0) return subs;
  const { data, error } = await supabase
    .from("push_prefs")
    .select("profile_id, quiet_from, quiet_to")
    .in("profile_id", pids);
  if (error) return subs;                       // 0105 전이면 그대로 보낸다
  const now = nowMinsSeoul();

  /**
   * **안 정하신 분은 기본값(밤 11시~아침 9시)을 쓴다** (2026-08-07).
   *
   * 기본을 「없음」 으로 두면 아무도 안 정하시고, 그러면 밤에 울리는 폰
   * 때문에 알림을 통째로 꺼버리시게 된다 — 그게 제일 나쁘다.
   *
   * 「지우기」 를 누르신 분은 빈 값이 **저장되어** 있으므로 여기서 기본값을
   * 안 쓴다. 안 정한 것과 안 받겠다고 정한 것은 다르다.
   */
  const set = new Map((data || []).map((p) => [p.profile_id, p]));
  const quiet = new Set(
    pids.filter((id) => {
      const p = set.get(id);
      return p
        ? inQuiet(now, p.quiet_from, p.quiet_to)
        : inQuiet(now, DEFAULT_QUIET.from, DEFAULT_QUIET.to);
    })
  );
  if (quiet.size === 0) return subs;
  return subs.filter((s) => !quiet.has(s.profile_id));
}

/**
 * **한 통마다 자취를 남긴다** (0105).
 *
 * 보내고 나면 끝이라 「안 봤다」 와 「안 갔다」 를 구별할 수가 없었다.
 * 그 둘은 다음에 할 일이 완전히 다르다 — 앞은 전화를 드려야 하고,
 * 뒤는 알림 설정을 봐드려야 한다.
 *
 * 표 번호를 알림에 실어 보내면, 폰이 받았을 때와 눌렀을 때 그 번호로
 * 알려온다 (public/sw.js → /api/push/seen).
 *
 * 표가 없거나(0105 전) 뭔가 어긋나면 **번호 없이 그냥 보낸다** —
 * 세는 일 때문에 알림 자체가 안 가면 본말이 뒤집힌다.
 */
async function withReceipts(supabase, subs, payload, childOf = new Map()) {
  /**
   * **번호를 우리가 정해서 넣는다.**
   *
   * 넣고 나서 돌려받는 순서가 넣은 순서와 같으리라는 보장이 없다. 어긋나면
   * 남의 알림에 남의 번호가 실려서, **엉뚱한 사람이 열어본 것으로 기록된다.**
   * 그런 어긋남은 아무 오류도 안 내고 조용히 쌓인다. 미리 정해두면 그럴 일이 없다.
   */
  const with_ = subs
    .filter((s) => s.profile_id)
    .map((s) => ({ sub: s, id: randomUUID() }));
  if (with_.length === 0) return subs;

  const { error } = await supabase.from("push_receipts").insert(
    with_.map(({ sub, id }) => ({
      id,
      profile_id: sub.profile_id,
      student_id: sub.student_id || childOf.get(sub.profile_id) || null,
      title: (payload?.title || "").slice(0, 120),
      kind: (payload?.tag || "").slice(0, 40) || null,
    }))
  );
  if (error) return subs;                        // 0105 전이면 번호 없이 그냥 보낸다

  const idOf = new Map(with_.map(({ sub, id }) => [sub.id, id]));
  return subs.map((s) => {
    const r = idOf.get(s.id);
    return r ? { ...s, payload: { ...payload, r } } : s;
  });
}

// 선생님이 직접 보내는 테스트 알림
export async function testPush() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const keys = await keysOf(supabase);
  if (!keys?.privateKey) return { error: "먼저 알림 키를 만들어주세요." };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", user.id);
  if (!subs?.length) return { error: "이 기기에서 먼저 알림 받기를 켜주세요." };

  const res = await pushToAll(keys, subs, {
    title: "클로이영어",
    body: "알림 연결 테스트입니다. 이 알림이 보이면 설정이 끝났어요.",
    url: "/me",
  });
  if (res.error) return { error: res.error, sent: 0 };

  /**
   * **몇 대에 보냈는지 말한다** (2026-08-07).
   *
   * 「보냈어요」 만으로는 폰에 안 왔을 때 어디를 봐야 할지 알 수 없다.
   * 「1대에 보냈어요」 까지 나오면, 그래도 안 뜬 것은 **폰 쪽 설정**이라는
   * 뜻이 된다 (아이폰 설정 → 알림에서 이 앱이 꺼져 있는 경우).
   */
  const gone = res.gone.length ? ` (옛 기기 ${res.gone.length}대는 정리했어요)` : "";
  if (res.gone.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", res.gone);
  }
  return { error: null, sent: res.sent, note: `${res.sent}대에 보냈어요.${gone}` };
}

/**
 * **선생님 폰(그리고 워치)으로 알림.**
 *
 * 원장님 (2026-08-05) — 「아이 상태가 바뀌면 알림 오게 해줘. 워치랑 연동하게.
 * 숙제는 제외하고 수업 중에만」
 *
 * 워치는 따로 붙이는 것이 없다. 폰에 온 알림을 워치가 그대로 보여준다
 * (아이폰+애플워치, 안드로이드+갤럭시워치 둘 다). 그래서 폰에 알림이 오게
 * 하는 것이 전부다 — **홈 화면에 담아둔 앱**에서 알림 받기를 켜두셔야 한다.
 *
 * **숙제는 안 보낸다.** 집에서 하는 것이라 밤에 알림이 울린다. 수업 중에
 * 등원 학습을 끝냈을 때만 보낸다 (부르는 계산은 부르는 쪽에서 한다).
 */
/**
 * ── 왜 안 왔나 (2026-08-06, 원장님 — 「학생이 도움을 요청해도 알림이 안 와」) ──
 *
 * 코드는 멀쩡했다. 학생이 부르면 이 함수가 불렸다. 그런데 이 함수가
 * **학생의 자격으로** DB 를 읽는다 (서버에서 도는 코드라도 로그인한 사람의
 * 권한으로 읽는다). 그래서 —
 *
 *   · 알림 열쇠(`integrations`) → **원장님만** 읽을 수 있다 (0015)
 *   · 선생님들의 기기(`push_subscriptions`) → 본인 것이나 선생님만 (0016)
 *
 * 둘 다 학생에게는 **빈 값**으로 온다. 오류가 아니라 **없는 것처럼** 온다.
 * 그러면 아래 두 줄이 「알림을 안 쓰시는구나」 하고 조용히 넘어갔다.
 *
 * 이 앱에서 여러 번 겪은 그 모양이다 — 읽기 규칙은 막을 때 오류를 안 내고,
 * 그래서 화면도 로그도 멀쩡해 보인다.
 *
 * 0104 의 `staff_push_targets()` 가 **표 주인 자격으로** 대상을 찾아준다.
 * 0104 를 아직 안 돌리셨으면 예전 길로 돌아간다 (원장님이 부르실 때는 된다).
 */
export async function pushToStaff(payload) {
  const supabase = createClient();

  // 0104 — 학생·학부모가 불러도 대상을 찾을 수 있는 길
  const { data: targets, error: rpcErr } = await supabase.rpc("staff_push_targets");
  if (!rpcErr && Array.isArray(targets)) {
    if (targets.length === 0) return { sent: 0, error: null };   // 아무도 알림을 안 켰다
    const keys = {
      publicKey: targets[0].public_key,
      privateKey: targets[0].private_key,
      contact: targets[0].contact,
    };
    const subs = targets.map((t, i) => ({
      id: `${i}`, endpoint: t.endpoint, p256dh: t.p256dh, auth: t.auth,
    }));
    const res = await pushToAll(keys, subs, payload);
    // 사라진 기기는 여기서 못 지운다 (id 가 없다) — 다음에 선생님이 여실 때 정리된다
    return { sent: res.sent, error: res.error };
  }

  // 0104 전이면 예전 길 (선생님 자격으로 부를 때만 된다)
  const keys = await keysOf(supabase);
  if (!keys?.privateKey) return { sent: 0, error: null };

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, role")
    .in("role", ["principal", "instructor", "assistant"]);
  const ids = (staff || []).map((p) => p.id);
  if (ids.length === 0) return { sent: 0, error: null };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", ids);
  if (!subs?.length) return { sent: 0, error: null };

  const res = await pushToAll(keys, subs, payload);
  if (res.gone.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", res.gone);
  }
  return { sent: res.sent, error: res.error };
}

// ---------- 방해금지 시간 (0105) ----------

/** 내 방해금지 시간 — 없으면 둘 다 빈 값 */
export async function getQuietHours() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { from: "", to: "", ready: true };

  const { data, error } = await supabase
    .from("push_prefs")
    .select("quiet_from, quiet_to")
    .eq("profile_id", user.id)
    .maybeSingle();
  // 0105 전이면 표가 없다 — 화면에서 「아직 못 쓴다」 고 말할 수 있게 알린다
  if (error) return { from: "", to: "", ready: false };
  // 아직 아무것도 안 정하신 분께는 **기본값을 그대로 보여드린다** —
  // 화면에는 빈 칸인데 실제로는 안 울리면 「왜 안 오지」 가 된다
  if (!data) {
    return { ready: true, from: DEFAULT_QUIET.from, to: DEFAULT_QUIET.to, isDefault: true };
  }
  return {
    ready: true,
    from: (data.quiet_from || "").slice(0, 5),
    to: (data.quiet_to || "").slice(0, 5),
  };
}

/**
 * 방해금지 시간을 정한다. 둘 다 비우면 **없앤다** (다시 다 받으신다).
 *
 * 한쪽만 적으신 것은 뜻이 불분명하다 — 그대로 두면 「밤 10시부터 언제까지?」
 * 가 되어 영영 안 울릴 수도 있다. 그 자리에서 여쭙는다.
 */
export async function saveQuietHours(from, to) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const a = (from || "").trim();
  const b = (to || "").trim();
  if (!a && !b) {
    const { error } = await supabase.from("push_prefs").upsert(
      { profile_id: user.id, quiet_from: null, quiet_to: null, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" }
    );
    if (error) return { error: "설정 → Supabase 에서 0105 를 먼저 실행해주세요." };
    return { error: null, note: "방해금지 시간을 껐어요. 이제 알림이 그대로 옵니다." };
  }
  if (!a || !b) return { error: "시작과 끝을 둘 다 정해주세요." };
  if (a === b) return { error: "시작과 끝이 같아요. 다르게 정해주세요." };

  const { error } = await supabase.from("push_prefs").upsert(
    { profile_id: user.id, quiet_from: a, quiet_to: b, updated_at: new Date().toISOString() },
    { onConflict: "profile_id" }
  );
  if (error) return { error: "설정 → Supabase 에서 0105 를 먼저 실행해주세요." };
  return { error: null, note: `${a} ~ ${b} 에는 알림이 오지 않습니다.` };
}

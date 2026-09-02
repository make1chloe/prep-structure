/**
 * 밖으로 나가는 길은 **여기 하나뿐이다.**
 *
 * 화면마다 판단하게 두면 언젠가 리포트가 그냥 나간다(대전제 7).
 * 그래서 이 파일 밖에서 `web-push` 를 부르면 검사가 깨진다 (scripts/check-notify.mjs).
 *
 * ⚠️ 이 파일은 **첫 배포보다 먼저** 있어야 한다.
 *    주소와 VAPID 열쇠를 그대로 물려받으므로, 미리보기에서 누른 발송도
 *    **학부모 폰에 진짜 알림으로 뜬다.**
 */

/** 잠금화면에 내용을 안 띄운다 (원장님 2026-08-07). 본문을 **여기서** 갈아 끼운다 */
export const OPEN_TO_SEE = "앱에서 확인해주세요.";

/** 안 채운 치환 자리 — 이게 남아 있으면 **보내지 않는다** */
const HOLE = /\{\{[^}]*\}\}/;

/**
 * off  — 밖으로도 폰으로도 안 나간다. 목록과 자취에만 쌓인다
 * self — 원장 본인 기기에만
 * live — 전환일에 처음 켠다
 *
 * ⚠️ **기본값은 `off` 다.** 환경변수가 없으면 안 나간다 —
 *    「켜는 것을 잊어서 안 나갔다」가 「끄는 것을 잊어서 나갔다」보다 낫다.
 */
export function sinkOf(env = process.env) {
  const v = (env.NOTIFY_SINK || "").trim().toLowerCase();
  return v === "live" || v === "self" ? v : "off";
}

/** 선생님께 가는 것은 본문을 그대로 둔다 — 원장님 폰이고, 무슨 일인지 바로 보여야 답을 하신다 */
export function lockScreenBody(role, body) {
  return role === "staff" ? (body ?? "") : OPEN_TO_SEE;
}

/** 잠금화면 제목 — 아이·학부모에게는 **학원 이름만** */
export const JUST_ACADEMY = "클로이영어";

/**
 * ⚠️⚠️ **제목에도 아이 이름을 안 싣는다.**
 *
 * 원장님 2026-08-07 — 「미리보기에서 **내용 알 수 없게** 해줘. **그냥 공지사항 전달사항.**
 * 눌러서 어플 들어와야 알 수 있게.」 — **이름도 내용이다.**
 *
 * 본문만 갈아 끼우고 제목을 그대로 두면 잠금화면에 「김서은 데일리리포트」가 뜬다.
 * 알림 미리보기는 **폰을 안 열어도 보인다** — 옆 사람에게도 보이고,
 * **형제 폰에 어머니가 로그인해 두신 집에서는 아이가 본다.**
 *
 * ⚠️ 대가를 정직하게 — **형제가 둘인 집은 두 통의 제목이 같다.** 누구 것인지는
 *    앱을 열어야 안다. 그것이 원장님이 말씀하신 「눌러서 어플 들어와야 알 수 있게」다.
 *    (꼬리표는 아이마다 달라 두 통이 다 뜬다 — 덮이지 않는다)
 */
export function lockScreenTitle(role, title) {
  return role === "staff" ? (title || JUST_ACADEMY) : JUST_ACADEMY;
}

/** 안 채운 자리를 찾는다. 있으면 그 자리를 돌려준다 (없으면 null) */
export function findHole(...texts) {
  for (const t of texts) {
    const m = HOLE.exec(t ?? "");
    if (m) return m[0];
  }
  return null;
}

/**
 * 옛 서비스워커가 읽는 글 모양 — `{title, body, tag, url, r}`
 * ⚠️ **전환 첫 주는 이 모양을 안 바꾼다.** 폰에 박힌 옛 SW 가 이걸 읽는다.
 *    모양이 다르면 알림이 아예 안 뜨거나 눌렀을 때 404 가 되고,
 *    원장님 PC 에서는 멀쩡해서 며칠간 모른다.
 * ⚠️ `tag` 는 **갈래마다, 그리고 아이마다 달라야 한다** — 같은 tag 는 앞엣것을 덮어쓴다.
 *    형제가 있는 집은 학부모 폰 하나에 두 통이 가는데, tag 가 같으면
 *    **뒤 통이 앞 통을 덮어 한 아이 것만 보인다.** 오류도 안 나고 한 통은 떠서 아무도 모른다.
 *    → 아이가 있으면 tag 에 **아이를 붙인다.**
 */
export function pushPayload({ title, body, tag, url, r, role, studentId }) {
  const base = tag || "chloe";
  return JSON.stringify({
    // ⚠️ 제목도 갈아 끼운다 — 아이 이름이 잠금화면에 뜨면 그건 우리가 흘린 것이다
    title: lockScreenTitle(role, title),
    body: lockScreenBody(role, body),
    tag: studentId ? `${base}-${String(studentId).slice(0, 8)}` : base,
    url: url || (role === "parent" ? "/parent" : role === "staff" ? "/" : "/me"),
    r: r ?? null,
  });
}

/**
 * 하나뿐인 발송 문.
 *
 * @param db      { query(sql, params) } — pg 든 supabase 어댑터든
 * @param msg     { kind, title, body, url, tag, targets:[{profileId, studentId, role}] }
 * @param opts    { env, push }  push 는 실제로 쏘는 것. 검사와 리허설이 갈아 끼운다
 * @returns       { sink, sent, held, hole, log:[...] }
 */
export async function notify(db, msg, opts = {}) {
  const env = opts.env || process.env;
  const sink = sinkOf(env);

  // ⚠️ ① 안 채운 치환 자리는 **못 나간다.** 보내지 않고 원장님께 되돌린다.
  //    되돌린 것은 「안 보낸 판」으로 남아 **빠뜨린 것과 구별된다.**
  const hole = findHole(msg.title, msg.body);
  if (hole) return { sink, sent: 0, held: msg.targets?.length ?? 0, hole, log: [] };

  const targets = msg.targets ?? [];
  const log = [];
  let sent = 0;

  for (const t of targets) {
    // ⚠️ ② `self` 는 원장·강사에게만. 아이·학부모 폰으로는 한 발도 안 나간다
    const blocked = sink === "off" || (sink === "self" && t.role !== "staff");

    const { rows } = await db.query(
      `insert into v2.notify_log(profile_id, student_id, kind, title, url, tag, sink, sent_at)
       values ($1,$2,$3,$4,$5,$6,$7, case when $8 then null else now() end)
       returning id`,
      [t.profileId, t.studentId ?? null, msg.kind, msg.title,
       msg.url ?? null, msg.tag ?? null, sink, blocked]
    );
    const r = rows[0].id;
    log.push({ id: r, profileId: t.profileId, blocked });
    if (blocked) continue;

    // ⚠️ ③ **형제가 있는 집은 학부모 구독이 여러 번 걸린다.** endpoint 로 한 번만 보낸다
    const subs = await db.query(
      `select distinct on (endpoint) endpoint, p256dh, auth from v2.push_sub
        where profile_id = $1 and revoked_at is null`, [t.profileId]);

    for (const s of subs.rows) {
      try {
        await opts.push(s, pushPayload({ ...msg, r, role: t.role, studentId: t.studentId }));
        sent++;
      } catch (e) {
        await db.query(
          `update v2.notify_log set failed_at = now(), fail_why = $2 where id = $1`,
          [r, String(e?.message ?? e).slice(0, 300)]);
      }
    }
  }
  return { sink, sent, held: 0, hole: null, log };
}

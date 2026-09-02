/**
 * **자료 보내기** — 학부모 → 원장 (계획 절 ㊸).
 *
 * 왜 서버 동작(action)이 아니라 여기인가: 서버 동작의 본문은 기본 1MB 다.
 * 사진 30장은 줄여도 그것을 넘는다 — **넘으면 오류만 뜨고 아무도 까닭을 모른다.**
 * 라우트로 받으면 그 상한이 없다.
 *
 * ⚠️ **받을까 말까는 전부 `lib/files.js` 가 판단한다.** 여기서 확장자 목록도, 30장도,
 *    1600px 도 다시 적지 않는다 (원칙 1).
 * ⚠️ **형제가 있으면 누구 것인지 먼저 묻는다.** 화면이 안 물었으면 여기서 거절한다 —
 *    안 거절하면 형 학교 자료가 동생 칸에 들어가고 그대로 굳는다.
 * ⚠️ **갈래는 학부모가 안 고른다.** 올린 것은 「방금 온 것」에만 있고 아무 데도 안 붙는다
 *    (`v2.file_link` 를 안 만든다). 갈래를 고르고 묶는 것은 **원장님 자리**다.
 *    학부모에게는 `file_bin` 접근 규칙 자체가 없다 — 여기서 만들려 하면 막힌다.
 * ⚠️ **서비스 열쇠를 쓰지 않는다.** 그 사람 쿠키로 만든 클라이언트뿐이다.
 * ⚠️ **Storage 버킷은 아직 없다**(계획 0단계 9번 — 전환일 적용 파일). 그래서 지금 이 길은
 *    「버킷이 없습니다」로 정직하게 실패한다. **성공한 척하지 않는다.**
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverClientFromStore, roleOf, keys, SCHEMA } from "@/lib/supabase-server";
import {
  acceptBatch, refuseReason, cleanName, contentTypeFor,
  pathFor, purgeOnFor, dayOf, BUCKET, MAX_FILES, MAX_EDGE,
} from "@/lib/files";
import { ROLE } from "../shape";

const bad = (status, say, extra = {}) => NextResponse.json({ ok: false, say, ...extra }, { status });

export async function POST(request) {
  if (!keys().ok)
    return bad(503, "앱 설정이 아직 덜 됐습니다. 원장님께 알려주세요. (로그인 열쇠 없음)");

  const supabase = serverClientFromStore(await cookies());
  const me = await roleOf(supabase);
  if (!me.user) return bad(401, "로그인이 풀렸습니다. 다시 로그인해 주세요.");
  // ⚠️ 문지기는 `/parent` 를 역할로 지키지 않는다 (middleware.js 의 경고) — 여기서 본다
  if (me.role !== ROLE) return bad(403, me.msg || "학부모 계정으로만 보낼 수 있습니다.");

  const sb = supabase.schema(SCHEMA);

  let form;
  try { form = await request.formData(); }
  catch { return bad(400, "파일을 못 읽었습니다. 다시 시도해 주세요."); }

  const studentId = String(form.get("studentId") ?? "");
  const files = form.getAll("file").filter((f) => typeof f?.arrayBuffer === "function");
  const shrunkFlags = form.getAll("shrunk").map((v) => String(v) === "1");

  if (!files.length) return bad(400, "보낼 파일을 골라 주세요.");

  // ── 누구 것인가 — **먼저 묻는다** ────────────────────────────────────
  const mine = await sb.from("parent_student").select("student_id").eq("parent_profile_id", me.user.id);
  if (mine.error) return bad(500, 사람말로(mine.error));
  const ids = (mine.data ?? []).map((r) => r.student_id);
  if (!ids.length) return bad(400, "아직 아이가 연결되어 있지 않습니다. 원장님께 알려주세요.");
  if (!studentId) return bad(400, "어느 아이의 자료인지 먼저 골라 주세요.");
  if (!ids.includes(studentId)) return bad(403, "그 아이는 이 계정에 연결되어 있지 않습니다.");

  // ── 받을까 말까 — **판단은 lib/files.js** ────────────────────────────
  const meta = files.map((f) => ({ name: f.name, mime: f.type, bytes: f.size }));
  const batch = acceptBatch(meta, { already: 0 });
  if (batch.over || batch.refused.length || !batch.take.length) {
    return bad(400, batch.say || `한 번에 ${MAX_FILES}장까지입니다.`, {
      refused: batch.refused, over: batch.over, room: batch.room,
    });
  }

  // 「학원의 오늘」 — ⚠️ `new Date()` 로 세지 않는다 (서버가 UTC 면 밤부터 하루가 어긋난다)
  const t = await sb.rpc("today");
  const today = t?.error ? null : dayOf(t?.data);
  if (!today) return bad(503, "오늘 날짜를 못 읽었습니다. 원장님께 알려주세요.");

  // ⚠️ 파기일 — 학교 자료는 「그 학기가 끝나고 1년」인데 **학기 끝 날짜를 앱이 모른다.**
  //    지어내지 않고 비워 둔다. `purgeOnFor` 가 그 판단을 갖고 있다
  const purge = purgeOnFor({ to: "bin", on: today });

  const saved = [], failed = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const name = cleanName(f.name);
    // ⚠️ 묶음을 지났어도 **한 장씩 다시 본다** — 화면이 보낸 이름과 실제 이름이 다를 수 있다
    const why = refuseReason({ name, mime: f.type, bytes: f.size });
    if (why) { failed.push({ name, say: why.say }); continue; }

    // ⚠️ **id 를 먼저 만들고 그 id 로 경로를 짓는다.** 넣고 나서 지으면 버킷 경로와
    //    `v2.file.path` 가 다른 글자열이 되어 원장님이 눌러도 안 열리고, 파기가 엉뚱한 경로를 지운다
    const id = globalThis.crypto.randomUUID();
    const path = pathFor({ fileId: id, name, on: today });
    const mime = contentTypeFor(name);   // ⚠️ 폰이 적어 보내는 File.type 을 안 믿는다

    const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: mime, upsert: false });
    if (up.error) { failed.push({ name, say: 버킷말로(up.error) }); continue; }

    // ⚠️ 칸은 `lib/files.js` 의 `fileInsertSql()` 과 **같은 벌**이어야 한다.
    //    (원장 쪽은 pg 로 그 SQL 을 돌리고, 학부모 쪽은 접근 규칙을 지나려고 PostgREST 로 넣는다.
    //     `scripts/check-screen-parent.mjs` 가 두 칸 목록을 맞대어 본다)
    const ins = await sb.from("file").insert({
      id, by_profile: me.user.id, student_id: studentId,
      orig_name: name, mime, bytes: f.size, path,
      shrunk: Boolean(shrunkFlags[i]), purge_on: purge.purgeOn,
    }).select("id,orig_name,uploaded_at");

    if (ins.error || !(ins.data ?? []).length) {
      // ⚠️ 줄이 안 섰으면 버킷의 파일도 **남기지 않는다.** 남기면 아무도 모르는 파일이 쌓인다
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      failed.push({ name, say: ins.error ? 사람말로(ins.error) : "저장되지 않았습니다 (한 줄도 안 들어갔습니다)." });
      continue;
    }
    saved.push({ id, name });
  }

  // ⚠️ **한 장이라도 못 갔으면 그 사실을 그대로 말한다.** 「보냈습니다」로 뭉치지 않는다
  return NextResponse.json({
    ok: failed.length === 0,
    saved, failed,
    say: failed.length === 0
      ? `${saved.length}장을 보냈습니다. 원장님이 확인하시고 정리하십니다.`
      : `${saved.length}장은 갔고 ${failed.length}장은 못 갔습니다 — ${failed[0].say}`,
    note: purge.sure ? null : purge.why,
    shrinkEdge: MAX_EDGE,
  }, { status: failed.length ? 207 : 200 });
}

/** 버킷이 없을 때가 **지금 실제로 나는 오류다.** 영어를 그대로 보여주지 않는다 */
function 버킷말로(error) {
  const m = String(error?.message ?? "");
  if (/bucket not found|does not exist/i.test(m))
    return "아직 자료를 받을 자리가 열려 있지 않습니다 — 원장님께 알려주세요. (저장 공간 미개설)";
  if (/exceeded|too large|payload/i.test(m)) return "파일이 너무 큽니다. 나눠서 올려주세요.";
  if (/duplicate|already exists/i.test(m)) return "같은 파일이 이미 올라가 있습니다.";
  return "보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
}

function 사람말로(error) {
  const code = String(error?.code ?? "");
  if (code === "PGRST106") return "앱 설정이 아직 덜 됐습니다. 원장님께 알려주세요. (스키마 노출 안 됨)";
  if (code === "42501" || /row-level security/i.test(String(error?.message ?? "")))
    return "권한이 없어 저장하지 못했습니다. 원장님께 알려주세요.";
  return `저장하지 못했습니다 (${code || "까닭 모름"}). 원장님께 알려주세요.`;
}

/** ⚠️ 사진은 **브라우저에서** 긴 변 1600px 로 줄여 보낸다 (`view.js`). 여기서는 안 줄인다 —
 *  서버에서 줄이려면 그림 라이브러리가 필요하고, 그것은 이 판에서 넣지 않는다 */
export const runtime = "nodejs";

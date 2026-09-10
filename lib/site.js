/** 🏫 학교 홈페이지 받는 손((버2)) — 확장이 보낸 글을 **나이스와 같은 길**로 넣는다.
 *  판단은 새로 없다(원칙-1): 꼴 옮기기는 lib/site-plan.js, 무엇이 시험인지·이름·기간·옛 줄에 잇기는 lib/neis-plan.js 그대로.
 *  받는 길은 app/api/site/route.js 하나 · 열쇠는 확장 열쇠(v2.integration 'classcard' token — 확장 한 벌이 둘 다 쓴다). */
import { db } from "./supabase.js";
import { changed, rows as rowsOf } from "./sqlError.js";
import { planImport, diffExams, schoolYear } from "./neis-plan.js";
import { readSite } from "./site-plan.js";
import { syncAllStops } from "./exam.js";
/** 짐 받기 — 학교 하나치. 학교는 이름이나 id 로 찾는다(못 찾으면 **막지 않고** 까닭을 돌려준다) */
export async function receiveSite(svc, body, today) {
  const { from, to } = schoolYear(today);
  const want = String(body?.school_id ?? "").trim(), name = String(body?.school ?? "").trim();
  if (!want && !name) throw new Error("어느 학교인지(school_id 나 school)가 없습니다");
  const schools = rowsOf(await db(svc).from("schools").select("id,name,level").eq("state", "active"), "학교를 못 읽음");
  const school = (schools ?? []).find((s) => (want && s.id === want) || (name && s.name === name));
  if (!school) return { ok: false, why: `앱에 없는 학교입니다: ${name || want} — 학교를 먼저 만들어 주세요` };
  const year = Number(String(from).slice(0, 4));
  const { rows, dropped } = readSite(body, { year });
  if (!rows.length) return { ok: false, why: "날짜가 있는 줄을 못 찾았습니다 — 학사일정 화면에서 다시 보내 주세요", dropped: dropped.length };
  const [words, had] = await Promise.all([
    rowsOf(await db(svc).from("exam_word").select("word,scope"), "낱말을 못 읽음"),
    rowsOf(await db(svc).from("exams").select("id,scope,school_id,grade,name,term_from,term_to,english_on,source_key,state").eq("source", "site").eq("school_id", school.id).gte("term_from", from).lte("term_from", to), "있던 회차를 못 읽음"),
  ]);
  const plan = planImport([{ school, rows }], (words ?? []).filter((w) => w.scope === "national").map((w) => w.word));
  const mine = plan.exams.filter((e) => e.scope !== "national");   // 전국 회차는 나이스가 준다 — 홈페이지에서 온 것으로 안 만든다(두 벌이 된다)
  const diff = diffExams(had ?? [], mine);
  let put = 0;
  if (diff.fresh.length) {
    const put_rows = diff.fresh.map((e) => ({ scope: e.scope, school_id: e.school_id, grade: e.grade, name: e.name, term_from: e.term_from, term_to: e.term_to, source: "site", source_key: e.source_key, state: "active" }));   // 영어 시험일은 안 넣는다 — 홈페이지는 안 알려 준다(원장님이 12b 에서 찍으신다)
    put = (changed(await db(svc).from("exams").upsert(put_rows, { onConflict: "source,source_key" }).select("id"), "회차를 못 넣음") ?? []).length;
  }
  const now = new Date().toISOString();
  for (const c of diff.changed) changed(await db(svc).from("exams").update({ source_key: c.source_key, term_from: c.term_from, term_to: c.term_to, prev_term_from: c.prev_term_from, prev_term_to: c.prev_term_to, changed_at: now, changed_seen_at: null }).eq("id", c.id).select("id"), "옮겨진 회차를 못 적음");
  await syncAllStops(svc, today);   // 기간이 바뀌었을 수 있다 — 교재 멈춤 창을 다시 맞춘다(나이스와 같은 걸음)
  changed(await db(svc).from("schools").update({ site_seen_at: now }).eq("id", school.id).select("id"), "받은 때를 못 적음");   // 조용히 멈춘 것을 12b 가 이것으로 안다
  return { ok: true, school: school.name, read: rows.length, put, changed: diff.changed.length, dropped: dropped.length, skipped: plan.skipped };
}

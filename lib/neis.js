/** 나이스 받아오기의 손 — 열쇠(연동 neis, 원장만 읽힌다) · 학교 찾기 · 코드 붙이기 · 받아서 회차로(덮지 않는다: 출처+열쇠로 upsert, 영어 시험일은 안 건드린다). 판단은 lib/neis-plan.js(순수) */
import { db } from "./supabase.js";
import { schoolUrl, scheduleUrl, readNeis, whyFailed, toSchool, parseCode, makeCode, schoolYear, planImport } from "./neis-plan.js";
import { syncAllStops } from "./exam.js";
const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data ?? null; };
export async function neisKey(sb) {
  const it = row(await db(sb).from("integration").select("config").eq("id", "neis").maybeSingle(), "연동을 못 읽음");
  return String(it?.config?.key ?? "").trim();
}
async function call(fetchImpl, url, block) {
  let res, json = null;
  try { res = await fetchImpl(url, { cache: "no-store" }); } catch (e) { return { rows: [], error: `나이스를 부르지 못했어요: ${e.message}` }; }
  try { json = await res.json(); } catch { /* 본문이 JSON 이 아닐 수 있다 */ }
  if (!json) return { rows: [], error: `나이스가 읽을 수 없는 답을 보냈어요 (HTTP ${res.status}).` };
  const r = readNeis(json, block);
  if (!r.rows.length) { if (r.empty) return { rows: [], error: null, empty: true, note: whyFailed(r.code, r.message) }; if (r.code && r.code !== "INFO-000") return { rows: [], error: whyFailed(r.code, r.message) }; }
  return { rows: r.rows, total: r.total, error: null };
}
async function callAll(fetchImpl, key, code, from, to) {
  const all = []; let total = null;
  for (let page = 1; page <= 20; page++) {
    const res = await call(fetchImpl, scheduleUrl(key, code, from, to, page), "SchoolSchedule");
    if (res.error) return { rows: all, error: res.error };
    if (res.empty) return { rows: all, error: null, empty: all.length === 0 };
    if (res.total != null) total = Number(res.total);
    all.push(...res.rows);
    if (!total || all.length >= total || !res.rows.length) break;
  }
  return { rows: all, error: null, empty: all.length === 0 };
}
/** 학교 찾기(나이스 schoolInfo) — 이름 두 글자 이상 */
export async function searchSchools(sb, name, fetchImpl = fetch) {
  const q = String(name ?? "").trim(); if (q.length < 2) throw new Error("학교 이름을 두 글자 이상 적어주세요");
  const key = await neisKey(sb); if (!key) throw new Error("나이스 열쇠가 없습니다 — 연동(v2.integration) neis 줄의 key");
  const res = await call(fetchImpl, schoolUrl(key, q), "schoolInfo");
  if (res.error) throw new Error(res.error);
  return res.rows.map(toSchool);
}
/** 학교에 나이스 코드 붙이기 — 「교육청코드:학교코드」 한 칸 */
export async function setSchoolCode(sb, schoolId, atpt, schul) {
  const code = makeCode(String(atpt ?? "").trim(), String(schul ?? "").trim()); if (!code) throw new Error("학교 코드가 없습니다");
  const r = row(await db(sb).from("schools").update({ neis_code: code }).eq("id", schoolId).select("id"), "코드를 못 붙임");
  if (!r?.length) throw new Error("고쳐진 줄이 없습니다(검사-⑪)");
}
/** 🔄 다시 받기 — 코드 있는 학교 전부, 이 학년도. 넣는 것은 회차(학교 기간 · 전국 하루)뿐 · 출처+열쇠로 upsert(같은 줄이 하나) · 영어 시험일·손으로 넣은 줄은 안 건드린다 */
export async function importExams(sb, today, fetchImpl = fetch) {
  const key = await neisKey(sb); if (!key) throw new Error("나이스 열쇠가 없습니다 — 연동(v2.integration) neis 줄의 key 를 넣어 주세요(0072 가 옛 앱 설정에서 옮겼습니다)");
  const [schools, words] = await Promise.all([row(await db(sb).from("schools").select("id,name,level,neis_code").eq("state", "active"), "학교를 못 읽음"), row(await db(sb).from("exam_word").select("word,scope"), "낱말을 못 읽음")]);
  const targets = (schools ?? []).map((s) => ({ ...s, code: parseCode(s.neis_code) })).filter((s) => s.code);
  if (!targets.length) throw new Error("나이스 코드가 붙은 학교가 없습니다 — 학교 찾기로 먼저 붙이세요");
  const { from, to } = schoolYear(today);
  const bySchool = [], failed = [], notes = [];
  for (const s of targets) {
    const res = await callAll(fetchImpl, key, s.code, from, to);
    if (res.error) { failed.push(`${s.name} — ${res.error}`); continue; }
    if (res.empty) { notes.push(`${s.name}: 그 기간에 일정이 없어요.`); continue; }
    bySchool.push({ school: { id: s.id, name: s.name, level: s.level, code: s.neis_code }, rows: res.rows });
  }
  const plan = planImport(bySchool, (words ?? []).filter((w) => w.scope === "national").map((w) => w.word));
  let put = 0;
  if (plan.exams.length) {
    const rows = plan.exams.map((e) => ({ scope: e.scope, school_id: e.school_id, grade: e.grade, name: e.name, term_from: e.term_from, term_to: e.term_to, source: "neis", source_key: e.source_key, state: "active", ...(e.english_on ? { english_on: e.english_on } : {}) }));
    const r = row(await db(sb).from("exams").upsert(rows, { onConflict: "source,source_key" }).select("id"), "회차를 못 넣음");
    put = (r ?? []).length;
  }
  await syncAllStops(sb, today);   // 기간이 바뀌었을 수 있다 — 영어일 있는 회차의 교재 멈춤 창을 다시 맞춘다(06b)
  return { schools: bySchool.length, put, skipped: plan.skipped, failed, notes, from, to };
}

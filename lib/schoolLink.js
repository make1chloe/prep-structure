// 학생과 학교 줄을 **잇는 판정 한 곳** (전수검사 C7, 원장님 2026-08-16 「좋아」).
//
// 진실은 students.school_id 하나다 (0076) — 글자 칸(school)은 베낀 값이고,
// 학교 이름을 고치면 학생·시험이 저절로 따라온다. 그런데 등록·수정·엑셀·
// 상담 전환이 **글자만 적고 id 를 안 이어서**, 직접 적은 학생은 그 흐름
// 밖에 있었다 — 학교 이름을 고쳐도 그 아이만 옛 이름으로 남는다.
//
// 같은 학교 판정은 lib/schoolName 의 schoolKey (SQL 의 school_key 와 동일).

import { schoolKey } from "./schoolName";

/**
 * 이름으로 학교 줄을 찾는다 — 없으면 null (틀린 게 아니라 아직 명단에
 * 없는 학교일 수 있다. 잇는 것만 하고 만들지는 않는다 — 만드는 것은
 * 나이스가 붙는 attachSchool 의 일).
 */
export async function schoolIdOf(supabase, name, cache = null) {
  const n = (name || "").trim();
  if (!n) return null;
  let rows = cache;
  if (!rows) {
    const { data } = await supabase.from("schools").select("id, name");
    rows = data || [];
  }
  const k = schoolKey(n);
  return rows.find((s) => schoolKey(s.name) === k)?.id || null;
}

/**
 * **글자만 있는 학생을 한꺼번에 잇는다** — 학교 명단 화면의 단추가 부른다.
 * 명단에 없는 학교의 학생은 그대로 두고 이름만 알려준다 (지어내지 않는다).
 */
export async function linkLooseStudents(supabase) {
  const [{ data: schools }, { data: stu }] = await Promise.all([
    supabase.from("schools").select("id, name"),
    supabase.from("students").select("id, name, school, school_id")
      .is("school_id", null).not("school", "is", null),
  ]);
  const byKey = new Map((schools || []).map((s) => [schoolKey(s.name), s]));
  let linked = 0;
  const left = new Set();
  for (const s of stu || []) {
    const hit = byKey.get(schoolKey(s.school));
    if (!hit) { left.add(s.school.trim()); continue; }
    const { error } = await supabase
      .from("students").update({ school_id: hit.id }).eq("id", s.id);
    if (!error) linked += 1;
  }
  return { linked, left: [...left] };
}

/**
 * **이 일정이 이 아이 것인가.**
 *
 * 원장님 (2026-08-06)
 *   「일정은 해당 학교 학생이거나 일정에 학생이 연결된 경우에
 *    학생·학부모에게 노출시켜」
 *
 * 규칙은 0091(RLS) 과 **똑같다.** 그럼 왜 여기에도 두나 —
 *
 *   원장님은 학생 화면을 `?s=학생id` 미리보기로 확인하신다. 그때는 선생님
 *   계정이라 RLS 가 **전부 통과시킨다.** 그러면 미리보기에는 남의 학교
 *   일정까지 뜨고, 원장님은 아이가 그걸 본다고 생각하시게 된다.
 *   **미리보기가 거짓말을 하면 미리보기가 아니다.**
 *
 * 그래서 화면에서도 한 번 거른다. DB 가 막는 것이 진짜 방패이고,
 * 이것은 **미리보기를 정직하게 만드는 것**이다. 규칙이 두 군데인 것은
 * 맞지만, 하는 일이 다르다 — 한쪽은 막고 한쪽은 보여준다.
 *
 * 규칙을 바꾸실 때는 **둘 다** 고쳐야 한다. 그래서 여기 0091 이라고 적어둔다.
 */

/** 「신송중」과 「신송중학교」를 같은 곳으로 본다 (0076 의 school_key 와 같은 뜻) */
function schoolKey(name) {
  return (name || "")
    .toString()
    .replace(/\s+/g, "")
    .replace(/(초등학교|중학교|고등학교|초교|중교|고교|학교)$/u, "")
    .toLowerCase();
}

/**
 * **대상을 안 적었으면 아무에게도 안 보인다** (원장님, 2026-08-06).
 *
 * 처음에는 「안 적었으면 모두에게」 로 했다. 이미 적어둔 일정이 하루아침에
 * 사라지는 것이 무서워서였다. 그런데 그건 **한 번 겪고 마는 일**이고,
 * 안 적은 것이 새어 나가는 것은 **앞으로 계속 겪는 일**이다. 매번 겪는 쪽을
 * 안전하게 둔다.
 *
 * 그리고 이쪽이 원래 맞다. 「누가 보나」 를 생각 안 하고 적었다면 그건
 * **아직 안 정한 것**이지 「모두」 가 아니다. 모를 때 열어주는 쪽이 사고다.
 *
 *   all      전체        ← 골라야 보인다
 *   class    그 반
 *   grade    그 학교 · 그 학년
 *   student  고른 아이들
 *   (비움)   아무에게도 — 선생님만 보는 일정
 *
 * @param task  { deliver_scope, deliver_student_ids, deliver_school_id, deliver_school, deliver_grade, deliver_class_id }
 * @param me    { id, schoolId, school, grade, classIds }
 */
export function taskForStudent(task = {}, me = {}) {
  const scope = (task.deliver_scope || "").trim();
  // 「전체」 를 골랐으면 대상 칸이 비어 있어도 보인다. 그게 전체의 뜻이다
  if (scope === "all") return true;

  const students = task.deliver_student_ids || [];
  const schoolId = task.deliver_school_id || null;
  const school = (task.deliver_school || "").trim();
  const grade = (task.deliver_grade || "").trim();
  const classId = task.deliver_class_id || null;

  // 아무 대상도 안 적혔다 → 선생님만 보는 일정
  if (students.length === 0 && !schoolId && !school && !grade && !classId) return false;

  // 1) 학생을 콕 집은 것
  if (me.id && students.includes(me.id)) return true;

  // 2) 우리 학교 (학년까지 적혀 있으면 학년도 맞아야 한다)
  const schoolOk =
    schoolId
      ? me.schoolId === schoolId
      : school
      ? schoolKey(me.school) === schoolKey(school)
      : true;                          // 학교는 안 적고 학년만 적은 것
  const gradeOk = !grade || me.grade === grade;
  if ((schoolId || school || grade) && schoolOk && gradeOk) return true;

  // 3) 우리 반
  if (classId && (me.classIds || []).includes(classId)) return true;

  return false;
}

/** 여러 개를 한 번에 */
export function tasksForStudent(tasks = [], me = {}) {
  return tasks.filter((t) => taskForStudent(t, me));
}

/**
 * **누가 보나** — 선생님 화면에 한 줄로 적어준다.
 *
 * 규칙이 뒤집혔으니(안 적으면 안 보임) 원장님이 **적어둔 일정이 아이에게
 * 가는지 아닌지를 한눈에** 아셔야 한다. 안 그러면 「올렸는데 왜 모르지」 가 된다.
 */
export function audienceLabel(task = {}) {
  const scope = (task.deliver_scope || "").trim();
  if (scope === "all") return { text: "전체", tone: "tag-mint" };
  if (scope === "student" || (task.deliver_student_ids || []).length > 0) {
    const n = (task.deliver_student_ids || []).length;
    return { text: n ? `학생 ${n}명` : "학생 (안 고름)", tone: n ? "tag-sky" : "tag-amber" };
  }
  if (scope === "class" || task.deliver_class_id) {
    return task.deliver_class_id
      ? { text: "반", tone: "tag-sky" }
      : { text: "반 (안 고름)", tone: "tag-amber" };
  }
  if (scope === "grade" || task.deliver_school_id || task.deliver_school || task.deliver_grade) {
    const has = task.deliver_school_id || task.deliver_school || task.deliver_grade;
    return has
      ? { text: "학교·학년", tone: "tag-sky" }
      : { text: "학교 (안 고름)", tone: "tag-amber" };
  }
  return { text: "선생님만", tone: "tag-muted" };
}

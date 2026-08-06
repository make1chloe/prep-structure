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
 * @param task  { deliver_student_ids, deliver_school_id, deliver_school, deliver_grade, deliver_class_id }
 * @param me    { id, schoolId, school, grade, classIds }
 */
export function taskForStudent(task = {}, me = {}) {
  const students = task.deliver_student_ids || [];
  const schoolId = task.deliver_school_id || null;
  const school = (task.deliver_school || "").trim();
  const grade = (task.deliver_grade || "").trim();
  const classId = task.deliver_class_id || null;

  // 대상을 하나도 안 적었으면 모두에게 (학원 전체 휴강 · [전국] 수능일 …).
  // **안 적은 것을 「아무도 아님」 으로 보면 안 된다** — 그러면 지금까지 적어둔
  // 일정이 하루아침에 전부 사라진다.
  if (students.length === 0 && !schoolId && !school && !grade && !classId) return true;

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

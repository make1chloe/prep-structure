"use client";

import { useId } from "react";
import { gradeChoices } from "@/lib/grades";

/**
 * **골라 넣는 칸** (원장님, 2026-08-09 — 「db가 있어서 선택하면 되는 것을
 * 텍스트로 적게 되어 있는 거 없는지 전 페이지 전수검사해」).
 *
 * 학교와 학년이 다섯 군데에서 손으로 적히고 있었다. 손으로 적으면 같은
 * 학교가 「신정중 · 신정중학교 · 인천신정중」 으로 갈라지고, 그 순간 그
 * 학교의 시험 일정도 시험범위도 성적도 서로 다른 학교 것이 된다.
 * 오류는 안 난다 — 아이 하나가 조용히 빠질 뿐이다.
 */

/**
 * **학교 — 고르되, 적을 수도 있다.**
 *
 * 굳이 `<select>` 로 못 박지 않은 까닭: 표에 아직 없는 학교가 늘 있다.
 * 전학 온 아이의 학교, 이번에 처음 온 학교. 못 적으면 접수가 막히고,
 * 접수가 막히면 원장님이 앱 밖에 적으신다 — 그게 제일 나쁘다.
 *
 * `<datalist>` 는 **목록을 보여주되 막지는 않는다.** 있는 학교는 두 글자만
 * 쳐도 골라지고, 없는 학교는 그냥 적으면 된다.
 */
export function SchoolField({
  name = "school",
  schools = [],
  value,
  onChange,
  required = false,
  className = "input input-sm",
  ...rest
}) {
  /**
  * `useId()` 는 「:R1abc:」 처럼 **콜론이 든 값**을 준다. 브라우저는 이걸
  * id 로 잘 받지만, CSS 선택자로는 못 쓴다 (검사에서 걸렸다). 뒤에 이
  * 목록을 찾아볼 일이 있으니 글자·숫자만 남긴다.
  */
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const controlled = value !== undefined;
  return (
    <>
      <input
        className={className}
        name={name}
        list={`sch-${id}`}
        required={required}
        placeholder={schools.length ? "골라주세요 (없으면 적으셔도 됩니다)" : "신정중"}
        {...(controlled ? { value, onChange } : {})}
        {...rest}
      />
      <datalist id={`sch-${id}`}>
        {schools.map((s) => <option key={s} value={s} />)}
      </datalist>
    </>
  );
}

/**
 * **학년 — 값이 열둘로 끝난다.**
 *
 * 여기는 막아도 된다. 다만 **지금 적혀 있는 값이 목록에 없으면 그것도
 * 넣어준다** — 없으면 칸이 빈 것처럼 보이고, 그대로 저장하면 원래 적혀
 * 있던 것이 지워진다.
 */
export function GradeField({
  name = "grade",
  value,
  onChange,
  defaultValue = "",
  required = false,
  className = "input input-sm",
  ...rest
}) {
  const controlled = value !== undefined;
  const choices = gradeChoices(controlled ? value : defaultValue);
  return (
    <select
      className={className}
      name={name}
      required={required}
      {...(controlled ? { value, onChange } : { defaultValue })}
      {...rest}
    >
      <option value="">—</option>
      {choices.map((g) => <option key={g} value={g}>{g}</option>)}
    </select>
  );
}

/**
 * **목록에서 고르는 칸 (일반)** — 유입경로처럼 값이 정해진 것.
 *
 * 여기서도 **지금 값이 목록에 없으면 넣어준다.** 상담 화면의 유입경로가
 * 바로 이것을 안 해서, 설문지가 남긴 「기타 (친구 어머니가 알려주심)」 이
 * 수정창에서 빈 칸으로 보이고 저장하면 지워지고 있었다.
 */
export function PickField({
  name,
  options = [],
  value,
  onChange,
  defaultValue = "",
  className = "input input-sm",
  blank = "—",
  ...rest
}) {
  const controlled = value !== undefined;
  const cur = String((controlled ? value : defaultValue) || "").trim();
  const list = cur && !options.includes(cur) ? [cur, ...options] : options;
  return (
    <select
      className={className}
      name={name}
      {...(controlled ? { value, onChange } : { defaultValue })}
      {...rest}
    >
      <option value="">{blank}</option>
      {list.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

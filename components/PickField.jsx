"use client";

import { useState } from "react";
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
/**
 * **2판 — 진짜 고르는 칸으로** (원장님, 2026-08-14 — 「여전히 이미 입력된
 * 값을 불러오지 않고 수기로 텍스트로 적어야 되는 것이 있어. … 나이스
 * 정보를 불러와서 선택해야 되는 거 아냐」).
 *
 * 1판은 `<datalist>` 였다 — PC 크롬에서는 목록이 내려오지만 **아이폰에서는
 * 거의 안 보여서**, 원장님 눈에는 그냥 글자 치는 칸이었다. 이제 목록은
 * `<select>` 로 또렷이 고르고, 없는 학교만 「직접 적기」 를 골라 적는다.
 * (막지 않는 원칙은 그대로 — 전학 온 아이의 학교는 늘 목록에 없다)
 */
export function SchoolField({
  name = "school",
  schools = [],
  value,
  onChange,
  defaultValue = "",
  required = false,
  className = "input input-sm",
  ...rest
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue || "");
  const cur = controlled ? (value ?? "") : inner;
  // 지금 값이 목록에 없으면(옛날에 손으로 적은 것) 직접 적기 모드로 연다 —
  // select 로만 보이면 그 값이 빈 것처럼 보이고, 저장하면 지워진다
  const [custom, setCustom] = useState(() => !!(cur && schools.length && !schools.includes(cur)));
  const set = (v) => {
    if (!controlled) setInner(v);
    onChange?.({ target: { value: v } });
  };

  // 목록이 아예 없으면(학교 표가 비었으면) 적는 수밖에 없다
  if (schools.length === 0 || custom) {
    return (
      <>
        <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
          <input
            className={className}
            required={required}
            placeholder="학교 이름"
            value={cur}
            onChange={(e) => set(e.target.value)}
            {...rest}
          />
          {schools.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title="목록에서 고르기로 돌아갑니다"
              onClick={() => { setCustom(false); set(""); }}
            >
              목록
            </button>
          )}
        </span>
        {name && <input type="hidden" name={name} value={cur} />}
      </>
    );
  }

  return (
    <>
      <select
        className={className}
        required={required}
        value={schools.includes(cur) ? cur : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom") { setCustom(true); set(""); return; }
          set(v);
        }}
        {...rest}
      >
        <option value="">골라주세요</option>
        {schools.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value="__custom">목록에 없어요 — 직접 적기</option>
      </select>
      {name && <input type="hidden" name={name} value={cur} />}
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

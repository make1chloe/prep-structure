/**
 * **본보기 루틴** (원장님, 2026-08-11 — 「학습항목이랑 루틴설계해야하는데
 * 엄두가 안나」 → 「도와줘」).
 *
 * 루틴은 교재 한 권에 서너 줄이면 된다. 그런데 빈 화면에서 시작하면
 * **무엇부터 적어야 할지** 가 안 떠오른다 — 학습 항목이 마흔여섯 개라
 * 고르는 것부터 일이 된다.
 *
 * 그래서 영역(문법·독해·단어·영작)마다 **자주 쓰는 순서**를 미리 적어둔다.
 * 원장님은 넣고 나서 **고치신다** — 빈 화면을 채우는 것보다 있는 것을
 * 고치는 편이 훨씬 쉽다.
 *
 * ── 어떻게 짰나 ────────────────────────────────────────
 *
 * 0035 의 머리말에 원장님이 실제로 하시는 문법 순서가 적혀 있다.
 *
 *   1  등원: 단원 설명 정독 · 문답노트    숙제: 구두테스트(녹음) · 본교재 문제
 *   2  등원: 숙제채점 · 구두테스트(직접)  숙제: 워크북
 *   3  등원: 숙제채점 · 단원평가          숙제: —
 *
 * 그것을 뼈대로 삼고, 나머지 영역은 lib/basicHomework 의 항목 이름을
 * 그대로 써서 같은 결로 짰다.
 *
 * ── 이름으로 잇는다 ────────────────────────────────────
 *
 * 여기에는 **항목 이름만** 적는다. id 는 학원마다 다르고, 원장님이 이름을
 * 고치실 수도 있다. 넣을 때 이름으로 찾아 잇고, **못 찾은 것은 조용히
 * 버리지 않고 돌려준다** — 무엇이 빠졌는지 알아야 채워 넣으실 수 있다.
 */

/** 영역마다 자주 쓰는 순서. label 은 한눈에 알아보는 이름이다. */
export const ROUTINE_TEMPLATES = {
  문법: [
    {
      label: "개념 잡기",
      inclass: ["문법 개념 정독 · 문답노트 정리"],
      home: ["셀프녹음테스트 (문답노트)", "문법 문제풀기"],
    },
    {
      label: "확인하고 연습",
      inclass: ["문법 숙제채점", "구두테스트 (문답노트)"],
      home: ["문법 워크북 풀기"],
    },
    {
      label: "단원평가",
      inclass: ["문법 숙제채점", "단원평가"],
      home: ["문법 오답노트"],
    },
  ],
  독해: [
    {
      label: "예습하고 오기",
      inclass: ["직독직해 · 스피킹"],
      home: ["독해 지문 예습", "독해 해석쓰기"],
    },
    {
      label: "풀고 채점",
      inclass: ["독해 숙제채점", "SVOCM 표시하고 제출"],
      home: ["독해 워크북 풀기", "독해 클래스카드 (낭독·녹음·암기)"],
    },
    {
      label: "실전 · 정리",
      inclass: ["독해 숙제채점"],
      home: ["독해 실전 문제풀기 (시간재기)", "독해 오답노트"],
    },
  ],
  단어: [
    {
      label: "외워 오기",
      inclass: ["단어테스트"],
      home: ["단어 클래스카드 필수학습", "단어 교재 풀고 채점"],
    },
    {
      label: "다시 확인",
      inclass: ["단어테스트", "틀린 단어 쓰기"],
      home: ["단어 셀프테스트 (워크북)", "단어 스펠 100% (재도전)"],
    },
  ],
  영작: [
    {
      label: "개념 · 문제",
      inclass: ["영작 숙제채점"],
      home: ["영작 개념 정독 + 문제풀기"],
    },
    {
      label: "쓰기 연습",
      inclass: ["영작 숙제채점"],
      home: ["영작 워크북 풀기", "영어문장 쓰기 (서술형)"],
    },
  ],
  듣기: [
    {
      label: "듣고 받아쓰기",
      inclass: ["듣기 숙제채점"],
      home: ["듣기 문제풀기 + 딕테이션"],
    },
  ],
  내신: [
    {
      label: "회독 · 문제",
      inclass: ["내신 워크북"],
      home: ["내신 온라인 회독", "내신 문제풀기"],
    },
    {
      label: "확인",
      inclass: ["내신 숙제채점"],
      home: ["내신 워크북"],
    },
  ],
};

/** 이 영역에 본보기가 있나 */
export function templateFor(area) {
  const key = (area || "").toString().trim();
  return ROUTINE_TEMPLATES[key] || null;
}

/** 본보기가 있는 영역들 (화면에서 「무엇을 넣을 수 있나」 를 말해줄 때) */
export const TEMPLATE_AREAS = Object.keys(ROUTINE_TEMPLATES);

/**
 * 본보기를 **그 학원의 학습 항목 id** 로 옮긴다.
 *
 * @param steps  ROUTINE_TEMPLATES 의 한 영역
 * @param items  [{ id, name }] 그 학원의 학습 항목
 * @returns {{ rows: [{label, inclass_items, home_items}], missing: string[] }}
 *   missing — 이름으로 못 찾은 항목. **버리지 않고 돌려준다.**
 */
export function buildSteps(steps = [], items = []) {
  const byName = new Map((items || []).map((i) => [(i.name || "").trim(), i.id]));
  const missing = [];
  const pick = (names = []) =>
    names
      .map((n) => {
        const id = byName.get(n.trim());
        if (!id && !missing.includes(n)) missing.push(n);
        return id;
      })
      .filter(Boolean);

  const rows = steps.map((s, i) => ({
    sort: (i + 1) * 10,
    label: s.label || "",
    inclass_items: pick(s.inclass),
    home_items: pick(s.home),
  }));
  return { rows, missing };
}

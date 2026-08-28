/**
 * **이 학생에게만 더한 학습 항목 — 판단 한 벌** (0182, 원장님 2026-08-28
 * 「재원생에서 루틴에 학습항목 추가할 수 있게 해줘」).
 *
 * 담기는 곳은 `student_textbooks.routine_add` 한 칸이고, 읽는 곳은 셋이다:
 *   화면      app/students/routinePickActions.routineChoices
 *   차림      app/today/routineActions.nextRoutine
 *   청소      lib/itemRefs.stripItemRefs (죽은 이름표)
 * 셋이 모양을 저마다 풀면 **화면엔 있는데 아이한테 안 나가는** 사고가 난다.
 * 그래서 푸는 것도 세는 것도 여기 한 벌이다 (원칙 1).
 *
 * 세 칸은 routine_steps 의 inclass_items · home_items · home_next 와
 * **같은 뜻**이다 — 새 잣대를 만들지 않았다. 등원과 숙제 양쪽에 같은 항목을
 * 넣는 것도 그대로 된다 (루틴이 원래 그것을 허용한다 — 2026-08-28
 * 「루틴 내용 내가 작성한 거랑 달라」 를 고치며 확인한 규칙).
 */

/**
 * 세 갈래 — 화면이 고르는 단추도, 저장도, 차림도 이 목록을 따른다.
 * `steps` 는 routine_steps 의 짝이 되는 칸 이름이다 (뜻이 같음을 못 박아둔다).
 */
export const ADD_BUCKETS = [
  { key: "inclass", label: "등원 학습", step: "inclass_items", hint: "학원에서 해요" },
  { key: "home", label: "집 숙제", step: "home_items", hint: "오늘 단원이 붙어요" },
  { key: "next", label: "예습", step: "home_next", hint: "다음 단원이 붙어요" },
];

const KEYS = ADD_BUCKETS.map((b) => b.key);

/**
 * DB 에서 온 것을 **믿을 수 있는 모양**으로 편다.
 * 0182 전 DB 는 칸 자체가 없어 undefined 가 온다 — 그때도 빈 세 갈래를 준다
 * (화면·차림이 「없음」과 「못 읽음」을 따로 다룰 필요가 없게).
 */
export function normalizeAdd(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const k of KEYS) {
    const v = Array.isArray(src[k]) ? src[k] : [];
    out[k] = [...new Set(v.filter((x) => typeof x === "string" && x))];
  }
  return out;
}

/** 더한 항목 전부 (갈래 상관없이, 중복 없이) — 차례·이름 붙일 때 쓴다 */
export function addIds(add) {
  const a = normalizeAdd(add);
  return [...new Set(KEYS.flatMap((k) => a[k]))];
}

/** 이 항목이 어느 갈래로 더해졌나 — 화면이 딱지를 붙일 때 */
export function addBucketsOf(add, id) {
  const a = normalizeAdd(add);
  return KEYS.filter((k) => a[k].includes(id));
}

/**
 * 죽은 이름표를 걷어낸 것을 돌려준다 (`alive` 는 살아 있는 항목 id 집합).
 * 지운 것이 없으면 **원본을 그대로** 돌려준다 — 쓸데없는 저장을 안 만든다.
 */
export function pruneAdd(add, alive) {
  const a = normalizeAdd(add);
  let cut = 0;
  const out = {};
  for (const k of KEYS) {
    out[k] = a[k].filter((x) => alive.has(x));
    cut += a[k].length - out[k].length;
  }
  return { add: cut ? out : a, cut };
}

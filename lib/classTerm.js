// 특강 기한
//
// 특강은 끝난다. 끝난 특강이 목록에 계속 남아 있으면 매번 눈으로
// 걸러내야 하고, 오늘 수업에도 뜨고, 수강료에도 잡힌다.
//
// 그래서 **종료일 하나만** 넣어두면 나머지는 날짜가 알아서 한다.
// "끝났으니 보관 버튼을 눌러야지" 를 기억할 필요가 없어야 한다.
//   (원칙: 사람이 기억할 일을 늘리지 않는다)
//
// 기록은 지우지 않는다. 보관은 **화면에서만** 내리는 것이다 —
// 작년 겨울특강에 누가 있었는지는 나중에도 찾을 수 있어야 한다.

/** 이 반이 오늘 기준으로 끝났는가 (종료일이 지났거나 손으로 보관했거나) */
export function isArchived(klass = {}, today) {
  if (klass.archived_at) return true;
  if (!klass.ends_on || !today) return false;
  return klass.ends_on < today;
}

/** 아직 시작 전인가 (개강일을 미리 넣어둔 특강) */
function isUpcoming(klass = {}, today) {
  if (!klass.starts_on || !today) return false;
  return klass.starts_on > today;
}

/**
 * 지금 굴러가고 있는 반인가.
 * 오늘 수업 · 할일 생성 · 수강료는 전부 이것만 본다.
 */
export function isRunning(klass = {}, today) {
  return !isArchived(klass, today) && !isUpcoming(klass, today);
}

/** 굴러가는 반만 남긴다 */
export function running(classes = [], today) {
  return classes.filter((c) => isRunning(c, today));
}

/** 며칠 뒤에 끝나는가 (종료일 포함해서 센다). 종료일이 없으면 null */
export function daysLeft(klass = {}, today) {
  if (!klass.ends_on || !today) return null;
  const ms = Date.parse(`${klass.ends_on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

/**
 * 곧 끝나는 반에 붙일 한마디.
 *
 * 연장할지 말지를 **결정할 시점**을 알려주는 것이 목적이다.
 * 끝나고 나서 아는 것은 늦다.
 */
export function termLabel(klass = {}, today) {
  if (klass.archived_at) return { text: "보관됨", tone: "muted" };
  if (isUpcoming(klass, today)) return { text: `${klass.starts_on} 개강`, tone: "muted" };
  const d = daysLeft(klass, today);
  if (d === null) return null;
  if (d < 0) return { text: `${klass.ends_on} 종강`, tone: "muted" };
  if (d === 0) return { text: "오늘 종강", tone: "amber" };
  if (d <= 3) return { text: `${d}일 뒤 종강`, tone: "amber" };
  return { text: `${klass.ends_on} 까지`, tone: "muted" };
}

/**
 * 굴러가는 반을 읽어온다.
 *
 * 0042 전 DB 에서도 앱이 돌아가야 하므로, 기간 칸이 없으면 없는 대로 읽는다
 * (그 경우 모든 반이 굴러가는 것으로 본다 — 지금까지와 똑같이 동작한다).
 */
export async function loadRunningClasses(supabase, cols = "id, name, days", today) {
  return running(await loadClassesWithTerm(supabase, cols), today);
}

/**
 * **기간 칸까지 반드시 챙겨서** 반을 읽어온다 (거르지는 않는다).
 *
 * ── 왜 이 함수가 따로 있나 (2026-08-06) ──────────────────────
 *
 * 원장님 — 「여전히 반 일정이 고려되지 않아. 화목1특강이 8월 11일까지인데
 * 일정에 8월 이후에도 계속 수업이 있는 걸로 나와」
 *
 * 규칙(`lib/schedule` 의 `inTerm`)은 진작 맞게 적혀 있었다. **자료가 안 왔을
 * 뿐이다** — 대시보드·학생 달력·학부모 달력·학교별 화면이 `starts_on`,
 * `ends_on` 을 안 골라 읽고 있었다. 안 고르면 값이 `undefined` 가 되고,
 * `undefined` 는 「기한 없음 = 무기한」 으로 읽혀서 **종강한 특강이 영원히
 * 수업하는 반**이 된다. 오류도 안 나고 화면도 멀쩡해서 아무도 모른다.
 *
 * 이 앱에서 몇 번이나 겪은 모양이다 — 규칙은 한 군데 두었는데 **그 규칙에
 * 먹일 자료를 챙기는 일**이 화면마다 흩어져 있으면, 한 곳을 고쳐도 나머지가
 * 조용히 틀린 채로 남는다. 그래서 **읽어오는 일도 한 군데**로 모은다.
 *
 * `running()` 으로 거르지 않는다 — 달력은 **지나간 달**도 그린다. 8월 11일에
 * 끝난 특강은 8월 달력에는 11일까지 나와야 하고, 9월에는 없어야 한다.
 * 그 판단은 날짜마다 `inTerm` 이 한다.
 *
 * @param cols  기간 칸 말고 더 필요한 열 ("id, name, days" 처럼)
 * @param ids   있으면 그 반들만
 */
export async function loadClassesWithTerm(supabase, cols = "id, name, days", ids = null) {
  const term = "starts_on, ends_on, archived_at";
  const ask = (sel) => {
    const q = supabase.from("classes").select(sel);
    return Array.isArray(ids) ? q.in("id", ids) : q;
  };
  // 0042 전 DB 에는 기간 칸이 없다. 그때는 없는 대로 (모두 무기한으로) 읽는다
  let { data, error } = await ask(`${cols}, ${term}`);
  if (error) ({ data } = await ask(cols));
  return data || [];
}

/** 이 반이 실제로 끝난 날 (종강일이 없으면 손으로 보관한 날) */
export function endOf(klass = {}) {
  if (klass.ends_on) return klass.ends_on;
  if (klass.archived_at) return String(klass.archived_at).slice(0, 10);
  return null;
}

/**
 * 그 기간에 이 반이 하루라도 굴러갔는가.
 *
 * 수강료는 **오늘**이 아니라 **보고 있는 달**을 기준으로 봐야 한다.
 * 15일에 끝난 특강도 그 달에는 청구할 것이 있다.
 */
export function overlaps(klass = {}, first, last) {
  const e = endOf(klass);
  if (e && e < first) return false;
  if (klass.starts_on && klass.starts_on > last) return false;
  return true;
}

/** 특강처럼 출결을 따로 세야 하는 반인가 (= 정규반이 아닌 반) */
export function isExtra(klass = {}) {
  return !!klass.category && klass.category !== "정규반";
}

/** 그 날짜에 수업이 있는 반인가 — 요일 + 기간을 함께 본다 */
export function meetsOn(klass = {}, date, dow) {
  if (!isRunning(klass, date)) return false;
  return (klass.days || []).includes(dow);
}

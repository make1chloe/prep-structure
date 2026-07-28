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
export function isUpcoming(klass = {}, today) {
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

/** 끝난 반만 — 늦게 끝난 것부터 */
export function archived(classes = [], today) {
  return classes
    .filter((c) => isArchived(c, today))
    .sort((a, b) => (b.ends_on || "").localeCompare(a.ends_on || ""));
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
  const term = "starts_on, ends_on, archived_at";
  let { data, error } = await supabase.from("classes").select(`${cols}, ${term}`);
  if (error) ({ data } = await supabase.from("classes").select(cols));
  return running(data || [], today);
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

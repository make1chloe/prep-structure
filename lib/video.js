/**
 * 영상 주소 읽기 — 네트워크를 타지 않는다.
 *
 * 원장님은 유튜브에서 주소를 복사해 붙여넣는다. 그 주소는 모양이 여러 가지다.
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/shorts/ID
 *   https://www.youtube.com/embed/ID
 *   https://vimeo.com/123456789
 * 어떤 모양이든 같은 영상으로 알아봐야 한다.
 */

/** 주소에서 어디 영상인지, 영상 id 가 무엇인지 */
export function parseVideo(url) {
  const u = (url || "").trim();
  if (!u) return { provider: null, vid: null };

  const yt =
    u.match(/[?&]v=([\w-]{6,})/) ||
    u.match(/youtu\.be\/([\w-]{6,})/) ||
    u.match(/youtube\.com\/shorts\/([\w-]{6,})/) ||
    u.match(/youtube\.com\/embed\/([\w-]{6,})/) ||
    u.match(/youtube\.com\/live\/([\w-]{6,})/);
  if (yt) return { provider: "youtube", vid: yt[1] };

  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
  if (vm) return { provider: "vimeo", vid: vm[1] };

  return { provider: null, vid: null };
}

/** 화면 안에 끼워 넣을 주소 */
export function embedUrl(provider, vid, url) {
  if (provider === "youtube" && vid) return `https://www.youtube.com/embed/${vid}?rel=0`;
  if (provider === "vimeo" && vid) return `https://player.vimeo.com/video/${vid}`;
  return url || "";
}

/** 목록에 띄울 작은 그림 (유튜브만 주소로 바로 된다) */
export function thumbUrl(provider, vid) {
  if (provider === "youtube" && vid) return `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;
  return null;
}

/**
 * 세 갈래로 나눈다.
 *   안 봄 · 열어만 봄 · 다 봄
 * "봤어요" 하나로 묶으면 열어만 본 아이가 다 본 아이가 된다.
 */
export function viewState(v) {
  if (v?.done_at) return "done";
  if (v?.opened_at) return "opened";
  return "none";
}

export const VIEW_LABEL = { done: "다 봄", opened: "열어만 봄", none: "안 봄" };
export const VIEW_CLS = { done: "tag-mint", opened: "tag-amber", none: "tag-muted" };

/** 배정 한 건씩을 화면에 뿌릴 모양으로 */
export function rollup(videos = [], assignments = [], views = [], students = []) {
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const viewOf = new Map(views.map((v) => [`${v.video_id}|${v.student_id}`, v]));

  return videos.map((v) => {
    const mine = assignments.filter((a) => a.video_id === v.id);
    const rows = mine
      .map((a) => {
        const w = viewOf.get(`${v.id}|${a.student_id}`);
        return {
          studentId: a.student_id,
          name: nameOf.get(a.student_id) || "?",
          dueOn: a.due_on || null,
          assignedOn: a.assigned_on || null,
          state: viewState(w),
          opens: w?.opens || 0,
          lastAt: w?.last_at || null,
          doneAt: w?.done_at || null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));

    return {
      ...v,
      rows,
      total: rows.length,
      done: rows.filter((r) => r.state === "done").length,
      opened: rows.filter((r) => r.state === "opened").length,
      none: rows.filter((r) => r.state === "none").length,
    };
  });
}

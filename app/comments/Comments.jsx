"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listComments, addComment, deleteComment, markRead } from "./actions";

const ROLE = {
  staff: { label: "선생님", cls: "tag-sky" },
  student: { label: "학생", cls: "tag-mint" },
  parent: { label: "학부모", cls: "tag-lav" },
};

function when(iso) {
  const d = new Date(iso);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return same ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/**
 * 리포트 한 건의 댓글.
 * 선생님 화면과 학생·학부모 화면에서 같은 것을 쓴다.
 *
 * @param reportId   daily_reports.id — 없으면 아직 리포트가 없다는 뜻
 * @param studentId  누구 것인지
 * @param me         내 role (staff | student | parent)
 * @param openBy     처음부터 펼칠지
 */
export default function Comments({ reportId, studentId, me = "staff", openBy = false }) {
  const [open, setOpen] = useState(openBy);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(true);
  const [list, setList] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!open || loaded || !reportId) return;
    let alive = true;
    listComments(reportId).then((res) => {
      if (!alive) return;
      setList(res.comments || []);
      setReady(res.ready !== false);
      setLoaded(true);
      // 선생님이 열면 읽음 처리
      if (me === "staff" && (res.comments || []).some((c) => !c.read_at)) {
        markRead(reportId).then(() => router.refresh());
      }
    });
    return () => {
      alive = false;
    };
  }, [open, loaded, reportId, me, router]);

  function send() {
    const body = text.trim();
    if (!body) return;
    setErr(null);
    startTransition(async () => {
      const res = await addComment(reportId, studentId, body);
      if (res?.error) {
        setErr(res.error);
        return;
      }
      setText("");
      const fresh = await listComments(reportId);
      setList(fresh.comments || []);
      router.refresh();
    });
  }

  function remove(id) {
    if (!confirm("이 댓글을 지울까요?")) return;
    startTransition(async () => {
      await deleteComment(id);
      setList((l) => l.filter((c) => c.id !== id));
      router.refresh();
    });
  }

  if (!reportId) return null;

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        💬 댓글
      </button>
    );
  }

  return (
    <div
      className="stack"
      style={{
        gap: 8,
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px dashed var(--border)",
        width: "100%",
      }}
    >
      {!ready && (
        <div className="notice">
          댓글을 쓰려면 Supabase에서 <b>0023 SQL</b>을 먼저 실행해주세요.
        </div>
      )}

      {loaded && list.length === 0 && ready && (
        <p className="hint" style={{ margin: 0 }}>
          {me === "staff"
            ? "아직 댓글이 없습니다."
            : "궁금한 점이나 알려주실 내용을 남겨주세요. 선생님이 확인합니다."}
        </p>
      )}

      {list.map((c) => {
        const r = ROLE[c.author_role] || ROLE.staff;
        return (
          <div key={c.id} className="stack" style={{ gap: 2 }}>
            <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
              <span className={`tag ${r.cls}`}>{r.label}</span>
              <b style={{ fontSize: 14 }}>{c.author_name || ""}</b>
              <span className="hint">{when(c.created_at)}</span>
              {me === "staff" && !c.read_at && c.author_role !== "staff" && (
                <span className="tag tag-amber">새 댓글</span>
              )}
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => remove(c.id)}>
                삭제
              </button>
            </div>
            <div style={{ fontSize: 14.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{c.body}</div>
          </div>
        );
      })}

      {ready && (
        <div className="row" style={{ gap: 6, alignItems: "flex-end" }}>
          <textarea
            className="input"
            rows={2}
            style={{ flex: 1, minWidth: 160 }}
            placeholder={me === "staff" ? "답글 쓰기" : "선생님께 남길 말"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || !text.trim()}
            onClick={send}
          >
            남기기
          </button>
        </div>
      )}

      {err && <div className="notice notice-bad">{err}</div>}

      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
        닫기
      </button>
    </div>
  );
}

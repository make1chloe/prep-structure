"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNotice, deleteNotice } from "./actions";
import { applyTasksDelivery } from "@/app/tasks/actions";

const SCOPES = [
  { key: "all", label: "전체" },
  { key: "class", label: "반별" },
  { key: "grade", label: "학교·학년별" },
  { key: "student", label: "개인별" },
];

const KINDS = [
  {
    key: "deliver",
    label: "전달사항",
    hint: "수업 중 학생에게 말로 전할 내용이에요. 하원 전에 전달했는지 체크합니다.",
  },
  {
    key: "notice",
    label: "공지",
    hint: "학부모 리포트에 나갈 공지예요. 학생별 공지는 각 학생 칸에서 따로 적을 수 있어요.",
  },
];

export default function TopNotices({
  date,
  classes = [],
  students = [],
  notices = [],
  tasks = [],
  unavailable = false,
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("deliver");
  const [scope, setScope] = useState("all");
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const schools = [...new Set(students.map((s) => s.school).filter(Boolean))].sort();
  const grades = [...new Set(students.map((s) => s.grade).filter(Boolean))].sort();

  const mine = notices.filter((n) => n.kind === kind);
  const undone = notices.filter((n) => n.kind === "deliver" && n.done < n.total);

  // 지금 설정으로 몇 명에게 가는지 미리 보여준다
  const targetCount =
    scope === "all"
      ? students.length
      : scope === "class"
      ? students.filter((s) => (s.classIds || []).includes(classId)).length
      : scope === "grade"
      ? students.filter((s) => (!school || s.school === school) && (!grade || s.grade === grade)).length
      : picked.size;

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      const res = await createNotice({
        date,
        kind,
        scope,
        classId: classId || null,
        school: school || null,
        grade: grade || null,
        studentIds: [...picked],
        body,
      });
      if (res?.error) {
        alert(res.error);
        return;
      }
      setBody("");
      setPicked(new Set());
      router.refresh();
    });
  }

  function remove(id) {
    if (!confirm("이 내용을 지울까요? 전달 체크 기록도 함께 지워집니다.")) return;
    startTransition(async () => {
      const res = await deleteNotice(id);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  const pendingTasks = tasks.filter((t) => t.deliverBody && !t.applied);

  function applyTasks(ids) {
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await applyTasksDelivery(ids, date);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (unavailable) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          공지·전달사항을 쓰려면 Supabase에서 <b>0009_notices.sql</b> 을 한 번 실행해주세요.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
      <button className="grouphead" onClick={() => setOpen(!open)}>
        <span style={{ fontWeight: 800 }}>
          {open ? "▾" : "▸"} 공지 · 전달사항
        </span>
        <span className="muted" style={{ fontSize: 12.5 }}>
          오늘 {notices.length}건
          {undone.length > 0 && (
            <b style={{ color: "var(--amber)" }}> · 아직 전달 안 한 항목 {undone.length}건</b>
          )}
          {pendingTasks.length > 0 && (
            <b style={{ color: "var(--lav)" }}> · 오늘 일정에서 만들 전달사항 {pendingTasks.length}건</b>
          )}
        </span>
      </button>

      {open && (
        <div style={{ padding: "12px 16px 14px" }}>
          {tasks.length > 0 && (
            <div className="card card-tight" style={{ marginBottom: 12, background: "var(--surface-2)" }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ fontSize: 13 }}>오늘 일정 {tasks.length}건</b>
                {pendingTasks.length > 0 && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => applyTasks(pendingTasks.map((t) => t.id))}
                    disabled={pending}
                  >
                    전달사항 {pendingTasks.length}건 한 번에 만들기
                  </button>
                )}
              </div>
              <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                {tasks.map((t) => (
                  <div className="unitrow" key={t.id}>
                    {t.time && <span className="hint" style={{ minWidth: 38 }}>{t.time}</span>}
                    <b style={{ fontSize: 12.5 }}>{t.title}</b>
                    {t.category && <span className="tag tag-muted">{t.category}</span>}
                    <span className="spacer" />
                    {t.deliverBody &&
                      (t.applied ? (
                        <span className="tag tag-mint">전달사항 만듦</span>
                      ) : (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => applyTasks([t.id])}
                          disabled={pending}
                        >
                          전달사항 만들기
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="row" style={{ gap: 4 }}>
            {KINDS.map((k) => (
              <button
                key={k.key}
                className={`btn btn-sm ${kind === k.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setKind(k.key)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ margin: "6px 0 10px" }}>
            {KINDS.find((k) => k.key === kind)?.hint}
          </p>

          <div className="row" style={{ gap: 4, alignItems: "center" }}>
            {SCOPES.map((sc) => (
              <button
                key={sc.key}
                className={`btn btn-sm ${scope === sc.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setScope(sc.key)}
              >
                {sc.label}
              </button>
            ))}

            {scope === "class" && (
              <select
                className="input input-sm"
                style={{ width: 170 }}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {scope === "grade" && (
              <>
                <select
                  className="input input-sm"
                  style={{ width: 150 }}
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                >
                  <option value="">학교 전체</option>
                  {schools.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  className="input input-sm"
                  style={{ width: 110 }}
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                >
                  <option value="">학년 전체</option>
                  {grades.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </>
            )}
            <span className="tag tag-sky">대상 {targetCount}명</span>
          </div>

          {scope === "student" && (
            <div className="row" style={{ gap: 4, marginTop: 8 }}>
              {students.map((s) => (
                <button
                  key={s.id}
                  className={`hwchip ${picked.has(s.id) ? "hw-next" : ""}`}
                  onClick={() => {
                    const n = new Set(picked);
                    n.has(s.id) ? n.delete(s.id) : n.add(s.id);
                    setPicked(n);
                  }}
                >
                  {picked.has(s.id) && <b>＋</b>} {s.name}
                </button>
              ))}
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 10, alignItems: "flex-start" }}>
            <textarea
              className="input input-sm"
              rows={2}
              style={{ flex: 1, minWidth: 240 }}
              placeholder={
                kind === "deliver"
                  ? "예) 다음 주 월요일은 학교 행사로 6시 시작"
                  : "예) 이번 주 단어 시험 범위는 Unit 5~6입니다"
              }
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={submit}
              disabled={pending || !body.trim() || targetCount === 0}
            >
              {pending ? "저장 중…" : "추가"}
            </button>
          </div>

          {mine.length > 0 && (
            <div className="stack" style={{ gap: 4, marginTop: 12 }}>
              {mine.map((n) => (
                <div className="unitrow" key={n.id}>
                  <span className="tag tag-lav">{n.targetLabel}</span>
                  <span style={{ flex: 1, minWidth: 160, fontSize: 13 }}>{n.body}</span>
                  {n.kind === "deliver" && (
                    <span className={`tag ${n.done >= n.total ? "tag-mint" : "tag-amber"}`}>
                      전달 {n.done}/{n.total}
                    </span>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(n.id)} disabled={pending}>
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

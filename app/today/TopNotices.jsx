"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createNotice, deleteNotice } from "./actions";
import { applyTasksDelivery } from "@/app/tasks/actions";
import NoticePhotos from "@/components/NoticePhotos";
import RequestPhotos from "@/components/RequestPhotos";

const SCOPES = [
  { key: "all", label: "전체" },
  { key: "class", label: "반별" },
  { key: "grade", label: "학교·학년별" },
  { key: "student", label: "개인별" },
];

const KINDS = [
  {
    key: "deliver",
    label: "학생용 공지",
    hint:
      "수업 중 학생에게 말로 전하고, 하원 전에 전달했는지 체크합니다. " +
      "같은 내용이 그 학생의 숙제 문자에도 함께 나갑니다.",
  },
  {
    key: "notice",
    label: "학부모용 공지",
    hint:
      "데일리리포트에 함께 나갑니다. 학생 한 명에게만 할 말은 각 학생 칸의 '공지' 에 적으세요.",
  },
];

export default function TopNotices({
  date,
  classes = [],
  students = [],
  notices = [],
  tasks = [],
  unavailable = false,
  preClass = { comments: [], requests: [] },
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("deliver");
  const [scope, setScope] = useState("all");
  const [classId, setClassId] = useState(classes[0]?.id || "");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
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
    if (!body.trim() && !title.trim()) return;   // 사진만 보내는 경우엔 제목만 있어도 된다
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
        title,
      });
      if (res?.error) {
        alert(res.error);
        return;
      }
      setBody("");
      setTitle("");
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

  // 수업 전에 볼 것 — 오늘 오는 학생 것만 추려서 여기 띄운다
  const pre = [
    ...(preClass.comments || []).map((c) => ({
      key: `c${c.id}`,
      tag: c.author_role === "parent" ? "학부모" : "학생",
      cls: c.author_role === "parent" ? "tag-lav" : "tag-mint",
      name: c.name,
      text: c.body,
    })),
    ...(preClass.requests || []).map((r) => ({
      photos: r.photos || [],
      key: `r${r.id}`,
      tag: r.kind === "absence" ? "결석 알림" : r.kind === "makeup" ? "보강 요청" : "문의",
      cls: "tag-amber",
      name: r.name,
      text:
        [r.from_date && `${r.from_date.slice(5)}${r.to_date && r.to_date !== r.from_date ? `~${r.to_date.slice(5)}` : ""}`, r.body]
          .filter(Boolean)
          .join(" · "),
    })),
  ];

  const preBox = pre.length > 0 && (
    <div className="card" style={{ marginTop: 12, borderColor: "var(--amber)" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
        수업 전에 볼 것 {pre.length}건
      </h2>
      <p className="muted" style={{ margin: "0 0 8px", fontSize: 12.5 }}>
        <b>오늘 오는 학생</b>이 남긴 것만 모았습니다. 대시보드까지 안 가도 됩니다.
      </p>
      <div className="stack" style={{ gap: 4 }}>
        {pre.map((p) => (
          <div className="unitrow" key={p.key} style={{ alignItems: "flex-start" }}>
            <span className={`tag ${p.cls}`}>{p.tag}</span>
            <b style={{ fontSize: 12.5 }}>{p.name}</b>
            <div style={{ fontSize: 12.5, flex: 1 }}>
              {p.text}
              {/* 학교에서 받은 종이를 찍어 보냈으면 여기 함께 온다 */}
              {(p.photos || []).length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <RequestPhotos paths={p.photos} readOnly small />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (unavailable) {
    return (
      <>
      {preBox}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          공지·전달사항을 쓰려면 Supabase에서 <b>0009_notices.sql</b> 을 한 번 실행해주세요.
        </div>
      </div>
      </>
    );
  }

  return (
    <>
    {preBox}
    <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
      <button className="grouphead" onClick={() => setOpen(!open)}>
        <span style={{ fontWeight: 800 }}>
          {open ? "▾" : "▸"} 공지 (학생용 · 학부모용)
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

          <input
            className="input input-sm"
            style={{ width: "100%", marginTop: 10 }}
            placeholder="제목 (선택) — 예) 2학기 중간고사 시간표"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "flex-start" }}>
            <textarea
              className="input input-sm"
              rows={2}
              style={{ flex: 1, minWidth: 240 }}
              placeholder={
                kind === "deliver"
                  ? "학생에게 — 예) 다음 주 월요일은 학교 행사로 6시 시작"
                  : "학부모님께 — 예) 이번 주 단어 시험 범위는 Unit 5~6입니다"
              }
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={submit}
              disabled={pending || (!body.trim() && !title.trim()) || targetCount === 0}
            >
              {pending ? "저장 중…" : "추가"}
            </button>
          </div>
          <p className="hint" style={{ margin: "6px 0 0" }}>
            학교에서 나눠준 종이(학사일정 · 시험 시간표 · 가정통신문)는 옮겨 적지 마시고,
            <b> 먼저 추가한 뒤 아래 목록에서 📷 로 찍어 붙이세요.</b> 받는 사람 화면에 그대로 보입니다.
          </p>

          {mine.length > 0 && (
            <div className="stack" style={{ gap: 4, marginTop: 12 }}>
              {mine.map((n) => (
                <div className="card card-tight" key={n.id}>
                  <div className="unitrow">
                    <span className="tag tag-lav">{n.targetLabel}</span>
                    <span style={{ flex: 1, minWidth: 160, fontSize: 13 }}>
                      {n.title && <b>{n.title}</b>}
                      {n.title && n.body && n.body !== n.title ? " — " : ""}
                      {n.body !== n.title ? n.body : ""}
                    </span>
                    {n.kind === "deliver" && (
                      <span className={`tag ${n.done >= n.total ? "tag-mint" : "tag-amber"}`}>
                        전달 {n.done}/{n.total}
                      </span>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(n.id)} disabled={pending}>
                      삭제
                    </button>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <NoticePhotos noticeId={n.id} photos={n.photos || []} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

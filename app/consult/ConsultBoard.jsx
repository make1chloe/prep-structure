"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateInquiry,
  setInquiryStatus,
  deleteInquiries,
  convertToStudent,
  ensureFormLink,
  STATUS,
} from "./actions";
import { dowOf, parts } from "@/lib/day";

const SOURCES = ["블로그", "소개", "전단", "검색", "방문", "기타"];
const CLS = Object.fromEntries(STATUS.map((s) => [s.key, s.cls]));
const LABEL = Object.fromEntries(STATUS.map((s) => [s.key, s.label]));

function dayLabel(d) {
  if (!d) return "";
  const dow = dowOf(d);
  const t = { getMonth: () => parts(d).m - 1, getDate: () => parts(d).d };
  return `${t.getMonth() + 1}/${t.getDate()} (${dow})`;
}

export default function ConsultBoard({
  rows = [],
  classes = [],
  unavailable = false,
  formReady = true,
}) {
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const kw = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (filter === "open" && ["enrolled", "declined"].includes(r.status)) return false;
    if (filter !== "open" && filter !== "all" && r.status !== filter) return false;
    if (kw && ![r.name, r.school, r.grade, r.phone].filter(Boolean).some((v) => v.toLowerCase().includes(kw)))
      return false;
    return true;
  });

  const counts = {};
  STATUS.forEach((s) => (counts[s.key] = rows.filter((r) => r.status === s.key).length));
  const openCount = rows.filter((r) => !["enrolled", "declined"].includes(r.status)).length;

  const allChecked = shown.length > 0 && shown.every((r) => sel.has(r.id));
  function toggleAll() {
    if (allChecked) {
      const n = new Set(sel);
      shown.forEach((r) => n.delete(r.id));
      setSel(n);
    } else setSel(new Set([...sel, ...shown.map((r) => r.id)]));
  }
  function toggleOne(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  const [copied, setCopied] = useState(null);

  async function copyLink(r) {
    const res = await ensureFormLink(r.id);
    if (res?.error) {
      alert(res.error);
      return;
    }
    const url = `${window.location.origin}/apply?t=${res.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(r.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt("이 링크를 복사해서 보내주세요", url);
    }
    router.refresh();
  }

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  function startEdit(r) {
    setEditId(r.id);
    setDraft({
      name: r.name || "",
      phone: r.phone || "",
      student_phone: r.student_phone || "",
      school: r.school || "",
      grade: r.grade || "",
      source: r.source || "",
      status: r.status || "new",
      consult_on: r.consult_on || "",
      consult_at: (r.consult_at || "").slice(0, 5),
      test_on: r.test_on || "",
      test_at: (r.test_at || "").slice(0, 5),
      test_result: r.test_result || "",
      test_note: r.test_note || "",
      want_time: r.want_time || "",
      memo: r.memo || "",
      class_id: r.class_id || "",
    });
  }

  const className = (id) => classes.find((c) => c.id === id)?.name || "";

  if (unavailable) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          상담을 쓰려면 Supabase에서 <b>0017 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="row" style={{ gap: 4, marginTop: 12, alignItems: "center" }}>
        <input
          className="input input-sm"
          style={{ width: 170 }}
          placeholder="이름·학교·번호 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className={`btn btn-sm ${filter === "open" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setFilter("open")}
        >
          진행중 {openCount}
        </button>
        {STATUS.map((s) => (
          <button
            key={s.key}
            className={`btn btn-sm ${filter === s.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(s.key)}
          >
            {s.label} {counts[s.key]}
          </button>
        ))}
        <button
          className={`btn btn-sm ${filter === "all" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setFilter("all")}
        >
          전체 {rows.length}
        </button>
      </div>

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}건 선택</b>
          <select
            className="input input-sm"
            style={{ width: 140 }}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (!v) return;
              run(async () => {
                const r = await setInquiryStatus([...sel], v);
                setSel(new Set());
                return r;
              });
            }}
            disabled={pending}
          >
            <option value="">상태 변경…</option>
            {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (!confirm(`${sel.size}건을 삭제할까요?`)) return;
              run(async () => {
                const r = await deleteInquiries([...sel]);
                setSel(new Set());
                return r;
              });
            }}
            disabled={pending}
          >
            삭제
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ gap: 8, alignItems: "center", padding: "12px 16px" }}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          <span className="hint">보이는 {shown.length}건 전체 선택</span>
        </div>

        {shown.length === 0 ? (
          <p className="muted" style={{ padding: "0 16px 16px", margin: 0, fontSize: 13.5 }}>
            해당하는 상담이 없어요.
          </p>
        ) : (
          shown.map((r) => {
            const editing = editId === r.id;
            return (
              <div className="stuRow" key={r.id}>
                <div className="row" style={{ gap: 8, alignItems: "center", padding: "10px 16px" }}>
                  <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleOne(r.id)} />
                  <span className={`tag ${CLS[r.status] || "tag-muted"}`}>{LABEL[r.status] || r.status}</span>
                  <b style={{ fontSize: 13.5 }}>{r.name}</b>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {[r.school, r.grade].filter(Boolean).join(" ")}
                  </span>
                  {r.phone && <span className="hint mono">{r.phone}</span>}
                  {r.source && <span className="tag tag-muted">{r.source}</span>}
                  {formReady && (
                    r.form_submitted_at ? (
                      <span className="tag tag-mint">양식 제출</span>
                    ) : (
                      <span className="tag tag-muted">양식 미제출</span>
                    )
                  )}
                  {r.consult_on && (
                    <span className="hint">
                      상담 {dayLabel(r.consult_on)}
                      {r.consult_at ? ` ${r.consult_at.slice(0, 5)}` : ""}
                    </span>
                  )}
                  {r.test_on && (
                    <span className="tag tag-sky">
                      테스트 {dayLabel(r.test_on)}
                      {r.test_at ? ` ${r.test_at.slice(0, 5)}` : ""}
                    </span>
                  )}
                  {r.class_id && <span className="tag tag-muted">{className(r.class_id)}</span>}
                  <span className="spacer" />
                  {r.status !== "enrolled" && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        if (!confirm(`${r.name} 학생을 재원생으로 등록할까요?`)) return;
                        run(() => convertToStudent(r.id, r.class_id));
                      }}
                      disabled={pending}
                    >
                      등록으로 전환
                    </button>
                  )}
                  {formReady && !r.form_submitted_at && (
                    <button className="btn btn-ghost btn-sm" onClick={() => copyLink(r)}>
                      {copied === r.id ? "링크 복사됨 ✓" : "양식 링크"}
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => (editing ? setEditId(null) : startEdit(r))}
                  >
                    {editing ? "닫기" : "수정"}
                  </button>
                </div>

                {!editing && (r.memo || r.test_note || r.test_want_on || r.visit_on || r.goal) && (
                  <div style={{ padding: "0 16px 10px 44px" }}>
                    {(r.test_want_on || r.visit_on || r.want_days_text || r.want_time) && (
                      <div className="hint">
                        <b>학부모 희망:</b>
                        {r.test_want_on && ` 테스트 ${dayLabel(r.test_want_on)}${r.test_want_at ? ` ${r.test_want_at.slice(0, 5)}` : ""}`}
                        {r.visit_on && ` · 상담 ${dayLabel(r.visit_on)}${r.visit_at ? ` ${r.visit_at.slice(0, 5)}` : ""}`}
                        {r.visit_alt && ` (${r.visit_alt})`}
                        {r.want_days_text && ` · 수업 ${r.want_days_text}`}
                        {r.want_time && ` ${r.want_time}`}
                      </div>
                    )}
                    {r.prev_academy && <div className="hint"><b>학습 경험:</b> {r.prev_academy}</div>}
                    {r.goal && <div className="hint"><b>바라는 점:</b> {r.goal}</div>}
                    {r.memo && <div className="hint">{r.memo}</div>}
                    {r.test_note && (
                      <div className="hint">
                        <b>테스트:</b> {r.test_result ? `${r.test_result} · ` : ""}{r.test_note}
                      </div>
                    )}
                  </div>
                )}

                {editing && (
                  <div className="stuPanel">
                    <div className="editgrid">
                      <div className="field">
                        <label className="label">이름</label>
                        <input className="input input-sm" value={draft.name}
                          onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">학부모 번호</label>
                        <input className="input input-sm" value={draft.phone}
                          onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">학생 번호</label>
                        <input className="input input-sm" value={draft.student_phone}
                          onChange={(e) => setDraft({ ...draft, student_phone: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">학교</label>
                        <input className="input input-sm" value={draft.school}
                          onChange={(e) => setDraft({ ...draft, school: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">학년</label>
                        <input className="input input-sm" value={draft.grade}
                          onChange={(e) => setDraft({ ...draft, grade: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">유입경로</label>
                        <select className="input input-sm" value={draft.source}
                          onChange={(e) => setDraft({ ...draft, source: e.target.value })}>
                          <option value="">—</option>
                          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label className="label">상태</label>
                        <select className="input input-sm" value={draft.status}
                          onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                          {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label className="label">상담 날짜</label>
                        <input className="input input-sm" type="date" value={draft.consult_on}
                          onChange={(e) => setDraft({ ...draft, consult_on: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">상담 시간</label>
                        <input className="input input-sm" type="time" value={draft.consult_at}
                          onChange={(e) => setDraft({ ...draft, consult_at: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">테스트 날짜</label>
                        <input className="input input-sm" type="date" value={draft.test_on}
                          onChange={(e) => setDraft({ ...draft, test_on: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">테스트 시간</label>
                        <input className="input input-sm" type="time" value={draft.test_at}
                          onChange={(e) => setDraft({ ...draft, test_at: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">테스트 결과</label>
                        <input className="input input-sm" value={draft.test_result}
                          placeholder="예: 중2 기본반 수준"
                          onChange={(e) => setDraft({ ...draft, test_result: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">희망 시간</label>
                        <input className="input input-sm" value={draft.want_time}
                          placeholder="예: 월수 7시 이후"
                          onChange={(e) => setDraft({ ...draft, want_time: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">배정 예정 반</label>
                        <select className="input input-sm" value={draft.class_id}
                          onChange={(e) => setDraft({ ...draft, class_id: e.target.value })}>
                          <option value="">—</option>
                          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="field" style={{ marginTop: 8 }}>
                      <label className="label">상담 내용</label>
                      <textarea className="input input-sm" rows={2} value={draft.memo}
                        onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
                    </div>
                    <div className="field" style={{ marginTop: 8 }}>
                      <label className="label">테스트 메모</label>
                      <textarea className="input input-sm" rows={2} value={draft.test_note}
                        onChange={(e) => setDraft({ ...draft, test_note: e.target.value })} />
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 10 }}>
                      <button className="btn btn-primary btn-sm" disabled={pending}
                        onClick={() => run(async () => {
                          const res = await updateInquiry(r.id, draft);
                          setEditId(null);
                          return res;
                        })}>저장</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

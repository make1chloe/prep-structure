"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateInquiry,
  setInquiryStatus,
  deleteInquiries,
  convertToStudent,
  sendApplyLink,
  sendVisitInfo,
  ensureFormLink,
  setInquiryBooks,
} from "./actions";
import { STATUS } from "./status";
import { slotText, SOURCES as APPLY_SOURCES } from "@/lib/applySlots";
import { SchoolField, GradeField, PickField } from "@/components/PickField";
import { dowOf, parts } from "@/lib/day";

// **설문지와 한 벌이어야 한다** (원장님, 2026-08-09 — 「설문지에서 기타를
// 선택한 경우 추가로 작성한 내용이 안 들어오는 거 같아」).
//
// 여기 목록이 따로 있었다. 설문지는 「재원생 소개 / 지인 소개 / 블로그 /
// 인터넷 검색 / 지나가다 보고 / 기타」 로 받고, 고른 것 뒤에 적어주신 글을
// 「기타 (친구 어머니가 알려주심)」 처럼 붙여 저장한다. 그 값이 이 화면의
// 목록에는 없으니 수정창에서 **빈 칸**으로 보이고, 그대로 저장하면 원래
// 글이 지워졌다. 저장은 잘 되고 있었다 — 보여주는 쪽이 잃고 있었다.
const SOURCES = APPLY_SOURCES.map((s) => s.key);
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
  schools = [],
  textbooks = [],
  unavailable = false,
  formReady = true,
}) {
  const bookNameOf = new Map(textbooks.map((b) => [b.id, b.name]));
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
  const [note, setNote] = useState(null);   // 방금 보낸 결과 (줄마다 한 줄)
  const [busy, setBusy] = useState(null);   // 지금 문자를 보내는 중인 줄

  /**
   * 문자 한 통.
   *
   * **발송 방식이 「직접 발송」 이면 안 나간다.** 그때는 만든 글을 그대로
   * 보여드리고 문자앱을 열어드린다 — 안 나갔는데 「보냈어요」 라고 하면
   * 그 집은 아무 연락도 못 받은 채로 지나간다.
   */
  /**
   * 문자 한 통.
   *
   * **`startTransition` 안에서 결과를 그리지 않는다.** 이 화면의 다른
   * 단추들은 누르면 `router.refresh()` 로 화면을 통째로 다시 그리는데,
   * 여기는 화면을 안 옮기고 **그 줄에만 한 줄을 붙인다.** 그 상태 바꾸기가
   * 전환 안에서는 그려지지 않았다 — 서버는 답을 줬는데 화면은 그대로라,
   * 「눌렀는데 아무 일도 안 일어난다」 가 됐다 (크롬 검사에서 잡혔다).
   *
   * 그냥 async 로 부르고, 누른 줄만 잠근다.
   */
  async function sms(r, fn, what) {
    setNote(null);
    setBusy(r.id);
    try {
      let res;
      try {
        res = await fn(r.id);
      } catch (e) {
        setNote({ id: r.id, bad: true, text: `보내지 못했어요: ${e?.message || e}` });
        return;
      }
      if (res?.error && !res.text) {
        setNote({ id: r.id, bad: true, text: res.error });
        return;
      }
      if (res?.sent) {
        setNote({ id: r.id, bad: false, text: `${what}를 보냈어요.` });
        router.refresh();
        return;
      }

      /**
       * **안 나갔다.** 발송 방식이 「직접 발송」 이거나 솔라피가 막혔을 때다.
       *
       * 글을 그 자리에 펴놓고, 문자앱은 **누르고 싶으면 누르시게** 둔다.
       * 앞 판은 곧바로 문자앱으로 화면을 옮겼는데, 컴퓨터에서는 아무 일도
       * 안 일어나서 안 나간 줄도 모르고 지나가게 된다.
       */
      const body = res?.text || "";
      setNote({
        id: r.id,
        bad: false,
        text: res?.error
          ? `아직 안 나갔어요 — ${res.error}`
          : "아래 글로 보내주세요 (복사해뒀습니다).",
        body,
        to: r.phone || "",
      });
      copyText(body);
    } finally {
      setBusy(null);
    }
  }

  /**
   * **복사는 안 될 수 있다 — 그리고 그때 멈춰 있을 수도 있다.**
   *
   * 브라우저에 따라 `clipboard.writeText` 가 거절도 안 하고 그냥 끝나지
   * 않는다. 그러면 그 뒤 줄이 영영 안 돌아서, 눌러도 아무 일이 안
   * 일어난 것처럼 보인다. 1초만 기다리고 안 되면 안 된 것으로 친다.
   */
  async function copyText(text) {
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 1000)),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async function copyLink(r) {
    const res = await ensureFormLink(r.id);
    if (res?.error) {
      alert(res.error);
      return;
    }
    const url = `${window.location.origin}/apply?t=${res.token}`;
    if (await copyText(url)) {
      setCopied(r.id);
      setTimeout(() => setCopied(null), 2000);
    } else {
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
          <p className="muted" style={{ padding: "0 16px 16px", margin: 0, fontSize: 15 }}>
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
                  <b style={{ fontSize: 15 }}>{r.name}</b>
                  <span className="muted" style={{ fontSize: 13 }}>
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
                        /**
                          * **학교가 학사일정에 붙었는지 말해준다** (0114 뒤,
                          * 2026-08-09). 등록하는 순간 그 학교를 받아오는데,
                          * 나이스에 같은 이름이 여럿이거나 못 찾으면 원장님이
                          * 학교 화면에서 이어주셔야 한다. 조용히 지나가면
                          * 그 아이만 시험 일정이 없는 채로 몇 달이 간다.
                          */
                        startTransition(async () => {
                          const res = await convertToStudent(r.id, r.class_id);
                          if (res?.error) return alert(res.error);
                          const sc = res.school;
                          if (sc?.note) alert(`${sc.name} — ${sc.note}`);
                          else if (sc?.added) alert(`${sc.name} 을(를) 학사일정에 넣었어요.`);
                          router.refresh();
                        });
                      }}
                      disabled={pending}
                    >
                      등록으로 전환
                    </button>
                  )}
                  {/**
                    * **전화 끊고 바로 나가야 한다** (원장님, 2026-08-07 —
                    * 「1. 전화옴 2. 문자로 설문지 제출할 링크 보내줌
                    *  3. 레시간, 상담시간 및 오는 길 안내 문자」).
                    *
                    * 전에는 「양식 링크」 가 복사만 했다. 복사 → 문자앱 →
                    * 번호 찾기 → 붙여넣기 → 인사말. 다섯 걸음이라 그 사이에
                    * 다른 전화가 오면 그 집은 링크를 못 받는다.
                    */}
                  {formReady && !r.form_submitted_at && (
                    <button
                      className={`btn btn-sm ${r.link_sent_at ? "btn-ghost" : ""}`}
                      disabled={busy === r.id}
                      title={r.phone ? "설문지 링크를 문자로 보냅니다" : "전화번호를 먼저 적어주세요"}
                      onClick={() => sms(r, sendApplyLink, "설문지 링크")}
                    >
                      {r.link_sent_at ? "링크 다시" : "① 설문지 링크"}
                    </button>
                  )}
                  {/* 일정이 잡혀야 보낼 것이 생긴다 — 없으면 눌러도 할 말이 없다 */}
                  {(r.test_on || r.consult_on || r.visit_on) && (
                    <button
                      className={`btn btn-sm ${r.guide_sent_at ? "btn-ghost" : ""}`}
                      disabled={busy === r.id}
                      title="레벨테스트·상담 시간과 오시는 길을 문자로 보냅니다"
                      onClick={() => sms(r, sendVisitInfo, "일정 안내")}
                    >
                      {r.guide_sent_at ? "일정 다시" : "② 일정 · 오시는 길"}
                    </button>
                  )}
                  {formReady && !r.form_submitted_at && (
                    <button className="btn btn-ghost btn-sm" onClick={() => copyLink(r)}
                            title="문자 말고 카톡 등으로 보내실 때">
                      {copied === r.id ? "복사됨 ✓" : "링크만 복사"}
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => (editing ? setEditId(null) : startEdit(r))}
                  >
                    {editing ? "닫기" : "수정"}
                  </button>
                </div>

                {/* **보낸 결과는 그 줄에서 보인다.** 화면 맨 아래에 두면
                    목록이 길 때 화면 밖에 있고, 그러면 눌러도 아무 일이
                    안 일어난 것처럼 보인다 */}
                {note?.id === r.id && (
                  <div style={{ padding: "0 16px 8px 44px" }}>
                    <p className={note.bad ? "err" : "hint"} style={{ margin: 0 }}>
                      {note.text}
                    </p>
                    {/* 안 나갔을 때 — 나갈 뻔한 글을 그대로 펴놓는다 */}
                    {note.body && (
                      <>
                        <textarea
                          className="input input-sm"
                          rows={6}
                          readOnly
                          value={note.body}
                          style={{ marginTop: 6 }}
                          onFocus={(e) => e.target.select()}
                        />
                        {note.to && (
                          <a
                            className="btn btn-sm"
                            style={{ marginTop: 6, display: "inline-block" }}
                            href={`sms:${note.to.replace(/[^0-9+]/g, "")}?body=${encodeURIComponent(note.body)}`}
                          >
                            문자앱으로 열기
                          </a>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/**
                  * **`&&` 앞에 숫자를 두면 그 숫자가 그려진다.**
                  *
                  * 여기 맨 끝이 `r.want_slots?.length` 였다. 희망 시간표를 하나도
                  * 안 고른 줄에서는 그 값이 **0** 이고, 앞의 것들도 다 비어 있으면
                  * 「거짓」 이 아니라 **0** 이 되어 화면에 0 이 찍혔다 (실제로
                  * 상담 목록 아래에 0 이 하나 떠 있었다). `> 0` 으로 참·거짓을
                  * 만들어 넘긴다.
                  */}
                {!editing && !!(r.memo || r.test_note || r.test_want_on || r.visit_on || r.goal
                  || r.test_want_text || r.visit_want_text || r.want_slots?.length > 0
                  || r.book_ids?.length > 0) && (
                  <div style={{ padding: "0 16px 10px 44px" }}>
                    {/* **고르신 시간표가 제일 위다** (2026-08-06). 어느 반에 넣을지가
                        상담 전에 정해지는 일이 많아서, 이것부터 보여야 한다 */}
                    {r.want_slots?.length > 0 && (
                      <div className="row" style={{ gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
                        {r.want_slots.map((k) => (
                          <span className="tag tag-mint" key={k} style={{ fontSize: 12 }}>
                            {slotText([k])}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* 글로 적어주신 희망 시간 — 날짜 칸으로는 못 받던 것 */}
                    {r.test_want_text && (
                      <div className="hint"><b>테스트 가능:</b> {r.test_want_text}</div>
                    )}
                    {r.visit_want_text && (
                      <div className="hint"><b>방문상담 가능:</b> {r.visit_want_text}</div>
                    )}
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
                    {r.goal && <div className="hint"><b>개선하고 싶은 점:</b> {r.goal}</div>}
                    {r.memo && <div className="hint">{r.memo}</div>}
                    {r.test_note && (
                      <div className="hint">
                        <b>테스트:</b> {r.test_result ? `${r.test_result} · ` : ""}{r.test_note}
                      </div>
                    )}
                    {/* 등록 전에 골라둔 교재 (0122) — 등록하면 그대로 배정된다 */}
                    {r.book_ids?.length > 0 && (
                      <div className="hint">
                        <b>교재:</b>{" "}
                        {r.book_ids.map((bid) => bookNameOf.get(bid) || "(지워진 교재)").join(" · ")}
                        <span className="muted"> — 등록하면 그대로 배정돼요</span>
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
                        <SchoolField schools={schools} name={undefined} value={draft.school}
                          onChange={(e) => setDraft({ ...draft, school: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">학년</label>
                        <GradeField name={undefined} value={draft.grade}
                          onChange={(e) => setDraft({ ...draft, grade: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">유입경로</label>
                        {/* 목록에 없는 값(설문지가 남긴 「기타 (…)」)도 그대로 지킨다 */}
                        <PickField options={SOURCES} value={draft.source}
                          onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
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
                    {/**
                      * **등록 전에 교재 골라두기** (0122, 원장님 2026-08-15 —
                      * 「신규 상담 정보에 교재 배정이 없음. 아직 등록 안 해도」).
                      * 고르는 즉시 저장된다 (저장 버튼과 무관) — 교재 안내를
                      * 보낼 때도 자동으로 적히고, 등록하면 그대로 배정된다.
                      */}
                    <div className="field" style={{ marginTop: 8 }}>
                      <label className="label">교재 (등록하면 자동 배정 · 고르면 바로 저장)</label>
                      <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        {(r.book_ids || []).map((bid) => (
                          <button
                            key={bid}
                            className="hwchip hw-next"
                            title="누르면 뺍니다"
                            disabled={pending}
                            onClick={() => run(() =>
                              setInquiryBooks(r.id, (r.book_ids || []).filter((x) => x !== bid))
                            )}
                          >
                            {bookNameOf.get(bid) || "(지워진 교재)"} ✕
                          </button>
                        ))}
                        <select
                          className="input input-sm"
                          style={{ minWidth: 200 }}
                          value=""
                          disabled={pending}
                          onChange={(e) => {
                            const v = e.target.value;
                            e.target.value = "";
                            if (!v) return;
                            run(() => setInquiryBooks(r.id, [...(r.book_ids || []), v]));
                          }}
                        >
                          <option value="">교재 추가…</option>
                          {textbooks.map((b) => (
                            <option key={b.id} value={b.id} disabled={(r.book_ids || []).includes(b.id)}>
                              {b.area ? `[${b.area}] ` : ""}{b.name}
                            </option>
                          ))}
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

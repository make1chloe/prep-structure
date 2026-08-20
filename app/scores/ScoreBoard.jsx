"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScore, removeScores, addWrong, removeWrongs, listWrongs } from "./actions";
import { KINDS, KIND_LABEL, summary, byKind, trendOf, gradeByCuts, findExam, cutsFor } from "@/lib/scores";
import { useBulk, BulkBar } from "@/components/Bulk";
import { shortName } from "@/lib/schoolName";
import { examTitle } from "@/lib/examList";
import { SchoolField } from "@/components/PickField";

const EMPTY = {
  kind: "school",
  taken_on: "",
  term: "",
  subject: "영어",
  raw_score: "",
  full_score: "100",
  grade: "",
  percentile: "",
  rank_in: "",
  rank_of: "",
  school: "",
  cuts: "",
  note: "",
  exam_id: "",
};

export default function ScoreBoard({ students = [], scores = [], exams = [], pick = null, pickExam = null, canEdit = false, schools = [] }) {
  const [sel, setSel] = useState(pick || students[0]?.id || "");
  /**
   * **누르고 들어왔으면 채워져 있어야 한다** (원장님, 2026-08-08 —
   * 「아직 성적 미입력자 클릭 안 돼」).
   *
   * 눌러도 아무 일이 안 일어나는 것처럼 보였다. 실제로는 학생이 골라지고
   * 있었는데, **목록은 화면 맨 위이고 넣는 칸은 한참 아래**라 바뀐 것이
   * 눈에 안 들어왔다. 이미 그 학생이 골라져 있던 때는 더 그랬다.
   *
   * 그래서 학생만 고르지 않고 **그 시험까지 채워** 두고, 넣는 칸으로
   * 화면을 내려준다. 그러면 누른 뒤 할 일이 「점수 적기」 하나만 남는다.
   */
  const [form, setForm] = useState(() => {
    const e = pickExam ? exams.find((x) => x.id === pickExam) : null;
    if (!e) return EMPTY;
    return {
      ...EMPTY,
      kind: "school",
      exam_id: e.id,
      term: e.name || "",
      school: e.school === "전국" ? "" : e.school || "",
      taken_on: e.english_on || e.from_date || "",
    };
  });
  const [editId, setEditId] = useState(null);
  const [openId, setOpenId] = useState(null);      // 틀린 문제를 연 성적
  const [wrongs, setWrongs] = useState([]);
  const [w, setW] = useState({ question: "", topic: "", reason: "" });
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const student = students.find((s) => s.id === sel) || null;

  // 누르고 들어왔으면 넣는 칸까지 내려준다 — 안 그러면 바뀐 줄을 모른다
  const formRef = useRef(null);
  useEffect(() => {
    if (!pickExam || !formRef.current) return;
    formRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [pickExam]);
  const mine = scores.filter((s) => s.student_id === sel);
  const groups = byKind(mine);
  const bulk = useBulk(mine);

  const nameOf = new Map(students.map((s) => [s.id, s.name]));

  const kw = q.trim().toLowerCase();
  const shownStudents = kw
    ? students.filter((s) => s.name.toLowerCase().includes(kw)).slice(0, 40)
    : students.filter((s) => s.status === "enrolled").slice(0, 40);

  function run(fn, after) {
    startTransition(async () => {
      const r = await fn();
      if (r?.error) alert(r.error);
      else after?.(r);
      router.refresh();
    });
  }

  function save() {
    run(
      () => saveScore({ ...form, id: editId, studentId: sel }),
      () => {
        // **시험 맥락은 남긴다** (2026-08-21) — 같은 시험을 20명 넣는 자리라,
        // 종류·회차·본 날·학교·만점까지 비우면 매번 다시 골라야 했다.
        // 점수 쪽(원점수·등급·백분위·석차·메모)만 비운다
        setForm((f) => ({
          ...EMPTY,
          kind: f.kind,
          exam_id: f.exam_id,
          taken_on: f.taken_on,
          term: f.term,
          school: f.school,
          full_score: f.full_score,
          cuts: f.cuts,
        }));
        setEditId(null);
      }
    );
  }

  function startEdit(s) {
    setEditId(s.id);
    setForm({
      kind: s.kind || "school",
      taken_on: s.taken_on || "",
      term: s.term || "",
      subject: s.subject || "영어",
      raw_score: s.raw_score ?? "",
      full_score: s.full_score ?? "100",
      grade: s.grade ?? "",
      percentile: s.percentile ?? "",
      rank_in: s.rank_in ?? "",
      rank_of: s.rank_of ?? "",
      school: s.school || "",
      cuts: (s.cuts || []).join(", "),
      note: s.note || "",
      exam_id: s.exam_id || "",
    });
  }

  function openWrongs(s) {
    if (openId === s.id) {
      setOpenId(null);
      return;
    }
    setOpenId(s.id);
    setWrongs([]);
    listWrongs(s.id).then((r) => setWrongs(r?.rows || []));
  }

  /**
   * **이 아이가 봤을 만한 회차** (원장님, 2026-08-08).
   *
   * 그동안은 「무슨 시험」 을 손으로 적고, 회차는 날짜·학교로 **짐작**했다
   * (lib/scores 의 findExam). 등급컷은 짐작해도 크게 안 틀리지만,
   * 성적표를 며칠 늦게 받아 적으면 엉뚱한 회차에 붙는다.
   *
   * 이제 고른다. 아무거나 다 늘어놓으면 못 고르므로 —
   *   모의고사  전국 회차 중 이 아이 학년 것
   *   내신      이 아이 학교 회차 중 이 아이 학년 것
   * 로 좁힌다. 학년이 안 적힌 회차는 전 학년 공통으로 본다.
   */
  const examChoices = (() => {
    if (form.kind === "unit") return [];
    const norm = (v) => (v || "").toString().replace(/\s/g, "");
    const want = form.kind === "mock" ? "전국" : norm(form.school || student?.school || "");
    if (!want) return [];
    const g = norm(student?.grade || "");
    return exams
      .filter((e) => norm(e.school) === norm(want))
      .filter((e) => !e.grade || !g || norm(e.grade) === g)
      .slice(0, 40);
  })();

  // 지금 적고 있는 성적은 **어느 회차**인가 — 컷은 거기서 온다.
  // **고른 것이 있으면 그것이 이긴다** — 짐작보다 적어둔 것이 늘 정확하다
  const formExam =
    exams.find((e) => e.id === form.exam_id) ||
    findExam(
      { kind: form.kind, taken_on: form.taken_on, school: form.school },
      exams,
      student
    );

  /** 회차를 고르면 날짜·이름·학교가 따라 채워진다 — 두 번 적을 이유가 없다 */
  function chooseExam(id) {
    const e = exams.find((x) => x.id === id);
    if (!e) { setForm({ ...form, exam_id: "" }); return; }
    setForm({
      ...form,
      exam_id: e.id,
      term: e.name || form.term,
      school: e.school === "전국" ? form.school : e.school || form.school,
      taken_on: form.taken_on || e.english_on || e.from_date || "",
    });
  }
  // 그 컷이면 지금 점수가 몇 등급인지 바로 보인다
  const cutPreview = (() => {
    const { cuts } = cutsFor({ cuts: (form.cuts || "").split(/[,\s/·]+/) }, formExam);
    const g = gradeByCuts(form.raw_score, cuts);
    return g ? `이 컷이면 ${g}등급` : null;
  })();

  return (
    <div className="stack" style={{ gap: 12, marginTop: 12 }}>
      {/* ---- 학생 고르기 ---- */}
      <div className="card card-tight">
        <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input input-sm"
            style={{ width: 160 }}
            placeholder="학생 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {shownStudents.map((s) => (
            <button
              key={s.id}
              className={`hwchip ${sel === s.id ? "hw-next" : ""}`}
              /* 학생만 바꾼다 — 시험 맥락(종류·회차·날짜·학교)은 그대로 (2026-08-21) */
              onClick={() => {
                setSel(s.id);
                setEditId(null);
                setForm((f) => ({
                  ...EMPTY,
                  kind: f.kind, exam_id: f.exam_id, taken_on: f.taken_on,
                  term: f.term, school: f.school, full_score: f.full_score, cuts: f.cuts,
                }));
              }}
            >
              {sel === s.id && <b>＋</b>} {s.name}
            </button>
          ))}
        </div>
        {student && (
          <div className="row" style={{ marginTop: 6, gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="hint">
              {[student.school, student.grade].filter(Boolean).join(" ")} · 성적 {mine.length}건
            </span>
            <span className="spacer" />
            {/* **리포트로 가는 문.** 이 화면은 넣는 곳이고, 보는 곳은 따로다 —
                상담 중에 펴놓으실 화면이라 넣기 칸이 섞여 있으면 안 된다 */}
            <a className="btn btn-ghost btn-sm" href="/scores/spec">문항표</a>
            <a className="btn btn-ghost btn-sm" href="/scores/analysis">출제분석</a>
            <a className="btn btn-primary btn-sm" href={`/scores/${student.id}`}>
              {student.name} 리포트 보기
            </a>
          </div>
        )}
      </div>

      {/**
        * **「아이들이 직접 낸 것」 칸을 뺐다** (원장님, 2026-08-08 —
        * 「성적 아이들이 직접 낸 것도 아예 필요없어」).
        *
        * 아이가 앱에서 성적을 내는 길을 열어두었는데, 실제로는 원장님이
        * 성적표를 보고 직접 적으신다. 안 쓰는 칸이 **상담 중에 펴놓는
        * 화면 맨 위**를 차지하고 있었다.
        *
        * 이미 아이가 낸 줄이 있으면 목록에는 그대로 남는다 — 자료를
        * 지우지는 않는다. 따로 세어 보여주지 않을 뿐이다.
        */}

      {/* ---- 넣기 ---- */}
      {student && (
        <div className="card">
          <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>
            {editId ? "성적 고치기" : `${student.name} 성적 넣기`}
          </h2>

          <div className="row" style={{ gap: 4, marginBottom: 8 }}>
            {KINDS.map((k) => (
              <button
                key={k.key}
                className={`btn btn-sm ${form.kind === k.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setForm({ ...form, kind: k.key })}
                title={k.hint}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ width: 150 }}>
              <label className="label">시험 본 날</label>
              <input
                className="input input-sm"
                type="date"
                value={form.taken_on}
                onChange={(e) => setForm({ ...form, taken_on: e.target.value })}
              />
            </div>
            {/**
              * **어느 시험인지 고른다** (원장님, 2026-08-08).
              *
              * 손으로 적으면 「3월 학평」 「3월 학력평가」 「3월 모의」 가 다
              * 다른 시험이 된다. 고르면 회차가 못 박히고, 등급컷 · 문항별
              * 분석이 그 시험지에 정확히 붙는다.
              *
              * 회차가 하나도 없으면(학사일정을 아직 안 받아왔거나) 예전처럼
              * 손으로 적는 칸이 나온다 — 막아두면 성적을 아예 못 넣는다.
              */}
            {examChoices.length > 0 ? (
              <div className="field" style={{ width: 230 }}>
                <label className="label">어느 시험</label>
                <select
                  className="input input-sm"
                  value={form.exam_id}
                  onChange={(e) => chooseExam(e.target.value)}
                >
                  <option value="">— 고르세요 (직접 적으려면 비워두세요) —</option>
                  {examChoices.map((e) => (
                    <option key={e.id} value={e.id}>
                      {examTitle(e)}
                      {e.english_on ? ` · ${e.english_on.slice(5)}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {!form.exam_id && (
              <div className="field" style={{ width: 170 }}>
                <label className="label">무슨 시험{examChoices.length > 0 ? " (직접)" : ""}</label>
                <input
                  className="input input-sm"
                  placeholder={form.kind === "mock" ? "2026년 3월 고1 모의고사" : "1학기 중간고사"}
                  value={form.term}
                  onChange={(e) => setForm({ ...form, term: e.target.value })}
                />
              </div>
            )}
            <div className="field" style={{ width: 100 }}>
              <label className="label">점수</label>
              <input
                className="input input-sm"
                inputMode="decimal"
                value={form.raw_score}
                onChange={(e) => setForm({ ...form, raw_score: e.target.value })}
              />
            </div>
            <div className="field" style={{ width: 90 }}>
              <label className="label">만점</label>
              <input
                className="input input-sm"
                inputMode="decimal"
                value={form.full_score}
                onChange={(e) => setForm({ ...form, full_score: e.target.value })}
              />
            </div>
            <div className="field" style={{ width: 90 }}>
              <label className="label">등급</label>
              <input
                className="input input-sm"
                inputMode="numeric"
                placeholder="1~9"
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
              />
            </div>
            {form.kind === "mock" && (
              <div className="field" style={{ width: 100 }}>
                <label className="label">백분위</label>
                <input
                  className="input input-sm"
                  inputMode="decimal"
                  value={form.percentile}
                  onChange={(e) => setForm({ ...form, percentile: e.target.value })}
                />
              </div>
            )}
            {form.kind === "school" && (
              <>
                <div className="field" style={{ width: 80 }}>
                  <label className="label">석차</label>
                  <input
                    className="input input-sm"
                    inputMode="numeric"
                    value={form.rank_in}
                    onChange={(e) => setForm({ ...form, rank_in: e.target.value })}
                  />
                </div>
                <div className="field" style={{ width: 80 }}>
                  <label className="label">전체</label>
                  <input
                    className="input input-sm"
                    inputMode="numeric"
                    value={form.rank_of}
                    onChange={(e) => setForm({ ...form, rank_of: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>

          {form.kind === "school" && (
            <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
              <div className="field" style={{ width: 160 }}>
                <label className="label">어느 학교 시험</label>
                {/* 학교는 골라 넣는다 (0114) — 「신정중」 과 「신정중학교」 가
                    갈라지면 등급컷도 회차도 서로 다른 학교 것이 된다 */}
                <SchoolField
                  className="input input-sm"
                  schools={schools}
                  value={form.school}
                  onChange={(e) => setForm({ ...form, school: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* 등급컷은 **회차** 것이다 — 여기서 적지 않는다.
              같은 시험을 본 학생이 셋이면 같은 값을 세 번 적게 되고,
              하나만 잘못 치면 그 학생만 등급이 다르게 나온다. */}
          {form.kind !== "unit" && (
            <div className="unitrow" style={{ marginTop: 8 }}>
              {formExam ? (
                <>
                  <span className="tag tag-muted">{shortName(formExam.school)} {examTitle(formExam)}</span>
                  {(formExam.cuts || []).length ? (
                    <>
                      <span className="hint">등급컷 {formExam.cuts.join(" · ")}</span>
                      {cutPreview && <span className="tag tag-sky">{cutPreview}</span>}
                    </>
                  ) : (
                    <span className="tag tag-amber">등급컷 아직 없음</span>
                  )}
                  <span className="spacer" />
                  <a className="hint sky" href="/schedule" target="_blank" rel="noreferrer">
                    {(formExam.cuts || []).length ? "컷 고치기" : "컷 적기"} — 학사일정 ›
                  </a>
                </>
              ) : (
                <>
                  <span className="tag tag-amber">이 시험 회차를 못 찾았어요</span>
                  <span className="hint">
                    학사일정에 <b>{form.kind === "mock" ? "전국" : form.school || student.school || "학교"}</b>{" "}
                    시험 기간이 있어야 등급컷을 이어붙일 수 있어요.
                  </span>
                  <div className="field" style={{ flex: 1, minWidth: 180 }}>
                    <label className="label">등급컷 (이 성적에만)</label>
                    <input
                      className="input input-sm"
                      placeholder="90, 84, 77, 70"
                      value={form.cuts}
                      onChange={(e) => setForm({ ...form, cuts: e.target.value })}
                    />
                  </div>
                  {cutPreview && <span className="tag tag-sky">{cutPreview}</span>}
                </>
              )}
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label className="label">메모</label>
              <input
                className="input input-sm"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !sel}>
              {pending ? "저장 중…" : editId ? "고치기" : "넣기"}
            </button>
            {editId && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(null); setForm(EMPTY); }}>
                취소
              </button>
            )}
          </div>

          {form.kind === "school" && (
            <p className="hint" style={{ margin: "8px 0 0" }}>
              등급컷은 학교가 시험마다 발표하는 숫자예요. <b>학사일정의 시험 회차</b>에
              한 번만 적어두면 그 시험을 본 학생 전부에게 쓰입니다 — 학생마다 따로 적으면
              같은 시험인데 등급이 달라질 수 있어요. 적어두면 "1등급까지 3점" 이 보입니다.
            </p>
          )}
        </div>
      )}

      {/* ---- 목록 ---- */}
      {student && mine.length > 0 && (
        <div className="card">
          <BulkBar bulk={bulk} label="성적">
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`고른 성적 ${bulk.count}건을 지울까요?\n틀린 문제 기록도 함께 지워집니다.`)) return;
                run(() => bulk.run((ids) => removeScores(ids)));
              }}
            >
              삭제
            </button>
          </BulkBar>

          {KINDS.map((k) => {
            const list = groups[k.key] || [];
            if (list.length === 0) return null;
            const t = trendOf(list);
            return (
              <div key={k.key} style={{ marginTop: 10 }}>
                <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
                  <b style={{ fontSize: 15 }}>{k.label}</b>
                  <span className="hint">{list.length}건</span>
                  {t && (
                    <span className={`tag ${t.diff > 0 ? "tag-mint" : t.diff < 0 ? "tag-amber" : "tag-muted"}`}>
                      {t.text}
                    </span>
                  )}
                </div>

                <div className="stack" style={{ gap: 3, marginTop: 6 }}>
                  {list.map((s) => (
                    <div key={s.id} className="stack" style={{ gap: 0 }}>
                      <div className="unitrow">
                        <input
                          type="checkbox"
                          checked={bulk.has(s.id)}
                          onChange={() => bulk.toggle(s.id)}
                        />
                        <span className="hint" style={{ minWidth: 76 }}>
                          {s.taken_on ? s.taken_on.slice(2).replaceAll("-", ".") : "날짜 없음"}
                        </span>
                        <b style={{ fontSize: 14, minWidth: 120 }}>{s.term || KIND_LABEL[s.kind]}</b>
                        <span style={{ fontSize: 14, flex: 1 }}>{summary(s, findExam(s, exams, student))}</span>
                        {s.source === "form" && <span className="tag tag-sky">학생이 냄</span>}
                        <button className="btn btn-ghost btn-sm" onClick={() => openWrongs(s)}>
                          {openId === s.id ? "닫기" : "틀린 문제"}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(s)}>수정</button>
                      </div>

                      {openId === s.id && (
                        <div className="card card-tight" style={{ background: "var(--surface-2)", margin: "4px 0 8px" }}>
                          <div className="stack" style={{ gap: 3 }}>
                            {wrongs.length === 0 && (
                              <p className="hint" style={{ margin: 0 }}>
                                아직 적어둔 것이 없어요. 무엇을 왜 틀렸는지 남겨두면
                                다음 시험 전에 그것만 다시 봅니다.
                                {" "}<b>번호로 적으시면</b> 리포트에서 영역별 정답률로 계산됩니다
                                (아이가 스스로 적은 것과 같은 자리입니다).
                              </p>
                            )}
                            {wrongs.map((x) => (
                              <div className="unitrow" key={x.id}>
                                {x.question && <span className="tag tag-muted">{x.question}</span>}
                                <b style={{ fontSize: 14 }}>{x.topic || "—"}</b>
                                <span className="hint" style={{ flex: 1 }}>{x.reason || ""}</span>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={pending}
                                  onClick={() =>
                                    run(() => removeWrongs([x.id]), () =>
                                      setWrongs(wrongs.filter((y) => y.id !== x.id))
                                    )
                                  }
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                            <input
                              className="input input-sm"
                              style={{ width: 70 }}
                              placeholder="12번"
                              title="번호를 적으면 영역별 정답률에 들어갑니다"
                              value={w.question}
                              onChange={(e) => setW({ ...w, question: e.target.value })}
                            />
                            <input
                              className="input input-sm"
                              style={{ width: 150 }}
                              placeholder="메모 (선택)"
                              value={w.topic}
                              onChange={(e) => setW({ ...w, topic: e.target.value })}
                            />
                            <input
                              className="input input-sm"
                              style={{ flex: 1, minWidth: 160 }}
                              placeholder="왜 (단어를 몰라서 · 시간 부족)"
                              value={w.reason}
                              onChange={(e) => setW({ ...w, reason: e.target.value })}
                            />
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={pending}
                              onClick={() =>
                                run(() => addWrong(s.id, w), () => {
                                  setW({ question: "", topic: "", reason: "" });
                                  listWrongs(s.id).then((r) => setWrongs(r?.rows || []));
                                })
                              }
                            >
                              넣기
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {student && mine.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            {student.name} 학생의 성적이 아직 없습니다. 위에서 넣어주세요.
          </p>
        </div>
      )}
    </div>
  );
}

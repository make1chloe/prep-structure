"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addExam, setEnglishDate, updateExam, deleteExam, hideExam, setExamCuts,
  applyNeis, detachNeis,
  markExamAbsence, makeExamEveSession, addClassHoliday, keepClassOn, removeHoliday, removeHolidays,
} from "./actions";
import { shortLabel, monthDay, todaySeoul } from "@/lib/day";
import MonthGrid from "./MonthGrid";
import { useBulk, BulkBar } from "@/components/Bulk";
import { neisDiff, diffText, examState, STATE_LABEL, STATE_CLS, teacherText } from "@/lib/exams";

const ALERT_CLS = {
  over: "tag-sky",
  short: "tag-amber",
  off: "tag-muted",
  exam: "tag-amber",
  engEve: "tag-lav",
};

function ymLabel(ym) {
  const [y, m] = ym.split("-");
  return `${Number(m)}월`;
}
const dayShort = shortLabel;

// 3개월을 합쳐서 보면 결국 몇 회를 더 하고 덜 하는지
function Totals({ months }) {
  const live = months.reduce((s, m) => s + m.live.length, 0);
  const base = months.reduce((s, m) => s + (m.base || 0), 0);
  const diff = live - base;
  return (
    <span className={`tag ${diff === 0 ? "tag-mint" : diff > 0 ? "tag-sky" : "tag-amber"}`}>
      3개월 합계 {live}회 / 기준 {base}회
      {diff === 0 ? " — 딱 맞음" : diff > 0 ? ` — ${diff}회 많음` : ` — ${-diff}회 부족`}
    </span>
  );
}

export default function ScheduleBoard({
  months = [],
  reviews = [],
  exams = [],
  schools = [],
  grades = [],
  classes = [],
  unavailable = false,
  holidayNotes = [],
  makeupDays = [],
  holidays = [],
  show = "schedule",        // schedule(휴강·회차) | exams(학교 시험)
}) {
  const hBulk = useBulk(holidays);
  const [form, setForm] = useState({ school: "", grade: "", name: "", from: "", to: "" });
  const [eng, setEng] = useState({});
  const [cutOpen, setCutOpen] = useState(null);   // 등급컷을 적는 중인 회차
  const [cuts, setCuts] = useState({});
  const [infoOpen, setInfoOpen] = useState(null); // 선생님·특이사항을 적는 중인 회차
  const [teach, setTeach] = useState({});
  const [memo, setMemo] = useState({});
  const [off, setOff] = useState({ date: "", name: "", classId: "" });
  const [showHidden, setShowHidden] = useState(false);   // 숨긴 시험도 볼까
  // 숨긴 시험은 기본으로 접어둔다 — 나이스에서 받으면 안 쓰는 것까지 다 들어온다
  const hiddenExams = exams.filter((e) => e.hidden);
  const shownExams = showHidden ? exams : exams.filter((e) => !e.hidden);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn, msg) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      if (msg) alert(msg);
      router.refresh();
    });
  }

  const [showPast, setShowPast] = useState(false);
  const [openDay, setOpenDay] = useState(null);

  // 지나간 달과 앞으로의 달을 가른다 (지난 달은 아래로 접어 둔다)
  const nowYM = todaySeoul().slice(0, 7);
  const monthList = months.filter((ym) => ym >= nowYM);
  const pastList = months.filter((ym) => ym < nowYM);

  /** 그 달에 이 반이 어떤가 — reviews 안에서 찾아온다 */
  function monthOf(review, ym) {
    return (review.months || []).find((m) => m.ym === ym) || null;
  }

  function AlertRow({ klass, m, a, i }) {
    return (
      <div className="unitrow" key={i} style={{ alignItems: "flex-start" }}>
        <span
          className={`tag ${
            a.settled ? "tag-mint" : ALERT_CLS[a.kind] || "tag-muted"
          }`}
        >
          {a.kind === "over" ? (a.settled ? "회차 맞음" : "회차 많음")
            : a.kind === "short" ? (a.settled ? "회차 맞음" : "회차 부족")
            : a.kind === "off" ? "휴강"
            : a.kind === "exam" ? "시험 기간"
            : "영어 시험 전날"}
        </span>
        <span style={{ fontSize: 12.5, flex: 1 }}>
          {a.text}
          {a.advice && (
            <>
              <br />
              <span
                className="muted"
                style={{ fontSize: 12, lineHeight: 1.6 }}
              >
                {a.advice}
              </span>
            </>
          )}
          {/* 누구 이야기인지 — 이름이 없으면 결국 명단을 다시 찾아본다.
              한 반에 학교가 섞여 있으면 반 전체가 아니라 그 학교 아이들만이다 */}
          {a.who?.length > 0 && (
            <>
              <br />
              <span style={{ fontSize: 12, lineHeight: 1.7 }}>
                {a.school && (
                  <b>{[a.school, a.grade].filter(Boolean).join(" ")} — </b>
                )}
                {a.who.map((x) => x.name).join(", ")}{" "}
                <span className="muted">({a.who.length}명)</span>
              </span>
            </>
          )}
        </span>

        {a.kind === "over" && !a.settled && (
          <select
            className="input input-sm"
            style={{ width: 150 }}
            defaultValue=""
            onChange={(ev) => {
              const d = ev.target.value;
              ev.target.value = "";
              if (!d) return;
              if (!confirm(`${dayShort(d)} 을 휴강으로 지정할까요?`)) return;
              run(
                () => addClassHoliday(d, "회차 조정 휴강", klass.id),
                "휴강으로 지정했어요."
              );
            }}
            disabled={pending}
          >
            <option value="">휴강으로 지정…</option>
            {m.live.map((d) => (
              <option key={d} value={d}>{dayShort(d)}</option>
            ))}
          </select>
        )}

        {a.kind === "exam" && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending || !(a.pairs || []).length}
            onClick={() => {
              // **시험을 보는 아이에게, 그 아이 시험 날짜에만** 넣는다.
              // 한 반에 학교가 섞여 있어도 나머지 아이는 안 건드린다.
              const pairs = a.pairs || [];
              if (pairs.length === 0) return;
              const byName = new Map();
              pairs.forEach((p) => {
                if (!byName.has(p.name)) byName.set(p.name, []);
                byName.get(p.name).push(p.date);
              });
              const lines = [...byName.entries()].map(
                ([n, ds]) => `· ${n} — ${ds.map(dayShort).join(", ")}`
              );
              if (
                !confirm(
                  `시험을 보는 학생만 결석 예정으로 넣습니다.\n\n` +
                    `${lines.join("\n")}\n\n` +
                    `학생 ${byName.size}명 · 모두 ${pairs.length}건\n` +
                    `${klass.name} 의 나머지 학생은 건드리지 않습니다.`
                )
              )
                return;
              run(
                () => markExamAbsence(pairs, "시험 기간"),
                `결석 예정 ${pairs.length}건을 넣었어요.`
              );
            }}
          >
            결석 예정 일괄 등록
          </button>
        )}

        {a.kind === "engEve" && (
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => {
              const e = m.engEve.find((x) => x.date === a.date);
              const names = (a.who || []).map((x) => x.name);
              if (
                names.length &&
                !confirm(
                  `${dayShort(a.date)} 등원 일정을 만들까요?\n\n` +
                    `${a.school || ""} ${a.grade || ""} — ${names.join(", ")} (${names.length}명)\n` +
                    "그날 전달사항으로 이 학생들에게 안내됩니다."
                )
              )
                return;
              run(
                () =>
                  makeExamEveSession({
                    date: a.date,
                    school: e?.school,
                    grade: e?.grade,
                    classId: klass.id,
                    englishOn: e?.english_on,
                  }),
                "등원 일정을 만들었어요. 그날 전달사항으로 학생에게 안내됩니다."
              );
            }}
          >
            등원 일정 만들기
          </button>
        )}
      </div>
    );
  }

  /**
   * 한 달 — **달력 하나**와, 그 아래 반별 설명.
   *
   * 반마다 달력을 놓으면 같은 달이 반 수만큼 되풀이된다. 원장님이 보고 싶은
   * 것은 「9월에 무슨 일이 있나」 이지 「월수반의 9월」 이 아니다.
   */
  function MonthCard({ ym, past = false }) {
    // 이 달에 수업이 있는 반만
    const mine = reviews
      .map((r) => ({ ...r, m: monthOf(r, ym) }))
      .filter((r) => r.m && (r.m.all || []).length > 0);
    const alertCount = mine.reduce((n, r) => n + (r.m.alerts || []).length, 0);

    return (
      <div className="card" style={past ? { opacity: 0.9 } : undefined}>
        <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{ymLabel(ym)}</h2>
          <span className="hint">반 {mine.length}</span>
          {alertCount === 0
            ? <span className="tag tag-mint">특이사항 없음</span>
            : <span className="tag tag-amber">챙길 것 {alertCount}</span>}
        </div>

        <MonthGrid
          ym={ym}
          classes={mine.map((r) => ({
            id: r.klass.id,
            name: r.klass.name,
            month: r.m,
            absents: (r.absents || []).filter((a) => a.date.startsWith(ym)),
          }))}
          openDay={openDay}
          onPick={(d) => setOpenDay(openDay === d ? null : d)}
        />

        {/* 반별 설명 — 회차와 챙길 것 */}
        <div className="stack" style={{ gap: 10, marginTop: 12 }}>
          {mine.map((r) => (
            <div key={r.klass.id} style={{ borderTop: "1px dashed var(--border)", paddingTop: 8 }}>
              <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                <b style={{ fontSize: 13.5 }}>{r.klass.name}</b>
                <span className="hint">
                  {(r.klass.days || []).join("·")} · 수업 {r.m.live.length}회
                  {r.m.off.length > 0 && ` (휴강 ${r.m.off.length}회 제외)`}
                  {r.klass.base_sessions ? ` · 기준 ${r.klass.base_sessions}회` : ""}
                </span>
                {r.m.alerts.length === 0 && <span className="tag tag-mint">특이사항 없음</span>}
              </div>
              {r.m.alerts.length > 0 && (
                <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                  {r.m.alerts.map((a, i) => (
                    <AlertRow key={i} klass={r.klass} m={r.m} a={a} i={i} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          시험 일정을 쓰려면 Supabase에서 <b>0021 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  return (
    <>
      {show === "schedule" && (
      <>
      {/* 휴강 — 공휴일이 아닌 날도 쉰다 (원장님 사정, 학교 행사, 가족 일) */}
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>휴강</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.7 }}>
          공휴일이 아닌 날도 쉴 수 있습니다. 여기 넣으면 <b>그날은 회차에서 빠지고</b>,
          수강료는 깎지 않고 보강으로 채우도록 계산됩니다.
        </p>

        <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ width: 160 }}>
            <label className="label">날짜 *</label>
            <input
              className="input input-sm"
              type="date"
              value={off.date}
              onChange={(e) => setOff({ ...off, date: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 170 }}>
            <label className="label">이유</label>
            <input
              className="input input-sm"
              placeholder="원장 개인사정"
              value={off.name}
              onChange={(e) => setOff({ ...off, name: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 170 }}>
            <label className="label">어느 반</label>
            <select
              className="input input-sm"
              value={off.classId}
              onChange={(e) => setOff({ ...off, classId: e.target.value })}
            >
              <option value="">전체 휴강 (모든 반)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}만</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || !off.date}
            style={{ marginBottom: 1 }}
            onClick={() =>
              run(async () => {
                const res = await addClassHoliday(off.date, off.name, off.classId || null);
                if (!res?.error) setOff({ date: "", name: "", classId: "" });
                return res;
              }, "휴강으로 지정했어요.")
            }
          >
            휴강 추가
          </button>
        </div>

        {holidays.length > 0 ? (
          <div className="stack" style={{ gap: 3, marginTop: 10 }}>
            {/* 시험 기간 휴강을 통째로 걷을 때 하나씩 누르는 것이 일이다 */}
            <BulkBar bulk={hBulk} label="휴강">
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`고른 휴강 ${hBulk.count}건을 지울까요?\n회차와 수강료가 다시 계산됩니다.`)) return;
                  run(() => hBulk.run((ids) => removeHolidays(ids)));
                }}
              >
                삭제
              </button>
            </BulkBar>
            {holidays.map((h) => (
              <div className="unitrow" key={h.id}>
                <input type="checkbox" checked={hBulk.has(h.id)} onChange={() => hBulk.toggle(h.id)} />
                <b style={{ fontSize: 12.5, minWidth: 96 }}>{dayShort(h.date)}</b>
                <span className={`tag ${h.class_id ? "tag-sky" : "tag-muted"}`}>
                  {h.class_id ? `${classes.find((c) => c.id === h.class_id)?.name || "반"}만` : "전체"}
                </span>
                <span style={{ fontSize: 12.5, flex: 1 }}>{h.name || "휴강"}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`${dayShort(h.date)} 휴강을 지울까요?\n회차와 수강료가 다시 계산됩니다.`)) return;
                    run(() => removeHoliday(h.id));
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint" style={{ margin: "10px 0 0" }}>아직 지정한 휴강이 없습니다.</p>
        )}
      </div>

      {/* 공휴일 · 대체공휴일 · 낀 날 */}
      {holidayNotes.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
            공휴일 — 쉴지 정해주세요
          </h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.7 }}>
            자동으로 휴강 처리하지 않습니다. 학원마다 다르고 낀 날은 더 그렇기 때문에,
            <b> 수업이 잡혀 있는 공휴일만 골라서 알려드립니다.</b>
            <br />
            <b>그냥 수업함</b> 을 누르면 회차·수강료는 그대로 두고 일정에 기록만 남기고,
            알림은 사라집니다. <b>쉬기</b> 를 고르면 휴강으로 잡혀 회차에서 빠집니다.
          </p>
          <div className="stack" style={{ gap: 4 }}>
            {holidayNotes.map((h) => (
              <div className="unitrow" key={h.date} style={{ alignItems: "flex-start" }}>
                <span
                  className={`tag ${
                    h.kind === "bridge" ? "tag-lav"
                    : h.kind === "substitute" ? "tag-amber"
                    : "tag-red"
                  }`}
                >
                  {h.kind === "bridge" ? "낀 날" : h.kind === "substitute" ? "대체공휴일" : "공휴일"}
                </span>
                <b style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                  {dayShort(h.date)} {h.name}
                </b>
                <span className="muted" style={{ fontSize: 12, flex: 1, lineHeight: 1.6 }}>
                  {h.why}
                </span>
                {/* 답이 두 개다 — 쉬거나, 그냥 수업하거나 */}
                <button
                  className="btn btn-sm"
                  disabled={pending}
                  title="회차·수강료는 그대로 두고, 일정에 '정상 수업' 으로 기록만 남깁니다"
                  onClick={() =>
                    run(
                      () => keepClassOn(h.date, h.name),
                      "그냥 수업하는 것으로 정했어요. 일정에 남겨뒀습니다."
                    )
                  }
                >
                  그냥 수업함
                </button>
                <select
                  className="input input-sm"
                  style={{ width: 150 }}
                  defaultValue=""
                  disabled={pending}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    ev.target.value = "";
                    if (v === "all") {
                      run(() => addClassHoliday(h.date, h.name, null), "전체 휴강으로 지정했어요.");
                    } else if (v) {
                      run(() => addClassHoliday(h.date, h.name, v), "휴강으로 지정했어요.");
                    }
                  }}
                >
                  <option value="">쉬기 (휴강 지정)…</option>
                  <option value="all">전체 휴강</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}만</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      </>
      )}

      {/* 시험 일정 — **학교 화면**에서만 보여준다 (show="exams").
          휴강·회차와 성격이 달라서 한 화면에 다 있으면 무엇을 보러 왔는지
          잊게 된다. 같은 코드를 두 번 적지 않으려고 prop 하나로 가른다. */}
      {show === "exams" && (
      <>
      {/* 시험 일정 */}
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>학교 시험 일정</h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.7 }}>
          <b>1차</b> — 학교에서 시험 기간만 알려주면 먼저 기간을 넣습니다.
          그 기간 정규수업은 <b>타과목 시험 때문에 결석 예상</b>으로 표시됩니다.
          <br />
          <b>2차</b> — 영어 시험일이 확정되면 채워 넣습니다.
          그 <b>전날</b>은 정규수업이 아니어도 등원해야 하므로 알림이 뜹니다.
        </p>

        <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ width: 150 }}>
            <label className="label">학교 *</label>
            <input
              className="input input-sm"
              list="schools"
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })}
            />
            <datalist id="schools">
              {schools.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="field" style={{ width: 110 }}>
            <label className="label">학년</label>
            <input
              className="input input-sm"
              list="grades"
              placeholder="비우면 전체"
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: e.target.value })}
            />
            <datalist id="grades">
              {grades.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div className="field" style={{ width: 150 }}>
            <label className="label">시험 이름</label>
            <input
              className="input input-sm"
              placeholder="2학기 중간고사"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 145 }}>
            <label className="label">시작 *</label>
            <input
              className="input input-sm"
              type="date"
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value, to: form.to || e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 145 }}>
            <label className="label">끝</label>
            <input
              className="input input-sm"
              type="date"
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ marginBottom: 1 }}
            disabled={pending || !form.school || !form.from}
            onClick={() =>
              run(async () => {
                const r = await addExam(form);
                setForm({ school: "", grade: "", name: "", from: "", to: "" });
                return r;
              })
            }
          >
            기간 추가
          </button>
        </div>

        {hiddenExams.length > 0 && (
          <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "center" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowHidden(!showHidden)}>
              {showHidden ? "숨긴 것 접기" : `숨긴 시험 ${hiddenExams.length}건 보기`}
            </button>
            <span className="hint" style={{ fontSize: 11.5 }}>
              숨긴 시험은 알림·결석 예상에서 빠집니다. 다시 받아와도 숨긴 채로 있습니다.
            </span>
          </div>
        )}

        {shownExams.length > 0 && (
          <div className="stack" style={{ gap: 4, marginTop: 12 }}>
            {shownExams.map((e) => (
              <div key={e.id} className="stack" style={{ gap: 0 }}>
              {/* 학교가 날짜를 바꿨을 때 — **조용히 안 바꾼다.** 알려주고 누르게 한다.
                  자료 만드는 일정이 이 날짜에 매달려 있어서, 모르게 바뀌면
                  시험 사흘 전에 어긋나 있어도 모른다. */}
              {neisDiff(e)?.any && (
                <div className="unitrow" style={{ borderColor: "var(--amber)", borderBottom: 0, borderRadius: "9px 9px 0 0" }}>
                  <span className="tag tag-amber">학교 일정 바뀜</span>
                  <span className="hint" style={{ flex: 1 }}>{diffText(neisDiff(e))}</span>
                  <button
                    className="btn btn-sm"
                    disabled={pending}
                    title="내 시험 기간을 학교 일정에 맞춥니다"
                    onClick={() => run(() => applyNeis(e.id), "학교 일정에 맞췄어요.")}
                  >
                    내 것에 반영
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    title="학교 일정을 떼어냅니다. 내 시험은 그대로 남아요"
                    onClick={() => run(() => detachNeis(e.id))}
                  >
                    떼기
                  </button>
                </div>
              )}
              <div className="unitrow" style={e.hidden ? { opacity: 0.55 } : undefined}>
                {e.hidden && <span className="tag tag-muted">숨김</span>}
                <b style={{ fontSize: 12.5 }}>
                  {e.school} {e.grade || "전체"}
                </b>
                {e.name && <span className="tag tag-muted">{e.name}</span>}
                {teacherText(e) && <span className="tag tag-lav">{teacherText(e)}</span>}
                {e.note && <span className="hint" title={e.note}>{e.note}</span>}
                {/* 이 시험은 **내 것**이다. 학교 일정은 붙어 있는 참고다 (0075) */}
                <span className={`tag ${STATE_CLS[examState(e)]}`} title={
                  examState(e) === "mine"
                    ? "내가 적은 시험이에요. 학교 일정을 붙이면 바뀔 때 알려드립니다"
                    : STATE_LABEL[examState(e)]
                }>
                  {STATE_LABEL[examState(e)]}
                </span>
                {/* 시험 목록은 석 달치가 섞여 나온다 — 달이 없으면 몇 월인지 모른다 */}
                <span className="hint">
                  {monthDay(e.from_date)} ~ {monthDay(e.to_date)}
                </span>
                <span className="spacer" />
                {e.english_on ? (
                  <>
                    <span className="tag tag-lav">영어 {monthDay(e.english_on)}</span>
                    <span className="tag tag-sky">
                      전날 등원 {monthDay(e.eveDate)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="tag tag-amber">영어 시험일 미정</span>
                    <input
                      className="input input-sm"
                      type="date"
                      style={{ width: 145 }}
                      value={eng[e.id] || ""}
                      onChange={(ev) => setEng({ ...eng, [e.id]: ev.target.value })}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={pending || !eng[e.id]}
                      onClick={() => run(() => setEnglishDate(e.id, eng[e.id]))}
                    >
                      영어 시험일 저장
                    </button>
                  </>
                )}
                {/* 등급컷은 **이 회차** 것이다. 여기 한 번 적으면 이 시험을 본
                    학생 전부의 등급이 같은 기준으로 매겨진다. */}
                {cutOpen === e.id ? (
                  <>
                    <input
                      className="input input-sm"
                      style={{ width: 170 }}
                      placeholder="90, 84, 77, 70"
                      title="1등급컷부터 높은 순서로"
                      value={cuts[e.id] ?? (e.cuts || []).join(", ")}
                      onChange={(ev) => setCuts({ ...cuts, [e.id]: ev.target.value })}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const r = await setExamCuts(
                            e.id,
                            cuts[e.id] ?? (e.cuts || []).join(", ")
                          );
                          if (!r?.error) setCutOpen(null);
                          return r;
                        })
                      }
                    >
                      컷 저장
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCutOpen(null)}>
                      취소
                    </button>
                  </>
                ) : (
                  <button
                    className={`btn btn-ghost btn-sm ${(e.cuts || []).length ? "" : "muted"}`}
                    onClick={() => setCutOpen(e.id)}
                    title="이 시험의 등급컷 — 이 시험을 본 학생 모두에게 쓰입니다"
                  >
                    {(e.cuts || []).length ? `등급컷 ${e.cuts.join("·")}` : "등급컷 적기"}
                  </button>
                )}
                {/* 출제 선생님 · 특이사항 — **이 회차** 것이다.
                    같은 학교라도 회차마다 출제 선생님이 바뀐다. */}
                {infoOpen === e.id ? (
                  <>
                    <input
                      className="input input-sm"
                      style={{ width: 150 }}
                      placeholder="김선생, 박선생"
                      title="여러 명이면 쉼표로 나눠 적으세요"
                      value={teach[e.id] ?? (e.teachers?.length ? e.teachers.join(", ") : e.teacher || "")}
                      onChange={(ev) => setTeach({ ...teach, [e.id]: ev.target.value })}
                    />
                    <input
                      className="input input-sm"
                      style={{ width: 190 }}
                      placeholder="특이사항 (서술형 비중 등)"
                      value={memo[e.id] ?? (e.note || "")}
                      onChange={(ev) => setMemo({ ...memo, [e.id]: ev.target.value })}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const r = await updateExam(e.id, {
                            teachers: teach[e.id] ?? (e.teachers?.length ? e.teachers.join(", ") : e.teacher || ""),
                            note: memo[e.id] ?? (e.note || ""),
                          });
                          if (!r?.error) setInfoOpen(null);
                          return r;
                        })
                      }
                    >
                      저장
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setInfoOpen(null)}>
                      취소
                    </button>
                  </>
                ) : (
                  <button
                    className={`btn btn-ghost btn-sm ${teacherText(e) || e.note ? "" : "muted"}`}
                    onClick={() => setInfoOpen(e.id)}
                    title="이 회차의 출제 선생님과 특이사항"
                  >
                    {teacherText(e) || e.note ? "선생님 · 특이사항 고치기" : "선생님 · 특이사항 적기"}
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  title={
                    e.hidden
                      ? "다시 쓰겠습니다"
                      : "필요 없는 시험입니다. 알림·결석 예상에서 뺍니다 (기록은 남습니다)"
                  }
                  onClick={() => run(() => hideExam(e.id, !e.hidden))}
                >
                  {e.hidden ? "다시 쓰기" : "숨기기"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (!confirm("이 시험 일정을 지울까요?\n\n나이스에서 받아온 것이면 다시 받을 때 또 들어옵니다. 그럴 땐 「숨기기」 를 쓰세요.")) return;
                    run(() => deleteExam(e.id));
                  }}
                >
                  삭제
                </button>
              </div>
              </div>
            ))}
          </div>
        )}
        {exams.length === 0 && (
          <p className="hint" style={{ marginTop: 8 }}>등록된 시험 일정이 없습니다.</p>
        )}
      </div>
      </>
      )}

      {show === "schedule" && (
      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        {/* **달력은 달마다 하나.** 반마다 따로 놓으니 같은 달이 반 수만큼
            되풀이됐고, 「9월에 무슨 일이 있나」 를 보려면 여섯 판을 훑어야 했다.
            달력 하나에 모아 칠하고, 무슨 일인지는 **아래에 반별로** 적는다. */}
        {reviews.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              반이 없습니다. <b>반</b> 메뉴에서 먼저 만들어주세요.
            </p>
          </div>
        ) : (
          <>
            {monthList.map((ym) => (
              <MonthCard key={ym} ym={ym} />
            ))}

            {/* 지나간 달은 **아래로 내린다.** 지워버리면 「지난달 회차가 몇이었지」
                를 볼 데가 없고, 위에 두면 매번 지나쳐 내려와야 한다 */}
            {pastList.length > 0 && (
              <div className="card">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowPast(!showPast)}
                >
                  {showPast ? "지난 달 접기" : `지난 달 보기 (${pastList.length}개월)`}
                </button>
                {showPast && (
                  <div className="stack" style={{ gap: 12, marginTop: 10 }}>
                    {pastList.map((ym) => (
                      <MonthCard key={ym} ym={ym} past />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      )}
    </>
  );
}

"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStudent, deleteStudents, updateStudentsStatus, linkSiblings, unlinkSibling, setStudentClasses } from "./actions";
import StudentHistoryPanel from "./StudentHistory";
import LinkBox from "./LinkBox";
import ParentBox from "./ParentBox";
import NoteBox from "./NoteBox";
import ScoreBox from "./ScoreBox";
import StudentBooks from "@/app/today/StudentBooks";
import StudentBooksProgress from "@/app/progress/StudentBooksProgress";
import WordTestBox from "./WordTestBox";
import ScheduleBox from "./ScheduleBox";
import { fromLabel } from "@/lib/bookUse";
import { shortName } from "@/lib/schoolName";
import { WEEK_ORDER as DOW } from "@/lib/day";
import { missingIn, hasMissing, countMissing } from "@/lib/listMissing";
import MissingPicker from "@/components/MissingPicker";

/**
 * **빠진 것** — 이 아이에게 없으면 실제로 일이 안 되는 칸.
 *
 * 학부모 전화가 없으면 그 아이만 리포트가 안 나가고, 학교가 없으면 시험
 * 기간에서 통째로 빠진다. 빠진 칸은 오류가 안 나서 목록으로는 안 보인다.
 * 퇴원·예비는 안 본다 — 채울 이유가 없는 것을 세면 숫자가 늘 켜져 있게 된다.
 */
const NEED = [
  { key: "school", label: "학교" },
  { key: "grade", label: "학년" },
  { key: "parent_phone", label: "학부모 전화" },
];

const STATUS = {
  prospect: { label: "예비", cls: "tag tag-sky" },
  enrolled: { label: "재원", cls: "tag tag-mint" },
  paused: { label: "휴원", cls: "tag tag-amber" },
  withdrawn: { label: "퇴원", cls: "tag tag-muted" },
};

// 표에 펼칠 수 있는 열 — **전부 켜면 가로로 1400px 이 넘는다.**
// 그래서 기본으로는 매일 보는 것만 켜두고, 나머지는 「열 고르기」로 켠다.
// 켠 목록은 이 브라우저에 남는다 (계정마다 다른 게 아니라 화면 습관이다).
const DEFAULT_ON = ["name", "school", "grade", "status", "parent_phone", "books", "wordTest"];

const COLS = [
  { key: "name", label: "이름", w: 84, strong: true },
  { key: "school", label: "학교", w: 84 },
  { key: "grade", label: "학년", w: 56 },
  { key: "birth_year", label: "생년월일", w: 118, type: "date" },
  { key: "gender", label: "성별", w: 62, type: "select", options: ["", "여", "남"] },
  { key: "student_phone", label: "학생 전화", w: 126 },
  { key: "parent_phone", label: "학부모 전화", w: 126 },
  { key: "status", label: "상태", w: 76, type: "status" },
  { key: "enrolled_on", label: "등원시작일", w: 118, type: "date" },
  { key: "electives", label: "선택과목", w: 130 },
  { key: "note", label: "특이사항", w: 140 },
  { key: "login_id", label: "아이디", w: 104, mono: true },
  // 학교에서 이미 클카 계정을 만든 아이들 — 앱 아이디와 다를 때만 적는다 (0131)
  { key: "classcard_login", label: "클카 아이디 (다르면)", w: 130, mono: true },
  // **엄마 아이디** — 물어오시면 바로 답할 수 있게 (원장님, 2026-08-07).
  // 고치는 칸이 아니다 (학부모 계정 칸에서 만들고 바꾼다)
  { key: "parent_login_id", label: "엄마 아이디", w: 110, mono: true, readOnly: true },
  { key: "initPw", label: "비번", w: 76, type: "pw" },
  { key: "books", label: "교재", w: 130, type: "books" },
  { key: "wordTest", label: "단어시험", w: 130, type: "wordTest" },
  { key: "family", label: "형제", w: 96, type: "family" },
];

// 한 판에서 고칠 수 있는 것 — 표에 안 켜둔 칸도 여기서는 전부 고친다.
// (표는 "훑어보는 곳", 한 판은 "고치는 곳" 으로 나눈다)
// 「엄마 아이디」 는 students 표의 칸이 아니라 학부모 계정에서 온 것이라
// 여기서 고칠 수 없다 — 고치는 시늉만 하다가 저장이 조용히 실패한다
const ALL_FIELDS = COLS.filter(
  (c) => !c.readOnly && !["books", "wordTest", "family", "pw"].includes(c.type || c.key)
);

const TABS = [
  ["info", "정보"],
  ["books", "교재"],
  ["word", "단어시험"],
  // 이 아이에게만 해당하는 일정 (보강 · 상담 · 학교 행사).
  // 할일 화면으로 나갔다 오면 흐름이 끊기고, 끊기면 나중에 하게 된다 (2026-08-06)
  ["schedule", "일정"],
  // 성적은 **여기서 읽기만** 한다. 넣는 곳은 /scores 한 곳이다 —
  // 두 군데서 넣으면 두 군데가 어긋난다 (원장님, 2026-08-06)
  ["score", "성장"],
  ["note", "상담일지"],
  ["account", "계정"],
  ["history", "기록"],
];

const STATUS_TABS = [
  ["enrolled", "재원"],
  ["all", "전체"],
  ["prospect", "예비"],
  ["paused", "휴원"],
  ["withdrawn", "퇴원"],
];

const COL_KEY = "chloe.students.cols";
// 보기 설정(정렬 · 묶음 · 상태) — **저장을 눌러야 남는다.**
// 열 고르기는 누르는 즉시 남는 것과 다르다. 정렬·묶음은 그때그때 바꿔보는 것이라
// 자동으로 남기면 다음에 열었을 때 왜 이렇게 보이는지 알 수 없다.
const VIEW_KEY = "chloe.students.view";

const SORTS = [
  ["name", "이름순"],
  ["school", "학교순"],
  ["grade", "학년순"],
  ["enrolled_on", "등원시작일순"],
  ["created_at", "최근 추가순"],
];

export default function StudentList({ students = [], textbooks = [], defaultPass = 90, openStudent = null, classList = [], missKeys = null }) {
  // 「빠진 것」 은 원장님이 고른 칸만 센다 (11-11). 안 정했으면 후보 전부.
  const need = missKeys === null ? NEED : NEED.filter((d) => missKeys.includes(d.key));
  // 어떤 열을 볼지 — 기본은 매일 보는 것만
  const [on, setOn] = useState(() => new Set(DEFAULT_ON));
  const [colBox, setColBox] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_KEY) || "null");
      if (Array.isArray(saved) && saved.length) setOn(new Set(saved));
    } catch { /* 저장된 게 깨졌으면 기본값 그대로 */ }
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
      if (v && typeof v === "object") {
        setSavedView(v);
        if (v.sortBy) setSortBy(v.sortBy);
        if (v.groupBy) setGroupBy(v.groupBy);
        // 상태는 오늘 수업에서 넘어온 학생이 있으면 그쪽이 먼저다
        if (v.statusFilter && !openStudent) setStatusFilter(v.statusFilter);
      }
    } catch { /* 저장된 게 깨졌으면 기본값 그대로 */ }
  }, []);

  const cols = COLS.filter((c) => on.has(c.key));

  function toggleCol(k) {
    const n = new Set(on);
    n.has(k) ? n.delete(k) : n.add(k);
    if (n.size === 0) return;          // 전부 끄면 표가 사라진다
    setOn(n);
    try { localStorage.setItem(COL_KEY, JSON.stringify([...n])); } catch { /* 사파리 비공개 */ }
  }
  const [sel, setSel] = useState(() => new Set());
  // 넘어오자마자 고칠 수 있게, 열린 학생의 값을 미리 채워둔다
  const [draft, setDraft] = useState(() => {
    const s = students.find((x) => x.id === openStudent);
    if (!s) return {};
    const d = {};
    ALL_FIELDS.forEach(({ key }) => (d[key] = s[key] ?? ""));
    return d;
  });
  const [q, setQ] = useState("");
  // 목록을 무엇으로 묶어 볼지 — 반 · 요일 · 학교 · 학년
  const [groupBy, setGroupBy] = useState("none");
  const [sortBy, setSortBy] = useState("name");
  const [savedView, setSavedView] = useState(null);   // 저장해둔 보기
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [statusFilter, setStatusFilter] = useState(
    () => students.find((s) => s.id === openStudent)?.status || "enrolled"
  );
  // 한 학생을 열면 **한 판**이 펼쳐진다. 예전에는 수정·기록·상담·교재·계정이
  // 각각 다른 버튼이었고, 누를 때마다 다른 줄이 열렸다. 무엇이 열려 있는지
  // 눈으로 세야 했고, 정보 하나 고치려면 표를 가로로 밀어야 했다.
  // 오늘 수업에서 「재원생 정보」로 넘어오면 그 학생이 **열린 채로** 뜬다.
  // 넘어와서 다시 이름을 찾게 하면 넘어온 뜻이 없다.
  const [openId, setOpenId] = useState(openStudent);
  // 좁은 화면에서는 판이 위로 올라온다. 목록을 보려면 접을 수 있어야 한다.
  const [folded, setFolded] = useState(false);
  const [tab, setTab] = useState("info");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function open(s, which = "info") {
    if (openId === s.id && tab === which) { setOpenId(null); return; }
    setOpenId(s.id);
    setTab(which);
    setFolded(false);   // 접어둔 채로 다른 학생을 누르면 아무 일도 안 난 것처럼 보인다
    const d = {};
    ALL_FIELDS.forEach(({ key }) => (d[key] = s[key] ?? ""));
    setDraft(d);
  }

  const cellPwStatic = <span className="muted">—</span>;
  const norm = (v) => (v || "").toString().toLowerCase();
  const kw = norm(q).trim();
  const shown = students.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (onlyMissing && !hasMissing(s, need)) return false;
    if (!kw) return true;
    return [s.name, s.school, s.grade, s.parent_phone, s.student_phone, s.login_id, s.parent_login_id, s.note]
      .some((v) => norm(v).includes(kw));
  });

  // 정렬 — 빈 값은 **언제나 뒤로.** 학교를 아직 안 적은 아이가 맨 위에 오면
  // 목록이 이상해 보인다.
  const cmp = (a, b) => {
    if (sortBy === "created_at") return (b.created_at || "").localeCompare(a.created_at || "");
    const va = (a[sortBy] || "").toString().trim();
    const vb = (b[sortBy] || "").toString().trim();
    if (!va && !vb) return a.name.localeCompare(b.name, "ko");
    if (!va) return 1;
    if (!vb) return -1;
    return va.localeCompare(vb, "ko") || a.name.localeCompare(b.name, "ko");
  };
  shown.sort(cmp);

  /**
   * 목록을 **묶어 본다** — 반 · 요일 · 학교 · 학년.
   *
   * 「학교별로 한 번 훑기」 는 실제로 자주 하는 일이다 (내신 자료를 만들 때,
   * 시험 기간 결석을 넣을 때). 검색으로는 한 학교씩 쳐야 하고, 몇 명인지도
   * 세어야 한다.
   *
   * 반·요일은 한 아이가 **여러 묶음에 들어갈 수 있다** (주 2회 수업이면 월·수 둘 다).
   * 그럴 때는 양쪽에 다 보여준다 — 빼면 「월요일반 명단」 이 틀린 명단이 된다.
   *
   * 비어 있는 것도 한 묶음으로 둔다. 안 보여주면 학교를 아직 안 적은 아이가
   * 목록에서 사라진 것처럼 보인다.
   */
    const groups = (() => {
    if (groupBy === "none") return [{ key: "all", title: null, rows: shown }];

    const bucket = new Map();
    const put = (key, title, row) => {
      if (!bucket.has(key)) bucket.set(key, { key, title, rows: [] });
      bucket.get(key).rows.push(row);
    };

    if (groupBy === "class") {
      classList.forEach((c) => bucket.set(c.id, { key: c.id, title: c.name, rows: [] }));
      shown.forEach((s) => {
        const mine = s.classes || [];
        if (mine.length === 0) put("_none", "반 없음", s);
        else mine.forEach((c) => put(c.id, c.name, s));
      });
    } else if (groupBy === "day") {
      DOW.forEach((d) => bucket.set(d, { key: d, title: `${d}요일`, rows: [] }));
      shown.forEach((s) => {
        const mine = s.days || [];
        if (mine.length === 0) put("_none", "수업 요일 없음", s);
        else mine.forEach((d) => put(d, `${d}요일`, s));
      });
    } else {
      const field = groupBy === "school" ? "school" : "grade";
      const empty = groupBy === "school" ? "학교 미입력" : "학년 미입력";
      shown.forEach((s) => {
        const v = (s[field] || "").trim();
        put(v || "_none", v || empty, s);
      });
    }

    return [...bucket.values()]
      .filter((g) => g.rows.length > 0)
      .sort((a, b) => {
        if (a.key === "_none") return 1;
        if (b.key === "_none") return -1;
        if (groupBy === "class" || groupBy === "day") return 0;   // 정해둔 순서 그대로
        return a.title.localeCompare(b.title, "ko");
      });
  })();

  const view = { sortBy, groupBy, statusFilter };
  const viewDirty = JSON.stringify(view) !== JSON.stringify(savedView || {});

  function saveView() {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* 사파리 비공개 */ }
    setSavedView(view);
  }
  function resetView() {
    if (savedView) {
      setSortBy(savedView.sortBy || "name");
      setGroupBy(savedView.groupBy || "none");
      setStatusFilter(savedView.statusFilter || "enrolled");
      return;
    }
    setSortBy("name");
    setGroupBy("none");
    setStatusFilter("enrolled");
  }

  const allChecked = shown.length > 0 && sel.size === shown.length;
  const someChecked = sel.size > 0 && !allChecked;

  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(shown.map((s) => s.id)));
  }
  function toggleOne(id) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  }

  function saveEdit() {
    const id = openId;
    startTransition(async () => {
      const res = await updateStudent(id, draft);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function runDelete() {
    const ids = [...sel];
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}명을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    startTransition(async () => {
      await deleteStudents(ids);
      setSel(new Set());
      router.refresh();
    });
  }

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function runStatus(status) {
    const ids = [...sel];
    if (ids.length === 0 || !status) return;
    startTransition(async () => {
      await updateStudentsStatus(ids, status);
      setSel(new Set());
      router.refresh();
    });
  }

  if (students.length === 0) {
    return (
      <p className="muted" style={{ padding: 14, margin: 0, fontSize: 15 }}>
        아직 학생이 없습니다. 위에서 학생을 추가하거나 엑셀로 올려보세요.
      </p>
    );
  }

  function cell(s, c) {
    const v = s[c.key];
    // 학교는 **짧게 보여준다.** 저장된 이름은 「인천신정중학교」 그대로 두고
    // (나이스와 대조하려면 진짜 이름이 있어야 한다) 표에는 「신정중」 으로 적는다.
    // 마우스를 올리면 원래 이름이 나온다.
    if (c.key === "school" && v) {
      return <span title={v}>{shortName(v)}</span>;
    }
    // 특이사항이 길면 표가 옆으로 무한정 늘어나 줄이 안 맞았다 (2026-08-15).
    // 표에서는 줄여 보여주고, 전체는 마우스 올리기(제목)나 한 판에서 본다.
    if (c.key === "note" && v) {
      return (
        <span
          title={v}
          style={{
            display: "inline-block",
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            verticalAlign: "bottom",
          }}
        >
          {v}
        </span>
      );
    }
    // 아직 0000 그대로인 계정 — 아이디가 규칙적이라 남이 열 수 있다
    // 같은 반이어도 교재는 학생마다 다르다 — 목록에서 바로 보이게
    // 교재는 **전부 보여준다.** "외 3" 이라고 줄여두면 무엇을 쓰는지 알려고
    // 매번 펼쳐야 한다. 어차피 학생마다 다른 것이라 그게 이 열의 쓸모다.
    if (c.type === "books") {
      const list = s.books || [];
      if (list.length === 0) return <span className="hint">없음</span>;
      return (
        <span className="row" style={{ gap: 3, flexWrap: "wrap" }}>
          {list.map((b) => (
            // 아직 안 시작한 교재(교재 안내만 보낸 것)는 **언제부터인지** 붙인다.
            // 안 그러면 지금 쓰는 책과 구별이 안 된다
            <span
              key={b.id}
              className={`tag ${b.from ? "tag-amber" : "tag-muted"}`}
              style={{ fontSize: 12 }}
              title={b.from ? `${fromLabel(b.from)} 사용 예정` : undefined}
            >
              {b.name}
              {b.from ? ` · ${fromLabel(b.from)}` : ""}
            </span>
          ))}
        </span>
      );
    }

    // 형제자매 — 같은 집이면 이름을 보여준다
    if (c.type === "family") {
      if (!s.family_id) return <span className="muted">—</span>;
      const kin = students.filter((x) => x.family_id === s.family_id && x.id !== s.id);
      if (kin.length === 0) return <span className="muted">—</span>;
      return (
        <span className="row" style={{ gap: 3, flexWrap: "wrap" }}>
          {kin.map((x) => (
            <span key={x.id} className="tag tag-lav" style={{ fontSize: 12 }}>{x.name}</span>
          ))}
        </span>
      );
    }

    // 단어시험 — 몇 개씩 · 몇 % 통과 · 언제
    if (c.type === "wordTest") {
      const n = s.word_test_count;
      const cut = s.word_cut_pct;
      return (
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 12, padding: "2px 6px" }}
          onClick={() => open(s, "word")}
        >
          {n ? `${n}개` : "범위대로"} · {cut ? `${cut}%` : "기본"} ·{" "}
          {s.word_when === "end" ? "끝" : "시작"}
        </button>
      );
    }
    if (c.type === "pw") {
      if (!s.login_id) return <span className="muted">—</span>;
      return v ? (
        <span className="tag tag-amber" title="아직 0000 입니다. 학생이 로그인하면 바꾸게 됩니다">
          0000
        </span>
      ) : (
        <span className="tag tag-mint">바꿈</span>
      );
    }
    if (c.type === "status") {
      const st = STATUS[v] || STATUS.enrolled;
      return <span className={st.cls}>{st.label}</span>;
    }
    if (!v) return <span className="muted">—</span>;
    return v;
  }

  function editor(c) {
    if (c.type === "pw" || c.type === "books" || c.type === "wordTest" || c.type === "family") return cellPwStatic;
    if (c.type === "status") {
      return (
        <select
          className="input input-sm"
          value={draft.status || "enrolled"}
          onChange={(e) => setDraft({ ...draft, status: e.target.value })}
        >
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      );
    }
    if (c.type === "select") {
      return (
        <select
          className="input input-sm"
          value={draft[c.key] || ""}
          onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
        >
          {c.options.map((o) => (
            <option key={o} value={o}>{o || "—"}</option>
          ))}
        </select>
      );
    }
    if (c.key === "note") {
      // 특이사항은 길다 — 한 줄 input 으로는 전체가 안 보인다 (2026-08-15)
      return (
        <textarea
          className="input input-sm"
          rows={3}
          style={{ resize: "vertical", lineHeight: 1.6 }}
          value={draft[c.key] ?? ""}
          onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
        />
      );
    }
    return (
      <input
        className="input input-sm"
        type={c.type === "date" ? "date" : "text"}
        value={draft[c.key] ?? ""}
        onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
      />
    );
  }

  /**
   * 오른쪽 칸 — **고르는 곳(왼쪽 표)과 고치는 곳(오른쪽 판)을 나란히.**
   *
   * 예전에는 이름을 누르면 표 **사이가 벌어지면서** 판이 끼어들었다. 그러면
   * 아래 학생들이 화면 밖으로 밀려나서, 다른 아이를 보려면 판을 닫고 다시
   * 찾아 내려가야 했다. 이제 왼쪽 목록은 그 자리에 그대로 있고 오른쪽만 바뀐다.
   *
   * 좁은 화면에서는 위아래가 된다 — 판이 위, 목록이 아래. 판은 접을 수 있다.
   */
  function panelFor(s) {
    if (!s) return null;
    return (
      <aside className={`card split-panel ${folded ? "split-folded" : ""}`}>
        {/* 판이 화면보다 길면 안쪽이 스크롤된다. 그때 **이름과 닫기가 사라지면**
            지금 누구를 보고 있는지 알 수 없다. 머리줄은 붙여둔다. */}
        <div className="row split-head" style={{ gap: 6, alignItems: "center" }}>
          <button
            className="btn btn-ghost btn-sm split-fold"
            onClick={() => setFolded(!folded)}
            title={folded ? "펴기" : "접기"}
          >
            {folded ? "▾" : "▴"}
          </button>
          <b style={{ fontSize: 15 }}>{s.name}</b>
          <span className="hint">{[s.school, s.grade].filter(Boolean).join(" ")}</span>
          <span className="spacer" />
          <a className="btn btn-ghost btn-sm" href={`/me?s=${s.id}`} target="_blank" rel="noreferrer">
            학생 화면 ↗
          </a>
          <a className="btn btn-ghost btn-sm" href={`/parent?s=${s.id}`} target="_blank" rel="noreferrer">
            학부모 화면 ↗
          </a>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}>닫기</button>
        </div>
        {!folded && (
          <div className="split-body">
<div className="row" style={{ gap: 3, margin: "8px 0 10px" }}>
                        {TABS.map(([k, label]) => (
                          <button
                            key={k}
                            className={`hwchip ${tab === k ? "hw-next" : ""}`}
                            onClick={() => setTab(k)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* 정보 — 표에 안 켜둔 칸도 여기서는 전부 고친다 */}
                      {tab === "info" && (
                        <>
                          <div className="editgrid">
                            {ALL_FIELDS.map((c) => (
                              <div
                                className="field"
                                key={c.key}
                                style={c.key === "note" ? { gridColumn: "1 / -1" } : undefined}
                              >
                                <label className="label">{c.label}</label>
                                {editor(c)}
                              </div>
                            ))}
                            {/* **엄마 아이디** — 여기서 고치는 것이 아니라
                                「아이디가 뭐였죠」 에 바로 답하기 위한 것이다.
                                만들고 바꾸는 것은 아래 계정 칸에서 한다 */}
                            <div className="field">
                              <label className="label">엄마 아이디</label>
                              <input
                                className="input input-sm"
                                value={s.parent_login_id || ""}
                                readOnly
                                placeholder="아직 없음"
                                style={{ opacity: s.parent_login_id ? 1 : 0.6 }}
                              />
                            </div>
                          </div>
                          {/* 반 배정 — 여기서 못 바꾸면 반 화면으로 나가서
                              옛 반에서 빼고 새 반에서 넣는 두 번 일이 된다.
                              반은 여러 개일 수 있다 (정규반 + 특강). */}
                          {classList.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <label className="label">반</label>
                              <div className="chips" style={{ marginTop: 4 }}>
                                {classList.map((c) => {
                                  const on = (s.classes || []).some((x) => x.id === c.id);
                                  return (
                                    <button
                                      key={c.id}
                                      className={`chip ${on ? "on" : ""}`}
                                      disabled={pending}
                                      onClick={() => {
                                        const now = (s.classes || []).map((x) => x.id);
                                        const next = on ? now.filter((x) => x !== c.id) : [...now, c.id];
                                        run(() => setStudentClasses(s.id, next));
                                      }}
                                    >
                                      {c.name}
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="hint" style={{ margin: "4px 0 0" }}>
                                누르면 <b>바로 바뀝니다</b> (아래 저장과 별개예요).
                                {(s.classes || []).length === 0 && " 지금은 어느 반에도 없습니다."}
                              </p>
                            </div>
                          )}

                          <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "center" }}>
                            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending}>
                              {pending ? "저장 중…" : "저장"}
                            </button>
                            <span className="hint">고친 뒤 저장을 눌러주세요.</span>
                            <span className="spacer" />
                            {/* 형제 묶기는 목록에서 여럿 골라 하고, 푸는 것은 여기서 한 명씩 */}
                            {s.family_id && (
                              <>
                                <span className="hint">
                                  형제{" "}
                                  {students
                                    .filter((x) => x.family_id === s.family_id && x.id !== s.id)
                                    .map((x) => x.name)
                                    .join(", ") || "—"}
                                </span>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={pending}
                                  onClick={() => {
                                    if (!confirm(`${s.name} 학생만 형제 묶음에서 뺄까요?`)) return;
                                    run(() => unlinkSibling(s.id));
                                  }}
                                >
                                  형제 풀기
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}

                      {tab === "books" && (
                        <>
                          <p className="hint" style={{ margin: "0 0 6px" }}>
                            교재는 <b>학생마다 다릅니다</b> — 같은 반이어도요. 여기서 바꾸면
                            숙제 배정·진도가 이 교재로 갑니다.
                          </p>
                          <StudentBooks studentId={s.id} myBooks={s.books || []} textbooks={textbooks} alwaysOpen />

                          {/**
                            * **진도도 여기서 적는다** (원장님, 2026-08-14 —
                            * 「학생별로 진도를 저장하는 화면이 오늘수업밖에 없고」).
                            *
                            * 진도를 적는 일이 수업 중에만 생기는 것이 아니다 —
                            * 상담 전에 어디까지 했는지 보고, 결석한 아이 것을
                            * 나중에 채우고, 회독을 넘긴다. 그때마다 오늘 수업에서
                            * 그 날짜를 찾아 들어갈 수는 없다.
                            *
                            * 오늘 수업과 **같은 한 벌**을 쓴다 (components/BookProgress)
                            * — 두 벌이면 한쪽에서 찍은 진도가 다른 쪽에 안 보인다.
                            */}
                          {(s.books || []).length > 0 && (
                            <div className="stack" style={{ gap: 8, marginTop: 12 }}>
                              <b style={{ fontSize: 14 }}>진도</b>
                              {/* 교재 판마다 따로 다녀오지 않는다 — 한 왕복 (2026-08-14) */}
                              <StudentBooksProgress studentId={s.id} books={s.books || []} />
                            </div>
                          )}

                          {/**
                            * **지난 교재** (원장님, 2026-08-14 — 「교재가 끝나면
                            * 종료처리도 해야 해. 이미 쓴 적 있는데 기록이 없는
                            * 교재를 추가할 수 있어야 해」). 끝냄·중단으로 처리한
                            * 교재는 지워지는 게 아니라 여기 기록으로 남는다 —
                            * 안 보이면 종료처리한 보람이 없다.
                            */}
                          {(s.pastBooks || []).length > 0 && (
                            <div className="stack" style={{ gap: 4, marginTop: 12 }}>
                              <b style={{ fontSize: 14 }}>지난 교재 {(s.pastBooks || []).length}권</b>
                              {(s.pastBooks || []).map((b) => (
                                <div key={b.id} className="row" style={{ gap: 6, alignItems: "baseline" }}>
                                  <span className={`tag ${b.status === "done" ? "tag-mint" : "tag-muted"}`}>
                                    {b.status === "done" ? "끝냄" : "중단"}
                                  </span>
                                  <b style={{ fontSize: 13.5 }}>
                                    {b.area ? `[${b.area}] ` : ""}{b.name}
                                  </b>
                                  <span className="hint">
                                    {b.from ? b.from.slice(2).replace(/-/g, ".") : "?"} ~{" "}
                                    {b.to ? b.to.slice(2).replace(/-/g, ".") : "?"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      {/* key — 학생이 바뀌면 값도 새로 (2026-08-21: A 학생 값이 B 에게 저장되던 것) */}
                      {tab === "word" && <WordTestBox key={s.id} student={s} defaultPass={defaultPass} />}
                      {tab === "schedule" && <ScheduleBox studentId={s.id} name={s.name} />}
                      {tab === "score" && <ScoreBox studentId={s.id} name={s.name} />}
                      {tab === "note" && <NoteBox studentId={s.id} name={s.name} />}
                      {tab === "account" && (
              <>
                <LinkBox studentId={s.id} name={s.name} />
                <ParentBox studentId={s.id} name={s.name} />
              </>
            )}
                      {tab === "history" && <StudentHistoryPanel studentId={s.id} />}
          </div>
        )}
      </aside>
    );
  }

  return (
    <>
      <div className="row" style={{ gap: 6, padding: "12px 16px 0", alignItems: "center" }}>
        <input
          className="input input-sm"
          style={{ width: 220 }}
          placeholder="이름 · 학교 · 연락처 검색"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(new Set()); }}
        />
        {/* 묶어 보기 — 「학교별로 한 번 훑기」 는 실제로 자주 하는 일이다 */}
        <select
          className="input input-sm"
          style={{ width: 118 }}
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          title="목록을 묶어서 봅니다"
        >
          <option value="none">묶지 않기</option>
          <option value="class">반별</option>
          <option value="day">요일별</option>
          <option value="school">학교별</option>
          <option value="grade">학년별</option>
        </select>
        <select
          className="input input-sm"
          style={{ width: 128 }}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          title="목록 정렬"
        >
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {STATUS_TABS.map(([k, label]) => {
          const n = k === "all" ? students.length : students.filter((s) => s.status === k).length;
          if (n === 0 && k !== "enrolled" && k !== "all") return null;
          return (
            <button
              key={k}
              className={`btn btn-sm ${statusFilter === k ? "btn-primary" : "btn-ghost"}`}
              onClick={() => { setStatusFilter(k); setSel(new Set()); }}
            >
              {label} {n}
            </button>
          );
        })}
        <span className="spacer" />
        <span className="hint">{shown.length}명 표시</span>
        {/* **빠진 칸은 조용하다** — 학부모 전화가 없으면 그 아이만 리포트가
            안 나가는데, 목록을 훑어서는 안 보인다 */}
        {countMissing(students.filter((s) => statusFilter === "all" || s.status === statusFilter), need) > 0 && (
          <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={onlyMissing} onChange={(e) => { setOnlyMissing(e.target.checked); setSel(new Set()); }} />
            빠진 것만 ({countMissing(students.filter((s) => statusFilter === "all" || s.status === statusFilter), need)})
          </label>
        )}
        <MissingPicker listKey="students" defs={NEED} chosen={missKeys} />
        {/* 정렬·묶음·상태는 **저장을 눌러야 남는다.** 그때그때 바꿔보는 것이라
            자동으로 남기면 다음에 열었을 때 왜 이렇게 보이는지 알 수 없다. */}
        {viewDirty && (
          <button className="btn btn-sm" onClick={saveView} title="지금 보기를 이 브라우저에 기억시킵니다">
            이 보기 저장
          </button>
        )}
        {(viewDirty || savedView) && (
          <button className="btn btn-ghost btn-sm" onClick={resetView}>
            {savedView ? "저장한 보기로" : "처음 보기로"}
          </button>
        )}
        {/* 전부 켜면 가로로 1400px 이 넘는다. 매일 보는 것만 켜두고 나머지는 여기서 */}
        <button className="btn btn-ghost btn-sm" onClick={() => setColBox(!colBox)}>
          열 고르기 {cols.length}/{COLS.length}
        </button>
      </div>

      {colBox && (
        <div className="card card-tight" style={{ marginTop: 8 }}>
          <p className="hint" style={{ margin: "0 0 8px" }}>
            볼 것만 켜두세요. <b>이 브라우저에 기억됩니다.</b>
            끈 것도 학생 줄을 펼치면 「수정」에서 그대로 고칠 수 있어요.
          </p>
          <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
            {COLS.map((c) => (
              <button
                key={c.key}
                className={`hwchip ${on.has(c.key) ? "hw-next" : ""}`}
                onClick={() => toggleCol(c.key)}
              >
                {on.has(c.key) && <b>＋</b>} {c.label}
              </button>
            ))}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOn(new Set(DEFAULT_ON));
                try { localStorage.setItem(COL_KEY, JSON.stringify(DEFAULT_ON)); } catch { /* 무시 */ }
              }}
            >
              처음 상태로
            </button>
          </div>
        </div>
      )}

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}명 선택</b>
          {/* 형제가 둘 다 다니면 학부모는 계정 하나로 둘 다 봐야 한다 */}
          {sel.size >= 2 && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                const names = students.filter((s) => sel.has(s.id)).map((s) => s.name).join(", ");
                if (!confirm(`${names}\n\n이 학생들을 형제자매로 묶을까요?`)) return;
                run(async () => {
                  const r = await linkSiblings([...sel]);
                  if (!r?.error) setSel(new Set());
                  return r;
                });
              }}
            >
              형제로 묶기
            </button>
          )}
          <select
            className="input input-sm"
            style={{ width: 120 }}
            defaultValue=""
            onChange={(e) => { runStatus(e.target.value); e.target.value = ""; }}
            disabled={pending}
          >
            <option value="">상태 변경…</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={runDelete} disabled={pending}>삭제</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="splitview">
      <div className="tblwrap">
        {/* 폰에서는 열을 다 보여줄 수가 없다 (기본만 켜도 가로 600px 이 넘는다).
            **이름과 상태만 남기고** 나머지는 접는다 — 어차피 이름을 누르면
            한 판이 열려서 거기서 다 보고 고친다. 가로로 미는 것보다 낫다.
            (열 고르기로 켠 것은 넓은 화면에서 그대로 나온다) */}
        <table className="tbl tbl-tight stutbl">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => el && (el.indeterminate = someChecked)}
                  onChange={toggleAll}
                />
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={c.key === "name" || c.key === "status" ? "stu-keep" : "stu-drop"}
                  style={{ minWidth: c.w }}
                >
                  {c.label}
                </th>
              ))}
              <th style={{ width: 86 }}></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                {/* 묶어 볼 때만 나오는 머리줄. 「학교 미입력」 처럼 **빈 것도 한 묶음**이다 —
                    안 보여주면 그 아이들이 목록에서 사라진 것처럼 보인다 */}
                {g.title && (
                  <tr className="grouprow">
                    <td>
                      <input
                        type="checkbox"
                        checked={g.rows.every((x) => sel.has(x.id))}
                        onChange={() => {
                          const n = new Set(sel);
                          const every = g.rows.every((x) => n.has(x.id));
                          g.rows.forEach((x) => (every ? n.delete(x.id) : n.add(x.id)));
                          setSel(n);
                        }}
                      />
                    </td>
                    <td colSpan={cols.length + 1}>
                      <b style={{ fontSize: 14 }}>{g.title}</b>{" "}
                      <span className="hint">{g.rows.length}명</span>
                    </td>
                  </tr>
                )}
                {g.rows.map((s) => (
              <Fragment key={s.id}>
                <tr className={openId === s.id ? "rowopen" : undefined}>
                  <td>
                    <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggleOne(s.id)} />
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={[
                        c.mono ? "mono" : "",
                        c.key === "name" || c.key === "status" ? "stu-keep" : "stu-drop",
                      ].filter(Boolean).join(" ")}
                      style={c.strong ? { fontWeight: 700 } : undefined}
                    >
                      {/* 이름을 누르면 그 학생 한 판이 열린다 — 버튼을 찾을 일이 없다 */}
                      {c.key === "name" ? (
                        <>
                          <button className="namebtn" onClick={() => open(s)}>{s.name}</button>
                          {/* 무엇이 빠졌는지 적어준다 — 숫자만 있으면 줄마다 눌러 찾아야 한다 */}
                          {missingIn(s, need).length > 0 && (
                            <span
                              className="tag tag-amber"
                              style={{ marginLeft: 4 }}
                              title={`${missingIn(s, need).join(" · ")} 가 비어 있습니다`}
                            >
                              {missingIn(s, need).join("·")} 없음
                            </span>
                          )}
                        </>
                      ) : (
                        cell(s, c)
                      )}
                    </td>
                  ))}
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => open(s)}>
                      {openId === s.id ? "닫기" : "열기"}
                    </button>
                  </td>
                </tr>

              </Fragment>
            ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="muted" style={{ padding: 16, margin: 0, fontSize: 15 }}>
            조건에 맞는 학생이 없어요.
          </p>
        )}
      </div>
      {panelFor(students.find((x) => x.id === openId))}
      </div>
    </>
  );
}

import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import TopBar from "@/components/TopBar";
import Help, { helpOn } from "@/components/Help";
import AddStudentForm from "./AddStudentForm";
import { schoolNames } from "@/lib/schoolList";
import ExcelUpload from "./ExcelUpload";
import BulkAccounts from "./BulkAccounts";
import StudentList from "./StudentList";
import { notYet } from "@/lib/bookUse";
import { todaySeoul } from "@/lib/day";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

export default async function StudentsPage(props) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const today = todaySeoul();
  // 로그인 확인은 쿠키로 — getUser 는 요청마다 인증 서버 왕복이다
  // (미들웨어·오늘 수업과 같은 까닭. 2026-08-14 「로딩 자체가 느려」)
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user || null;

  const SCOLS =
    "id, name, school, grade, birth_year, gender, student_phone, parent_phone, status, enrolled_on, electives, note, login_id, profile_id, created_at";

  /**
   * **파도 1** — 서로 필요한 것이 없는 조회를 한꺼번에 (직렬 13회 → 3층).
   * 학생 사다리 폴백(옛 DB용)은 실패했을 때만 그대로 내려간다.
   */
  // 순서 주의: 6번째가 missing 설정, 7번째가 학교 이름 — 2026-08-21 뒤바뀐 채
  // 발견 (schools 에 설정 객체가 들어가 학생 추가 폼이 터졌다)
  const [profileQ, studentsQ1, warnQ, booksQ, klassesQ, missQ, schoolsList, hwQ] = await Promise.all([
    user
      ? cachedProfile(supabase, user.id)
      : Promise.resolve({ data: null }),
    supabase
      .from("students")
      .select(`${SCOLS}, word_when, word_test_count, word_cut_pct, family_id, classcard_login`)
      .order("created_at", { ascending: false }),
    supabase.from("integrations").select("config").eq("id", "warning").maybeSingle(),
    supabase
      .from("textbooks")
      .select("id, name, area, status, total_pages")
      .order("name", { ascending: true }),
    supabase
      .from("classes")
      .select("id, name, days, start_time")
      .order("start_time", { ascending: true }),
    // 「빠진 것」 기준 — 목록마다 어떤 칸을 셀지 (11-11, app/settings/missingActions)
    supabase.from("integrations").select("config").eq("id", "missing").maybeSingle(),
    schoolNames(supabase).catch(() => []),
    /**
     * **학습 항목** — 재원생에서 그 학생 교재의 등원 학습·집 숙제 루틴을
     * 바로 고칠 수 있게 (원장님 2026-08-24 — 「등원학습/하원숙제 루틴을
     * 재원생 정보에서 변경할 수 있게 해줘」). 교재 화면과 **같은 편집기**를
     * 쓰므로 고르는 항목 목록도 같은 한 벌이어야 한다.
     */
    supabase
      .from("homework_items")
      .select("id, name, sort, category")
      .eq("active", true)
      .order("sort", { ascending: true }),
  ]);
  const hwItems = hwQ?.error ? [] : hwQ?.data || [];
  const profile = profileQ?.data || null;

  let { data: students, error } = studentsQ1;
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0131 전이면 클카 아이디 없이
    ({ data: students, error } = await supabase
      .from("students")
      .select(`${SCOLS}, word_when, word_test_count, word_cut_pct, family_id`)
      .order("created_at", { ascending: false }));
  }
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0071 전이면 형제 묶음 없이
    ({ data: students, error } = await supabase
      .from("students")
      .select(`${SCOLS}, word_when, word_test_count, word_cut_pct`)
      .order("created_at", { ascending: false }));
  }
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0070 전이면 단어시험 칸도 없이
    ({ data: students, error } = await supabase
      .from("students")
      .select(SCOLS)
      .order("created_at", { ascending: false }));
  }

  // 통과선 기본값 — 학생마다 정하지 않았으면 이걸 쓴다
  const { data: warnRow } = warnQ;
  const defaultPass = Number(warnRow?.config?.wordPassPct) || 90;

  // 아직 초기 비밀번호(0000) 그대로인 학생.
  // 아이디가 규칙적이라, 한 번도 안 들어온 계정은 남이 열 수 있다. 챙겨야 한다.

  // 교재는 **학생마다 다르다** — 같은 반이어도 다르다. 그래서 재원생 목록에서
  // 바로 바꿀 수 있어야 한다 (예전에는 오늘 수업 화면 안에만 있어서, 오늘 수업이
  // 없는 학생은 손댈 수가 없었다).
  const { data: allBooks } = booksQ;
  const textbooks = (allBooks || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({ id: b.id, name: b.name, area: b.area || "", bookPages: b.total_pages || null }));
  const bookById = new Map(textbooks.map((b) => [b.id, b]));
  // 절판·중단까지 전부 — 배정·기록이 가리키는 교재를 찾을 때 쓴다
  const anyBookById = new Map(
    (allBooks || []).map((b) => [
      b.id,
      { id: b.id, name: b.name, area: b.area || "", bookPages: b.total_pages || null },
    ])
  );

  const ids = (students || []).map((x) => x.id);
  const pids2 = (students || []).map((s2) => s2.profile_id).filter(Boolean);
  const none = { data: [] };
  // 파도 2 — 학생 id 가 필요한 것들
  const [stBooksQ, initPwQ, membersQ, plinksQ] = await Promise.all([
    ids.length
      ? fetchAll(() => supabase
          .from("student_textbooks")
          .select("student_id, textbook_id, status, assigned_on, ended_on, current_page, skip_acts, pause")
          .in("student_id", ids)
          .order("student_id").order("textbook_id"))
      : none,
    pids2.length
      ? supabase.from("profiles").select("id, must_change_pw").in("id", pids2)
      : none,
    ids.length
      ? supabase.from("class_students").select("class_id, student_id").in("student_id", ids)
      : none,
    ids.length
      ? supabase.from("parent_student").select("student_id, parent_profile_id").in("student_id", ids)
      : none,
  ]);
  // pause(0149) → skip_acts(0133) 가 없는 DB 면 한 칸씩 물러나며 다시 읽는다
  let stBooks = stBooksQ.data;
  if (stBooksQ.error && ids.length) {
    // 0149 전 — pause 없이 (skip_acts 는 지킨다)
    let fb = await supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status, assigned_on, ended_on, current_page, skip_acts")
      .in("student_id", ids);
    if (fb.error) {
      // 0133 전 — skip_acts 도 없이
      fb = await supabase
        .from("student_textbooks")
        .select("student_id, textbook_id, status, assigned_on, ended_on, current_page")
        .in("student_id", ids);
    }
    stBooks = fb.data;
  }

  // 아직 초기 비밀번호(0000) 그대로인 학생 — 파도 2 에서 왔다
  const initPw = new Set();
  (initPwQ.data || []).forEach((p) => p.must_change_pw && initPw.add(p.id));
  const booksOf = new Map();
  (stBooks || []).forEach((r) => {
    if (r.status && r.status !== "active") return;   // 끝냈거나 그만둔 교재는 뺀다
    /**
     * **교재가 절판·중단이어도 배정이 살아 있으면 보여준다** (2026-08-14 —
     * 「동아」 계열: 오늘 수업에는 뜨는데 여기서는 조용히 사라져서 두 화면이
     * 다른 말을 했다). 숨기면 원장님이 끝냄 처리할 길도 없다 — 「중단 교재」
     * 꼬리표를 달아 보여주고, 🧹 교재 정리로 치우시게 한다.
     */
    const alive = bookById.get(r.textbook_id);
    const b = alive || anyBookById.get(r.textbook_id);
    if (!b) return;
    if (!booksOf.has(r.student_id)) booksOf.set(r.student_id, []);
    // **여기서는 아직 안 시작한 교재도 보여준다.** 교재 안내를 보내고 나면
    // 「보냈나 안 보냈나」 를 여기서 확인하시게 된다 — 안 보이면 확인할 데가
    // 없다. 대신 언제부터인지를 붙여서, 지금 쓰는 것과 구별되게 한다.
    booksOf.get(r.student_id).push({
      ...b,
      dead: !alive,
      from: notYet(r, today) ? r.assigned_on : null,
      curPage: r.current_page ?? "",
      skipActs: r.skip_acts || "",
      // 멈춤 (0149) — 진도 판(BookProgress)이 태그·토글로 보여준다
      pause: r.pause || null,
    });
  });

  /**
   * **끝냈거나 중단한 교재 — 기록으로 보여준다** (원장님, 2026-08-14 —
   * 「교재가 끝나면 종료처리도 해야 해. 이미 쓴 적 있는데 기록이 없는
   * 교재를 추가할 수 있어야 해」). 적을 수 있게만 하고 보여주지 않으면
   * 적은 보람이 없다. 절판 처리된 교재도 기록에는 나와야 하므로
   * 활성 교재만 추린 bookById 가 아니라 전체에서 찾는다.
   */
  const pastOf = new Map();
  (stBooks || []).forEach((r) => {
    if (!r.status || r.status === "active") return;
    const b = anyBookById.get(r.textbook_id);
    if (!b) return;
    if (!pastOf.has(r.student_id)) pastOf.set(r.student_id, []);
    pastOf.get(r.student_id).push({
      ...b,
      status: r.status,
      from: r.assigned_on || null,
      to: r.ended_on || null,
    });
  });
  pastOf.forEach((list) => list.sort((a, b) => (b.to || "").localeCompare(a.to || "")));

  // 반과 수업 요일 — 목록을 **반별 · 요일별**로 묶어 보기 위해서다
  const { data: klasses } = klassesQ;
  const klassById = new Map((klasses || []).map((c) => [c.id, c]));
  const { data: members } = membersQ;
  const classesOf = new Map();
  (members || []).forEach((m) => {
    const c = klassById.get(m.class_id);
    if (!c) return;
    if (!classesOf.has(m.student_id)) classesOf.set(m.student_id, []);
    classesOf.get(m.student_id).push({ id: c.id, name: c.name, days: c.days || [] });
  });

  /**
   * **엄마 아이디** (원장님, 2026-08-07 — 「재원생 정보에 엄마아이디 필요해」).
   *
   * 학부모 계정 칸이 판 맨 아래에 있어서, 어머니가 「아이디가 뭐였죠」 하고
   * 물어오시면 한참 내려야 했다. 표에 한 칸으로 두면 검색으로도 찾힌다.
   *
   * 형제는 계정 하나를 같이 쓰므로 두 아이 줄에 같은 아이디가 나온다 —
   * 그게 맞다.
   */
  const { data: plinks } = plinksQ;
  const ppids = [...new Set((plinks || []).map((l) => l.parent_profile_id).filter(Boolean))];
  const { data: pprofs } = ppids.length
    ? await supabase.from("profiles").select("id, login_id").in("id", ppids)
    : { data: [] };
  const loginOf = new Map((pprofs || []).map((p) => [p.id, p.login_id]));
  const parentIdOf = new Map();
  (plinks || []).forEach((l) => {
    const v = loginOf.get(l.parent_profile_id);
    if (v) parentIdOf.set(l.student_id, v);
  });

  const rows = (students || []).map((s) => {
    const cls = classesOf.get(s.id) || [];
    return {
      ...s,
      initPw: !!s.profile_id && initPw.has(s.profile_id),
      parent_login_id: parentIdOf.get(s.id) || null,
      books: booksOf.get(s.id) || [],
      pastBooks: pastOf.get(s.id) || [],
      classes: cls,
      days: [...new Set(cls.flatMap((c) => c.days))],
    };
  });

  // 학교는 골라 넣는다 (0114) — 손으로 적으면 「신정중」 과 「신정중학교」 로 갈라진다
  const schools = schoolsList;

  return (
    <>
      <TopBar profile={profile} active="students" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">학생 관리</p>
          <h1 className="h1">재원생</h1>
          <Help>
            <p className="sub">
              학생을 추가하면 실제 데이터베이스(Supabase)에 저장됩니다. 로그인
              아이디는 전화 뒷자리로 자동 생성됩니다.
            </p>
          </Help>
        {/* 새로 넣은 학생 — 「저장을 눌렀는데 아무 일도 안 났다」 의 답 */}
        {searchParams?.made && (
          <div className="notice" style={{ marginTop: 12, background: "var(--mint-soft)" }}>
            <b>「{searchParams.made}」 를 넣었어요.</b>{" "}
            {searchParams?.kin
              ? `학부모 번호가 같은 형제 ${searchParams.kin}명과 한 집으로 묶었어요.`
              : "아래에서 반·교재를 배정해주세요."}
          </div>
        )}

          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <AddStudentForm schools={schools} />
            <ExcelUpload />
          </div>
          <div style={{ marginTop: 4 }}>
            <BulkAccounts />
            {/* 학부모도 같은 자리에서. 규칙도 비밀번호도 학생과 같다 */}
            <BulkAccounts who="parent" />
          </div>
        </div>

        {/* overflow:hidden 을 걸면 **오른쪽 판이 스크롤을 안 따라온다** (sticky 가
            죽는다). 목록을 내려가면 판만 위에 남아서, 학생을 누를 때마다
            위로 올라가야 했다. 모서리는 안쪽에서 다듬는다. */}
        <div className="card" style={{ marginTop: 12, padding: 0 }}>
          {error ? (
            <div style={{ padding: 14 }}>
              <div className="err">불러오기 실패: {error.message}</div>
            </div>
          ) : (
            <StudentList
              students={rows}
              textbooks={textbooks}
              hwItems={hwItems}
              defaultPass={defaultPass}
              openStudent={searchParams?.s || null}
              classList={(klasses || []).map((c) => ({ id: c.id, name: c.name }))}
              missKeys={missQ?.data?.config?.students ?? null}
              schools={schools}
              help={await helpOn()}
            />
          )}
        </div>
      </main>
    </>
  );
}

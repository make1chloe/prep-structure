import { createClient } from "@/lib/supabase/server";
import PickOrType from "@/components/PickOrType";
import TopBar from "@/components/TopBar";
import { addUnit } from "./actions";
import TextbookUpload from "./TextbookUpload";
import UnitUpload from "./UnitUpload";
import GenerateUnits from "./GenerateUnits";
import AddTextbookForm from "./AddTextbookForm";
import TextbookList from "./TextbookList";
import UnitList from "./UnitList";
import WordRangeBox from "./WordRangeBox";
import RoutineEditor from "./RoutineEditor";
import DupBooks from "./DupBooks";
import BookStudents from "./BookStudents";
import BookProgressBoard from "./BookProgressBoard";
import { flattenTree } from "@/lib/unitTree";
import { activityList } from "@/lib/activities";
import { dupGroups, pickKeeper } from "@/lib/bookName";
import { AREA_ORDER as AREAS } from "@/lib/bookSort";
import { listRoutine } from "./routineActions";
import { listBookProgress } from "@/app/progress/actions";
import { cachedProfile } from "@/lib/profileCache";
import { fetchAll } from "@/lib/fetchAll";
import RoutineUpload from "./RoutineUpload";

export const dynamic = "force-dynamic";

export default async function TextbooksPage({ searchParams }) {
  const supabase = createClient();
  // 로그인 확인은 쿠키로 — getUser 는 요청마다 인증 서버 왕복이다 (2026-08-14)
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user || null;

  // **파도 1** — 서로 필요한 것이 없는 조회를 한꺼번에 (직렬 13회 → 3층)
  const [profileQ, tbQ1, allUnitsQ, assignedQ, hwQ1, studentsQ, missQ] = await Promise.all([
    user
      ? cachedProfile(supabase, user.id)
      : Promise.resolve({ data: null }),
    supabase
      .from("textbooks")
      .select("id, name, area, target_grade, total_pages, price, word_range, words_irregular, status, purchase_url, feature, created_at")
      .order("created_at", { ascending: false }),
    // 단원은 전 교재 합이라 1000줄을 넘는다 — 잘리면 멀쩡한 교재가
    // 「단원 없음」 으로 보인다 (2026-08-14 실제로 그랬다. lib/fetchAll)
    fetchAll(() => supabase.from("textbook_units").select("textbook_id, label").order("id")),
    fetchAll(() =>
      supabase
        .from("student_textbooks")
        .select("textbook_id, student_id, status")
        .neq("status", "dropped")
        .order("student_id")
        .order("textbook_id")
    ),
    supabase
      .from("homework_items")
      .select("id, name, sort, category")
      .eq("active", true)
      .order("sort", { ascending: true }),
    supabase
      .from("students")
      .select("id, name, school, grade, status")
      .eq("status", "enrolled")
      .order("name", { ascending: true }),
    // 「빠진 것」 기준 — 목록마다 어떤 칸을 셀지 (11-11)
    supabase.from("integrations").select("config").eq("id", "missing").maybeSingle(),
  ]);
  const profile = profileQ?.data || null;

  // word_range 컬럼이 아직 없는 DB에서도 목록이 보이도록, 실패하면 기본 컬럼만 다시 조회
  let { data: textbooks, error: tbError } = tbQ1;
  if (tbError) {
    // 0070 전이면 '불규칙' 없이
    ({ data: textbooks, error: tbError } = await supabase
      .from("textbooks")
      .select("id, name, area, target_grade, total_pages, price, word_range, status, purchase_url, feature, created_at")
      .order("created_at", { ascending: false }));
  }
  if (tbError) {
    ({ data: textbooks, error: tbError } = await supabase
      .from("textbooks")
      .select("id, name, area, target_grade, total_pages, price, purchase_url, feature, created_at")
      .order("created_at", { ascending: false }));
  }

  // 교재별 단원 개수 — 어느 교재를 아직 안 채웠는지 한눈에 보기 위해
  // 활동 이름도 여기서 모은다 (한 번 적은 것은 다음부터 골라 쓸 수 있게)
  const { data: allUnits } = allUnitsQ;
  const unitCount = {};
  (allUnits || []).forEach((u) => {
    unitCount[u.textbook_id] = (unitCount[u.textbook_id] || 0) + 1;
  });
  const activities = activityList((allUnits || []).map((u) => u.label));

  // 같은 교재로 보이는 것 — 엑셀 이름이 조금 달라서 갈라진 것들.
  // 어느 쪽을 남길지 정하려면 **쓰는 학생 수**를 알아야 한다.
  // 학생 id 도 같이 받는다 — 아래 「이 교재를 쓰는 학생」이 쓴다.
  // 한 번 물어본 것을 두 번 묻지 않는다 (같은 표를 두 번 읽으면 두 답이 갈린다)
  const { data: assigned } = assignedQ;
  const useCount = {};
  (assigned || []).forEach((r) => {
    useCount[r.textbook_id] = (useCount[r.textbook_id] || 0) + 1;
  });

  /**
   * 교재마다 **지금 쓰는 학생** — 「학생별로 걸러 보기」와 「학생」 열이 쓴다.
   *
   * '완료(done)' 는 뺀다. 다 뗀 책까지 「쓰는 중」으로 세면, 걸러 봤을 때
   * 지금 안 쓰는 책이 섞여 나온다.
   */
  const byBook = {};
  (assigned || [])
    .filter((r) => (r.status || "active") === "active")
    .forEach((r) => {
      (byBook[r.textbook_id] ||= []).push(r.student_id);
    });
  const dups = dupGroups(textbooks || []).map(({ key, books }) => {
    const withCounts = books.map((b) => ({
      id: b.id, name: b.name, area: b.area, created_at: b.created_at,
      students: useCount[b.id] || 0,
      units: unitCount[b.id] || 0,
    }));
    return { key, books: withCounts, keepId: pickKeeper(withCounts)?.id || withCounts[0].id };
  });

  // 분류(category)도 받아온다 — 루틴에서 항목을 고를 때 마흔몇 개를 한 덩어리로
  // 펴 놓으면 눈이 멈출 데가 없다. 분류로 묶어서 보여준다
  let { data: hwItems, error: hwErr } = hwQ1;
  if (hwErr) {
    ({ data: hwItems } = await supabase
      .from("homework_items")
      .select("id, name, sort")
      .eq("active", true)
      .order("sort", { ascending: true }));
  }

  // 교재에 학생을 붙이려면 재원생 명단이 있어야 한다.
  // 그만둔 아이까지 늘어놓으면 고를 때마다 눈으로 걸러야 한다.
  let { data: students, error: stuErr } = studentsQ;
  if (stuErr) students = [];

  const selectedId = searchParams?.tb || textbooks?.[0]?.id || null;
  const selected = textbooks?.find((t) => t.id === selectedId) || null;

  /**
   * 루틴·진도 탭의 데이터도 **여기서 미리** (원장님, 2026-08-14 — 「루틴
   * 진도 누르면 엄청나게 느려」). 탭을 누른 뒤에 서버에 다녀오게 두면
   * 누를 때마다 빈 판 → 왕복 → 내용 순서가 된다. 페이지가 이미 어느
   * 교재인지 아니까 실어 보낸다 — 탭 전환이 왕복 0 이 된다.
   */
  const [routineInit, progressInit] = await Promise.all([
    selectedId ? listRoutine(selectedId) : { steps: [], ready: true },
    selectedId ? listBookProgress(selectedId) : { rows: [] },
  ]);

  let units = [];
  if (selectedId) {
    const base = "id, name, sort, label, parent_id, page_start, page_end";
    let { data, error } = await supabase
      .from("textbook_units")
      .select(`${base}, question_no, word_count`)
      .eq("textbook_id", selectedId)
      .order("sort", { ascending: true });
    if (error) {
      // 0070 전이면 단어 개수 없이
      ({ data, error } = await supabase
        .from("textbook_units")
        .select(`${base}, question_no`)
        .eq("textbook_id", selectedId)
        .order("sort", { ascending: true }));
    }
    if (error) {
      // 0051 전이면 문제번호도 없이
      ({ data } = await supabase
        .from("textbook_units")
        .select(base)
        .eq("textbook_id", selectedId)
        .order("sort", { ascending: true }));
    }
    units = data || [];
  }

  // 상위 단원 후보 (대·중단원까지만)
  const unitOptions = flattenTree(units)
    .filter((r) => r.depth < 2)
    .map((r) => ({ id: r.unit.id, name: r.unit.name, depth: r.depth }));

  return (
    <>
      <TopBar profile={profile} active="textbooks" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">교재 관리</p>
          <h1 className="h1">교재 · 단원</h1>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <AddTextbookForm />
            <TextbookUpload />
            <UnitUpload />
            <RoutineUpload />
          </div>
        </div>

        {/* 「저장했는데 안 생겼다」 의 답 — 이미 같은 교재가 있어서 그리로 왔다 */}
        {searchParams?.same && (
          <div className="notice" style={{ marginTop: 12 }}>
            <b>「{searchParams.same}」 는 이미 있는 교재예요.</b> 아래 교재가 그것입니다.
            띄어쓰기나 「2025 개정」 같은 표기만 달라도 같은 교재로 봅니다 —
            둘로 만들면 진도가 갈리기 때문이에요.
            {/**
              * **절판·중단이라 숨어 있던 경우** (2026-08-14 — 「동아」 계열).
              * 목록·검색에는 안 나오는데 「이미 있어요」 만 뜨니, 만들 수도
              * 쓸 수도 없는 것처럼 보였다. 어디 숨었는지 · 어떻게 되살리는지
              * 를 그 자리에서 말해준다.
              */}
            {searchParams?.dead && (
              <>
                <br />
                <b>이 교재는 지금 절판·중단 상태라 목록·검색에 안 보입니다.</b>{" "}
                다시 쓰시려면 오른쪽 판 → 「정보」 탭에서 상태를 <b>사용중</b>으로
                바꾸세요. 잘못 만들어졌던 빈 교재(단원 0 · 학생 0)라면 거기서
                지우셔도 됩니다.
              </>
            )}
          </div>
        )}

        <DupBooks groups={dups} />

        {/* 교재 목록(왼쪽) + 고른 교재 한 판(오른쪽) — **재원생 화면과 같은 구조.**
            overflow:hidden 을 걸면 오른쪽 판의 sticky 가 죽는다 (재원생과 같은 이유) */}
        <div className="card" style={{ marginTop: 12, padding: 0 }}>
          {tbError ? (
            <div style={{ padding: 14 }}>
              <div className="err">불러오기 실패: {tbError.message}</div>
            </div>
          ) : (
            <TextbookList
              textbooks={textbooks || []}
              missKeys={missQ?.data?.config?.textbooks ?? null}
              unitCount={unitCount}
              selectedId={selectedId}
              students={students || []}
              byBook={byBook}
              routinePanel={
                selected ? (
                  <RoutineEditor
                    key={selectedId}
                    textbookId={selectedId}
                    items={hwItems}
                    initialSteps={routineInit.steps}
                    initialReady={routineInit.ready}
                  />
                ) : null
              }
              progressPanel={
                selected ? (
                  <BookProgressBoard
                    key={selectedId}
                    textbookId={selectedId}
                    initialRows={progressInit.rows || []}
                  />
                ) : null
              }
              studentsPanel={
                selected ? (
                  <BookStudents
                    key={selectedId}
                    textbookId={selectedId}
                    bookName={selected.name}
                    students={students || []}
                    picked={byBook[selectedId] || []}
                  />
                ) : null
              }
              unitsPanel={
                selected ? (
              <>
                <div className="row" style={{ margin: "0 0 8px" }}>
                  <GenerateUnits
                    textbookId={selectedId}
                    parents={unitOptions}
                    totalPages={selected.total_pages}
                  />
                </div>
                <p className="muted" style={{ margin: "0 0 10px", fontSize: 14 }}>
                  상위 단원을 고르면 그 아래(중·소단원)로 들어가요. 순서는 자동으로 맨 뒤에 붙습니다.
                </p>

                {/* 단어 교재만 — 단어시험 개수의 근거가 되는 숫자다 */}
                {selected.area === "단어" && <WordRangeBox book={selected} />}

                <form action={addUnit} className="row" style={{ alignItems: "flex-end", gap: 8, marginBottom: 12 }}>
                  <input type="hidden" name="textbook_id" value={selected.id} />
                  <div className="field" style={{ width: 170 }}>
                    <label className="label">상위 단원</label>
                    <select className="input input-sm" name="parent_id" defaultValue="">
                      <option value="">대단원 (최상위)</option>
                      {unitOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {"— ".repeat(o.depth)}
                          {o.name} 아래
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: 1, minWidth: 150 }}>
                    <label className="label">단원명 *</label>
                    <input className="input input-sm" name="name" required placeholder="Unit 1. 관계사" />
                  </div>
                  <div className="field" style={{ width: 74 }}>
                    <label className="label">문제번호</label>
                    <input
                      className="input input-sm"
                      name="question_no"
                      placeholder="29"
                      title="모의고사처럼 단원이 없을 때 씁니다 (내신 범위를 여기서 골라 담습니다)"
                    />
                  </div>
                  <div className="field" style={{ width: 58 }}>
                    <label className="label">시작p</label>
                    <input className="input input-sm" name="page_start" inputMode="numeric" placeholder="8" />
                  </div>
                  <div className="field" style={{ width: 58 }}>
                    <label className="label">끝p</label>
                    <input className="input input-sm" name="page_end" inputMode="numeric" placeholder="15" />
                  </div>
                  <div className="field" style={{ width: 118 }}>
                    <label className="label">활동</label>
                    {/* 교재마다 다르니 골라도 되고 직접 적어도 된다 */}
                    {/* datalist 는 아이폰에서 안 보인다 (C6) — 골라 넣기 한 벌 */}
                    <PickOrType name="activity" options={activities} placeholder="설명 · 예습 …" />
                  </div>
                  <button className="btn btn-primary btn-sm" type="submit" style={{ marginBottom: 1 }}>
                    추가
                  </button>
                </form>

                <UnitList
                  units={units}
                  textbookId={selected.id}
                  textbooks={textbooks || []}
                  activities={activities}
                  book={selected}
                />
              </>
                ) : null
              }
            />
          )}
        </div>
      </main>
    </>
  );
}

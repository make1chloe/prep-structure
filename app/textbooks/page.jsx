import { createClient } from "@/lib/supabase/server";
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
import { flattenTree } from "@/lib/unitTree";
import { activityList } from "@/lib/activities";

export const dynamic = "force-dynamic";

const AREAS = ["독해", "듣기", "영작", "문법", "단어", "내신"];

export default async function TextbooksPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  // word_range 컬럼이 아직 없는 DB에서도 목록이 보이도록, 실패하면 기본 컬럼만 다시 조회
  let { data: textbooks, error: tbError } = await supabase
    .from("textbooks")
    .select("id, name, area, target_grade, total_pages, price, word_range, words_irregular, status, purchase_url, feature, created_at")
    .order("created_at", { ascending: false });
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
  const { data: allUnits } = await supabase
    .from("textbook_units")
    .select("textbook_id, label");
  const unitCount = {};
  (allUnits || []).forEach((u) => {
    unitCount[u.textbook_id] = (unitCount[u.textbook_id] || 0) + 1;
  });
  const activities = activityList((allUnits || []).map((u) => u.label));

  const { data: hwItems } = await supabase
    .from("homework_items")
    .select("id, name, sort")
    .eq("active", true)
    .order("sort", { ascending: true });

  const selectedId = searchParams?.tb || textbooks?.[0]?.id || null;
  const selected = textbooks?.find((t) => t.id === selectedId) || null;

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
          </div>
        </div>

        {/* 교재 목록 (전체 폭) */}
        <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          {tbError ? (
            <div style={{ padding: 18 }}>
              <div className="err">불러오기 실패: {tbError.message}</div>
            </div>
          ) : (
            <TextbookList
              textbooks={textbooks || []}
              unitCount={unitCount}
              selectedId={selectedId}
            />
          )}
        </div>

        {/* 선택한 교재의 단원 (아래, 전체 폭) */}
        <div className="card" style={{ marginTop: 12 }}>
            {selected ? (
              <>
                <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
                  {selected.name} · 단원
                </h2>
                <div className="row" style={{ margin: "0 0 8px" }}>
                  <GenerateUnits
                    textbookId={selectedId}
                    parents={unitOptions}
                    totalPages={selected.total_pages}
                  />
                </div>
                <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
                  상위 단원을 고르면 그 아래(중·소단원)로 들어가요. 순서는 자동으로 맨 뒤에 붙습니다.
                </p>

                {/* 단어 교재만 — 단어시험 개수의 근거가 되는 숫자다 */}
                {selected.area === "단어" && <WordRangeBox book={selected} />}

                <RoutineEditor textbookId={selectedId} items={hwItems} />

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
                    <input
                      className="input input-sm"
                      name="activity"
                      list="activity-list"
                      placeholder="설명 · 예습 …"
                      title="목록에서 골라도 되고 직접 적어도 됩니다"
                    />
                    <datalist id="activity-list">
                      {activities.map((a) => (
                        <option key={a} value={a} />
                      ))}
                    </datalist>
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
            ) : (
              <p className="muted" style={{ fontSize: 13.5 }}>
                왼쪽에서 교재를 선택하면 단원을 정리할 수 있어요.
              </p>
            )}
        </div>
      </main>
    </>
  );
}

import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { addUnit } from "./actions";
import TextbookUpload from "./TextbookUpload";
import UnitUpload from "./UnitUpload";
import GenerateUnits from "./GenerateUnits";
import AddTextbookForm from "./AddTextbookForm";
import TextbookList from "./TextbookList";
import UnitList from "./UnitList";
import { flattenTree } from "@/lib/unitTree";

export const dynamic = "force-dynamic";

const AREAS = ["독해", "듣기", "영작", "문법", "단어", "내신"];
const ACTIVITIES = ["설명", "실전모의고사", "워크북"];

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
    .select("id, name, area, target_grade, total_pages, price, word_range, status, purchase_url, feature, created_at")
    .order("created_at", { ascending: false });
  if (tbError) {
    ({ data: textbooks, error: tbError } = await supabase
      .from("textbooks")
      .select("id, name, area, target_grade, total_pages, price, purchase_url, feature, created_at")
      .order("created_at", { ascending: false }));
  }

  const selectedId = searchParams?.tb || textbooks?.[0]?.id || null;
  const selected = textbooks?.find((t) => t.id === selectedId) || null;

  let units = [];
  if (selectedId) {
    const { data } = await supabase
      .from("textbook_units")
      .select("id, name, sort, label, parent_id, page_start, page_end")
      .eq("textbook_id", selectedId)
      .order("sort", { ascending: true });
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
            <TextbookList textbooks={textbooks || []} selectedId={selectedId} />
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
                  <div className="field" style={{ flex: 1, minWidth: 160 }}>
                    <label className="label">단원명 *</label>
                    <input className="input input-sm" name="name" required placeholder="Unit 1. 관계사" />
                  </div>
                  <div className="field" style={{ width: 62 }}>
                    <label className="label">시작p</label>
                    <input className="input input-sm" name="page_start" inputMode="numeric" placeholder="8" />
                  </div>
                  <div className="field" style={{ width: 62 }}>
                    <label className="label">끝p</label>
                    <input className="input input-sm" name="page_end" inputMode="numeric" placeholder="15" />
                  </div>
                  <div className="field" style={{ width: 118 }}>
                    <label className="label">활동</label>
                    <select className="input input-sm" name="activity" defaultValue="">
                      <option value="">없음</option>
                      {ACTIVITIES.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary btn-sm" type="submit" style={{ marginBottom: 1 }}>
                    추가
                  </button>
                </form>

                <UnitList
                  units={units}
                  textbookId={selected.id}
                  textbooks={textbooks || []}
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

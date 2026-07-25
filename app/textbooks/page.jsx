import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import { addTextbook, addUnit } from "./actions";
import TextbookUpload from "./TextbookUpload";
import TextbookList from "./TextbookList";
import UnitList, { flattenTree } from "./UnitList";

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
    .select("id, name, area, target_grade, total_pages, price, word_range, created_at")
    .order("created_at", { ascending: false });
  if (tbError) {
    ({ data: textbooks, error: tbError } = await supabase
      .from("textbooks")
      .select("id, name, area, target_grade, total_pages, price, created_at")
      .order("created_at", { ascending: false }));
  }

  const selectedId = searchParams?.tb || textbooks?.[0]?.id || null;
  const selected = textbooks?.find((t) => t.id === selectedId) || null;

  let units = [];
  if (selectedId) {
    const { data } = await supabase
      .from("textbook_units")
      .select("id, name, sort, label, parent_id")
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
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">교재 관리</p>
          <h1 className="h1">교재 · 단원</h1>
          <p className="sub">
            교재를 추가하고, 교재를 선택하면 오른쪽에서 단원(제목·순서)을
            정리할 수 있어요.
          </p>
          <TextbookUpload />
        </div>

        <div className="grid2" style={{ marginTop: 18, alignItems: "start" }}>
          {/* 왼쪽: 교재 추가 + 목록 */}
          <div className="stack" style={{ gap: 14 }}>
            <div className="card">
              <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 800 }}>
                교재 추가
              </h2>
              <form action={addTextbook} className="stack">
                <div className="field">
                  <label className="label">교재명 *</label>
                  <input className="input" name="name" required placeholder="리딩튜터 입문" />
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">영역</label>
                    <select className="input" name="area" defaultValue="">
                      <option value="">선택</option>
                      {AREAS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">레벨</label>
                    <input className="input" name="target_grade" placeholder="중2 / 중1-중2" />
                  </div>
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">전체 페이지</label>
                    <input className="input" name="total_pages" inputMode="numeric" placeholder="120" />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">교재비(원)</label>
                    <input className="input" name="price" inputMode="numeric" placeholder="15000" />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">단어범위</label>
                    <input className="input" name="word_range" inputMode="numeric" placeholder="800" />
                  </div>
                </div>
                <div className="field">
                  <label className="label">구매링크</label>
                  <input className="input" name="purchase_url" placeholder="https://..." />
                </div>
                <div className="field">
                  <label className="label">비고</label>
                  <input className="input" name="feature" placeholder="교재 특징 메모" />
                </div>
                <button className="btn btn-primary btn-block" type="submit">
                  저장
                </button>
              </form>
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 18px 0" }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                  교재 목록{" "}
                  <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
                    {textbooks?.length || 0}권
                  </span>
                </h2>
              </div>
              {tbError ? (
                <div style={{ padding: 18 }}>
                  <div className="err">불러오기 실패: {tbError.message}</div>
                </div>
              ) : (
                <TextbookList textbooks={textbooks || []} selectedId={selectedId} />
              )}
            </div>
          </div>

          {/* 오른쪽: 선택한 교재의 단원 */}
          <div className="card">
            {selected ? (
              <>
                <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>
                  {selected.name} · 단원
                </h2>
                <p className="muted" style={{ margin: "0 0 14px", fontSize: 12.5 }}>
                  상위 단원을 고르면 그 아래(중·소단원)로 들어가요. 순서는 자동으로 맨 뒤에 붙습니다.
                </p>

                <form action={addUnit} className="row" style={{ alignItems: "flex-end", marginBottom: 16 }}>
                  <input type="hidden" name="textbook_id" value={selected.id} />
                  <div className="field" style={{ width: 190 }}>
                    <label className="label">상위 단원</label>
                    <select className="input" name="parent_id" defaultValue="">
                      <option value="">대단원 (최상위)</option>
                      {unitOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {"— ".repeat(o.depth)}
                          {o.name} 아래
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">단원명 *</label>
                    <input className="input" name="name" required placeholder="Unit 1. 관계사" />
                  </div>
                  <div className="field" style={{ width: 130 }}>
                    <label className="label">활동</label>
                    <select className="input" name="activity" defaultValue="">
                      <option value="">없음</option>
                      {ACTIVITIES.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary" type="submit" style={{ marginBottom: 2 }}>
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
        </div>
      </main>
    </>
  );
}

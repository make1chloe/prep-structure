import { createClient } from "@/lib/supabase/server";
import Help from "@/components/Help";
import AddHomeworkForm from "./AddHomeworkForm";
import HomeworkList from "./HomeworkList";
import SeedBasicButton from "./SeedBasicButton";
import GrammarUnitsCard from "./GrammarUnitsCard";
import HwUpload from "./HwUpload";
import Tabs from "@/app/textbooks/Tabs";

/**
 * **학습 항목 판** — 옛 /homework 화면 그대로, 「교재」 화면의 탭으로 이사
 * (원장님 확정, 2026-08-27). /textbooks?view=items 가 이걸 그린다.
 * 판단·조회는 하나도 안 바꿨다 — 화면이 사는 주소만 옮겼다.
 * (actions · HomeworkList 들은 이 폴더에 그대로 산다 — app/todo 와 같은 관례)
 */
export default async function ItemsScreen() {
  const supabase = await createClient();

  // 항목과 「빠진 것」 기준(11-11)은 서로 필요한 게 없다 — 한 파도 (원칙 6-1)
  let [{ data: items, error }, missQ, guQ, stepsQ, booksQ] = await Promise.all([
    supabase
      .from("homework_items")
      .select("id, name, category, sort, active, method, prep_task, no_timer, checklist, home_item_id, in_person, unit_test, tool, redo_default")
      .order("sort", { ascending: true }),
    supabase.from("integrations").select("config").eq("id", "missing").maybeSingle(),
    supabase.from("integrations").select("config").eq("id", "grammar_units").maybeSingle(),
    // 「쓰는 곳」 (원장님 2026-08-21 — 루틴이 만든 항목과 내가 만든 것이
    // 섞여 구별이 안 돼) — 어느 진도루틴이 이 항목을 쓰는지
    supabase.from("routine_steps").select("textbook_id, area, inclass_items, home_items, home_next"),
    supabase.from("textbooks").select("id, name"),
  ]);
  if (error) {
    // 0116 전이면 '준비물' 없이
    ({ data: items, error } = await supabase
      .from("homework_items")
      .select("id, name, category, sort, active, method, prep_task, no_timer, checklist, home_item_id, in_person, unit_test")
      .order("sort", { ascending: true }));
  }
  if (error) {
    // 0063 전이면 '직접검사' 없이
    ({ data: items, error } = await supabase
      .from("homework_items")
      .select("id, name, category, sort, active, method, prep_task, no_timer, checklist, home_item_id, in_person")
      .order("sort", { ascending: true }));
  }
  if (error) {
    // no_timer 컬럼이 아직 없는 DB (0033 전)
    ({ data: items, error } = await supabase
      .from("homework_items")
      .select("id, name, category, sort, active, method, prep_task, no_timer")
      .order("sort", { ascending: true }));
  }
  if (error) {
    // prep_task 컬럼도 없는 DB (0028 전)
    ({ data: items, error } = await supabase
      .from("homework_items")
      .select("id, name, category, sort, active, method")
      .order("sort", { ascending: true }));
  }

  /**
   * 항목 id → 쓰는 진도루틴 이름들. 아무 데도 안 쓰이면 「상시」 —
   * 안 쓰인다는 뜻이 아니라 **아무 수업에서나 골라 쓰는 항목**이라는 뜻
   * (원장님 2026-08-21 「안쓰임이 아니라 상시」).
   */
  const bookName = new Map(((booksQ?.data) || []).map((b) => [b.id, b.name]));
  const usageOf = {};
  (((stepsQ?.data) || [])).forEach((st) => {
    let who = st.textbook_id ? bookName.get(st.textbook_id) || "교재" : `영역:${st.area || "?"}`;
    // 모의고사 12권은 한 갈래로 (원장님 2026-08-22 「따로 보여주지 말고
    // 그냥 모의고사 영역으로」). 「저절로 첫모의고사」 같은 교재는 안 접힌다
    if (/^\d{4}년 \d+월 고[123] 모의고사$/.test(who)) who = "모의고사";
    [...(st.inclass_items || []), ...(st.home_items || []), ...(st.home_next || [])].forEach((iid) => {
      if (!usageOf[iid]) usageOf[iid] = [];
      if (!usageOf[iid].includes(who)) usageOf[iid].push(who);
    });
  });

  if (error) {
    // method 컬럼도 없는 DB
    ({ data: items, error } = await supabase
      .from("homework_items")
      .select("id, name, category, sort, active")
      .order("sort", { ascending: true }));
  }

  return (
    <>
      {/* wrap(1080) — 학습 항목은 수가 적은 단일 목록이라 분할 이득이 없다.
          1480 은 빈 오른쪽만 남겼다 (B2 재실측 #15) */}
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">교재</p>
          <h1 className="h1">학습 항목</h1>
          <Help>
            <p className="sub">
              오늘 수업에서 숙제를 검사하고 배정할 때 쓰는 항목이에요.
              <b>학습 방법</b>을 적어두면 학생 페이지에서 숙제를 눌렀을 때 그대로 보여줍니다.
              안 쓰는 항목은 삭제 대신 <b>숨기기</b>를 권합니다 (지난 기록이 보존돼요).
            </p>
          </Help>
          <Tabs view="items" />
          <div className="row" style={{ marginTop: 10, gap: 6, flexWrap: "wrap" }}>
            <AddHomeworkForm />
            <HwUpload />
            <SeedBasicButton />
            <GrammarUnitsCard initial={guQ?.data?.config?.names || []} />
          </div>
        </div>

        <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          {error ? (
            <div style={{ padding: 14 }}>
              <div className="err">불러오기 실패: {error.message}</div>
            </div>
          ) : (
            <HomeworkList items={items || []} missKeys={missQ?.data?.config?.homework ?? null} usageOf={usageOf} />
          )}
        </div>
      </main>
    </>
  );
}

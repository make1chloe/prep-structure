import { createClient } from "@/lib/supabase/server";
import { loadRunningClasses } from "@/lib/classTerm";
import Help from "@/components/Help";
import AddInquiryForm from "./AddInquiryForm";
import ApplyLink from "./ApplyLink";
import ConsultBoard from "./ConsultBoard";
import { schoolNames } from "@/lib/schoolList";

export const dynamic = "force-dynamic";

export default async function ConsultPage() {
  const supabase = await createClient();

  // 서로 필요한 것이 없는 조회는 한 파도로 (원칙 6-1 — 직렬 3층이었다)
  const [inqQ, classesQ, schools, booksQ] = await Promise.all([
    supabase.from("inquiries").select("*").order("created_at", { ascending: false }),
    // 종강한 특강은 안 보인다 — 반 목록은 classTerm 한 벌 (값-지도 P1-12)
    loadRunningClasses(supabase, "id, name, days, start_time").then((r) => ({ data: [...r].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")) })),
    // 학교는 골라 넣는다 (0114) — 손으로 적으면 「신정중」 과 「신정중학교」 로 갈라진다
    schoolNames(supabase).catch(() => []),
    // 상담에 교재를 골라둔다 (0122) — 사용 중 교재만
    supabase.from("textbooks").select("id, name, area, status").order("name", { ascending: true }),
  ]);
  const { data: rows, error } = inqQ;
  const { data: classes } = classesQ;
  const textbooks = (booksQ.data || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({ id: b.id, name: b.name, area: b.area || "" }));
  // 이름 찾기는 **전체** 교재로 (전수검사 A10) — 활성만 주면 절판된 책이
  // 「(지워진 교재)」 로 보인다. 고르는 판은 위의 활성 목록 그대로.
  const bookNames = (booksQ.data || []).map((b) => ({ id: b.id, name: b.name }));

  return (
    <>
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">운영</p>
          <h1 className="h1">신규 상담</h1>
          <Help>
            <p className="sub">
              문의 → 상담 → 레벨테스트 → 등록까지 한 줄로 따라갑니다.
              등록으로 전환하면 이름·연락처가 그대로 재원생으로 넘어가요.
            </p>
          </Help>
          <div className="row" style={{ marginTop: 10, alignItems: "center", gap: 8 }}>
            <AddInquiryForm schools={schools} />
            <ApplyLink />
          </div>
        </div>
        <ConsultBoard
          schools={schools}
          rows={rows || []}
          classes={classes || []}
          textbooks={textbooks}
          bookNames={bookNames}
          unavailable={!!error}
          formReady={(rows || []).length === 0 || "form_submitted_at" in ((rows || [])[0] || {})}
        />
      </main>
    </>
  );
}

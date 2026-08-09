import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import AddInquiryForm from "./AddInquiryForm";
import ApplyLink from "./ApplyLink";
import ConsultBoard from "./ConsultBoard";
import { schoolNames } from "@/lib/schoolList";

export const dynamic = "force-dynamic";

export default async function ConsultPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const { data: rows, error } = await supabase
    .from("inquiries")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name")
    .order("start_time", { ascending: true });

  // 학교는 골라 넣는다 (0114) — 손으로 적으면 「신정중」 과 「신정중학교」 로 갈라진다
  const schools = await schoolNames(supabase).catch(() => []);

  return (
    <>
      <TopBar profile={profile} active="consult" />
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
          unavailable={!!error}
          formReady={(rows || []).length === 0 || "form_submitted_at" in ((rows || [])[0] || {})}
        />
      </main>
    </>
  );
}

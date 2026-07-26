import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import AddInquiryForm from "./AddInquiryForm";
import ConsultBoard from "./ConsultBoard";

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

  return (
    <>
      <TopBar profile={profile} active="consult" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">신규 상담</p>
          <h1 className="h1">문의 · 상담 · 레벨테스트</h1>
          <p className="sub">
            문의 → 상담 → 레벨테스트 → 등록까지 한 줄로 따라갑니다.
            등록으로 전환하면 이름·연락처가 그대로 재원생으로 넘어가요.
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <AddInquiryForm />
          </div>
        </div>
        <ConsultBoard rows={rows || []} classes={classes || []} unavailable={!!error} />
      </main>
    </>
  );
}

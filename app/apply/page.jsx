import { createClient } from "@/lib/supabase/server";
import BrandMark from "@/components/BrandMark";
import ApplyForm from "./ApplyForm";

export const dynamic = "force-dynamic";

// 로그인 없이 학부모가 여는 신청 양식.
// /apply           → 새 접수
// /apply?t=토큰    → 전화로 이름만 받아둔 건에 이어 붙임
export default async function ApplyPage({ searchParams }) {
  const token = searchParams?.t || "";
  let prefill = {};

  if (token) {
    const supabase = createClient();
    const { data } = await supabase
      .from("inquiries")
      .select("name, phone, school, grade")
      .eq("token", token)
      .maybeSingle();
    if (data) prefill = data;
  }

  return (
    <main className="wrap" style={{ maxWidth: 560, paddingBottom: 40 }}>
      <div className="page-head">
        <div className="login-logo" style={{ justifyContent: "flex-start", marginBottom: 10 }}>
          <BrandMark />
          <b style={{ fontSize: 17 }}>클로이영어</b>
        </div>
        <h1 className="h1">상담 신청</h1>
        <p className="sub">
          학생 <b>레벨테스트</b>와 <b>학부모 상담</b> 일정을 따로 잡아드립니다.
          아는 것만 적어주시면 되고, 빈칸이 있어도 접수됩니다.
        </p>
      </div>
      <div style={{ marginTop: 14 }}>
        <ApplyForm token={token} prefill={prefill} />
      </div>
    </main>
  );
}

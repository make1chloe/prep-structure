import { createClient } from "@/lib/supabase/server";
import BrandMark from "@/components/BrandMark";
import ApplyForm from "./ApplyForm";
import { schoolNames } from "@/lib/schoolList";

export const dynamic = "force-dynamic";

// 로그인 없이 학부모가 여는 신청 양식.
// /apply           → 새 접수
// /apply?t=토큰    → 전화로 이름만 받아둔 건에 이어 붙임
export default async function ApplyPage({ searchParams }) {
  const token = searchParams?.t || "";
  let prefill = {};
  const supabase = createClient();

  /**
   * **여기는 로그인이 없다.** schools 표는 선생님만 읽으므로(0076), 0114 의
   * 좁은 문으로 이름만 받는다. 못 받으면 빈 목록 — 그러면 그냥 적어 넣는
   * 칸이 되고 접수는 그대로 된다. 학교 목록 때문에 접수가 막히면 손해가 크다.
   */
  const schools = await schoolNames(supabase, { anon: true }).catch(() => []);

  if (token) {
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
        <ApplyForm token={token} prefill={prefill} schools={schools} />
      </div>
    </main>
  );
}

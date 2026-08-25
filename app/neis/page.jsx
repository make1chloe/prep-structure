import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import NeisPeek from "./NeisPeek";
import { listSchools } from "@/app/schedule/neisActions";
import { schoolYear } from "@/lib/neis";
import { todaySeoul } from "@/lib/day";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

/**
 * **나이스 원본** (원장님, 2026-08-09 — 「나이스 일정 페이지를 만들어서
 * 순수하게 나이스에 입력된 일정을 전수 볼 수 있게 해줘. 지금 오류가 난 건지
 * 입력이 안 된 건지 알 수가 없네. 장기적으로도 이 페이지는 필요해 보여」).
 *
 * 다른 화면은 전부 **우리가 바꾼 뒤**를 보여준다 — 이름을 펴고, 여러 날을
 * 잇고, 갈래를 나누고, 노이즈를 버린 다음. 그래서 뭔가 없을 때 학교가 안
 * 올린 것인지 우리가 못 알아본 것인지 가릴 수가 없었다.
 *
 * 이 화면만은 **바꾸기 전**을 본다. 나이스에 그 자리에서 다시 물어보고,
 * 받은 줄을 하나도 안 버리고 그대로 늘어놓는다. 저장은 하지 않는다.
 */
export default async function NeisPage() {
  const supabase = await createClient();
  const user = await sessionUser(supabase);

  let profile = null;
  if (user) {
    const { data } = await cachedProfile(supabase, user.id);
    profile = data;
  }

  const { rows: schools } = await listSchools();
  const year = schoolYear(todaySeoul());

  return (
    <>
      <TopBar profile={profile} active="neis" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">일정</p>
          <h1 className="h1">나이스 원본</h1>
          <Help>
            <p className="sub">
              나이스에 <b>학교가 올려둔 그대로</b>를 봅니다. 다른 화면은 앱이 정리한 뒤의
              모습이라, 뭔가 없을 때 <b>학교가 안 올린 건지 앱이 못 알아본 건지</b> 알 수가
              없었습니다. 여기서는 받은 줄을 하나도 안 버리고 보여주고,
              옆에 <b>앱이 그 줄을 어떻게 봤는지</b>를 적습니다.
            </p>
          </Help>
        </div>

        <NeisPeek
          from={year.from}
          to={year.to}
          schools={(schools || []).filter((s) => s.active !== false && s.schul_code)}
        />
      </main>
    </>
  );
}

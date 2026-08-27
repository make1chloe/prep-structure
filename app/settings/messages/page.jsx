import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Help from "@/components/Help";
import MessageList from "./MessageList";
import ChannelPlan from "./ChannelPlan";
import NotesForm from "../notes/NotesForm";
import { listMessages } from "./actions";
import { listNotes } from "../noteActions";
import { loadSettings } from "@/lib/settings";
import { channelPlan } from "@/lib/alimtalk";
import { isTeacher } from "@/lib/roles";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

/**
 * **미리 적어두는 말은 한 자리에** (원장님, 2026-08-07 — 「같은 종류로
 * 묶여서 관리되어야 할 항목이 흩어져있는게 없는지 전체 하나하나 확인하고
 * 개선해」).
 *
 * 「문자 문구」 와 「안내 문구」 가 설정 메뉴에 나란히 두 칸을 차지하고 있었다.
 * 이름이 비슷해서 어느 쪽이 어느 쪽인지 매번 헷갈리고, 실제로 하는 일은
 * 하나다 — **미리 말을 적어두고, 때가 되면 그 말이 나간다.**
 *
 * 다른 것은 **어디로 나가느냐** 뿐이다.
 *   나가는 문자   보내기를 누를 때 문자로 (한 사람에게)
 *   화면 안내     그 화면을 여는 모든 아이·어머니에게 (늘)
 *
 * 그래서 한 화면에 두 칸으로 둔다.
 */
export default async function MessagesPage(props) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const user = await sessionUser(supabase);

  let profile = null;
  if (user) {
    const { data } = await cachedProfile(supabase, user.id);
    profile = data;
  }

  const tab = searchParams?.t === "screen" ? "screen" : "send";
  // 화면 안내는 아이·어머니 모두에게 한 번에 보이는 글이라 원장·강사만 (0093)
  const canScreen = isTeacher(profile?.role);

  // 서로 안 물어보는 것은 나란히 (성능수리 4차 — 3단 → 1단).
  // 화면 안내는 그 탭일 때만 여전히 안 부른다
  const [{ rows, hidden, level, error }, settings, notes] = await Promise.all([
    listMessages(),
    loadSettings(supabase),
    tab === "screen" && canScreen ? listNotes() : null,
  ]);

  return (
    <>
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">설정</p>
          <h1 className="h1">문구</h1>
          <Help>
            <p className="sub">
              미리 적어두는 말입니다. <b>나가는 문자</b>는 보내기를 누를 때 한 사람에게 가고,
              <b> 화면 안내</b>는 그 화면을 여는 모든 아이·어머니에게 늘 보입니다.
            </p>
          </Help>
        </div>

        <div className="row" style={{ gap: 4, marginBottom: 10 }}>
          <Link
            className={`btn btn-sm ${tab === "send" ? "btn-on" : "btn-ghost"}`}
            href="/settings/messages"
          >
            나가는 문자
          </Link>
          {canScreen && (
            <Link
              className={`btn btn-sm ${tab === "screen" ? "btn-on" : "btn-ghost"}`}
              href="/settings/messages?t=screen"
            >
              화면 안내
            </Link>
          )}
        </div>

        {tab === "send" ? (
          <>
            {/* 보내기 전에 **무엇이 어디로 나갈지** 알아야 한다 */}
            {/* **한 번 읽으면 되는 글이다** (원장님, 2026-08-07 —
                「문구설정이 너무 복잡해서 뭘 어떻게 설정하고 고치는지
                 모르겠어」). 규칙은 이제 문구마다 뱃지로 붙는다 —
                「앱으로」 · 「문자로」 · 「알림톡으로」 */}
            <Help>
              <ChannelPlan
                plan={channelPlan(rows, settings.solapi?.pfId || "")}
                pfId={settings.solapi?.pfId || ""}
              />
            </Help>
            <MessageList
              rows={rows}
              hidden={hidden || []}
              level={level}
              error={error}
              pfId={settings.solapi?.pfId || ""}
            />
          </>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 12 }}>
              <p className="hint" style={{ margin: 0, lineHeight: 1.8 }}>
                여기 적은 글은 <b>그 화면을 여는 모든 아이·어머니에게 똑같이</b> 보입니다.
                한 사람에게만 할 말은 <b>재원생 정보 → 일정</b> 이나 <b>발송 → 안내</b> 를 쓰세요.
                {" · "}
                <Link className="sky" href="/me">학생 화면 보기</Link>
                {" · "}
                <Link className="sky" href="/parent">학부모 화면 보기</Link>
              </p>
            </div>
            <NotesForm notes={notes?.notes} unavailable={notes?.error} />
          </>
        )}
      </main>
    </>
  );
}

import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import MessageList from "./MessageList";
import ChannelPlan from "./ChannelPlan";
import { listMessages } from "./actions";
import { loadSettings } from "@/lib/settings";
import { channelPlan } from "@/lib/alimtalk";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const { rows, level, error } = await listMessages();
  const settings = await loadSettings(supabase);

  return (
    <>
      <TopBar profile={profile} active="messages" />
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">설정</p>
          <h1 className="h1">문자 문구</h1>
          <p className="sub">
            나가는 문자마다 문구를 따로 정합니다. 여기서 추가하고 고치고 지우면 됩니다.
          </p>
        </div>
        {/* 보내기 전에 **무엇이 어디로 나갈지** 알아야 한다 */}
        <ChannelPlan plan={channelPlan(rows, settings.solapi?.pfId || "")} pfId={settings.solapi?.pfId || ""} />

        <MessageList
          rows={rows}
          level={level}
          error={error}
          pfId={settings.solapi?.pfId || ""}
        />
      </main>
    </>
  );
}

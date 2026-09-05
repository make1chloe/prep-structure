import { guard } from "@/lib/session";
import Skins from "../_shell/skins.js";
export const dynamic = "force-dynamic";
export default async function Settings() {
  await guard();
  return <main className="frame" style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}><div className="card"><div className="ctitle"><span className="cemo">🎨</span>배색</div><p className="note">이 폰(브라우저)에만 저장됩니다.</p><Skins /></div><div className="card"><div className="ctitle"><span className="cemo">🔐</span>누가 무엇을 보나</div><p className="note">강사·조교·학생·학부모에게 어느 자리를 여는지 — 원장님만 고칩니다.</p><a className="btn sm" href="/settings/access">정하러 가기 →</a></div></main>;
}

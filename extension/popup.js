/** 팝업 — 앱 주소·확장 열쇠를 넣고, 지금 보내고, **마지막에 무슨 일이 있었는지** 본다.
 *  진행·결과·실패는 background 가 저장소에 적는다 — 팝업을 닫았다 열어도 그대로 남아 있다.
 *  열쇠는 화면에서 가려 보이고(●), 어디에도 다시 싣지 않는다. */
const $ = (id) => document.getElementById(id);
const DEFAULTS = { appUrl: "https://chloe-english.vercel.app", token: "", lastRun: null, lastError: null, lastResult: null, busy: false, progress: null };

const md = (iso) => { if (!iso) return "—"; const d = new Date(new Date(iso).getTime() + 9 * 3600000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };

function draw(c) {
  $("run").disabled = $("save").disabled = Boolean(c.busy);
  if (c.busy) { $("state").innerHTML = `<b>보내는 중…</b> ${c.progress ?? ""}`; return; }
  const r = c.lastResult;
  const bits = [`<b>마지막</b> ${md(c.lastRun)}`];
  if (c.lastError) bits.push(`<span class="bad">멈췄습니다 — ${c.lastError}</span>`);
  else if (r) {
    bits.push(`<span class="ok">보냈습니다</span> — 아이 ${r.students}명 · 읽은 줄 ${r.got} · 적힌 줄 ${r.saved}`);
    if (r.unlinked?.length) bits.push(`앱에 <b>안 이은 아이디 ${r.unlinked.length}</b> — 학생 화면에서 이어 주세요<ul>${r.unlinked.slice(0, 8).map((u) => `<li>${u}</li>`).join("")}</ul>`);
    if (r.dropped?.length) bits.push(`못 읽은 줄 ${r.dropped.length}`);
  } else bits.push("아직 보낸 적이 없습니다.");
  $("state").innerHTML = bits.join("<br>");
}

async function load() { const c = await chrome.storage.local.get(DEFAULTS); $("appUrl").value = c.appUrl; $("token").value = c.token; draw(c); }

$("save").onclick = async () => {
  const appUrl = $("appUrl").value.trim(), token = $("token").value.trim();
  if (!/^https?:\/\/.+/.test(appUrl)) { $("msg").textContent = "앱 주소가 http(s) 로 시작해야 합니다"; return; }
  if (token.length < 16) { $("msg").textContent = "확장 열쇠가 너무 짧습니다 — 앱 설정에서 그대로 옮겨 주세요"; return; }
  await chrome.storage.local.set({ appUrl, token });
  $("msg").textContent = "저장했습니다";
};
$("run").onclick = () => { $("msg").textContent = ""; chrome.runtime.sendMessage("run-now"); };
chrome.storage.onChanged.addListener(() => load());
load();

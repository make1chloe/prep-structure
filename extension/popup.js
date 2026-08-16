const $ = (id) => document.getElementById(id);

async function refresh() {
  const c = await chrome.storage.local.get({
    appUrl: "https://chloe-english.vercel.app",
    key: "",
    lastRun: null,
    lastError: null,
  });
  $("appUrl").value = c.appUrl;
  $("key").value = c.key;
  const st = $("status");
  if (c.lastError) {
    st.innerHTML = `<div class="err">마지막 시도 실패:\n${c.lastError}</div>`;
  } else if (c.lastRun) {
    st.innerHTML = `<div class="ok">마지막으로 보낸 시각: ${new Date(c.lastRun).toLocaleString("ko-KR")}</div>`;
  } else {
    st.textContent = "아직 보낸 적이 없어요. 열쇠를 넣고 「지금 읽어서 보내기」 를 눌러보세요.";
  }
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    appUrl: $("appUrl").value.trim().replace(/\/$/, ""),
    key: $("key").value.trim(),
  });
  $("status").textContent = "저장했어요.";
});

function showBt(res) {
  $("status").innerHTML =
    `<div class="ok">백테스트 (${res.from}~${res.to})<br>` +
    `대조 ${res.compared}건 · <b>일치 ${res.agree}건 (${res.pct}%)</b><br>` +
    `자동이 후함 ${res.generous} (수업 뒤 마저 한 것 포함) · 자동이 박함 ${res.strict}` +
    (res.diag
      ? `<br><span style="color:#888">명단 ${res.diag.roster} · 이어짐 ${res.diag.linked} · 클카일자료 ${res.diag.ccDays} · 리포트 ${res.diag.reports} · 실제검사 ${res.diag.checks}</span>`
      : "") +
    `</div>`;
}

// 결과는 저장소에서 읽는다 — 팝업을 닫았다 열어도 남아 있다
let btTick = null;
function watchBt() {
  if (btTick) clearInterval(btTick);
  btTick = setInterval(async () => {
    const { btProgress, btResult, btError } = await chrome.storage.local.get([
      "btProgress", "btResult", "btError",
    ]);
    if (btProgress) { $("status").textContent = `백테스트 ${btProgress}`; return; }
    clearInterval(btTick); btTick = null;
    $("backtest").disabled = false;
    if (btError) $("status").innerHTML = `<div class="err">백테스트 실패:\n${btError}</div>`;
    else if (btResult) showBt(btResult);
  }, 1200);
}

$("backtest").addEventListener("click", () => {
  $("backtest").disabled = true;
  $("status").textContent = "백테스트 시작 — 창을 닫아도 계속 돕니다";
  chrome.runtime.sendMessage("backtest", () => {});
  watchBt();
});

$("run").addEventListener("click", () => {
  $("run").disabled = true;
  $("status").textContent = "읽는 중… (학생 수만큼 몇 초 걸려요)";
  chrome.runtime.sendMessage("run-now", (res) => {
    $("run").disabled = false;
    if (res?.ok) {
      $("status").innerHTML =
        `<div class="ok">보냈어요 — 명단 ${res.roster}명 · 오늘 ${res.days}명분 · 달력 ${res.planner}건</div>`;
    } else {
      $("status").innerHTML = `<div class="err">실패:\n${res?.error || "알 수 없는 오류"}</div>`;
    }
    setTimeout(refresh, 1500);
  });
});

refresh();
(async () => {
  const { btProgress, btResult, btError } = await chrome.storage.local.get([
    "btProgress", "btResult", "btError",
  ]);
  if (btProgress) { $("backtest").disabled = true; watchBt(); }
  else if (btError) $("status").innerHTML = `<div class="err">백테스트 실패:\n${btError}</div>`;
  else if (btResult) showBt(btResult);
})();

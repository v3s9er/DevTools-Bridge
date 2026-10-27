const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const statusText = document.getElementById("status");

function status(message, error = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", error);
}

async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: "STATUS" });
  stopButton.disabled = !response?.status?.connected;
  status(response?.status?.connected ?
    `탭 ${response.status.tabId}에 연결됨` : "연결되지 않음");
}

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  status("연결 중…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("활성 탭을 찾지 못했습니다.");
    const response = await chrome.runtime.sendMessage({ type: "START", tabId: tab.id });
    if (!response?.ok) throw new Error(response?.error ?? "연결 실패");
    await chrome.tabs.create({ url: response.url });
    status("로컬 DevTools UI를 열었습니다.");
    stopButton.disabled = false;
  } catch (error) {
    status(String(error.message ?? error), true);
  } finally {
    startButton.disabled = false;
  }
});

stopButton.addEventListener("click", async () => {
  stopButton.disabled = true;
  const response = await chrome.runtime.sendMessage({ type: "STOP" });
  status(response?.ok ? "연결을 종료했습니다." : (response?.error ?? "종료 실패"), !response?.ok);
});

void refresh().catch(error => status(String(error.message ?? error), true));

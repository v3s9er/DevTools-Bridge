const BRIDGE_URL = "ws://127.0.0.1:18765/bridge/extension/";
const UI_URL = "http://127.0.0.1:18765/app/devtools_app.html";
let session = null;

function send(socket, value) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(value));
  }
}

function sessionStatus() {
  return session ? { connected: true, tabId: session.tabId } : { connected: false };
}

async function stopSession() {
  const current = session;
  if (!current) return;
  session = null;
  clearInterval(current.keepalive);
  if (current.socket.readyState === WebSocket.OPEN) {
    current.socket.close(1000, "Stopped");
  }
  try {
    await chrome.debugger.detach({ tabId: current.tabId });
  } catch {
    // Closing the target tab or opening another debugger also detaches us.
  }
}

function connectSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("로컬 서버 연결 시간이 초과됐습니다."));
    }, 5000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("로컬 서버에 연결할 수 없습니다. start_server.cmd를 먼저 실행하세요."));
    }, { once: true });
  });
}

async function startSession(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new Error("유효한 탭을 선택하지 못했습니다.");
  }
  const tab = await chrome.tabs.get(tabId);
  if (!/^https?:\/\//i.test(tab.url ?? "")) {
    throw new Error("일반 웹 페이지(http/https)에서 실행하세요.");
  }
  await stopSession();

  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), byte =>
    byte.toString(16).padStart(2, "0")).join("");
  let attached = false;
  let socket;
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    attached = true;
    socket = await connectSocket(BRIDGE_URL + token);
    const current = {
      tabId,
      token,
      socket,
      keepalive: setInterval(() => send(socket, { bridge: "ping" }), 20000)
    };
    session = current;
    socket.addEventListener("message", async event => {
      if (session !== current) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.bridge === "frontend_closed") {
        await stopSession();
        return;
      }
      if (!Number.isInteger(message.id) || typeof message.method !== "string") return;
      const target = message.sessionId ? { tabId, sessionId: message.sessionId } : { tabId };
      try {
        const result = await chrome.debugger.sendCommand(target, message.method, message.params ?? {});
        send(socket, { id: message.id, result: result ?? {}, ...(message.sessionId ? { sessionId: message.sessionId } : {}) });
      } catch (error) {
        send(socket, { id: message.id, error: { code: -32000, message: String(error.message ?? error) },
          ...(message.sessionId ? { sessionId: message.sessionId } : {}) });
      }
    });
    socket.addEventListener("close", () => {
      if (session === current) void stopSession();
    });
    return `${UI_URL}?ws=127.0.0.1:18765/bridge/frontend/${token}`;
  } catch (error) {
    if (socket?.readyState === WebSocket.OPEN) socket.close();
    if (attached) {
      try { await chrome.debugger.detach({ tabId }); } catch { /* Already detached. */ }
    }
    throw error;
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (session && source.tabId === session.tabId) {
    send(session.socket, {
      method,
      params: params ?? {},
      ...(source.sessionId ? { sessionId: source.sessionId } : {})
    });
  }
});

chrome.debugger.onDetach.addListener(source => {
  if (session && source.tabId === session.tabId) void stopSession();
});

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (request?.type === "STATUS") {
    respond({ ok: true, status: sessionStatus() });
    return false;
  }
  if (request?.type === "STOP") {
    stopSession().then(() => respond({ ok: true })).catch(error =>
      respond({ ok: false, error: String(error.message ?? error) }));
    return true;
  }
  if (request?.type === "START") {
    startSession(request.tabId).then(url => respond({ ok: true, url })).catch(error =>
      respond({ ok: false, error: String(error.message ?? error) }));
    return true;
  }
  return false;
});

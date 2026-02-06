let sid = null;
let refreshTimer = null;
let isLogin = false;
let latestTasks = [];

/* =========================
   讀取設定
========================= */
function getSettings() {
    return new Promise(resolve => {
        chrome.storage.sync.get(
        {
            host: "",
            account: "",
            password: "",
            refreshInterval: 3000
        },
        resolve
        );
    });
}

/* =========================
   判斷 protocol
========================= */
function getBaseUrl(host) {
    // host 可能是：
    // 192.168.1.2
    // 192.168.1.2:5000
    // nas.local:5001

    let protocol = "http";

    if (host.includes(":")) {
        const port = host.split(":").pop();
        if (port === "5001") protocol = "https";
        if (port === "5000") protocol = "http";
    }

    return `${protocol}://${host}`;
}

/* =========================
   組 API URL
========================= */
function apiUrl(host, path, params = {}) {
    const url = new URL(`${getBaseUrl(host)}${path}`);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
        url.searchParams.append(k, v);
        }
    });
    return url.toString();
}

/* =========================
   登入 DSM
========================= */
async function loginDSM(retryCount = 0) {
    const { host, account, password } = await getSettings();
    if (!host || !account) throw new Error("Host and Account NOT set");

    const url = apiUrl(host, "/webapi/auth.cgi", {
        api: "SYNO.API.Auth",
        version: 6,
        method: "login",
        account,
        passwd: password,
        session: "DownloadStation",
        format: "sid"
    });

    try {
        const res = await fetch(url, { credentials: "include" });
        const data = await res.json();

        if (!data.success) {
            isLogin = false;
            throw new Error(`Login failed: (${data.error?.code})`);
        }
        
        isLogin = true;
        sid = data.data.sid;
        return sid;
    } catch (err) {
        // 如果失敗且重試次數少於 3 次，且是因為網路問題
        if (retryCount < 3 && !navigator.onLine) {
            console.log(`連線失敗，${retryCount + 1} 秒後重試...`);
            await new Promise(r => setTimeout(r, 2000));
            return loginDSM(retryCount + 1);
        }
        throw err;
    }
}

/* =========================
   確保登入
========================= */
async function ensureLogin() {
    // 增加一個簡單的網路連線檢查，避免斷網時無意義的登入嘗試
    if (!navigator.onLine) {
        throw new Error("網路未連線，跳過登入");
    }

    if (!isLogin || !sid) {
        return loginDSM();
    }
    return sid;
}

/* =========================
   更新 badge 任務數量
========================= */
function updateBadge(count) {
    if (count > 0) {
        chrome.action.setBadgeText({ text: String(count) });
        chrome.action.setBadgeBackgroundColor({ color: "#669ee7d1" });
    } else {
        chrome.action.setBadgeText({ text: "" }); // 沒任務就清空
    }
}

/* =========================
   取得任務列表
========================= */
async function getTasks() {
    try {
        const { host } = await getSettings();
        const currentSid = await ensureLogin();

        const url = apiUrl(host, "/webapi/DownloadStation/task.cgi", {
            api: "SYNO.DownloadStation.Task",
            version: 3,
            method: "list",
            additional: "transfer",
            _sid: currentSid
        });

        const res = await fetch(url, { credentials: "include" });
        const data = await res.json();

        if (!data.success) {
            // 如果代碼是 105 (Session 逾期) 或其他登入錯誤
            console.warn("Session 失效，嘗試重登...");
            sid = null;
            isLogin = false;
            // 遞迴嘗試重登一次，但僅限一次避免無限循環
            return loginDSM().then(() => getTasks());
        }
        
        const tasks = data.data.tasks || [];
        updateBadge(tasks.length);
        return tasks;
    } catch (err) {
        // 如果發生 fetch 失敗 (網路斷開)，重置狀態以便下次網路通了能重登
        isLogin = false;
        throw err;
    }
}

/* =========================
   刪除任務
========================= */
async function deleteTask(taskId, deleteFile) {
    const { host } = await getSettings();
    await ensureLogin();

    const url = apiUrl(host, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task",
        version: 1,
        method: "delete",
        id: taskId,
        force_clean: deleteFile,
        _sid: sid
    });
    
    const res = await fetch(url, {
        method: 'GET',
    });

    const data = await res.json();

    if (!data.success) {
        throw new Error(`Delete failed: (${data.error?.code})`);
    }

    return true;
}

/* =========================
   啟動任務
========================= */
async function startTask(taskId) {
    const { host } = await getSettings();
    await ensureLogin();

    const url = apiUrl(host, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task",
        version: 1,
        method: "resume",
        id: taskId,
        _sid: sid
    });
    
    const res = await fetch(url, {
        method: 'GET',
    });

    const data = await res.json();

    if (!data.success) {
        throw new Error(`Resume failed: (${data.error?.code})`);
    }

    return true;
}

/* =========================
   暫停任務
========================= */
async function pauseTask(taskId) {
    const { host } = await getSettings();
    await ensureLogin();

    const url = apiUrl(host, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task",
        version: 1,
        method: "pause",
        id: taskId,
        _sid: sid
    });
    
    const res = await fetch(url, {
        method: 'GET',
    });

    const data = await res.json();

    if (!data.success) {
        throw new Error(`Pause failed: (${data.error?.code})`);
    }

    return true;
}

/* =========================
   新增任務
========================= */
async function createTask(downloadUrl) {
    const { host } = await getSettings();
    await ensureLogin();

    const url = apiUrl(host, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task",
        version: 3,
        method: "create",
        uri: downloadUrl, // 下載網址
        _sid: sid
    });

    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error("API Error Code: " + data.error.code);
    
    refreshTasks(); // 成功後立即刷新清單
    return data;
}

/* =========================
   Message Listener
========================= */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    // ⭐ 喚醒用
    if (msg.action === "ping") {
        // ⭐ 若 timer 死了，順手補啟
        if (!refreshTimer) {
            startTaskRefresh();
        }
        sendResponse({ alive: true });
        return;
    }
    // ⭐ 手動登入（options / popup 可用）
    else if (msg.action === "login") {
        loginDSM()
        .then(() => sendResponse({ success: true }))
        .catch(err =>
            sendResponse({ success: false, error: err.message })
        );
        return true;
    }
    // ⭐ 取得任務
    else if (msg.action === "getLatestTasks") {
        sendResponse({ success: isLogin, tasks: latestTasks });
        return true;
    }
    // ⭐ 開始任務
    else if (msg.action === "startTask") {
        startTask(msg.taskId)
        .then(() => sendResponse({ success: true }))
        .catch(err =>
            sendResponse({ success: false, error: err.message })
        );
        return true;
    }
    // ⭐ 暫停任務
    else if (msg.action === "pauseTask") {
        pauseTask(msg.taskId)
        .then(() => sendResponse({ success: true }))
        .catch(err =>
            sendResponse({ success: false, error: err.message })
        );
        return true;
    }
    // ⭐ 刪除任務
    else if (msg.action === "deleteTask") {
        deleteTask(msg.taskId, msg.deleteFile)
        .then(() => sendResponse({ success: true }))
        .catch(err =>
            sendResponse({ success: false, error: err.message })
        );
        return true;
    }
    // ⭐ 新增任務
    else if (msg.action === "createTask") {
        createTask(msg.url)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // 保持非同步通道開啟
    }
});

async function refreshTasks() {
    try {
        const tasks = await getTasks();
        latestTasks = tasks;

        updateBadge(tasks.length);

        // 通知 popup（如果有開）
        chrome.runtime.sendMessage({
            action: "tasksUpdated",
            success: isLogin,
            tasks: tasks
        }).catch(err => {
            // 這裡報錯是正常的，代表 Popup 當前處於關閉狀態
            // console.log("Popup 沒開，不更新 UI");
        });
    }
    catch (e) {
        console.error("refreshTasks failed", e);
    }
}

async function startTaskRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    const { refreshInterval } = await getSettings();
    
    // 確保有設定值才啟動
    refreshTimer = setInterval(refreshTasks, refreshInterval);
    refreshTasks();
}

chrome.runtime.onStartup.addListener(async () => {
    await startTaskRefresh();
});

chrome.runtime.onInstalled.addListener(async () => {
    await startTaskRefresh();
});

/* =========================
   監聽儲存空間變動
========================= */
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === "sync") {
        console.log("偵測設定修改...");

        // 如果修改了主機、帳號或密碼，強制重登
        if (changes.host || changes.account || changes.password) {
            sid = null; 
            isLogin = false;
            // 立即嘗試執行一次任務刷新，這會觸發 ensureLogin
            await refreshTasks();
        }

        // 如果修改了重新整理頻率，重新啟動 Timer
        if (changes.refreshInterval) {
            console.log("更新頻率:", changes.refreshInterval.newValue);
            if (refreshTimer) {
                clearInterval(refreshTimer);
                refreshTimer = null;
            }
            startTaskRefresh(); // 使用新頻率重新啟動
        }
    }
});

/* =========================
   新增：系統狀態監聽 (處理喚醒)
========================= */
chrome.idle.onStateChanged.addListener(async (newState) => {
    console.log("系統狀態變更:", newState);
    if (newState === "active") {
        console.log("從休眠喚醒，清理狀態並重啟任務...");
        
        // 1. 強制清空連線狀態，確保喚醒後一定會重新執行登入流程
        sid = null;
        isLogin = false;
        
        // 2. 停止舊的 Timer
        if (refreshTimer) clearInterval(refreshTimer);
        
        // 3. 延遲 3 秒執行，確保網路硬體（WiFi）已完全連線
        setTimeout(async () => {
            await startTaskRefresh(); 
        }, 3000);
    }
});

globalThis.addEventListener('online', () => {
    console.log("網路恢復連線，自動刷新任務...");
    refreshTasks();
});
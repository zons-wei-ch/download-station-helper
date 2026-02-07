import * as DSM_API from './dsm_api.js';

const state = {
    sid: null,
    isLogin: false,
    latestTasks: []
};

let refreshTimer = null;

// 更新 Badge
function updateBadge(count) {
    if (count > 0) {
        chrome.action.setBadgeText({ text: String(count) });
        chrome.action.setBadgeBackgroundColor({ color: "#66aadd" });
    } else if (count == 0) {
        chrome.action.setBadgeText({ text: "-" });
        chrome.action.setBadgeBackgroundColor({ color: "#c3c3c3" });
    } else {
        chrome.action.setBadgeText({ text: "!" });
        chrome.action.setBadgeBackgroundColor({ color: "#ff8888" });
    }
}

// 刷新任務邏輯
async function refreshTasks() {
    try {
        const tasks = await DSM_API.getTasks(state);
        state.latestTasks = tasks;
        updateBadge(tasks.length);

        chrome.runtime.sendMessage({
            action: "tasksUpdated",
            success: state.isLogin,
            tasks: tasks
        }).catch(() => { /* Popup 關閉時正常報錯，略過 */ });
    }
    catch (e) {
        console.error("refreshTasks failed", e);
        updateBadge(-1);
        chrome.runtime.sendMessage({
            action: "tasksUpdated",
            success: false,
            error: e.message,
            tasks: []
        }).catch(() => {});
    }
}

// 管理計時器
async function startTaskRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    const { refreshInterval } = await DSM_API.getSettings();
    refreshTimer = setInterval(refreshTasks, refreshInterval);
    refreshTasks();
}

// Message Listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "ping") {
        if (!refreshTimer) startTaskRefresh();
        sendResponse({ alive: true });
    } 
    else if (msg.action === "login") {
        DSM_API.loginDSM(state)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
    }
    else if (msg.action === "getLatestTasks") {
        sendResponse({ success: state.isLogin, tasks: state.latestTasks });
    }
    else if (msg.action === "startTask") {
        DSM_API.setTaskStatus(state, msg.taskId, "resume")
            .then(() => { refreshTasks(); sendResponse({ success: true }); })
            .catch(err => sendResponse({ success: false, error: err.message }));
    }
    else if (msg.action === "pauseTask") {
        DSM_API.setTaskStatus(state, msg.taskId, "pause")
            .then(() => { refreshTasks(); sendResponse({ success: true }); })
            .catch(err => sendResponse({ success: false, error: err.message }));
    }
    else if (msg.action === "deleteTask") {
        DSM_API.deleteTask(state, msg.taskId, msg.deleteFile)
            .then(() => { refreshTasks(); sendResponse({ success: true }); })
            .catch(err => sendResponse({ success: false, error: err.message }));
    }
    else if (msg.action === "createTask") {
        DSM_API.createTask(state, msg.url)
            .then(() => { refreshTasks(); sendResponse({ success: true }); })
            .catch(err => sendResponse({ success: false, error: err.message }));
    }
    return true;
});

/* =========================
   監聽儲存空間變動
========================= */
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === "sync") {
        if (changes.host || changes.account || changes.password) {
            state.sid = null; 
            state.isLogin = false;
            await refreshTasks();
        }
        else if (changes.refreshInterval) {
            startTaskRefresh();
        }
    }
});

/* =========================
   生命週期與事件
========================= */
chrome.runtime.onStartup.addListener(async () => {
    await startTaskRefresh();
});

chrome.runtime.onInstalled.addListener(async () => {
    chrome.alarms.create("refreshTasks", { periodInMinutes: 0.1 });
    await startTaskRefresh();
});

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "refreshTasks") startTaskRefresh();
});

chrome.idle.onStateChanged.addListener(async (newState) => {
    if (newState === "active") {
        // 1. 強制清空連線狀態，確保喚醒後一定會重新執行登入流程
        state.sid = null; 
        state.isLogin = false;
        // 2. 停止舊的 Timer
        if (refreshTimer) clearInterval(refreshTimer);
        // 3. 延遲 3 秒執行，確保網路硬體（WiFi）已完全連線
        setTimeout(async () => {
            await startTaskRefresh(); 
        }, 3000);
    }
});

globalThis.addEventListener('online', refreshTasks);
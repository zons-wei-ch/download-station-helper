import * as DSM_API from './dsm_api.js';

const state = {
    sid: null,
    isLogin: false,
    latestTasks: []
};

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

// 處裡命令
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "ping") {
        sendResponse({ alive: true });
        refreshTasks();
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
            setupAlarm();
        }
    }
});

/* =========================
   生命週期與事件
========================= */
async function setupAlarm() {
    const settings = await DSM_API.getSettings();
    const intervalInMinutes = (settings.refreshInterval / 1000) / 60;
    
    // Chrome Alarm 最小單位是 1 分鐘 (開發模式可較短，但建議至少 1 分鐘以維持穩定)
    // 如果你需要更短的頻率，請參考下方的「心跳」技巧
    chrome.alarms.clearAll();
    chrome.alarms.create("refreshTasks", {
        periodInMinutes: Math.max(intervalInMinutes, 0.015)
    });
}

chrome.runtime.onStartup.addListener(async () => {
    refreshTasks();
    setupAlarm();
});

chrome.runtime.onInstalled.addListener(async () => {
    refreshTasks();
    setupAlarm();
});

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "refreshTasks") refreshTasks();
});

chrome.idle.onStateChanged.addListener(async (newState) => {
    if (newState === "active") {
        refreshTasks();
        setupAlarm();
    }
});

globalThis.addEventListener('online', refreshTasks);
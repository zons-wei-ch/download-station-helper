import * as DSM_API from './dsm_api.js';

let heartbeatInterval = null;

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

// 顯示通知
function createChromeNotification(taskTitle, state) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/download_48.png',
        title: 'DSM Task',
        message: `${state} : ${taskTitle}`,
        priority: 2
    });
}

// 檢查任務狀態通知
function checkTaskNotifications(newTasks, oldTasks, settings) {
    const check = (enabled, status, label) => {
        if (!enabled) return;
        newTasks.forEach(task => {
            const preTask = oldTasks.find(t => t.id === task.id);
            
            if (task.status === status && preTask && preTask.status !== status) {
                createChromeNotification(task.title, label);
            }
        });
    };

    check(settings.enableNotifyForSeeding, 'seeding', 'Seeding');
    check(settings.enableNotifyForFinished, 'finished', 'Finished');
    check(settings.enableNotifyForError, 'error', 'Error');
}

// 刷新任務邏輯
async function refreshTasks() {
    try {
        const tasks = await DSM_API.getTasks(state);
        const settings = await DSM_API.getSettings();
        // 檢查任務狀態是否有變化
        checkTaskNotifications(tasks, state.latestTasks, settings);

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
    switch (msg.action) {
    case "ping":
        sendResponse({ success: true });
        refreshTasks();

        DSM_API.getSettings()
            .then(settings =>{
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                heartbeatInterval = setInterval(() => {
                    refreshTasks();
                }, settings.refreshInterval);
            })
            .catch(
                clearInterval(heartbeatInterval)
            );
        break;
    case "un-ping":
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
        sendResponse({ success: true });
        break;
    case "login":
        DSM_API.loginPure(msg.data)
            .then(result => { sendResponse(result.success ? { success: true } : { success: false, error: result.error }); })
            .catch(err => sendResponse({ success: false, error: err.message }));
        break;
    case "latestTasks":
        if (state.isLogin)
            sendResponse({ success: state.isLogin, tasks: state.latestTasks });
        else
            DSM_API.getTasks(state)
                .then(tasks => {
                    state.latestTasks = tasks;
                    sendResponse({ success: true, tasks });
                })
                .catch(err => sendResponse({ success: false, error: err.message }));
        break;
    case "nowTasks":
        DSM_API.getTasks(state)
            .then(tasks => {
                state.latestTasks = tasks;
                sendResponse({ success: true, tasks });
            })
            .catch(err => sendResponse({ success: false, error: err.message }));
        break;
    case "startTask":
        DSM_API.setTaskStatus(state, msg.taskId, "resume")
            .then(() => { refreshTasks(); sendResponse({ success: true }); })
            .catch(err => sendResponse({ success: false, error: err.message }));
        break;
    case "pauseTask":
        DSM_API.setTaskStatus(state, msg.taskId, "pause")
            .then(() => { refreshTasks(); sendResponse({ success: true }); })
            .catch(err => sendResponse({ success: false, error: err.message }));
        break;
    case "deleteTask":
        DSM_API.deleteTask(state, msg.taskId, msg.deleteFile)
            .then(() => { refreshTasks(); sendResponse({ success: true }); })
            .catch(err => sendResponse({ success: false, error: err.message }));
        break;
    case "createTask":
        DSM_API.createTask(state, msg.url)
            .then(() => { refreshTasks(); sendResponse({ success: true }); })
            .catch(err => sendResponse({ success: false, error: err.message }));
        break;
    }
    return true;
});

/* =========================
   監聽點擊事件
========================= */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "sendToDownloadStation") {
        const downloadUrl = info.linkUrl;
        
        // 1. 通知 content.js 顯示 Loading (透過傳送訊息)
        chrome.tabs.sendMessage(tab.id, { 
            action: "showUI", 
            type: 'loading', 
            title: 'Adding download task...' 
        }).catch(() => {/* 頁面未載入 content.js 時忽略 */});

        try {
            // 2. 執行加入任務
            await DSM_API.createTask(state, downloadUrl);
            
            // 3. 成功：通知 content.js 顯示成功
            chrome.tabs.sendMessage(tab.id, { 
                action: "showUI", 
                type: 'success', 
                title: 'Success', 
                text: 'Task added successfully!',
                timer: 1000
            }).catch(() => {});
            
            refreshTasks();
        } catch (error) {
            // 4. 失敗：通知 content.js 顯示失敗
            chrome.tabs.sendMessage(tab.id, { 
                action: "showUI", 
                type: 'error', 
                title: 'Fail', 
                text: error.message 
            }).catch(() => {});
        }
    }
});

/* =========================
   監聽儲存空間變動
========================= */
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === "sync") {
        if (changes.host || changes.account || changes.password) {
            console.log("Settings changed, resetting session...");
            state.sid = null;       // 徹底清空舊 SID
            state.isLogin = false;  // 重置登入狀態
            
            // 延遲一下再刷新，避免與 options.js 的測試連線衝突
            setTimeout(() => {
                refreshTasks();
            }, 500);
        }
        else if (changes.refreshInterval) {
            setupAlarm();
        }
    }
});

/* =========================
   生命週期與事件
========================= */
function createContextMenu() {
    // 安裝/啟動時建立右鍵選單
    chrome.contextMenus.create({
        id: "sendToDownloadStation",
        title: "Send to Download Station",
        contexts: ["link"] // 只有在連結上按右鍵才出現
    });
}

async function setupAlarm() {
    // const settings = await DSM_API.getSettings();
    // const intervalInMinutes = (settings.refreshInterval / 1000) / 60;
    
    // Chrome Alarm 最小單位是 1 分鐘 (開發模式可較短，但建議至少 1 分鐘以維持穩定)
    // 如果你需要更短的頻率，請參考下方的「心跳」技巧
    chrome.alarms.clearAll();
    chrome.alarms.create("refreshTasks", {
        periodInMinutes: 1
    });
}

chrome.runtime.onStartup.addListener(async () => {
    refreshTasks();
    setupAlarm();
    createContextMenu();
});

chrome.runtime.onInstalled.addListener(async () => {
    refreshTasks();
    setupAlarm();
    createContextMenu();
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

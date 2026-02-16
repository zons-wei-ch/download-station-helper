import * as UTIL from'./util.js';

const statusEl = document.getElementById("status");
const stateEl = document.getElementById("state");
const downloadEl = document.getElementById("download_speed");
const uploadEl = document.getElementById("upload_speed");
const taskListEl = document.getElementById("taskList");
const containerCache = {};

document.addEventListener("DOMContentLoaded", () => {
    // 開啟 options.html
    const openOptionsBtn = document.getElementById("openOptions");
    if (openOptionsBtn) {
        openOptionsBtn.addEventListener("click", () => {
            chrome.runtime.openOptionsPage();
        });
    }
    // 清理已完成任務
    const purgeBtn = document.getElementById("purgeFinished");
    if (purgeBtn) {
        purgeBtn.addEventListener("click", () => {
            // 先取得目前的任務列表（從畫面或快取）
            chrome.runtime.sendMessage({ action: "getLatestTasks" }, async (res) => {
                if (!res || !res.tasks) return;

                // 過濾出狀態為 finished 的任務
                const finishedTasks = res.tasks.filter(t => t.status === "finished");
                if (finishedTasks.length === 0) {
                    UTIL.showNotify("No tasks to clear", "info");
                    return;
                }

                const confirmed = await UTIL.showConfirm(
                    "Purge Tasks?", 
                    `Remove ${finishedTasks.length} finished tasks?`
                );
                if (confirmed) {
                    finishedTasks.forEach(task => {
                        chrome.runtime.sendMessage({ action: "deleteTask", taskId: task.id });
                    });
                    UTIL.showNotify("Tasks Purged");
                }
            });
        });
    }
    // 新增任務
    const addTaskBtn = document.getElementById("addTask");
    const addTaskContainer = document.getElementById("addTaskContainer");
    const applyTaskBtn = document.getElementById("applyTask");
    const taskUrlInput = document.getElementById("taskUrl");
    // 點擊新增任務
    addTaskBtn.addEventListener("click", () => {
        // 使用 classList 切換，觸發 CSS transition
        addTaskContainer.classList.toggle("show");

        // 如果面板打開了，自動聚焦輸入框
        if (addTaskContainer.classList.contains("show")) {
            setTimeout(() => taskUrlInput.focus(), 200);
        }
    });
    // 點擊 Apply 按鈕送出網址
    applyTaskBtn.addEventListener("click", () => {
        const url = taskUrlInput.value.trim();
        if (!url) {
            // 如果沒填，直接關閉面板
            addTaskContainer.classList.toggle("show");
            return;
        }

        applyTaskBtn.disabled = true;
        // ... 發送訊息邏輯 ...
        chrome.runtime.sendMessage({ action: "createTask", url: url }, (res) => {
            applyTaskBtn.disabled = false;
            if (res?.success) {
                // 成功後務必移除 active 並隱藏
                addTaskContainer.classList.toggle("show");
                taskUrlInput.value = "";
                UTIL.showNotify("Task added !");
            }
            else
                UTIL.showNotify("Failed to add !", "error");
        });
    });

    // 額外加碼：在輸入框按 Enter 直接觸發 Apply
    taskUrlInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            applyTaskBtn.click();
        }
    });
    //
    initPopupWithRetry();
});

// ---------- 渲染任務 ----------
async function renderTasks(tasks) {
    tasks = await UTIL.sortTasks(tasks);
    
    const fragment = document.createDocumentFragment();
    // 建立更新 task element
    tasks.forEach(task => {
        let cache = containerCache[task.id];
        let taskEl;
        if (!cache) {
            taskEl = createTaskEl(task);
            containerCache[task.id] = { container: taskEl, bar: null };
        }
        else {
            taskEl = cache.container;
            updateTaskEl(task, taskEl);
        }
        fragment.appendChild(taskEl);
    });
    // 先暫停 hover transition
    taskListEl.classList.add("no-hover");
    // 取代 task list
    taskListEl.replaceChildren(fragment);
    // 下一個 frame 再恢復
    requestAnimationFrame(() => {
        taskListEl.classList.remove("no-hover");
    });

    // 刪除沒用到的暫存
    const taskIds = tasks.map(t => t.id);
    Object.keys(containerCache).forEach(id => {
        if (!taskIds.includes(id)) {
            delete containerCache[id];
        }
    });
    // 建立更新 progerss bar
    Object.entries(containerCache).forEach(([taskId, cache]) => {
        let task = tasks.find(t => t.id === taskId);
        let container = cache.container;
        let bar = cache.bar;
        
        if (!bar) {
            bar = createBar(task);
            containerCache[task.id] = { container: container, bar: bar };
        }
        else
            updateBar(task, bar);
    });
}

function createTaskEl(task) {
    let li = document.createElement("li");
    li.id = `${task.id}-task`;
    li.className = "task";
    li.setAttribute("data-status", task.status);

    // 標題
    let title = document.createElement("div");
    title.id =  `${task.id}-title`;
    title.className = "task-title";
    title.textContent = task.title || task.name || "No Title";
    // ----
    
    // 狀態 + icon + Ratio
    let metaStatus = document.createElement("div");
    metaStatus.id = `${task.id}-status`;
    let statusText = task.status;
    if (task.status === "error") statusText += ` ／ ${task.status_extra?.error_detail}`;
    metaStatus.textContent = `${statusText}`;

    let metaRatioIcon = document.createElement("img");
    metaRatioIcon.src = "icons/ratio.png";
    metaRatioIcon.style.width = '16px';
    metaRatioIcon.style.height = 'auto';
    metaRatioIcon.style.marginLeft = "10px";
    metaRatioIcon.style.marginRight = "10px";

    let metaRatioValue = document.createElement("div");
    metaRatioValue.id =  `${task.id}-ratio`;
    metaRatioValue.className = "task-ratio";
    let ratio = UTIL.getRatio(task);
    metaRatioValue.textContent = ratio > 0 ? `${ratio}％` : "- ％";

    let metaTop = document.createElement("div");
    metaTop.id =  `${task.id}-meta-top`;
    metaTop.className = "task-meta";
    
    metaTop.appendChild(metaStatus);
    metaTop.appendChild(metaRatioIcon);
    metaTop.appendChild(metaRatioValue);
    // ----

    // 進度條
    // 必須給容器一個高度，否則 SVG 會無法顯示
    let progressContainer = document.createElement("div");
    progressContainer.id = `${task.id}-bar`;
    progressContainer.className = "task-progress";
    // ----
    
    // 容量 / icon / 完成度 / 速度
    let metaSize = document.createElement("div");
    metaSize.id = `${task.id}-size`;
    let size = task.size ?? 0;
    metaSize.textContent = `${UTIL.formatSize(size)}`;

    let metaProgressIcon = document.createElement("img");
    metaProgressIcon.src = "icons/progress.png";
    metaProgressIcon.style.width = '16px';
    metaProgressIcon.style.height = 'auto';
    metaProgressIcon.style.marginLeft = "10px";
    metaProgressIcon.style.marginRight = "10px";

    let metaProgressValue = document.createElement("div");
    metaProgressValue.id = `${task.id}-progress-value`;
    metaProgressValue.textContent = `${UTIL.getProgress(task)}％`;
    
    let metaSpeedIcon = document.createElement("img");
    metaSpeedIcon.src = "icons/speed.png";
    metaSpeedIcon.style.width = '16px';
    metaSpeedIcon.style.height = 'auto';
    metaSpeedIcon.style.marginLeft = "10px";
    metaSpeedIcon.style.marginRight = "10px";

    let metaSpeedValue = document.createElement("div");
    metaSpeedValue.id = `${task.id}-speed-value`;
    let speedDown = task.additional?.transfer?.speed_download ?? 0;
    let speedUp = task.additional?.transfer?.speed_upload ?? 0;
    metaSpeedValue.textContent = `D: ${UTIL.formatSpeed(speedDown)} ／ U: ${UTIL.formatSpeed(speedUp)}`;

    let metaBottom = document.createElement("div");
    metaBottom.id = `${task.id}-meta-bottom`;
    metaBottom.className = "task-meta";
    
    metaBottom.appendChild(metaSize);
    metaBottom.appendChild(metaProgressIcon);
    metaBottom.appendChild(metaProgressValue);
    metaBottom.appendChild(metaSpeedIcon);
    metaBottom.appendChild(metaSpeedValue);
    // ----

    // 動作按鈕容器
    let actions = document.createElement("div");
    actions.className = "task-actions";

    // 開始任務按鈕
    let startBtn = document.createElement("img");
    startBtn.src = "icons/start.png";
    startBtn.alt = "Resume Task";
    startBtn.title = "Resume Task";
    startBtn.className = "task-action-btn btn-start";
    startBtn.style.cursor = "pointer";
    startBtn.style.width = "24px";
    startBtn.style.height = "24px";
    startBtn.style.marginLeft = "10px";
    startBtn.onclick = e => {
        e.stopPropagation();
        chrome.runtime.sendMessage({
            action: "startTask",
            taskId: task.id
        });
    };
    actions.appendChild(startBtn);
    // 暫停任務按鈕
    let pauseBtn = document.createElement("img");
    pauseBtn.src = "icons/pause.png";
    pauseBtn.alt = "Pause Task";
    pauseBtn.title = "Pause Task";
    pauseBtn.className = "task-action-btn btn-pause";
    pauseBtn.style.cursor = "pointer";
    pauseBtn.style.width = "24px";
    pauseBtn.style.height = "24px";
    pauseBtn.style.marginLeft = "10px";
    pauseBtn.onclick = e => {
        e.stopPropagation();
        chrome.runtime.sendMessage({
            action: "pauseTask",
            taskId: task.id
        });
    };
    actions.appendChild(pauseBtn);
    // 刪除任務按鈕
    let delBtn = document.createElement("img");
    delBtn.src = "icons/delete.png";
    delBtn.alt = "Delete Task";
    delBtn.title = "Delete Task";
    delBtn.className = "task-delete-btn";
    delBtn.style.cursor = "pointer";
    delBtn.style.width = "24px";
    delBtn.style.height = "24px";
    delBtn.style.marginLeft = "10px";
    delBtn.onclick = async(e) => {
        let confirmed = await UTIL.showConfirm(
            "Delete Task?",
            `Are you sure to delete: "${task.title}"?`
        );

        if (confirmed) {
            chrome.runtime.sendMessage({ action: "deleteTask", taskId: task.id }, (res) => {
                if (res?.success) {
                    UTIL.showNotify("Deleted");
                    li.remove();
                } else {
                    UTIL.showError("Delete Failed", res?.error);
                }
            });
        }
    };
    actions.appendChild(delBtn);
    // 切換隱藏 / 顯示
    toggleButtons(task.status, startBtn, pauseBtn);

    // 將元素加入 li
    li.appendChild(title);
    li.appendChild(metaTop);
    li.appendChild(progressContainer);
    li.appendChild(metaBottom);
    li.appendChild(actions);

    return li;
}

function updateTaskEl(task, li) {
    li.setAttribute("data-status", task.status);
    // console.log(metaRatioValue);
    // 標題
    let title = li.querySelector(`#${task.id}-title`);
    title.textContent = task.title || task.name || "No Title";
    // ----
    
    // 狀態 + Ratio
    let metaRatioValue = li.querySelector(`#${task.id}-ratio`);
    let ratio = UTIL.getRatio(task);
    metaRatioValue.textContent = ratio > 0 ? `${ratio}％` : "- ％";

    let metaStatus = li.querySelector(`#${task.id}-status`);
    let statusText = task.status;
    if (task.status === "error") statusText += ` ／ ${task.status_extra?.error_detail}`;
    metaStatus.textContent = statusText;
    // ----

    // 容量 / 完成度 / 速度
    let metaSize = li.querySelector(`#${task.id}-size`);
    let size = task.size ?? 0;
    metaSize.textContent = `${UTIL.formatSize(size)}`;

    let metaProgressValue = li.querySelector(`#${task.id}-progress-value`);
    metaProgressValue.textContent = `${UTIL.getProgress(task)}％`;

    let metaSpeedValue = li.querySelector(`#${task.id}-speed-value`);
    let speedDown = task.additional?.transfer?.speed_download ?? 0;
    let speedUp = task.additional?.transfer?.speed_upload ?? 0;
    metaSpeedValue.textContent = `D: ${UTIL.formatSpeed(speedDown)} ／ U: ${UTIL.formatSpeed(speedUp)}`;
    // ----
    // 開始任務按鈕 暫停任務按鈕
    const startBtn = li.querySelector(".btn-start");
    const pauseBtn = li.querySelector(".btn-pause");
    // 切換隱藏 / 顯示
    toggleButtons(task.status, startBtn, pauseBtn);
}

// 專門切換顯示狀態的輔助函式
function toggleButtons(status, startBtn, pauseBtn) {
    if (["downloading", "seeding"].includes(status)) {
        startBtn.classList.add("hidden");    // 隱藏開始
        pauseBtn.classList.remove("hidden"); // 顯示暫停
    } else if (["paused", "waiting", "error", "finished"].includes(status)) {
        startBtn.classList.remove("hidden"); // 顯示開始
        pauseBtn.classList.add("hidden");    // 隱藏暫停
    }
}

function createBar(task) {
    let bar = new ProgressBar.Line(`#${task.id}-bar`, {
        strokeWidth: 4,
        easing: 'easeInOut',
        duration: 800,
        color: getStatusColor(task.status),
        trailColor: '#eee',
        trailWidth: 4,
        svgStyle: { width: '100%', height: '100%', borderRadius: '0px' }
    });

    let rate = ["seeding"].includes(task.status) ? UTIL.getRatio(task) : UTIL.getProgress(task);
    bar.set(rate / 100 > 1 ? 1 : rate / 100);

    return bar;
}

function updateBar(task, bar) {
    let rate = ["seeding"].includes(task.status) ? UTIL.getRatio(task) : UTIL.getProgress(task);
    bar.path.setAttribute('stroke', getStatusColor(task.status));
    bar.animate(rate / 100 > 1 ? 1 : rate / 100);
}

function getStatusColor(status) {
    switch(status) {
        case 'waiting': return '#aaaaaa';
        case 'downloading': return '#1199dd';
        case 'finishing': return '#55ccff';
        case 'finished': return '#55aa66';
        case 'seeding': return '#e7aa44';
        case 'paused': return '#888888';
        case 'error': return '#cc3322';
        default: return '#dddddd';
    }
}

function updateStatus(tasks) {
    const { totalDown, totalUp } = UTIL.calcTotalSpeed(tasks);
    statusEl.textContent = "DSM Online...";
    stateEl.src = 'icons/connected.png';
    downloadEl.textContent = `${UTIL.formatSpeed(totalDown)}`;
    uploadEl.textContent = `${UTIL.formatSpeed(totalUp)}`;
    statusEl.className = "status ok";
}

function wakeBackground(retries = 5) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "ping" }, res => {
            if (res?.alive) {
                resolve(true);
            } else if (retries > 0) {
                setTimeout(() => {
                    wakeBackground(retries - 1).then(resolve).catch(reject);
                }, 1000);
            } else {
                reject(new Error("Background not responding"));
            }
        });
    });
}

async function initPopupWithRetry(retries = 3) {
    statusEl.className = "status error";
    statusEl.textContent = "Waking background...";
    stateEl.src = 'icons/wait.png';

    try {
        await wakeBackground(); // ⭐ 先確保 background 活著
        const res = await chrome.runtime.sendMessage({ action: "getLatestTasks" });

        if (res?.success) {
            updateStatus(res.tasks);
            renderTasks(res.tasks);
        } else {
            statusEl.textContent = "DSM Offline...";
            stateEl.src = 'icons/disconnected.png';
        }
    } catch (e) {
        if (retries > 0) {
            setTimeout(() => initPopupWithRetry(retries - 1), 2000);
        } else {
            statusEl.textContent = "Background not responding";
            stateEl.src = 'icons/disconnected.png';
        }
    }
}

chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === "tasksUpdated") {
        console.log("tasksUpdated: " + String(msg.success));
        if (msg.success) {
            updateStatus(msg.tasks);
            renderTasks(msg.tasks);
        }
    }
});

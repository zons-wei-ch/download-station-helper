import * as UTIL from'./util.js';

const statusEl = document.getElementById("status");
const stateEl = document.getElementById("state");
const downloadEl = document.getElementById("download_speed");
const uploadEl = document.getElementById("upload_speed");
const taskListEl = document.getElementById("taskList");

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
    //console.log(tasks);
    taskListEl.innerHTML = "";

    tasks.forEach(task => {
        const li = document.createElement("li");
        li.className = "task";
        li.setAttribute("data-status", task.status);

        // 標題
        const title = document.createElement("div");
        title.className = "task-title";
        title.textContent = task.title || task.name || "No Title";
        // ----
        
        // 狀態 + icon + Ratio
        const metaRatioIcon = document.createElement("img");
        metaRatioIcon.src = "icons/ratio.png";
        metaRatioIcon.style.width = '16px';
        metaRatioIcon.style.height = 'auto';
        metaRatioIcon.style.marginLeft = "10px";
        metaRatioIcon.style.marginRight = "10px";

        const metaRatioValue = document.createElement("div");
        const downloaded = task.additional?.transfer?.size_downloaded ?? 0;
        const uploaded = task.additional?.transfer?.size_uploaded ?? 0;
        const ratio = downloaded > 0 ? UTIL.roundTo((uploaded / downloaded) * 100, 1): "-";
        metaRatioValue.textContent = `${ratio}％`;

        const metaTop = document.createElement("div");
        metaTop.className = "task-meta";
        let statusText = task.status;
        if (task.status === "error") statusText += ` ／ ${task.status_extra?.error_detail}`;
        metaTop.textContent = `${statusText}`;

        metaTop.appendChild(metaRatioIcon);
        metaTop.appendChild(metaRatioValue);
        // ----

        // 進度條
        const progress = document.createElement("progress");
        const progresRate = UTIL.getProgress(task);
        if (["seeding"].includes(task.status)) 
            progress.value = ratio;
        else
            progress.value = progresRate;
        progress.max = 100;
        progress.className = "task-progress";
        // ----
        
        // 容量 / icon / 完成度 / 速度
        const metaProgressIcon = document.createElement("img");
        metaProgressIcon.src = "icons/progress.png";
        metaProgressIcon.style.width = '16px';
        metaProgressIcon.style.height = 'auto';
        metaProgressIcon.style.marginLeft = "10px";
        metaProgressIcon.style.marginRight = "10px";

        const metaProgressValue = document.createElement("div");
        metaProgressValue.textContent = `${progresRate}％`;
        
        const metaSpeedIcon = document.createElement("img");
        metaSpeedIcon.src = "icons/speed.png";
        metaSpeedIcon.style.width = '16px';
        metaSpeedIcon.style.height = 'auto';
        metaSpeedIcon.style.marginLeft = "10px";
        metaSpeedIcon.style.marginRight = "10px";

        const metaSpeedValue = document.createElement("div");
        const speedDown = task.additional?.transfer?.speed_download ?? 0;
        const speedUp = task.additional?.transfer?.speed_upload ?? 0;
        metaSpeedValue.textContent = `D: ${UTIL.formatSpeed(speedDown)} ／ U: ${UTIL.formatSpeed(speedUp)}`;

        const metaBottom = document.createElement("div");
        metaBottom.className = "task-meta";
        const size = task.size ?? 0;
        metaBottom.textContent = `${UTIL.formatSize(size)}`;
        
        metaBottom.appendChild(metaProgressIcon);
        metaBottom.appendChild(metaProgressValue);
        metaBottom.appendChild(metaSpeedIcon);
        metaBottom.appendChild(metaSpeedValue);
        // ----

        // 動作按鈕容器
        const actions = document.createElement("div");
        actions.className = "task-actions";

        // 開始任務按鈕
        if (["paused", "waiting", "error", "finished"].includes(task.status)) {
            const startBtn = document.createElement("img");
            startBtn.src = "icons/start.png";
            startBtn.alt = "Resume Task";
            startBtn.title = "Resume Task";
            startBtn.className = "task-action-btn";
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
        }
        // 暫停任務按鈕
        if (["downloading", "seeding"].includes(task.status)) {
            const pauseBtn = document.createElement("img");
            pauseBtn.src = "icons/pause.png";
            pauseBtn.alt = "Pause Task";
            pauseBtn.title = "Pause Task";
            pauseBtn.className = "task-action-btn";
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
        }
        // 刪除任務按鈕
        const delBtn = document.createElement("img");
        delBtn.src = "icons/delete.png";
        delBtn.alt = "Delete Task";
        delBtn.title = "Delete Task";
        delBtn.className = "task-delete-btn";
        delBtn.style.cursor = "pointer";
        delBtn.style.width = "24px";
        delBtn.style.height = "24px";
        delBtn.style.marginLeft = "10px";

        delBtn.onclick = async(e) => {
            const confirmed = await UTIL.showConfirm(
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

        // 將元素加入 li
        li.appendChild(title);
        li.appendChild(metaTop);
        li.appendChild(progress);
        li.appendChild(metaBottom);
        li.appendChild(actions);

        taskListEl.appendChild(li);
    });
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
            stateEl.src = 'icons/alert.png';
        }
    } catch (e) {
        if (retries > 0) {
            setTimeout(() => initPopupWithRetry(retries - 1), 2000);
        } else {
            statusEl.textContent = "Background not responding";
            stateEl.src = 'icons/alert.png';
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

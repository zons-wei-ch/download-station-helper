const statusEl = document.getElementById("status");
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
            chrome.runtime.sendMessage({ action: "getLatestTasks" }, (res) => {
                if (!res || !res.tasks) return;

                // 過濾出狀態為 finished 的任務
                const finishedTasks = res.tasks.filter(t => t.status === "finished");

                if (finishedTasks.length === 0) {
                    alert("No finished task.");
                    return;
                }

                if (confirm(`Purge ${finishedTasks.length} finished task？`)) {
                    finishedTasks.forEach(task => {
                        chrome.runtime.sendMessage({
                            action: "deleteTask",
                            taskId: task.id,
                            deleteFile: true // 清理通常只刪除清單，保留檔案
                        });
                    });
                    // 點擊後顯示處理中文字
                    statusEl.textContent = "Purging...";
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
        const isActive = addTaskContainer.classList.toggle("active");
        // 根據 class 來決定顯示與否，最為穩定
        if (isActive) {
            addTaskContainer.style.display = "flex";
            taskUrlInput.focus();
        } else {
            addTaskContainer.style.display = "none";
        }
    });
    // 點擊 Apply 按鈕送出網址
    applyTaskBtn.addEventListener("click", () => {
        const url = taskUrlInput.value.trim();
        if (!url) {
            // 如果沒填，直接關閉面板
            addTaskContainer.classList.remove("active");
            addTaskContainer.style.display = "none";
            return;
        }

        applyTaskBtn.disabled = true;
        // ... 發送訊息邏輯 ...
        chrome.runtime.sendMessage({ action: "createTask", url: url }, (res) => {
            applyTaskBtn.disabled = false;
            if (res?.success) {
                // 成功後務必移除 active 並隱藏
                addTaskContainer.classList.remove("active");
                addTaskContainer.style.display = "none";
                taskUrlInput.value = "";
                statusEl.textContent = "✅ Task added!";
            }
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

// ---------- 格式化函數 ----------
function formatSpeed(bytesPerSec) {
    if (typeof bytesPerSec !== "number" || bytesPerSec <= 0) return "–";
    const kb = bytesPerSec / 1024;
    return kb < 1024 ? `${kb.toFixed(1)} KB/s` : `${(kb / 1024).toFixed(2)} MB/s`;
}

function formatSize(bytes) {
    if (typeof bytes !== "number" || bytes < 0) return "0 B";
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB", "TB"];
    // 計算因數：floor(log(bytes) / log(1024))
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    // 確保索引不會超出 units 範圍
    const unitIndex = Math.min(i, units.length - 1);
    
    // 計算數值並根據單位決定小數點位數
    const size = bytes / Math.pow(1024, unitIndex);
    
    // B 不需要小數點，其餘保留 2 位
    return unitIndex === 0 
        ? `${size} ${units[unitIndex]}` 
        : `${size.toFixed(2)} ${units[unitIndex]}`;
}

// 計算進度
function getProgress(task) {
    if (task.status === "finished" || task.status === "seeding") return 100;
    const downloaded = task.additional?.transfer?.size_downloaded ?? 0;
    const total = task.size ?? 0;
    if (total > 0) return Math.floor((downloaded / total) * 100);
    return 0;
}

// 計算總上下傳速度
function calcTotalSpeed(tasks) {
    let totalDown = 0, totalUp = 0;
    tasks.forEach(task => {
        const transfer = task.additional?.transfer;
        if (transfer) {
        totalDown += transfer.speed_download ?? 0;
        totalUp += transfer.speed_upload ?? 0;
        }
    });
    return { totalDown, totalUp };
}

// ---------- 渲染任務 ----------
function renderTasks(tasks) {
    taskListEl.innerHTML = "";

    tasks.forEach(task => {
        const li = document.createElement("li");
        li.className = "task";
        li.setAttribute("data-status", task.status);

        // 標題
        const title = document.createElement("div");
        title.className = "task-title";
        title.textContent = task.title || task.name || "No Title";

        // 狀態 + Ratio
        const metaTop = document.createElement("div");
        metaTop.className = "task-meta";
        const downloaded = task.additional?.transfer?.size_downloaded ?? 0;
        const uploaded = task.additional?.transfer?.size_uploaded ?? 0;
        const ratio = downloaded > 0 ? (uploaded / downloaded).toFixed(2) : "-";
        metaTop.textContent = `${task.status} ⏺︎ Ratio: ${ratio}`;

        // 進度條
        const progress = document.createElement("progress");
        progress.value = getProgress(task);
        progress.max = 100;
        progress.className = "task-progress";

        // 容量 / 速度
        const metaBottom = document.createElement("div");
        metaBottom.className = "task-meta";
        const size = task.size ?? 0;
        const speedDown = task.additional?.transfer?.speed_download ?? 0;
        const speedUp = task.additional?.transfer?.speed_upload ?? 0;
        metaBottom.textContent = `${formatSize(size)} ⏺︎ ${progress.value}% ⏺︎ Dn: ${formatSpeed(speedDown)} ⏺︎ Up: ${formatSpeed(speedUp)}`;

        /* ===== 動作按鈕容器 ===== */
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
            startBtn.style.width = "20px";
            startBtn.style.height = "20px";
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
            pauseBtn.style.width = "20px";
            pauseBtn.style.height = "20px";
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
        delBtn.style.width = "20px";
        delBtn.style.height = "20px";
        delBtn.style.marginLeft = "10px";

        delBtn.onclick = (e) => {
            if (confirm(`Delete task "${task.title}", confirm ？`)) {
                e.stopPropagation();

                chrome.runtime.sendMessage({
                    action: "deleteTask",
                    taskId: task.id,
                    deleteFile: true
                }, res => {
                    if
                        (res?.success) li.remove();
                    else
                        alert("Delete failed：" + (res?.error || ""));
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
    const { totalDown, totalUp } = calcTotalSpeed(tasks);
    statusEl.textContent = `✅ DSM Connected ⬇️: ${formatSpeed(totalDown)} ⬆️: ${formatSpeed(totalUp)}`;
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
    statusEl.textContent = "Waking background...";

    try {
        await wakeBackground(); // ⭐ 先確保 background 活著

        const res = await chrome.runtime.sendMessage({ action: "getLatestTasks" });

        if (res?.success) {
            updateStatus(res.tasks);
            renderTasks(res.tasks);
        } else {
            statusEl.textContent = "❌ NAS Not Connected";
        }
    } catch (e) {
        if (retries > 0) {
            setTimeout(() => initPopupWithRetry(retries - 1), 2000);
        } else {
            statusEl.textContent = "❌ Background not responding";
        }
    }
}


chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === "tasksUpdated") {
        console.log("tasksUpdated: " + String(msg.success));
        updateStatus(msg.tasks);
        renderTasks(msg.tasks);
    }
});

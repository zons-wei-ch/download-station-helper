const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark').matches;
/**
 * 顯示確認對話框
 * @param {string} title 標題
 * @param {string} text 內容文字
 * @param {string} type 圖示類型 'warning', 'error', 'success', 'info', 'question'
 */
export async function showConfirm(title, text, type = 'question') {
    return Swal.fire({
        title: title,
        text: text,
        icon: type,
        background: isDarkMode ? '#444' : '#ddd',
        color: isDarkMode ? '#ddd' : '#444',
        showCancelButton: true,
        confirmButtonColor: '#2688ff',
        cancelButtonColor: '#aaa',
        confirmButtonText: 'Confirm',
        cancelButtonText: 'Cancel'
    }).then(result => result.isConfirmed);
}

/**
 * 顯示簡單通知 (Toast)
 */
export function showNotify(title, icon = 'success', pos = 'top-end') {
    // 建立一個基礎的 Toast 配置
    let Toast = typeof Swal !== 'undefined' ? Swal.mixin({
        toast: true,
        position: pos,
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true
    }) : null;

    Toast.fire({
        icon: icon,
        background: isDarkMode ? '#444' : '#ddd',
        color: isDarkMode ? '#ddd' : '#444',
        title: title
    });
}

/**
 * 顯示錯誤訊息
 */
export function showError(title, message) {
    Swal.fire({
        icon: 'error',
        background: isDarkMode ? '#444' : '#ddd',
        color: isDarkMode ? '#ddd' : '#444',
        title: title,
        text: message,
        confirmButtonColor: '#2688ff'
    });
}

const sortSettings = () => 
    new Promise(resolve => chrome.storage.sync.get({
        enableSort: false, sortField: "", sortOrder: ""
    }, resolve));

// ---------- 格式化函數 ----------
export async function sortTasks(tasks) {
    // 取得儲存的設定
    const settings = await sortSettings();
    
    if (!settings.enableSort) return tasks;

    let sortedTasks = [...tasks];

    sortedTasks.sort((a, b) => {
        let valA, valB;

        // 根據條件提取值
        switch (settings.sortField) {
            case 'title':
                valA = a.title.toLowerCase();
                valB = b.title.toLowerCase();
                break;
            case 'size':
                valA = a.size || 0;
                valB = b.size || 0;
                break;
            case 'status':
                valA = a.status;
                valB = b.status;
                break;
            case 'time':
            default:
                // 假設 API 有提供 create_time，若無則用 id 判斷
                valA = a.additional?.detail?.create_time || a.id;
                valB = b.additional?.detail?.create_time || b.id;
                break;
        }

        // 比較邏輯
        if (valA < valB) return settings.sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return settings.sortOrder === 'asc' ? 1 : -1;
    });
    
    return sortedTasks;
}

export function formatSpeed(bytesPerSec) {
    if (typeof bytesPerSec !== "number" || bytesPerSec <= 0) return "–";
    const kb = bytesPerSec / 1024;
    return kb < 1024 ? `${kb.toFixed(1)} KB/s` : `${(kb / 1024).toFixed(2)} MB/s`;
}

export function formatSize(bytes) {
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
export function getProgress(task) {
    if (task.status === "finished" || task.status === "seeding") return 100;
    const downloaded = task.additional?.transfer?.size_downloaded ?? 0;
    const total = task.size ?? 0;
    if (total > 0) return roundTo((downloaded / total) * 100, 1);
    return 0;
}

// 計算總上下傳速度
export function calcTotalSpeed(tasks) {
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

// 四捨五入到小數點
export function roundTo(number, decimalPlaces) {
  const factor = 10 ** decimalPlaces;
  return Math.round(number * factor) / factor;
}
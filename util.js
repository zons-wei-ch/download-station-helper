// ---------- 格式化函數 ----------
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
    if (total > 0) return Math.floor((downloaded / total) * 100);
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
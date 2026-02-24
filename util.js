const isDarkMode =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Show confirm modal.
 */
export async function showConfirm(title, text, type = 'question') {
    return Swal.fire({
        title,
        text,
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
 * Show toast notification.
 */
export function showNotify(title, icon = 'success', pos = 'top-end') {
    const toast =
        typeof Swal !== 'undefined'
            ? Swal.mixin({
                toast: true,
                position: pos,
                showConfirmButton: false,
                timer: 1500,
                timerProgressBar: true
            })
            : null;

    if (!toast) return;

    toast.fire({
        icon,
        background: isDarkMode ? '#444' : '#ddd',
        color: isDarkMode ? '#ddd' : '#444',
        title
    });
}

/**
 * Show error modal.
 */
export function showError(title, message) {
    Swal.fire({
        icon: 'error',
        background: isDarkMode ? '#444' : '#ddd',
        color: isDarkMode ? '#ddd' : '#444',
        title,
        text: message,
        confirmButtonColor: '#2688ff'
    });
}

const getSortSettings = () =>
    new Promise(resolve =>
        chrome.storage.sync.get(
            { enableSort: false, sortField: '', sortOrder: '' },
            resolve
        )
    );

export async function sortTasks(tasks) {
    const settings = await getSortSettings();
    if (!settings.enableSort) return tasks;

    const sorted = [...tasks];

    sorted.sort((a, b) => {
        let valA;
        let valB;

        switch (settings.sortField) {
            case 'title':
                valA = (a.title || a.name || '').toLowerCase();
                valB = (b.title || b.name || '').toLowerCase();
                break;
            case 'size':
                valA = a.size || 0;
                valB = b.size || 0;
                break;
            case 'status':
                valA = a.status || '';
                valB = b.status || '';
                break;
            case 'time':
            default:
                valA = a.additional?.detail?.create_time || a.id;
                valB = b.additional?.detail?.create_time || b.id;
                break;
        }

        if (valA < valB) return settings.sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return settings.sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    return sorted;
}

export function formatSpeed(bytesPerSec) {
    if (typeof bytesPerSec !== 'number' || bytesPerSec <= 0) return '-';
    const kb = bytesPerSec / 1024;
    return kb < 1024 ? `${kb.toFixed(1)} KB/s` : `${(kb / 1024).toFixed(2)} MB/s`;
}

export function formatSize(bytes) {
    if (typeof bytes !== 'number' || bytes <= 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const unitIndex = Math.min(i, units.length - 1);
    const size = bytes / Math.pow(1024, unitIndex);

    return unitIndex === 0
        ? `${size} ${units[unitIndex]}`
        : `${size.toFixed(2)} ${units[unitIndex]}`;
}

export function getRatio(task) {
    const downloaded = task.additional?.transfer?.size_downloaded ?? 0;
    const uploaded = task.additional?.transfer?.size_uploaded ?? 0;
    if (downloaded <= 0) return 0;
    return roundTo((uploaded / downloaded) * 100, 1);
}

export function getProgress(task) {
    if (task.status === 'finished' || task.status === 'seeding') return 100;
    const downloaded = task.additional?.transfer?.size_downloaded ?? 0;
    const total = task.size ?? 0;
    if (total <= 0) return 0;
    return roundTo((downloaded / total) * 100, 1);
}

export function calcTotalSpeed(tasks) {
    let totalDown = 0;
    let totalUp = 0;

    tasks.forEach(task => {
        const transfer = task.additional?.transfer;
        if (!transfer) return;
        totalDown += transfer.speed_download ?? 0;
        totalUp += transfer.speed_upload ?? 0;
    });

    return { totalDown, totalUp };
}

export function roundTo(number, decimalPlaces) {
    const factor = 10 ** decimalPlaces;
    return Math.round(number * factor) / factor;
}

export function getTaskTitle(task) {
    return task.title || task.name || 'No Title';
}

export function getTaskStatusText(task) {
    const status = task.status || 'unknown';
    if (status !== 'error') return status;
    const detail = task.status_extra?.error_detail;
    return detail ? `${status}: ${detail}` : status;
}

export function getTaskSpeedText(task) {
    const speedDown = task.additional?.transfer?.speed_download ?? 0;
    const speedUp = task.additional?.transfer?.speed_upload ?? 0;
    return `D: ${formatSpeed(speedDown)} ／ U: ${formatSpeed(speedUp)}`;
}

export function getTaskTimeText(task) {
    let time_text = " ／ ";
    if (task.status === 'downloading') {
        let eat = calculateETA(task);
        time_text += `Estimated Time of Arrival: ${formatDuration(eat)}`;
    }
    else if (task.status === 'seeding') {
        let time = formatDuration(task.additional?.detail?.seedelapsed);
        time_text += `Seed Elapsed: ${time}`;
    }
    else if (task.status === 'finished') {
        let date = formatUnixTime(task.additional?.detail?.completed_time);
        time_text += `Completed Time: ${date}`;
    }
    else
        time_text += "-";
    
    return time_text;
}

export function calculateETA(task) {
    // 1. 優先使用 API 提供的值 (如果有)
    if (task.additional?.transfer?.eta !== undefined) {
        return task.additional.transfer.eta;
    }

    // 2. API 沒提供時，自己動手算
    const speed = task.additional?.transfer?.speed_download || 0;
    const totalSize = task.size || 0;
    const downloaded = task.additional?.transfer?.size_downloaded || 0;

    if (speed > 0 && totalSize > downloaded) {
        const remainingBytes = totalSize - downloaded;
        return Math.floor(remainingBytes / speed); // 回傳秒數
    }

    return -1; // 無法計算
}

export function getTaskDisplayRate(task) {
    return task.status === 'seeding' ? getRatio(task) : getProgress(task);
}

export function getTaskRatioText(task) {
    const ratio = getRatio(task);
    return ratio > 0 ? `${ratio}%` : '-';
}

export function getTaskProgressText(task) {
    return `${getProgress(task)}%`;
}

export function normalizeRate(rate) {
    if (typeof rate !== 'number' || rate <= 0) return 0;
    return Math.min(rate / 100, 1);
}

export function getTaskActionVisibility(status) {
    if (['downloading', 'seeding'].includes(status)) {
        return { showStart: false, showPause: true };
    }

    if (['waiting', 'paused', 'finished', 'error'].includes(status)) {
        return { showStart: true, showPause: false };
    }

    return { showStart: false, showPause: false };
}

export function getStatusColor(status) {
    switch (status) {
        case 'waiting':
            return '#aaaaaa';
        case 'downloading':
            return '#1199dd';
        case 'finishing':
            return '#55ccff';
        case 'finished':
            return '#55aa66';
        case 'seeding':
            return '#e7aa44';
        case 'paused':
            return '#888888';
        case 'error':
            return '#cc3322';
        default:
            return '#dddddd';
    }
}

export function formatUnixTime(timestamp) {
    if (!timestamp || timestamp === 0) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString(undefined, { 
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '-';

    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (d > 0) {
        // 有天數時，顯示：1d 5h 20m (通常省略秒，避免文字過長)
        return `${d}d ${h}h ${m}m`;
    } else if (h > 0) {
        // 有小時時，顯示：5h 20m 30s
        return `${h}h ${m}m ${s}s`;
    } else if (m > 0) {
        // 有分鐘時，顯示：20m 30s
        return `${m}m ${s}s`;
    } else {
        // 僅有秒
        return `${s}s`;
    }
}
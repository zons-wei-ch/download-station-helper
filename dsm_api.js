// 讀取設定
export function getSettings() {
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

// 判斷協定
function getBaseUrl(host) {
    let protocol = "http";
    if (host.includes(":")) {
        const port = host.split(":").pop();
        if (port === "5001") protocol = "https";
        if (port === "5000") protocol = "http";
    }
    return `${protocol}://${host}`;
}

// 組裝 API URL
function apiUrl(host, path, params = {}) {
    const url = new URL(`${getBaseUrl(host)}${path}`);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
            url.searchParams.append(k, v);
        }
    });
    return url.toString();
}

// 登入 DSM (傳入 state 物件以更新全域變數)
export async function loginDSM(state, retryCount = 0) {
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
            state.isLogin = false;
            throw new Error(`Login failed: (${data.error?.code})`);
        }
        
        state.isLogin = true;
        state.sid = data.data.sid;
        return state.sid;
    } catch (err) {
        if (retryCount < 3 && !navigator.onLine) {
            console.log(`連線失敗，${retryCount + 1} 秒後重試...`);
            await new Promise(r => setTimeout(r, 2000));
            return loginDSM(state, retryCount + 1);
        }
        throw err;
    }
}

// 確保登入
async function ensureLogin(state) {
    if (!navigator.onLine) {
        throw new Error("網路未連線，跳過登入");
    }
    if (!state.isLogin || !state.sid) {
        return loginDSM(state);
    }
    return state.sid;
}

// 取得任務列表
export async function getTasks(state) {
    try {
        const { host } = await getSettings();
        const currentSid = await ensureLogin(state);

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
            console.warn("Session 失效，嘗試重登...");
            state.sid = null;
            state.isLogin = false;
            return loginDSM(state).then(() => getTasks(state));
        }
        
        return data.data.tasks || [];
    } catch (err) {
        state.isLogin = false;
        throw err;
    }
}

// 刪除任務
export async function deleteTask(state, taskId, deleteFile) {
    const { host } = await getSettings();
    await ensureLogin(state);

    const url = apiUrl(host, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task",
        version: 1,
        method: "delete",
        id: taskId,
        force_clean: deleteFile,
        _sid: state.sid
    });
    
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(`Delete failed: (${data.error?.code})`);
    return true;
}

// 啟動/暫停任務通用函數 (合併 startTask 與 pauseTask)
export async function setTaskStatus(state, taskId, method) {
    const { host } = await getSettings();
    await ensureLogin(state);

    const url = apiUrl(host, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task",
        version: 1,
        method: method, // "resume" 或 "pause"
        id: taskId,
        _sid: state.sid
    });
    
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(`${method} failed: (${data.error?.code})`);
    return true;
}

// 新增任務
export async function createTask(state, downloadUrl) {
    const { host } = await getSettings();
    await ensureLogin(state);

    const url = apiUrl(host, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task",
        version: 3,
        method: "create",
        uri: downloadUrl,
        _sid: state.sid
    });

    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error("API Error Code: " + data.error.code);
    return data;
}
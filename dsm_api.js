// 基礎設定讀取
export const getSettings = () => 
    new Promise(resolve => chrome.storage.sync.get({
        host: "", account: "", password: "", refreshInterval: 3000
    }, resolve));

// 內部通用請求封裝 (核心精簡點)
async function dsmRequest(state, path, params = {}, method = 'GET') {
    const settings = await getSettings();
    if (!settings.host) throw new Error("NAS Host not set");
    
    // 如果不是登入 API，且目前沒有 sid，就先執行登入
    const isLoginPath = path === "/webapi/auth.cgi";
    if (!isLoginPath && !state.sid) {
        await loginDSM(state);
    }

    // 自動處理協定與 URL
    const protocol = settings.host.split(':').pop() === '5001' ? 'https' : 'http';
    const url = new URL(`${protocol}://${settings.host}${path}`);
    
    // 注入 SID (如果有的話)
    if (state.sid) params._sid = state.sid;
    
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

    const res = await fetch(url.toString(), { credentials: "include", method });
    const data = await res.json();

    if (!data.success) {
        // 處理 Session 失效 (例如錯誤代碼 105)
        if (data.error?.code === 105 && path !== "/webapi/auth.cgi") {
            state.isLogin = false;
            await loginDSM(state); // 自動重登
            return dsmRequest(state, path, params, method); // 重新發送原請求
        }
        throw new Error(data.error?.code || "API Error");
    }
    return data.data || data;
}

// 登入邏輯
export async function loginDSM(state) {
    const { account, password } = await getSettings();
    const result = await dsmRequest(state, "/webapi/auth.cgi", {
        api: "SYNO.API.Auth", version: 6, method: "login",
        account, passwd: password, session: "DownloadStation", format: "sid"
    });
    state.sid = result.sid;
    state.isLogin = true;
    return state.sid;
}

// 任務相關 API (現在變得非常精簡)
export const getTasks = (state) => 
    dsmRequest(state, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task", version: 3, method: "list", additional: "transfer"
    }).then(d => d.tasks || []);

export const setTaskStatus = (state, id, method) => 
    dsmRequest(state, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task", version: 1, method, id
    });

export const deleteTask = (state, id, force_clean) => 
    dsmRequest(state, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task", version: 1, method: "delete", id, force_clean
    });

export const createTask = (state, uri) => 
    dsmRequest(state, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task", version: 3, method: "create", uri
    });
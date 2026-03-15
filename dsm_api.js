let loginPromise = null; // 登入鎖
let lastLoginFailureTime = 0; // 記錄最後一次登入失敗的時間

// 基礎設定讀取
export const getSettings = () => 
    new Promise(resolve => chrome.storage.sync.get({
        host: "",
        account: "",
        password: "",
        refreshInterval: 3000,
        enableNotifyForSeeding: false,
        enableNotifyForFinished: false,
        enableNotifyForError: false
    }, resolve));

// 內部通用請求封裝 (核心精簡點)
async function dsmRequest(state, path, params = {}, method = 'GET') {
    const settings = await getSettings();
    if (!settings.host) throw new Error("NAS Host not set");
    
    if (!state.sid) {
        try {
            await loginDSM(state);
        } catch (loginError) {
            // 登入失敗就直接把錯誤往上拋，不再執行後續的 fetch
            throw new Error(`Pre-request login failed: ${loginError.message}`);
        }
    }

    try {
        // 1. 確保 Host 不包含協定頭 (防止使用者輸入 http://)
        const pureHost = settings.host.replace(/^https?:\/\//, '');
        const protocol = pureHost.split(':').pop() === '5001' ? 'https' : 'http';
        
        // 2. 建立 URL 物件並檢查合法性
        const url = new URL(`${protocol}://${pureHost}${path}`);
        
        if (state.sid) params._sid = state.sid;
        Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

        // 3. 設定超時保護 (Timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超時

        const res = await fetch(url.toString(), { 
            credentials: "include", 
            method,
            signal: controller.signal 
        });
        clearTimeout(timeoutId);

        const data = await res.json();
        
        if (!data.success) {
            const errorCode = data.error?.code;

            // 將 105 (過期) 或某些導致 400 的情況視為需重登
            if (errorCode === 105 || errorCode === 400) {
                state.sid = null;
                state.isLogin = false;
                await loginDSM(state);
                return dsmRequest(state, path, params, method);
            }
            const errorDesc = genErrorDesc(errorCode);
            throw new Error(`API Error. Code: ${errorCode} Desc: ${errorDesc}`);
        }
        return data.data || data;
    } catch (error) {
        // 擷取網路層級錯誤 (如 Failed to fetch)
        if (error.name === 'AbortError') throw new Error("Connection Timeout");
        throw new Error(`Network Error: ${error.message}`);
    }
}

export async function loginDSM(state) {
    if (loginPromise) return loginPromise;

    // 冷卻檢查邏輯保持不變
    const now = Date.now();
    const waitTime = 5000; 
    if (now - lastLoginFailureTime < waitTime) {
        const remaining = Math.ceil((waitTime - (now - lastLoginFailureTime)) / 1000);
        throw new Error(`Login cooling down: ${remaining}s remaining`);
    }

    loginPromise = (async () => {
        try {
            const settings = await getSettings();
            
            // 檢查設定是否完整
            if (!settings.host || !settings.account || !settings.password) {
                throw new Error("NAS configuration is incomplete.");
            }

            // --- 核心改動：改用 loginPure ---
            const result = await loginPure(settings);

            if (result && result.success && result.data?.sid) {
                state.sid = result.data.sid;
                state.isLogin = true;
                lastLoginFailureTime = 0; 
                return state.sid;
            } else {
                // 如果 loginPure 已經有幫我們封裝 error.message 就直接用
                const errorMsg = result.error?.message || "Login failed";
                throw new Error(errorMsg);
            }
        } catch (err) {
            state.sid = null;
            state.isLogin = false;
            lastLoginFailureTime = Date.now(); 
            throw err;
        } finally {
            loginPromise = null;
        }
    })();

    return loginPromise;
}

export async function loginPure(data) {
    const pureHost = data.host.replace(/^https?:\/\//, '');
    const protocol = pureHost.endsWith(':5001') ? 'https' : 'http';
    
    // 使用 URLSearchParams 建構子直接組合參數
    const params = new URLSearchParams({
        api: "SYNO.API.Auth", version: 3, method: "login",
        account: data.account, passwd: data.password,
        session: "DownloadStation", format: "sid"
    });

    const url = `${protocol}://${pureHost}/webapi/auth.cgi?${params}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
        const fetchRes = await fetch(url, { signal: controller.signal, credentials: "include" });
        const res = await fetchRes.json(); // 這裡必須加 await
        if (!res.success) {
            const errorCode = res.error?.code;
            // 將錯誤代碼轉換為人類可讀訊息，補至 res 物件中
            res.error.message = genErrorDesc(errorCode);
        }
        return res;
    } catch (err) {
        throw new Error(err.name === 'AbortError' ? "Timeout" : `Network: ${err.message}`);
    } finally {
        clearTimeout(timer);
    }
}

export function genErrorDesc(code) {
    let errorDesc = `Unknown error - ${code}`;
    
    switch (code) {
        // --- 通用錯誤 (100-107) ---
        case 100: errorDesc = "Unknown error."; break;
        case 101: errorDesc = "Invalid parameters."; break;
        case 102: errorDesc = "API does not exist."; break;
        case 103: errorDesc = "Method does not exist."; break;
        case 104: errorDesc = "Version not supported."; break;
        case 105: errorDesc = "Insufficient privilege."; break;
        case 106: errorDesc = "Session time out."; break;
        case 107: errorDesc = "Session interrupted."; break;

        // --- 登入驗證相關 (400-408) ---
        case 400: errorDesc = "Incorrect account or password."; break;
        case 401: errorDesc = "Guest account disabled."; break;
        case 402: errorDesc = "Account disabled."; break;
        case 403: errorDesc = "Invalid password."; break;
        case 404: errorDesc = "Permission denied."; break;
        case 405: errorDesc = "2-step verification needed."; break;
        case 406: errorDesc = "2-step verification failed."; break;
        case 407: errorDesc = "App portal: permission denied."; break;

        // --- Download Station 任務操作特定錯誤 (400-500+) ---
        // 注意：Download Station 的 400 與 Auth 的 400 定義可能不同，
        // 但在通用封裝中通常依據 API 類別區分
        case 408: errorDesc = "Invalid task ID."; break;
        case 409: errorDesc = "Invalid task action."; break;
        case 410: errorDesc = "No default destination folder."; break;
        
        // --- 下載任務新增錯誤 (常見於 createTask) ---
        case 501: errorDesc = "Max number of tasks reached."; break;
        case 502: errorDesc = "Destination denied."; break;
        case 503: errorDesc = "Destination is not a directory."; break;
        case 504: errorDesc = "Destination does not exist."; break;
        case 505: errorDesc = "Invalid download link."; break;
        case 506: errorDesc = "Invalid File Hosting information."; break;
        case 507: errorDesc = "File already exists."; break;
    }

    return errorDesc;
}

// 任務相關 API (現在變得非常精簡)
export const getTasks = (state) => 
    dsmRequest(state, "/webapi/DownloadStation/task.cgi", {
        api: "SYNO.DownloadStation.Task", version: 3, method: "list", additional: "detail,transfer"
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
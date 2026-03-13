let loginPromise = null; // 登入鎖
let lastLoginFailureTime = 0; // 記錄最後一次登入失敗的時間

// 基礎設定讀取
export const getSettings = () => 
    new Promise(resolve => chrome.storage.sync.get({
        host: "", account: "", password: "", refreshInterval: 3000, enableNotifyForSeeding: false, enableNotifyForFinished: false
    }, resolve));

// 內部通用請求封裝 (核心精簡點)
async function dsmRequest(state, path, params = {}, method = 'GET') {
    const settings = await getSettings();
    if (!settings.host) throw new Error("NAS Host not set");
    
    const isLoginPath = path === "/webapi/auth.cgi";
    if (!isLoginPath && !state.sid) {
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
            // 將 105 (過期) 或某些導致 400 的情況視為需重登
            if ((data.error.code === 105 || data.error.code === 400) && !isLoginPath) {
                state.sid = null;
                state.isLogin = false;
                await loginDSM(state);
                return dsmRequest(state, path, params, method);
            }
            throw new Error(`API Error: ${data.error.code}`);
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

    // 冷卻檢查邏輯
    const now = Date.now();
    const waitTime = 5000; // 5 秒冷卻
    if (now - lastLoginFailureTime < waitTime) {
        const remaining = Math.ceil((waitTime - (now - lastLoginFailureTime)) / 1000);
        throw new Error(`Login cooling down: ${remaining}s remaining`);
    }

    loginPromise = (async () => {
        try {
            const { account, password } = await getSettings();
            
            const result = await dsmRequest(state, "/webapi/auth.cgi", {
                api: "SYNO.API.Auth", version: 3, method: "login",
                account, passwd: password, session: "DownloadStation", format: "sid"
            });

            if (result && result.sid) {
                state.sid = result.sid;
                state.isLogin = true;
                lastLoginFailureTime = 0; // 登入成功，重置失敗時間
                return state.sid;
            } else {
                throw new Error("Login failed: No SID returned");
            }
        } catch (err) {
            state.sid = null;
            state.isLogin = false;
            lastLoginFailureTime = Date.now(); // 紀錄失敗時間點
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
        const res = await fetch(url, { signal: controller.signal, credentials: "include" });
        return await res.json();
    } catch (err) {
        throw new Error(err.name === 'AbortError' ? "Timeout" : `Network: ${err.message}`);
    } finally {
        clearTimeout(timer);
    }
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
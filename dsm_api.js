let loginPromise = null; // 登入鎖

// 基礎設定讀取
export const getSettings = () => 
    new Promise(resolve => chrome.storage.sync.get({
        host: "", account: "", password: "", refreshInterval: 3000
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
            if ((errCode === 105 || errCode === 400) && !isLoginPath) {
                state.sid = null;
                state.isLogin = false;
                await loginDSM(state);
                return dsmRequest(state, path, params, method);
            }
            throw new Error(`API Error: ${errCode}`);
        }
        return data.data || data;
    } catch (error) {
        // 擷取網路層級錯誤 (如 Failed to fetch)
        if (error.name === 'AbortError') throw new Error("Connection Timeout");
        throw new Error(`Network Error: ${error.message}`);
    }
}

// 登入邏輯
export async function loginDSM(state) {
    if (loginPromise) return loginPromise;

    loginPromise = (async () => {
        try {
            const { account, password } = await getSettings();
            if (!account) throw new Error("Account is empty");

            // 這裡呼叫 dsmRequest 會因為 isLoginPath 為 true 而跳過自動登入檢查
            const result = await dsmRequest(state, "/webapi/auth.cgi", {
                api: "SYNO.API.Auth", version: 6, method: "login",
                account, passwd: password, session: "DownloadStation", format: "sid"
            });

            if (result && result.sid) {
                state.sid = result.sid;
                state.isLogin = true;
                return state.sid;
            } else {
                throw new Error("Login failed: No SID returned");
            }
        } catch (err) {
            // 登入失敗，徹底清空狀態
            state.sid = null;
            state.isLogin = false;
            throw err; // 讓 dsmRequest 接收到錯誤
        } finally {
            loginPromise = null;
        }
    })();

    return loginPromise;
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
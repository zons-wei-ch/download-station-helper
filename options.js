

// 取得 DOM 元素
const hostInput = document.getElementById("host");
const accountInput = document.getElementById("account");
const passwordInput = document.getElementById("password");
const refreshSelect = document.getElementById("refreshInterval");
const statusDiv = document.getElementById("status");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("testConnection");
const togglePasswordBtn = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");

// --- 密碼顯示/隱藏功能 ---
togglePasswordBtn.onclick = (e) => {
    e.preventDefault();
    
    // 判斷目前的 type 並切換
    if (passwordInput.getAttribute("type") === "password") {
        passwordInput.setAttribute("type", "text");
        eyeIcon.src = "icons/hide.png";  // 切換為隱藏圖示
    } else {
        passwordInput.setAttribute("type", "password");
        eyeIcon.src = "icons/view.png";  // 切換為顯示圖示
    }
};

// --- 測試登入功能 ---
testBtn.onclick = async () => {
    const host = hostInput.value.trim();
    const account = accountInput.value.trim();
    const password = passwordInput.value;

    if (!host || !account) {
        alert("Please input Host and Account before testing!");
        return;
    }

    statusDiv.textContent = "🔃 Testing...";
    testBtn.disabled = true;

    // 先暫存目前輸入的資訊到 storage，讓 background.js 能讀取到最新的資訊進行測試
    chrome.storage.sync.set({ host, account, password }, () => {
        // 呼叫 background.js 的 login action
        chrome.runtime.sendMessage({ action: "login" }, (response) => {
            testBtn.disabled = false;
            if (response && response.success) {
                statusDiv.textContent = "✅ Login Successful!";
                statusDiv.style.color = "#1e8e3e";
            } else {
                statusDiv.textContent = `❌ Failed: ${response.error || "Unknown error"}`;
                statusDiv.style.color = "#d93025";
            }
        });
    });
};

// 儲存設定
saveBtn.onclick = () => {
    const host = hostInput.value.trim();
    const account = accountInput.value.trim();
    const password = passwordInput.value; // 可以留空
    const refreshInterval = parseInt(refreshSelect.value, 10);

    if (!host || !account) {
        alert("ipput Host and Account !");
        return;
    }

    chrome.storage.sync.set(
        {
        host,
        account,
        password,
        refreshInterval
        },
        () => {
        statusDiv.textContent = "✅ Settings Saved";
        statusDiv.style.color = "#202124";
        }
    );
};

// 初始化顯示
chrome.storage.sync.get(
    {
        host: "",
        account: "",
        password: "",
        refreshInterval: 3000 // 預設 3 秒
    },
    data => {
        hostInput.value = data.host;
        accountInput.value = data.account;
        passwordInput.value = data.password;

        // 檢查選項中是否有存的值
        const allowed = [1000, 3000, 5000, 10000, 15000, 30000, 45000, 60000];
        if (allowed.includes(data.refreshInterval)) {
            refreshSelect.value = data.refreshInterval;
        } else {
            refreshSelect.value = 3000;
        }
    }
);

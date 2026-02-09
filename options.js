import * as UTIL from'./util.js';

// 取得 DOM 元素
const hostInput = document.getElementById("host");
const accountInput = document.getElementById("account");
const passwordInput = document.getElementById("password");
const refreshSelect = document.getElementById("refreshInterval");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("testConnection");
const togglePasswordBtn = document.getElementById("togglePassword");
const eyeIcon = document.getElementById("eyeIcon");
const enableSortCheckbox = document.getElementById("enableSort");
const sortFieldSelect = document.getElementById('sortField');
const sortOrderSelect = document.getElementById('sortOrder');

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
        UTIL.showNotify("Please input Host and Account before testing !", "error", "top");
        return;
    }
    
    testBtn.disabled = true;

    // 先暫存目前輸入的資訊到 storage，讓 background.js 能讀取到最新的資訊進行測試
    chrome.storage.sync.set({ host, account, password }, () => {
        // 呼叫 background.js 的 login action
        chrome.runtime.sendMessage({ action: "login" }, (response) => {
            testBtn.disabled = false;
            if (response && response.success) {
                UTIL.showNotify("Login Successful !", "success", "top");
            } else {
                UTIL.showNotify(`Failed: ${response.error || "Unknown error"}`, "error", "top");
            }
        });
    });
};

// 處理排序選項啟用狀態的函式
function updateSortOptionsState() {
    const isEnabled = enableSortCheckbox.checked;
    sortFieldSelect.disabled = !isEnabled;
    sortOrderSelect.disabled = !isEnabled;
    
    // 選項禁用時，可以稍微改變透明度讓視覺更清楚
    sortFieldSelect.parentElement.style.opacity = isEnabled ? "1" : "0.5";
    sortOrderSelect.parentElement.style.opacity = isEnabled ? "1" : "0.5";
};
enableSortCheckbox.addEventListener("change", updateSortOptionsState);

// 儲存設定
saveBtn.onclick = () => {
    const host = hostInput.value.trim();
    const account = accountInput.value.trim();
    const password = passwordInput.value; // 可以留空
    const refreshInterval = parseInt(refreshSelect.value, 10);
    const enableSort = enableSortCheckbox.checked;
    const sortField = sortFieldSelect.value;
    const sortOrder = sortOrderSelect.value;

    if (!host || !account) {
        UTIL.showNotify("ipput Host and Account !", "error", "top");
        return;
    }

    chrome.storage.sync.set(
        {
            host,
            account,
            password,
            refreshInterval,
            enableSort,
            sortField,
            sortOrder
        },
        () => {
            UTIL.showNotify("Settings Saved !", "success", "top");
        }
    );
};

// 初始化顯示
chrome.storage.sync.get(
    {
        host: "",
        account: "",
        password: "",
        refreshInterval: 3000, // 預設 3 秒
        enableSort: false,
        sortField: "time",
        sortOrder: "desc"
    },
    data => {
        hostInput.value = data.host;
        accountInput.value = data.account;
        passwordInput.value = data.password;

        // 檢查選項中是否有存的值
        const allowed = [1000, 2000, 3000, 4000, 5000, 10000, 15000, 30000, 45000, 60000];
        if (allowed.includes(data.refreshInterval)) {
            refreshSelect.value = data.refreshInterval;
        } else {
            refreshSelect.value = 5000;
        }
        enableSortCheckbox.checked = data.enableSort;
        sortFieldSelect.value = data.sortField;
        sortOrderSelect.value = data.sortOrder;
        updateSortOptionsState();
    }
);


document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    
    if (anchor && anchor.href && anchor.href.startsWith('magnet:')) {
        
        // 檢查擴充功能環境是否失效
        if (!chrome.runtime?.id) {
            console.warn("Extension context invalidated. Please refresh the page.");
            // 選擇性地提示使用者
            // alert("套件已更新，請重新整理網頁後再試。");
            return;
        }
        e.preventDefault(); 
        const magnetUrl = anchor.href;
        
        try {
            chrome.runtime.sendMessage({
                action: "createTask",
                url: magnetUrl
            }, (response) => {
                // 處理響應...
                if (chrome.runtime.lastError) {
                    console.error("SendMessage Error:", chrome.runtime.lastError.message);
                    return;
                }
                if (response && response.success) {
                    alert("✅ Success to Add Download Station Task！");
                } else {
                    alert("❌ Failed to Add Task：" + (response?.error || "Please Check Setting"));
                }
            });
        } catch (error) {
            console.error("Caught context error:", error);
            alert("套件環境已變更，請重新整理此頁面。");
        }
    }
}, true);
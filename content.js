// content.js
document.addEventListener('click', (e) => {
    // 尋找被點擊的 <a> 標籤
    const anchor = e.target.closest('a');
    
    if (anchor && anchor.href && anchor.href.startsWith('magnet:')) {
        e.preventDefault(); // 阻止瀏覽器開啟預設程式（如 BitTorrent）
        
        const magnetUrl = anchor.href;
        
        // 傳送給 background.js 處理
        chrome.runtime.sendMessage({
            action: "createTask",
            url: magnetUrl
        }, (response) => {
            if (response && response.success) {
                alert("✅ Success to Add Download Station Task！");
            } else {
                alert("❌ Failed to Add Task：" + (response?.error || "Please Check Setting"));
            }
        });
    }
}, true); // 使用 Capture 模式確保能優先攔截
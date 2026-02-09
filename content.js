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
        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark').matches;

        try {
            // 使用 SweetAlert2 顯示「處理中
            Swal.fire({
                title: 'Adding download task...',
                didOpen: () => {
                    Swal.showLoading(); // 顯示載入動畫
                },
                allowOutsideClick: false
            });
            
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
                    // alert("✅ Success to Add Download Station Task！");
                    Swal.fire({
                        title: 'Success',
                        text: 'Success to add download task！',
                        icon: 'success',
                        background: isDarkMode ? '#444' : '#ddd',
                        color: isDarkMode ? '#ddd' : '#444',
                        timer: 1000,
                        showConfirmButton: false
                    });
                } else {
                    // alert("❌ Failed to Add Task：" + (response?.error || "Please Check Setting"));
                    Swal.fire({
                        title: 'Fail',
                        text: response?.error || "Please check setting",
                        icon: 'error',
                        background: isDarkMode ? '#444' : '#ddd',
                        color: isDarkMode ? '#ddd' : '#444',
                        confirmButtonText: 'Confirm'
                    });
                }
            });
        } catch (error) {
            console.error("Caught context error:", error);
            // alert("The extension environment has changed; please refresh this page.");
            Swal.fire({
                title: 'Error',
                text: "The extension environment has changed; please refresh this page.",
                icon: 'error',
                background: isDarkMode ? '#444' : '#ddd',
                color: isDarkMode ? '#ddd' : '#444',
                confirmButtonText: 'Confirm'
            });
        }
    }
}, true);
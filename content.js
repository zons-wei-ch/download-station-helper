function showNotify({ type = 'info', title = '', text = '', timer = null, showConfirm = true }) {
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const config = {
        icon: type,
        title: title,
        text: text,
        position: 'center',
        background: isDarkMode ? '#444' : '#ddd',
        color: isDarkMode ? '#ddd' : '#444',
        showConfirmButton: showConfirm,
        confirmButtonText: 'Confirm',
        timer: timer,
        didOpen: (toast) => {
            // 1. 設定整個彈窗的基礎字體粗細
            toast.style.fontSize = '16px';
            toast.style.fontWeight = 500; // 您可以設定 bold, 500, 600 等
            toast.style.width = 'auto';

            // 2. 如果您只想針對「標題」加粗，可以這樣寫：
            const titleElement = toast.querySelector('.swal2-title');
            if (titleElement) {
                titleElement.style.fontWeight = 600; // 僅標題加粗
            }
            
            // 如果是 loading 模式，則執行原有邏輯
            if (type === 'loading') {
                Swal.showLoading();
            }
        }
    };

    if (type === 'loading') {
        delete config.icon;
        config.allowOutsideClick = false;
    }

    return Swal.fire(config);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "showUI") {
        showNotify({
            type: msg.type,
            title: msg.title,
            text: msg.text || '',
            timer: msg.timer || null,
            showConfirm: msg.type !== 'loading' && !msg.timer
        });
    }
});

document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    
    if (anchor && anchor.href && anchor.href.startsWith('magnet:')) {
        
        // 1. 檢查環境
        if (!chrome.runtime?.id) {
            showNotify({ 
                type: 'warning', 
                title: 'Fail', 
                text: 'Extension updated. Please refresh the page.' 
            });
            return;
        }
        e.preventDefault(); 
        const magnetUrl = anchor.href;

        try {
            // 2. 顯示處理中
            showNotify({ title: 'Adding download task...', type: 'loading', showConfirm: false });
            
            chrome.runtime.sendMessage({
                action: "createTask",
                url: magnetUrl
            }, (response) => {
                // 處理響應...
                if (chrome.runtime.lastError) {
                    showNotify({ type: 'error', title: 'Error', text: chrome.runtime.lastError.message });
                    return;
                }
                if (response && response.success) {
                    // 3. 成功通知（1秒後自動關閉）
                    showNotify({ 
                        type: 'success', 
                        title: 'Success', 
                        text: 'Task added successfully!', 
                        timer: 1000, 
                        showConfirm: false 
                    });
                }
                else {
                    // 4. 失敗通知
                    showNotify({ 
                        type: 'error', 
                        title: 'Fail', 
                        text: response?.error || "Please check settings" 
                    });
                }
            });
        }
        catch (error) {
            showNotify({ type: 'error', title: 'Context Error', text: error.message });
        }
    }
}, true);
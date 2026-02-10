function showAlert({ type = 'info', title = '', text = '', timer = null, showConfirm = true }) {
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const config = {
        icon: type,
        title: title,
        text: text,
        background: isDarkMode ? '#444' : '#ddd',
        color: isDarkMode ? '#ddd' : '#444',
        showConfirmButton: showConfirm,
        confirmButtonText: 'Confirm',
        timer: timer
    };

    // 如果是 Loading 模式，特殊處理
    if (type === 'loading') {
        delete config.icon;
        config.allowOutsideClick = false;
        config.didOpen = () => Swal.showLoading();
    }

    return Swal.fire(config);
}

document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    
    if (anchor && anchor.href && anchor.href.startsWith('magnet:')) {
        
        // 1. 檢查環境
        if (!chrome.runtime?.id) {
            showAlert({ 
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
            showAlert({ title: 'Adding download task...', type: 'loading', showConfirm: false });
            
            chrome.runtime.sendMessage({
                action: "createTask",
                url: magnetUrl
            }, (response) => {
                // 處理響應...
                if (chrome.runtime.lastError) {
                    showAlert({ type: 'error', title: 'Error', text: chrome.runtime.lastError.message });
                    return;
                }
                if (response && response.success) {
                    // 3. 成功通知（1秒後自動關閉）
                    showAlert({ 
                        type: 'success', 
                        title: 'Success', 
                        text: 'Task added successfully!', 
                        timer: 1000, 
                        showConfirm: false 
                    });
                }
                else {
                    // 4. 失敗通知
                    showAlert({ 
                        type: 'error', 
                        title: 'Fail', 
                        text: response?.error || "Please check settings" 
                    });
                }
            });
        }
        catch (error) {
            showAlert({ type: 'error', title: 'Context Error', text: error.message });
        }
    }
}, true);
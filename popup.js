import * as UTIL from './util.js';

const $ = window.jQuery;

const $statusEl = $('#status');
const $stateEl = $('#state');
const $downloadEl = $('#download_speed');
const $uploadEl = $('#upload_speed');
const $taskListEl = $('#taskList');

const containerCache = {};

const ICON_18_STYLE = {
    width: '18px',
    height: '18px',
    marginLeft: '6px',
    marginRight: '6px'
};

const ICON_24_STYLE = {
    width: '24px',
    height: '24px',
    marginLeft: '10px',
    cursor: 'pointer'
};

$(document).ready(() => {
    bindOptionsAction();
    bindPurgeAction();
    bindAddTaskActions();
    initPopupWithRetry();
});

$(window).on('unload', () => {
    chrome.runtime.sendMessage({ action: 'un-ping' });
});

function bindOptionsAction() {
    const $openOptionsBtn = $('#openOptions');
    if (!$openOptionsBtn.length) return;
    $openOptionsBtn.on('click', () => chrome.runtime.openOptionsPage());
}

function bindPurgeAction() {
    const $purgeBtn = $('#purgeFinished');
    if (!$purgeBtn.length) return;

    $purgeBtn.on('click', () => {
        chrome.runtime.sendMessage({ action: "nowTasks" }, async res => {
            if (!res?.tasks) return;

            const finishedTasks = res.tasks.filter(task => task.status === 'finished');
            if (finishedTasks.length === 0) {
                UTIL.showNotify('No tasks to clear', 'info');
                return;
            }

            const confirmed = await UTIL.showConfirm(
                'Purge Tasks?',
                `Remove ${finishedTasks.length} finished tasks?`
            );

            if (!confirmed) return;

            finishedTasks.forEach(task => {
                chrome.runtime.sendMessage({ action: 'deleteTask', taskId: task.id });
            });
            UTIL.showNotify('Tasks Purged');
        });
    });
}

function bindAddTaskActions() {
    const $addTaskBtn = $('#addTask');
    const $addTaskContainer = $('#addTaskContainer');
    const $applyTaskBtn = $('#applyTask');
    const $taskUrlInput = $('#taskUrl');

    if (!$addTaskBtn.length || !$addTaskContainer.length || !$applyTaskBtn.length || !$taskUrlInput.length) return;

    $addTaskBtn.on('click', () => {
        $addTaskContainer.toggleClass('show');
        if ($addTaskContainer.hasClass('show')) {
            setTimeout(() => $taskUrlInput.trigger('focus'), 200);
        }
    });

    $applyTaskBtn.on('click', () => {
        const url = $taskUrlInput.val().trim();
        if (!url) {
            $addTaskContainer.toggleClass('show');
            return;
        }

        $applyTaskBtn.prop('disabled', true);
        chrome.runtime.sendMessage({ action: 'createTask', url }, res => {
            $applyTaskBtn.prop('disabled', false);
            if (!res?.success) {
                UTIL.showNotify('Failed to add!', 'error');
                return;
            }

            $addTaskContainer.toggleClass('show');
            $taskUrlInput.val('');
            UTIL.showNotify('Task added!');
        });
    });

    $taskUrlInput.on('keypress', e => {
        if (e.key === 'Enter') $applyTaskBtn.trigger('click');
    });
}

async function renderTasks(tasks) {
    const sortedTasks = await UTIL.sortTasks(tasks);
    const fragment = document.createDocumentFragment();

    sortedTasks.forEach(task => {
        const taskKey = String(task.id);
        let cache = containerCache[taskKey];

        if (!cache) {
            const $container = createTaskEl(task);
            cache = { $container, bar: null };
            containerCache[taskKey] = cache;
        } else {
            updateTaskEl(task, cache.$container);
        }

        fragment.appendChild(cache.$container[0]);
    });

    $taskListEl.addClass('no-hover');
    $taskListEl.empty().append(fragment);
    requestAnimationFrame(() => $taskListEl.removeClass('no-hover'));

    const currentIds = new Set(sortedTasks.map(task => String(task.id)));
    Object.keys(containerCache).forEach(id => {
        if (!currentIds.has(id)) delete containerCache[id];
    });

    Object.entries(containerCache).forEach(([taskId, cache]) => {
        const task = sortedTasks.find(item => String(item.id) === taskId);
        if (!task) return;

        if (!cache.bar) {
            cache.bar = createBar(task);
            return;
        }

        updateBar(task, cache.bar);
    });
}

function createTaskEl(task) {
    const taskId = String(task.id);

    const $li = $('<li>', {
        id: `${taskId}-task`,
        class: 'task'
    }).attr('data-status', task.status);

    const $title = createDiv(`${taskId}-title`, 'task-title', UTIL.getTaskTitle(task));

    const $metaStatusIcon = createIcon('icons/status.png', ICON_18_STYLE);
    const $metaStatus = createDiv(`${taskId}-status`, 'task-meta-text', UTIL.getTaskStatusText(task));
    const $metaProgressIcon = createIcon('icons/progress.png', ICON_18_STYLE);
    const $metaProgressValue = createDiv(
        `${taskId}-progress-value`,
        'task-meta-text',
        UTIL.getTaskProgressText(task)
    );
    const $metaRatioIcon = createIcon('icons/ratio.png', ICON_18_STYLE);
    const $metaRatioValue = createDiv(`${taskId}-ratio`, 'task-meta-text', UTIL.getTaskRatioText(task));

    const $metaTop = createDiv(`${taskId}-meta-top`, 'task-meta');
    $metaTop.append($metaStatusIcon, $metaStatus, $metaProgressIcon, $metaProgressValue, $metaRatioIcon, $metaRatioValue);

    const $progressContainer = createDiv(`${taskId}-bar`, 'task-progress');
    
    const $metaSizeIcon = createIcon('icons/storage.png', ICON_18_STYLE);
    const $metaSize = createDiv(`${taskId}-size`, 'task-meta-text', UTIL.formatSize(task.size ?? 0));
    const $metaSpeedIcon = createIcon('icons/speed.png', ICON_18_STYLE);
    const $metaSpeedValue = createDiv(`${taskId}-speed-value`, 'task-meta-text', UTIL.getTaskSpeedText(task));
    const $metaTimeInfo = createDiv(`${taskId}-time-info`, 'task-meta-text', UTIL.getTaskTimeText(task));

    const $metaBottom = createDiv(`${taskId}-meta-bottom`, 'task-meta');
    $metaBottom.append($metaSizeIcon, $metaSize, $metaSpeedIcon, $metaSpeedValue, $metaTimeInfo);

    const $actions = $('<div>', { class: 'task-actions' });

    const $startBtn = createActionButton('icons/start.png', 'Resume Task', 'task-action-btn btn-start');
    $startBtn.on('click', e => {
        e.stopPropagation();
        $li.attr('data-status', 'unknown');
        $startBtn.addClass('hidden');
        $pauseBtn.addClass('hidden');
        chrome.runtime.sendMessage({ action: 'startTask', taskId: task.id });
    });

    const $pauseBtn = createActionButton('icons/pause.png', 'Pause Task', 'task-action-btn btn-pause');
    $pauseBtn.on('click', e => {
        e.stopPropagation();
        $li.attr('data-status', 'unknown');
        $startBtn.addClass('hidden');
        $pauseBtn.addClass('hidden');
        chrome.runtime.sendMessage({ action: 'pauseTask', taskId: task.id });
    });

    const $delBtn = createActionButton('icons/delete.png', 'Delete Task', 'task-delete-btn');
    $delBtn.on('click', async e => {
        e.stopPropagation();

        const taskTitle = $li.find(`#${taskId}-title`).text() || UTIL.getTaskTitle(task);
        const confirmed = await UTIL.showConfirm(
            'Delete Task?',
            `Are you sure to delete: "${taskTitle}"?`
        );

        if (!confirmed) return;

        chrome.runtime.sendMessage({ action: 'deleteTask', taskId: task.id }, res => {
            if (res?.success) {
                UTIL.showNotify('Deleted');
                $li.remove();
                return;
            }

            UTIL.showError('Delete Failed', res?.error);
        });
    });

    $actions.append($startBtn, $pauseBtn, $delBtn);
    toggleButtons(task.status, $startBtn, $pauseBtn);

    $li.append($title, $metaTop, $progressContainer, $metaBottom, $actions);
    return $li;
}

function updateTaskEl(task, $li) {
    const taskId = String(task.id);

    $li.attr('data-status', task.status);

    $li.find(`#${taskId}-title`).text(UTIL.getTaskTitle(task));

    $li.find(`#${taskId}-ratio`).text(UTIL.getTaskRatioText(task));

    $li.find(`#${taskId}-status`).text(UTIL.getTaskStatusText(task));

    $li.find(`#${taskId}-size`).text(UTIL.formatSize(task.size ?? 0));

    $li.find(`#${taskId}-progress-value`).text(UTIL.getTaskProgressText(task));

    $li.find(`#${taskId}-speed-value`).text(UTIL.getTaskSpeedText(task));

    $li.find(`#${taskId}-time-info`).text(UTIL.getTaskTimeText(task));

    const $startBtn = $li.find('.btn-start');
    const $pauseBtn = $li.find('.btn-pause');
    if ($startBtn.length && $pauseBtn.length) toggleButtons(task.status, $startBtn, $pauseBtn);
}

function toggleButtons(status, $startBtn, $pauseBtn) {
    const { showStart, showPause } = UTIL.getTaskActionVisibility(status);
    $startBtn.toggleClass('hidden', !showStart);
    $pauseBtn.toggleClass('hidden', !showPause);
}

function createBar(task) {
    const bar = new ProgressBar.Line(`#${task.id}-bar`, {
        strokeWidth: 4,
        easing: 'easeInOut',
        duration: 800,
        color: UTIL.getStatusColor(task.status),
        trailColor: '#eee',
        trailWidth: 4,
        svgStyle: { width: '100%', height: '100%', borderRadius: '0px' }
    });

    bar.set(UTIL.normalizeRate(UTIL.getTaskDisplayRate(task)));
    return bar;
}

function updateBar(task, bar) {
    bar.path.setAttribute('stroke', UTIL.getStatusColor(task.status));
    bar.animate(UTIL.normalizeRate(UTIL.getTaskDisplayRate(task)));
}

function updateStatus(tasks) {
    const { totalDown, totalUp } = UTIL.calcTotalSpeed(tasks);

    $statusEl.text('DSM Online...');
    $stateEl.attr('src', 'icons/connected.png');
    $downloadEl.text(UTIL.formatSpeed(totalDown));
    $uploadEl.text(UTIL.formatSpeed(totalUp));
    $statusEl.attr('class', 'status ok');
}

function wakeBackground(retries = 5) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "ping" }, res => {
            if (res?.success) {
                resolve(true);
                return;
            }

            if (retries > 0) {
                setTimeout(() => {
                    wakeBackground(retries - 1).then(resolve).catch(reject);
                }, 1000);
                return;
            }

            reject(new Error('Background not responding'));
        });
    });
}

async function initPopupWithRetry(retries = 3) {
    $statusEl.attr('class', 'status wait');
    $statusEl.text('Waking background...'); //
    $stateEl.attr('src', 'icons/wait.png'); //

    try {
        await wakeBackground(); //
        const res = await chrome.runtime.sendMessage({ action: "latestTasks" }); //

        if (res?.success) {
            updateStatus(res.tasks); //
            renderTasks(res.tasks); //
            return;
        }

        // 如果失敗的原因是登入冷卻中
        if (res?.error && res.error.includes("Please wait")) {
            $statusEl.text(res.error); // 顯示例如 "Please wait 5s..."
            $stateEl.attr('src', 'icons/wait.png');
            // 可以在 1 秒後自動重試，直到冷卻結束
            setTimeout(() => initPopupWithRetry(0), 1200); 
            return;
        }

        $statusEl.attr('class', 'status error');
        $statusEl.text('DSM Offline...'); //
        $stateEl.attr('src', 'icons/disconnected.png'); //
    } catch (error) {
        // 處理 Promise reject 的錯誤
        if (error.message.includes("Please wait")) {
            $statusEl.attr('class', 'status wait');
            $statusEl.text(error.message);
            $stateEl.attr('src', 'icons/wait.png');
            setTimeout(() => initPopupWithRetry(0), 2000);
            return;
        }

        if (retries > 0) {
            setTimeout(() => initPopupWithRetry(retries - 1), 2000); //
            return;
        }
        $statusEl.attr('class', 'status error');
        $statusEl.text('Background not responding'); //
        $stateEl.attr('src', 'icons/disconnected.png'); //
    }
}

chrome.runtime.onMessage.addListener(msg => {
    if (!msg.success) {
        // 顯示錯誤狀態到 statusBar
        $statusEl.attr('class', 'status error');
        $statusEl.text(msg.error ? msg.error : 'Refresh Failed.');
        $stateEl.attr('src', 'icons/disconnected.png');
        return;
    }
    
    switch (msg.action) {
    case "tasksUpdated":
        updateStatus(msg.tasks);
        renderTasks(msg.tasks);
        break;
    }
});

function createDiv(id, className, textContent = '') {
    const $el = $('<div>');
    if (id) $el.attr('id', id);
    if (className) $el.attr('class', className);
    if (textContent !== undefined) $el.text(textContent);
    return $el;
}

function createIcon(src, style) {
    return $('<img>', { src }).css(style);
}

function createActionButton(src, title, className) {
    return $('<img>', {
        src,
        alt: title,
        title,
        class: className
    }).css(ICON_24_STYLE);
}

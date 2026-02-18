import * as UTIL from './util.js';

const statusEl = document.getElementById('status');
const stateEl = document.getElementById('state');
const downloadEl = document.getElementById('download_speed');
const uploadEl = document.getElementById('upload_speed');
const taskListEl = document.getElementById('taskList');

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

document.addEventListener('DOMContentLoaded', () => {
    bindOptionsAction();
    bindPurgeAction();
    bindAddTaskActions();
    initPopupWithRetry();
});

function bindOptionsAction() {
    const openOptionsBtn = document.getElementById('openOptions');
    if (!openOptionsBtn) return;
    openOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function bindPurgeAction() {
    const purgeBtn = document.getElementById('purgeFinished');
    if (!purgeBtn) return;

    purgeBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'getLatestTasks' }, async res => {
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
    const addTaskBtn = document.getElementById('addTask');
    const addTaskContainer = document.getElementById('addTaskContainer');
    const applyTaskBtn = document.getElementById('applyTask');
    const taskUrlInput = document.getElementById('taskUrl');

    if (!addTaskBtn || !addTaskContainer || !applyTaskBtn || !taskUrlInput) return;

    addTaskBtn.addEventListener('click', () => {
        addTaskContainer.classList.toggle('show');
        if (addTaskContainer.classList.contains('show')) {
            setTimeout(() => taskUrlInput.focus(), 200);
        }
    });

    applyTaskBtn.addEventListener('click', () => {
        const url = taskUrlInput.value.trim();
        if (!url) {
            addTaskContainer.classList.toggle('show');
            return;
        }

        applyTaskBtn.disabled = true;
        chrome.runtime.sendMessage({ action: 'createTask', url }, res => {
            applyTaskBtn.disabled = false;
            if (!res?.success) {
                UTIL.showNotify('Failed to add!', 'error');
                return;
            }

            addTaskContainer.classList.toggle('show');
            taskUrlInput.value = '';
            UTIL.showNotify('Task added!');
        });
    });

    taskUrlInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') applyTaskBtn.click();
    });
}

async function renderTasks(tasks) {
    const sortedTasks = await UTIL.sortTasks(tasks);
    const fragment = document.createDocumentFragment();

    sortedTasks.forEach(task => {
        const taskKey = String(task.id);
        let cache = containerCache[taskKey];

        if (!cache) {
            const container = createTaskEl(task);
            cache = { container, bar: null };
            containerCache[taskKey] = cache;
        } else {
            updateTaskEl(task, cache.container);
        }

        fragment.appendChild(cache.container);
    });

    taskListEl.classList.add('no-hover');
    taskListEl.replaceChildren(fragment);
    requestAnimationFrame(() => taskListEl.classList.remove('no-hover'));

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

    const li = document.createElement('li');
    li.id = `${taskId}-task`;
    li.className = 'task';
    li.setAttribute('data-status', task.status);

    const title = createDiv(`${taskId}-title`, 'task-title', UTIL.getTaskTitle(task));

    const metaStatusIcon = createIcon('icons/status.png', ICON_18_STYLE);
    const metaStatus = createDiv(`${taskId}-status`, 'task-meta-text', UTIL.getTaskStatusText(task));
    const metaProgressIcon = createIcon('icons/progress.png', ICON_18_STYLE);
    const metaProgressValue = createDiv(
        `${taskId}-progress-value`,
        'task-meta-text',
        UTIL.getTaskProgressText(task)
    );
    const metaRatioIcon = createIcon('icons/ratio.png', ICON_18_STYLE);
    const metaRatioValue = createDiv(`${taskId}-ratio`, 'task-meta-text', UTIL.getTaskRatioText(task));

    const metaTop = createDiv(`${taskId}-meta-top`, 'task-meta');
    metaTop.append(metaStatusIcon, metaStatus, metaProgressIcon, metaProgressValue, metaRatioIcon, metaRatioValue);

    const progressContainer = createDiv(`${taskId}-bar`, 'task-progress');
    
    const metaSizeIcon = createIcon('icons/storage.png', ICON_18_STYLE);
    const metaSize = createDiv(`${taskId}-size`, 'task-meta-text', UTIL.formatSize(task.size ?? 0));
    const metaSpeedIcon = createIcon('icons/speed.png', ICON_18_STYLE);
    const metaSpeedValue = createDiv(`${taskId}-speed-value`, 'task-meta-text', UTIL.getTaskSpeedText(task));

    const metaBottom = createDiv(`${taskId}-meta-bottom`, 'task-meta');
    metaBottom.append(metaSizeIcon, metaSize, metaSpeedIcon, metaSpeedValue);

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const startBtn = createActionButton('icons/start.png', 'Resume Task', 'task-action-btn btn-start');
    startBtn.onclick = e => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: 'startTask', taskId: task.id });
    };

    const pauseBtn = createActionButton('icons/pause.png', 'Pause Task', 'task-action-btn btn-pause');
    pauseBtn.onclick = e => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ action: 'pauseTask', taskId: task.id });
    };

    const delBtn = createActionButton('icons/delete.png', 'Delete Task', 'task-delete-btn');
    delBtn.onclick = async e => {
        e.stopPropagation();

        const taskTitle = li.querySelector(`#${taskId}-title`)?.textContent || UTIL.getTaskTitle(task);
        const confirmed = await UTIL.showConfirm(
            'Delete Task?',
            `Are you sure to delete: "${taskTitle}"?`
        );

        if (!confirmed) return;

        chrome.runtime.sendMessage({ action: 'deleteTask', taskId: task.id }, res => {
            if (res?.success) {
                UTIL.showNotify('Deleted');
                li.remove();
                return;
            }

            UTIL.showError('Delete Failed', res?.error);
        });
    };

    actions.append(startBtn, pauseBtn, delBtn);
    toggleButtons(task.status, startBtn, pauseBtn);

    li.append(title, metaTop, progressContainer, metaBottom, actions);
    return li;
}

function updateTaskEl(task, li) {
    const taskId = String(task.id);

    li.setAttribute('data-status', task.status);

    const title = li.querySelector(`#${taskId}-title`);
    if (title) title.textContent = UTIL.getTaskTitle(task);

    const metaRatioValue = li.querySelector(`#${taskId}-ratio`);
    if (metaRatioValue) metaRatioValue.textContent = UTIL.getTaskRatioText(task);

    const metaStatus = li.querySelector(`#${taskId}-status`);
    if (metaStatus) metaStatus.textContent = UTIL.getTaskStatusText(task);

    const metaSize = li.querySelector(`#${taskId}-size`);
    if (metaSize) metaSize.textContent = UTIL.formatSize(task.size ?? 0);

    const metaProgressValue = li.querySelector(`#${taskId}-progress-value`);
    if (metaProgressValue) metaProgressValue.textContent = UTIL.getTaskProgressText(task);

    const metaSpeedValue = li.querySelector(`#${taskId}-speed-value`);
    if (metaSpeedValue) metaSpeedValue.textContent = UTIL.getTaskSpeedText(task);

    const startBtn = li.querySelector('.btn-start');
    const pauseBtn = li.querySelector('.btn-pause');
    if (startBtn && pauseBtn) toggleButtons(task.status, startBtn, pauseBtn);
}

function toggleButtons(status, startBtn, pauseBtn) {
    const { showStart, showPause } = UTIL.getTaskActionVisibility(status);
    startBtn.classList.toggle('hidden', !showStart);
    pauseBtn.classList.toggle('hidden', !showPause);
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

    statusEl.textContent = 'DSM Online...';
    stateEl.src = 'icons/connected.png';
    downloadEl.textContent = UTIL.formatSpeed(totalDown);
    uploadEl.textContent = UTIL.formatSpeed(totalUp);
    statusEl.className = 'status ok';
}

function wakeBackground(retries = 5) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'ping' }, res => {
            if (res?.alive) {
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
    statusEl.className = 'status error';
    statusEl.textContent = 'Waking background...';
    stateEl.src = 'icons/wait.png';

    try {
        await wakeBackground();
        const res = await chrome.runtime.sendMessage({ action: 'getLatestTasks' });

        if (res?.success) {
            updateStatus(res.tasks);
            renderTasks(res.tasks);
            return;
        }

        statusEl.textContent = 'DSM Offline...';
        stateEl.src = 'icons/disconnected.png';
    } catch (error) {
        if (retries > 0) {
            setTimeout(() => initPopupWithRetry(retries - 1), 2000);
            return;
        }

        statusEl.textContent = 'Background not responding';
        stateEl.src = 'icons/disconnected.png';
    }
}

chrome.runtime.onMessage.addListener(msg => {
    if (msg.action !== 'tasksUpdated') return;

    if (msg.success) {
        updateStatus(msg.tasks);
        renderTasks(msg.tasks);
    }
});

function createDiv(id, className, textContent = '') {
    const el = document.createElement('div');
    if (id) el.id = id;
    if (className) el.className = className;
    if (textContent !== undefined) el.textContent = textContent;
    return el;
}

function createIcon(src, style) {
    const img = document.createElement('img');
    img.src = src;
    Object.assign(img.style, style);
    return img;
}

function createActionButton(src, title, className) {
    const button = document.createElement('img');
    button.src = src;
    button.alt = title;
    button.title = title;
    button.className = className;
    Object.assign(button.style, ICON_24_STYLE);
    return button;
}


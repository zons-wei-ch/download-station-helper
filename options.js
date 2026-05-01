import * as UTIL from './util.js';

const $ = window.jQuery;

const $hostInput = $('#host');
const $accountInput = $('#account');
const $passwordInput = $('#password');
const $refreshSelect = $('#refreshInterval');
const $saveBtn = $('#save');
const $testBtn = $('#testConnection');
const $togglePasswordBtn = $('#togglePassword');
const $eyeIcon = $('#eyeIcon');
const $enableSortCheckbox = $('#enableSort');
const $sortFieldSelect = $('#sortField');
const $sortOrderSelect = $('#sortOrder');
const $enableNotifyForSeedingCheckbox = $('#enableNotifyForSeeding');
const $enableNotifyForFinishedCheckbox = $('#enableNotifyForFinished');
const $enableNotifyForErrorCheckbox = $('#enableNotifyForError');

$togglePasswordBtn.on('click', e => {
    e.preventDefault();

    if ($passwordInput.attr('type') === 'password') {
        $passwordInput.attr('type', 'text');
        $eyeIcon.attr('src', 'icons/hide.png');
        return;
    }

    $passwordInput.attr('type', 'password');
    $eyeIcon.attr('src', 'icons/view.png');
});

$testBtn.on('click', async () => {
    const host = $hostInput.val().trim();
    const account = $accountInput.val().trim();
    const password = $passwordInput.val();

    if (!host || !account || !password) {
        UTIL.showNotify('Please input Host, Account and Password!', 'error', 'top');
        return;
    }

    $testBtn.prop('disabled', true);
    $testBtn.text('Testing...');

    chrome.runtime.sendMessage({
        action: 'login',
        data: { host, account, password }
    }, response => {
        $testBtn.prop('disabled', false);
        $testBtn.text('Test Connection');

        if (response?.success) {
            chrome.storage.sync.set(
                { host, account, password },
                () => UTIL.showNotify('Login Successful !', 'success', 'top', 2000)
            );
            return;
        }

        if (response?.error?.message) {
            UTIL.showNotify(response.error.message, 'error', 'top', 6000);
            return;
        }

        if (response?.error?.code) {
            UTIL.showNotify(`API Error Code: ${response.error.code}`, 'error', 'top', 6000);
            return;
        }

        UTIL.showNotify(response?.error || 'Undefined Err.', 'error', 'top', 6000);
    });
});

function updateSortOptionsState() {
    const isEnabled = $enableSortCheckbox.prop('checked');

    $sortFieldSelect.prop('disabled', !isEnabled);
    $sortOrderSelect.prop('disabled', !isEnabled);
    $sortFieldSelect.parent().css('opacity', isEnabled ? '1' : '0.5');
    $sortOrderSelect.parent().css('opacity', isEnabled ? '1' : '0.5');
}

$enableSortCheckbox.on('change', updateSortOptionsState);

$saveBtn.on('click', () => {
    const host = $hostInput.val().trim();
    const account = $accountInput.val().trim();
    const password = $passwordInput.val();
    const refreshInterval = parseInt($refreshSelect.val(), 10);
    const enableSort = $enableSortCheckbox.prop('checked');
    const sortField = $sortFieldSelect.val();
    const sortOrder = $sortOrderSelect.val();
    const enableNotifyForSeeding = $enableNotifyForSeedingCheckbox.prop('checked');
    const enableNotifyForFinished = $enableNotifyForFinishedCheckbox.prop('checked');
    const enableNotifyForError = $enableNotifyForErrorCheckbox.prop('checked');

    if (!host || !account) {
        UTIL.showNotify('Input Host and Account !', 'error', 'top');
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
            sortOrder,
            enableNotifyForSeeding,
            enableNotifyForFinished,
            enableNotifyForError
        },
        () => UTIL.showNotify('Settings Saved !', 'success', 'top')
    );
});

chrome.storage.sync.get(
    {
        host: '',
        account: '',
        password: '',
        refreshInterval: 5000,
        enableSort: false,
        sortField: 'time',
        sortOrder: 'desc',
        enableNotifyForSeeding: false,
        enableNotifyForFinished: false,
        enableNotifyForError: false
    },
    data => {
        $hostInput.val(data.host);
        $accountInput.val(data.account);
        $passwordInput.val(data.password);

        const allowed = [5000, 10000, 15000, 20000, 25000, 30000, 45000, 60000];
        $refreshSelect.val(allowed.includes(data.refreshInterval) ? data.refreshInterval : 5000);

        $enableSortCheckbox.prop('checked', data.enableSort);
        $sortFieldSelect.val(data.sortField);
        $sortOrderSelect.val(data.sortOrder);
        $enableNotifyForSeedingCheckbox.prop('checked', data.enableNotifyForSeeding);
        $enableNotifyForFinishedCheckbox.prop('checked', data.enableNotifyForFinished);
        $enableNotifyForErrorCheckbox.prop('checked', data.enableNotifyForError);

        updateSortOptionsState();
    }
);

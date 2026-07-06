// src/popup/popup.ts
import { sendMessage } from "../shared/browser-api";
import { loadConfig, saveConfig } from "../shared/storage";
import { MessageType, ExtensionConfig } from "../shared/types";

// ===== DOM Elements =====
const toggleEnabled = document.getElementById('toggle-enabled') as HTMLInputElement;
const toggleFetch = document.getElementById('toggle-fetch-intercept') as HTMLInputElement;
const toggleAutoLoad = document.getElementById('toggle-auto-load') as HTMLInputElement;
const toggleHideOld = document.getElementById('toggle-hide-old') as HTMLInputElement;
const toggleStatus = document.getElementById('toggle-status') as HTMLInputElement;
const visibleLimit = document.getElementById('visible-limit') as HTMLInputElement;
const batchSize = document.getElementById('batch-size') as HTMLInputElement;
const requestLimit = document.getElementById('request-limit-input') as HTMLInputElement;
const requestCount = document.getElementById('request-count-value') as HTMLSpanElement;
const resetBtn = document.getElementById('request-count-reset') as HTMLButtonElement;
const positionBtns = document.querySelectorAll('.position-picker__btn');
const themeToggle = document.getElementById('theme-toggle') as HTMLButtonElement;
const statusText = document.getElementById('status-text') as HTMLParagraphElement;
const versionText = document.getElementById('version-text') as HTMLParagraphElement;

// ===== Helper =====
async function sendMessageWithTimeout(msg: any, timeout = 2000): Promise<any> {
    return Promise.race([
        sendMessage(msg),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
    ]);
}

// ===== UI Apply =====
function applyConfig(config: ExtensionConfig): void {
    toggleEnabled.checked = config.enabled;
    toggleFetch.checked = config.fetchInterceptEnabled;
    toggleAutoLoad.checked = config.autoLoad;
    toggleHideOld.checked = config.hideOldMessages;
    toggleStatus.checked = config.showStatus;
    visibleLimit.value = String(config.visibleMessageLimit);
    batchSize.value = String(config.loadMoreBatchSize);
    requestLimit.value = String(config.weeklyRequestLimit);

    // Position picker
    positionBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.pos === config.statusPosition);
    });

    // Theme
    const isDark = config.theme === 'dark';
    document.documentElement.setAttribute('data-theme', config.theme);
    const sun = document.querySelector('.theme-toggle__icon.sun');
    const moon = document.querySelector('.theme-toggle__icon.moon');
    if (sun && moon) {
        sun.classList.toggle('hidden', isDark);
        moon.classList.toggle('hidden', !isDark);
    }

    statusText.textContent = 'Ready';
}

// ===== Request count =====
async function updateRequestCount(): Promise<void> {
    try {
        const siteId = await detectSiteId();
        const data = await sendMessage({ type: MessageType.GET_REQUEST_COUNT, payload: { siteId } });
        requestCount.textContent = data?.count?.toString() ?? '0';
    } catch {
        requestCount.textContent = '?';
    }
}

function detectSiteId(): Promise<string> {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0]?.url;
            if (!url) return resolve('unknown');
            const host = new URL(url).hostname;
            if (host.includes('chatgpt.com')) resolve('chatgpt');
            else if (host.includes('claude.ai')) resolve('claude');
            else if (host.includes('gemini.google.com')) resolve('gemini');
            else resolve('unknown');
        });
    });
}

// ===== Save Config =====
async function saveConfigUI(updates: Partial<ExtensionConfig>): Promise<void> {
    try {
        const result = await sendMessageWithTimeout({ type: MessageType.SET_CONFIG, payload: updates });
        applyConfig(result as ExtensionConfig);
    } catch (e) {
        console.warn('Background not responding, fallback to direct storage', e);
        const newConfig = await saveConfig(updates);
        applyConfig(newConfig);
        // Broadcast to tabs
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.id) chrome.tabs.sendMessage(tab.id, { type: MessageType.CONFIG_UPDATED, payload: newConfig }).catch(() => {});
            });
        });
        chrome.runtime.sendMessage({ type: MessageType.CONFIG_UPDATED, payload: newConfig }).catch(() => {});
    }
}

// ===== Init =====
async function initPopup(): Promise<void> {
    try {
        const config = await sendMessageWithTimeout({ type: MessageType.GET_CONFIG });
        if (config) {
            applyConfig(config);
            document.querySelector('.popup-settings')?.setAttribute('style', 'display:flex');
            statusText.textContent = 'Ready';
        } else throw new Error('no config');
    } catch {
        const config = await loadConfig();
        applyConfig(config);
        document.querySelector('.popup-settings')?.setAttribute('style', 'display:flex');
    }
    // Version
    const manifest = chrome.runtime.getManifest();
    if (manifest?.version) versionText.textContent = `v${manifest.version}`;
    await updateRequestCount();
}

// ===== Event Listeners =====
toggleEnabled.addEventListener('change', () => saveConfigUI({ enabled: toggleEnabled.checked }));
toggleFetch.addEventListener('change', () => saveConfigUI({ fetchInterceptEnabled: toggleFetch.checked }));
toggleAutoLoad.addEventListener('change', () => saveConfigUI({ autoLoad: toggleAutoLoad.checked }));
toggleHideOld.addEventListener('change', () => saveConfigUI({ hideOldMessages: toggleHideOld.checked }));
toggleStatus.addEventListener('change', () => saveConfigUI({ showStatus: toggleStatus.checked }));

visibleLimit.addEventListener('change', () => {
    const val = parseInt(visibleLimit.value);
    if (!isNaN(val) && val >= 1 && val <= 200) saveConfigUI({ visibleMessageLimit: val });
});
batchSize.addEventListener('change', () => {
    const val = parseInt(batchSize.value);
    if (!isNaN(val) && val >= 1 && val <= 50) saveConfigUI({ loadMoreBatchSize: val });
});
requestLimit.addEventListener('change', () => {
    const val = parseInt(requestLimit.value);
    if (!isNaN(val) && val >= 0) saveConfigUI({ weeklyRequestLimit: val });
});

positionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const pos = btn.dataset.pos;
        if (pos) saveConfigUI({ statusPosition: pos as any });
    });
});

themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    saveConfigUI({ theme: newTheme as any });
});

resetBtn.addEventListener('click', async () => {
    const siteId = await detectSiteId();
    await sendMessage({ type: MessageType.RESET_REQUEST_COUNT, payload: { siteId } });
    await updateRequestCount();
});

// ===== Storage change sync =====
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.ai_chat_speed_booster_config) {
        const newConfig = changes.ai_chat_speed_booster_config.newValue;
        if (newConfig) applyConfig(newConfig);
    }
});

// ===== Start =====
initPopup().catch(console.error);

import { ExtensionConfig } from "./types";
import { DEFAULT_CONFIG } from "./constants";
import { logger } from "./logger";

const STORAGE_KEY = "ai_chat_speed_booster_config";
const REQUEST_COUNT_KEY = "acsb_request_counts";
const AUTO_RESET_KEY = "acsb_auto_load_reset_v1";

// chrome.storage helpers
function chromeGet(key: string): Promise<any> {
    return new Promise(resolve => chrome.storage.local.get(key, resolve));
}
function chromeSet(items: Record<string, any>): Promise<void> {
    return new Promise(resolve => chrome.storage.local.set(items, resolve));
}

// localStorage fallback
function localGet(key: string): any {
    try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : null;
    } catch { return null; }
}
function localSet(key: string, value: any): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* ignore */ }
}

// Validate and merge with defaults
function validateConfig(raw: Partial<ExtensionConfig>): ExtensionConfig {
    return { ...DEFAULT_CONFIG, ...raw };
}

export async function loadConfig(): Promise<ExtensionConfig> {
    try {
        const result = await chromeGet(STORAGE_KEY);
        let config = result[STORAGE_KEY];
        if (config && Object.keys(config).length > 0) {
            return validateConfig(config);
        }
        // Fallback to localStorage
        const local = localGet(STORAGE_KEY);
        if (local) {
            const validated = validateConfig(local);
            await chromeSet({ [STORAGE_KEY]: validated });
            return validated;
        }
        return { ...DEFAULT_CONFIG };
    } catch (e) {
        logger.error("Failed to load config, using defaults", e);
        return { ...DEFAULT_CONFIG };
    }
}

export async function saveConfig(partial: Partial<ExtensionConfig>): Promise<ExtensionConfig> {
    const current = await loadConfig();
    const merged = { ...current, ...partial };
    const validated = validateConfig(merged);
    await chromeSet({ [STORAGE_KEY]: validated });
    localSet(STORAGE_KEY, validated);
    return validated;
}

export async function loadRequestCount(siteId: string): Promise<{ count: number; weekStart: number }> {
    const data = (await chromeGet(REQUEST_COUNT_KEY))[REQUEST_COUNT_KEY] || {};
    const weekStart = getWeekStart();
    const entry = data[siteId];
    if (entry && entry.weekStart === weekStart) return entry;
    return { count: 0, weekStart };
}

export async function incrementRequestCount(siteId: string, count: number = 1): Promise<{ count: number; weekStart: number }> {
    const data = (await chromeGet(REQUEST_COUNT_KEY))[REQUEST_COUNT_KEY] || {};
    const weekStart = getWeekStart();
    let entry = data[siteId] || { weekStart, count: 0 };
    if (entry.weekStart !== weekStart) entry = { weekStart, count: 0 };
    entry.count += count;
    data[siteId] = entry;
    await chromeSet({ [REQUEST_COUNT_KEY]: data });
    localSet(REQUEST_COUNT_KEY, data);
    return entry;
}

export async function resetRequestCount(siteId: string): Promise<{ count: number; weekStart: number }> {
    const data = (await chromeGet(REQUEST_COUNT_KEY))[REQUEST_COUNT_KEY] || {};
    const weekStart = getWeekStart();
    data[siteId] = { weekStart, count: 0 };
    await chromeSet({ [REQUEST_COUNT_KEY]: data });
    localSet(REQUEST_COUNT_KEY, data);
    return { count: 0, weekStart };
}

function getWeekStart(): number {
    const d = new Date();
    const day = (d.getUTCDay() + 6) % 7;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

// Listener for content scripts
export function onConfigChanged(callback: (config: ExtensionConfig) => void): void {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[STORAGE_KEY]) {
            const newVal = changes[STORAGE_KEY].newValue;
            if (newVal) callback(validateConfig(newVal));
        }
    });
}

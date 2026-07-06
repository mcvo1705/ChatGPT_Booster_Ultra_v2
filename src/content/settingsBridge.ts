const STORAGE_KEY = "ai_chat_speed_booster_config";
const BRIDGE_KEY = "acsb_bridge_config";

interface BridgePayload {
    enabled: boolean;
    fetchInterceptEnabled: boolean;
    visibleMessageLimit: number;
    loadMoreBatchSize: number;
}

function writeBridge(raw: Record<string, unknown> | undefined): void {
    const payload: BridgePayload = {
        enabled: typeof raw?.enabled === "boolean" ? raw.enabled : true,
        fetchInterceptEnabled: typeof raw?.fetchInterceptEnabled === "boolean" ? raw.fetchInterceptEnabled : true,
        visibleMessageLimit: typeof raw?.visibleMessageLimit === "number" ? raw.visibleMessageLimit : 3,
        loadMoreBatchSize: typeof raw?.loadMoreBatchSize === "number" ? raw.loadMoreBatchSize : 3,
    };
    try {
        localStorage.setItem(BRIDGE_KEY, JSON.stringify(payload));
    } catch {}
}

chrome.storage.local.get(STORAGE_KEY, (result) => {
    let config = result[STORAGE_KEY] as Record<string, unknown> | undefined;
    if (!config || Object.keys(config).length === 0) {
        try {
            const local = localStorage.getItem(STORAGE_KEY);
            if (local) config = JSON.parse(local);
        } catch {}
    }
    writeBridge(config);
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && STORAGE_KEY in changes) {
        const newVal = changes[STORAGE_KEY].newValue as Record<string, unknown> | undefined;
        writeBridge(newVal);
        if (newVal) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal)); } catch {}
        }
    }
});

window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
        try {
            const newConfig = JSON.parse(event.newValue);
            chrome.storage.local.get(STORAGE_KEY, (result) => {
                const current = result[STORAGE_KEY];
                if (JSON.stringify(current) !== JSON.stringify(newConfig)) {
                    chrome.storage.local.set({ [STORAGE_KEY]: newConfig });
                }
            });
        } catch {}
    }
});
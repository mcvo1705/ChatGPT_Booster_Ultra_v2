import sitesConfig from "../../sites.config.json";

declare const __DEV__: boolean;

interface BridgeSettings {
    enabled: boolean;
    fetchInterceptEnabled: boolean;
    visibleMessageLimit: number;
    loadMoreBatchSize: number;
}

interface TreeWalkConfig {
    nodesKey: string;
    currentNodeKey: string;
    rootKey: string;
    parentPointer: string;
    childrenKey: string;
    messageKey: string;
    roleAccessor: string;
    visibleRoles: string[];
}

interface ArraySliceConfig {
    messagesKey: string;
    roleKey: string;
    visibleRoles: string[];
    keepInitial?: number;
}

interface SiteFetchIntercept {
    urlMatch: string;
    urlExclude: string[];
    method: string;
    strategy: "tree-walk" | "array-slice";
    treeWalk?: TreeWalkConfig;
    arraySlice?: ArraySliceConfig;
}

interface SiteEntry {
    id: string;
    name: string;
    hostnames: string[];
    fetchIntercept?: SiteFetchIntercept;
}

const BRIDGE_KEY = "acsb_bridge_config";
const PREFIX = "[ACSB Fetch]";
const TRIMMED_ATTR = "data-acsb-trimmed";
const BYPASS_KEY = "acsb_skip_trim_once";
const BUFFER_ROUNDS = 10;
const RESPONSE_CACHE_MAX = 5;

interface CachedResponse {
    body: string;
    trimmed: boolean;
    status: number;
    statusText: string;
    headers: [string, string][];
    url: string;
}
const responseCache = new Map<string, CachedResponse>();

function cachePut(key: string, entry: CachedResponse): void {
    responseCache.delete(key);
    responseCache.set(key, entry);
    while (responseCache.size > RESPONSE_CACHE_MAX) {
        const oldest = responseCache.keys().next().value!;
        responseCache.delete(oldest);
    }
}

function cacheGet(key: string): CachedResponse | undefined {
    const entry = responseCache.get(key);
    if (!entry) return undefined;
    responseCache.delete(key);
    responseCache.set(key, entry);
    return entry;
}

(function initFetchInterceptor(): void {
    if ((window as unknown as Record<string, unknown>).__ACSB_FETCH_PATCHED__) return;
    (window as unknown as Record<string, unknown>).__ACSB_FETCH_PATCHED__ = true;

    const hostname = window.location.hostname;
    const site = (sitesConfig as unknown as SiteEntry[]).find((s) =>
        s.hostnames?.some(
            (h: string) => hostname === h || hostname.endsWith(`.${h}`),
        ),
    );

    if (!site?.fetchIntercept) {
        if (__DEV__) console.debug(PREFIX, "no fetch intercept config for", hostname);
        return;
    }

    const ic = site.fetchIntercept;
    const originalFetch = window.fetch;

    if (__DEV__) console.debug(PREFIX, "patching window.fetch for", site.name);

    window.fetch = async function patchedFetch(
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> {
        const url =
            typeof input === "string"
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;

        const method = (
            init?.method ??
            (input instanceof Request ? input.method : "GET")
        ).toUpperCase();

        if (
            method !== ic.method.toUpperCase() ||
            !url.includes(ic.urlMatch)
        ) {
            return originalFetch.call(this, input, init);
        }

        if (ic.urlExclude?.some((ex) => url.includes(ex))) {
            return originalFetch.call(this, input, init);
        }

        const settings = readSettings();
        if (!settings.enabled || !settings.fetchInterceptEnabled) {
            return originalFetch.call(this, input, init);
        }

        if (localStorage.getItem(BYPASS_KEY) === "true") {
            localStorage.removeItem(BYPASS_KEY);
            document.documentElement.removeAttribute(TRIMMED_ATTR);
            responseCache.delete(url);
            if (__DEV__) console.debug(PREFIX, "one-shot bypass active, skipping trim");
            return originalFetch.call(this, input, init);
        }

        const fetchLimit = (settings.visibleMessageLimit
            + (settings.loadMoreBatchSize * BUFFER_ROUNDS)) * 2;

        if (__DEV__) console.debug(PREFIX, "intercepting", method, url,
            `(fetchLimit=${fetchLimit})`);

        const cached = cacheGet(url);
        if (cached) {
            if (__DEV__) console.debug(PREFIX, "serving from cache", url);
            if (cached.trimmed) {
                document.documentElement.setAttribute(TRIMMED_ATTR, "true");
            }
            const headers = new Headers(cached.headers);
            const cachedRes = new Response(cached.body, {
                status: cached.status,
                statusText: cached.statusText,
                headers,
            });
            Object.defineProperty(cachedRes, "url", { value: cached.url });
            return cachedRes;
        }

        const response = await originalFetch.call(this, input, init);
        if (!response.ok) return response;

        try {
            const clone = response.clone();
            let text = await clone.text();
            if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
            const data = JSON.parse(text);
            const trimmed = applyStrategy(data, ic, fetchLimit);

            if (!trimmed) {
                if (__DEV__) console.debug(PREFIX, "no trimming needed");
                cachePut(url, {
                    body: text,
                    trimmed: false,
                    status: response.status,
                    statusText: response.statusText,
                    headers: [...new Headers(response.headers)],
                    url: response.url,
                });
                return response;
            }

            document.documentElement.setAttribute(TRIMMED_ATTR, "true");
            const trimmedBody = JSON.stringify(trimmed);
            cachePut(url, {
                body: trimmedBody,
                trimmed: true,
                status: response.status,
                statusText: response.statusText,
                headers: [...new Headers(response.headers)],
                url: response.url,
            });
            if (__DEV__) console.debug(PREFIX, "response trimmed and cached");
            return buildResponse(response, trimmedBody);
        } catch (err) {
            if (__DEV__) console.warn(PREFIX, "intercept failed, returning original", err);
            return response;
        }
    };

    function readSettings(): BridgeSettings {
        try {
            const raw = localStorage.getItem(BRIDGE_KEY);
            if (raw) return JSON.parse(raw) as BridgeSettings;
        } catch { /* */ }
        return {
            enabled: true,
            fetchInterceptEnabled: true,
            visibleMessageLimit: 3,
            loadMoreBatchSize: 3,
        };
    }

    function buildResponse(original: Response, body: string): Response {
        const headers = new Headers(original.headers);
        headers.set("content-type", "application/json; charset=utf-8");
        headers.delete("content-length");
        headers.delete("content-encoding");
        const res = new Response(body, {
            status: original.status,
            statusText: original.statusText,
            headers,
        });
        Object.defineProperty(res, "url", { value: original.url });
        return res;
    }

    function applyStrategy(
        data: Record<string, unknown>,
        config: SiteFetchIntercept,
        limit: number,
    ): Record<string, unknown> | null {
        if (config.strategy === "tree-walk" && config.treeWalk) {
            return trimTreeWalk(data, config.treeWalk, limit);
        }
        if (config.strategy === "array-slice" && config.arraySlice) {
            return trimArraySlice(data, config.arraySlice, limit);
        }
        return null;
    }

    function getNestedValue(obj: unknown, path: string): unknown {
        const parts = path.split(".");
        let current: unknown = obj;
        for (const part of parts) {
            if (current == null || typeof current !== "object") return undefined;
            current = (current as Record<string, unknown>)[part];
        }
        return current;
    }

    function isVisibleNode(
        node: Record<string, unknown>,
        tc: TreeWalkConfig,
    ): boolean {
        const msg = node[tc.messageKey];
        if (!msg) return false;
        const role = getNestedValue(msg, tc.roleAccessor);
        return typeof role === "string" && tc.visibleRoles.includes(role);
    }

    function trimTreeWalk(
        data: Record<string, unknown>,
        tc: TreeWalkConfig,
        limit: number,
    ): Record<string, unknown> | null {
        const mapping = data[tc.nodesKey] as
            | Record<string, Record<string, unknown>>
            | undefined;
        const currentNodeId = data[tc.currentNodeKey] as string | undefined;

        if (!mapping || !currentNodeId || !mapping[currentNodeId]) return null;

        const chain: string[] = [];
        let nid: string | null = currentNodeId;
        const visited = new Set<string>();

        while (nid && mapping[nid] && !visited.has(nid)) {
            visited.add(nid);
            chain.push(nid);
            nid = (mapping[nid][tc.parentPointer] as string | null) ?? null;
        }

        chain.reverse();

        let totalVisible = 0;
        for (const id of chain) {
            if (isVisibleNode(mapping[id], tc)) totalVisible++;
        }

        if (totalVisible <= limit) return null;

        let count = 0;
        let cutoff = 0;
        for (let i = chain.length - 1; i >= 0; i--) {
            if (isVisibleNode(mapping[chain[i]], tc)) {
                count++;
                if (count >= limit) {
                    cutoff = i;
                    break;
                }
            }
        }

        const kept = new Set<string>();
        for (let i = 0; i < cutoff; i++) {
            if (!isVisibleNode(mapping[chain[i]], tc)) kept.add(chain[i]);
        }
        for (let i = cutoff; i < chain.length; i++) {
            kept.add(chain[i]);
        }

        const keptChain = chain.filter((id) => kept.has(id));

        const newMapping: Record<string, Record<string, unknown>> = {};
        for (let i = 0; i < keptChain.length; i++) {
            const id = keptChain[i];
            const node = JSON.parse(
                JSON.stringify(mapping[id]),
            ) as Record<string, unknown>;
            node[tc.parentPointer] = i > 0 ? keptChain[i - 1] : null;
            node[tc.childrenKey] =
                i < keptChain.length - 1 ? [keptChain[i + 1]] : [];
            newMapping[id] = node;
        }

        const result = { ...data };
        result[tc.nodesKey] = newMapping;
        if (tc.rootKey)
            result[tc.rootKey] = keptChain[0] ?? currentNodeId;

        return result;
    }

    function trimArraySlice(
        data: Record<string, unknown>,
        ac: ArraySliceConfig,
        limit: number,
    ): Record<string, unknown> | null {
        const messages = data[ac.messagesKey] as
            | Record<string, unknown>[]
            | undefined;
        if (!Array.isArray(messages)) return null;

        const visibleIndices: number[] = [];
        for (let i = 0; i < messages.length; i++) {
            const role = getNestedValue(messages[i], ac.roleKey);
            if (typeof role === "string" && ac.visibleRoles.includes(role))
                visibleIndices.push(i);
        }

        if (visibleIndices.length <= limit) return null;

        const keepFromIdx =
            visibleIndices[visibleIndices.length - limit];
        const keepInitial = ac.keepInitial ?? 0;

        const newMessages: Record<string, unknown>[] = [];
        const added = new Set<number>();

        for (let i = 0; i < Math.min(keepInitial, messages.length); i++) {
            if (i < keepFromIdx) {
                newMessages.push(messages[i]);
                added.add(i);
            }
        }

        for (let i = keepFromIdx; i < messages.length; i++) {
            if (!added.has(i)) {
                newMessages.push(messages[i]);
            }
        }

        const result = { ...data };
        result[ac.messagesKey] = newMessages;
        return result;
    }
})();
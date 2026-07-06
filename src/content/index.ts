import { DOMObserver } from "./DOMObserver";
import { MessageManager } from "./MessageManager";
import { LoadMoreButton, StatusIndicator } from "./UIComponents";
import { detectCurrentSite, type SiteConfig } from "../shared/sites";
import { loadConfig, onConfigChanged } from "../shared/storage";
import { onMessage, sendMessage } from "../shared/browser-api";
import {
    MessageType,
    type ExtensionConfig,
    type ExtensionStatus,
} from "../shared/types";
import { logger } from "../shared/logger";

let config: ExtensionConfig;
let currentSite: SiteConfig;
const messageManager = new MessageManager();
let loadMoreButton: LoadMoreButton;
let statusIndicator: StatusIndicator;
let domObserver: DOMObserver;
let conversationRetryTimer: ReturnType<typeof setTimeout> | null = null;
let currentConversationTrimmed = false;

async function bootstrap(): Promise<void> {
    const site = detectCurrentSite();
    if (!site) {
        logger.info("no supported site detected, content script inactive");
        return;
    }
    currentSite = site;
    logger.info(`bootstrapping content script for ${currentSite.name}`);

    config = await loadConfig();
    messageManager.updateConfig(config);
    if (currentSite.messageIdAttribute) {
        messageManager.setMessageIdAttribute(currentSite.messageIdAttribute);
    }

    loadMoreButton = new LoadMoreButton(handleLoadMore, currentSite);
    statusIndicator = new StatusIndicator(currentSite);

    if (!config.showStatus) statusIndicator.hide();

    domObserver = new DOMObserver(currentSite, {
        onMessagesAdded: handleMessagesAdded,
        onMessagesRemoved: handleMessagesRemoved,
        onConversationChanged: handleConversationChanged,
        onMessagesReset: handleMessagesReset,
        getLastTrackedMessageId: () => messageManager.getLastTrackedMessageId(),
        hasTrackedMessageId: (id: string) =>
            messageManager.hasTrackedMessageId(id),
        onScrollToTop: loadOneMoreMessage,
    });

    domObserver.start();
    domObserver.SetAutoLoad(config.autoLoad);
    scheduleInitialScan();
    onConfigChanged(handleConfigUpdated);
    onMessage(handleExtensionMessage);
}

function scheduleInitialScan(): void {
    const attempt = (): void => {
        const existing = domObserver.queryAllMessages();
        if (existing.length > 0) {
            messageManager.initialise(existing);
            refreshUI();
            logger.info(`initial scan: ${existing.length} messages`);
            setTimeout(() => {
                const msgs = domObserver.queryAllMessages();
                const scrollEl = domObserver.findScrollContainer();
                console.log(
                    `[AI Chat Speed Booster] Site: ${currentSite.name} | ` +
                    `Selector: "${currentSite.selectors.messageTurn}" → ${msgs.length} match(es) | ` +
                    `Scroll container: ${scrollEl ? "found" : "NOT found"} | ` +
                    `Is Dynamic: ${currentSite.isDynamic ? "Yes" : "No"}`,
                );
            }, 100);
            if (currentSite.isDynamic) {
                requestAnimationFrame(() => {
                    const scrollEl = domObserver.findScrollContainer();
                    if (scrollEl) {
                        scrollEl.scrollTop = scrollEl.scrollHeight;
                    } else {
                        window.scrollTo(0, document.body.scrollHeight);
                    }
                });
            }
            return;
        }
        setTimeout(attempt, 500);
    };
    attempt();
}

function handleMessagesAdded(elements: HTMLElement[]): void {
    messageManager.addMessages(elements);
    refreshUI();
    countNewUserRequests(elements);
}

function countNewUserRequests(elements: HTMLElement[]): void {
    const sel = currentSite.selectors.userMessageSelector;
    if (!sel) return;
    const count = elements.filter(
        (el) => el.matches(sel) || el.querySelector(sel) !== null,
    ).length;
    if (count > 0) {
        sendMessage({
            type: MessageType.INCREMENT_REQUEST_COUNT,
            payload: { siteId: currentSite.id, count },
        }).catch(() => {});
    }
}

function handleMessagesRemoved(elements: HTMLElement[]): void {
    messageManager.removeMessages(elements);
    refreshUI();
}

function handleConversationChanged(): void {
    logger.debug("conversation changed, re-initialising");
    currentConversationTrimmed = false;

    if (conversationRetryTimer) {
        clearTimeout(conversationRetryTimer);
        conversationRetryTimer = null;
    }

    messageManager.destroy(false);
    loadMoreButton.hide();
    statusIndicator.hide();

    let retries = 0;
    const maxRetries = 20;
    const attempt = (): void => {
        const messages = domObserver.queryAllMessages();
        if (messages.length > 0 || retries >= maxRetries) {
            messageManager.initialise(messages);
            refreshUI();
            conversationRetryTimer = null;
            if (messages.length > 0) {
                logger.debug(`re-initialised with ${messages.length} messages after ${retries} retries`);
            }
            return;
        }
        retries++;
        conversationRetryTimer = setTimeout(attempt, 300);
    };
    attempt();
}

function handleConfigUpdated(newConfig: ExtensionConfig): void {
    config = newConfig;
    messageManager.updateConfig(config);
    refreshUI();
    logger.debug("config updated from external source");
}

function handleMessagesReset(): void {
    logger.debug("large batch detected, re-initialising message manager");
    messageManager.destroy();
    loadMoreButton.hide();
    const messages = domObserver.queryAllMessages();
    messageManager.initialise(messages);
    domObserver.resetAutoLoad();
    refreshUI();
}

function handleExtensionMessage(message: unknown): ExtensionStatus | undefined {
    const msg = message as { type?: string; payload?: unknown };
    if (msg.type === MessageType.GET_STATUS) {
        return { ...messageManager.getStatus(), siteId: currentSite.id };
    }
    if (msg.type === MessageType.CONFIG_UPDATED && msg.payload) {
        handleConfigUpdated(msg.payload as ExtensionConfig);
    }
    return undefined;
}

function handleLoadMore(): void {
    const revealed = messageManager.loadMore();
    if (revealed > 0) {
        refreshUI();
    } else {
        refreshUI();
    }
}

function loadOneMoreMessage(): void {
    if(!config.autoLoad) return;
    messageManager.loadMore(1);
    refreshUI();
}

function handleFullLoad(): void {
    try {
        localStorage.setItem("acsb_skip_trim_once", "true");
    } catch { /* */ }
    window.location.reload();
}

let rafPending = false;
function refreshUI(): void {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        rafPending = false;
        const status = messageManager.getStatus();

        if (document.documentElement.hasAttribute("data-acsb-trimmed")) {
            currentConversationTrimmed = true;
            document.documentElement.removeAttribute("data-acsb-trimmed");
        }

        if (status.hiddenMessages > 1 && config.enabled) {
            const firstVisible = findFirstVisibleMessage();
            const container = findMessageContainer();
            if (container && firstVisible) {
                loadMoreButton.show(container, firstVisible, status.hiddenMessages, config.loadMoreBatchSize);
            } else if (container) {
                loadMoreButton.show(container, null, status.hiddenMessages, config.loadMoreBatchSize);
            }
        } else if (currentConversationTrimmed && config.enabled && config.fetchInterceptEnabled) {
            const firstVisible = findFirstVisibleMessage();
            const container = findMessageContainer();
            if (container) {
                loadMoreButton.showFullLoad(container, firstVisible, handleFullLoad);
            }
        } else {
            loadMoreButton.hide();
        }

        domObserver.updateMessageStats(Math.floor(status.totalMessages / 2), Math.floor(status.visibleMessages / 2));
        domObserver.SetAutoLoad(config.autoLoad);

        if (!config.enabled || !config.showStatus || status.totalMessages === 0) {
            statusIndicator.hide();
        } else {
            statusIndicator.update(status.hiddenMessages, status.totalMessages, config.statusPosition, config.fetchInterceptEnabled, config.theme === "light");
        }
    });
}

function findFirstVisibleMessage(): HTMLElement | null {
    const all = document.querySelectorAll<HTMLElement>(currentSite.selectors.messageTurn);
    for (const el of all) {
        if (!el.classList.contains("acsb-hidden")) return el;
    }
    return null;
}

function findMessageContainer(): HTMLElement | null {
    const firstMsg = document.querySelector<HTMLElement>(currentSite.selectors.messageTurn);
    return firstMsg?.parentElement ?? null;
}

window.addEventListener("beforeunload", () => {
    if (conversationRetryTimer) {
        clearTimeout(conversationRetryTimer);
        conversationRetryTimer = null;
    }
    domObserver.stop();
    messageManager.destroy();
    loadMoreButton.destroy();
    statusIndicator.destroy();
});

bootstrap().catch((err) => {
    logger.error("failed to bootstrap content script", err);
});

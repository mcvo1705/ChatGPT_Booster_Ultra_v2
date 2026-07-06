export interface ExtensionConfig {
    visibleMessageLimit: number;
    loadMoreBatchSize: number;
    enabled: boolean;
    showStatus: boolean;
    statusPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    fetchInterceptEnabled: boolean;
    theme: "dark" | "light";
    autoLoad: boolean;
    weeklyRequestLimit: number;
    hideOldMessages: boolean;
}
export interface ExtensionStatus {
    enabled: boolean;
    totalMessages: number;
    visibleMessages: number;
    hiddenMessages: number;
    showStatus: boolean;
    statusPosition: string;
    siteId?: string;
}
export type StatusPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export interface TrackedMessage {
    id: string;
    element: HTMLElement;
    visible: boolean;
}
export enum MessageType {
    GET_CONFIG = "GET_CONFIG",
    SET_CONFIG = "SET_CONFIG",
    GET_STATUS = "GET_STATUS",
    TOGGLE_ENABLED = "TOGGLE_ENABLED",
    TOGGLE_STATUS = "TOGGLE_STATUS",
    TOGGLE_FETCH_INTERCEPT = "TOGGLE_FETCH_INTERCEPT",
    TOGGLE_AUTO_LOAD = "TOGGLE_AUTO_LOAD",
    TOGGLE_HIDE_OLD_MESSAGES = "TOGGLE_HIDE_OLD_MESSAGES",
    GET_REQUEST_COUNT = "GET_REQUEST_COUNT",
    INCREMENT_REQUEST_COUNT = "INCREMENT_REQUEST_COUNT",
    RESET_REQUEST_COUNT = "RESET_REQUEST_COUNT",
    CONFIG_UPDATED = "CONFIG_UPDATED",
}
export type ExtensionMessageUnion = { type: MessageType; payload?: any };

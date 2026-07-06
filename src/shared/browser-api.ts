export const api = chrome;
export function sendMessage(msg: any) {
    return chrome.runtime.sendMessage(msg);
}
export function onMessage(handler: (msg: any) => Promise<any> | any) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const result = handler(message);
        if (result instanceof Promise) {
            result.then(sendResponse).catch(() => sendResponse(undefined));
            return true;
        } else if (result !== undefined) {
            sendResponse(result);
        }
        return false;
    });
}

const PREFIX = "[ACSB]";
export const logger = {
    debug: (...args: any[]) => console.debug(PREFIX, ...args),
    info: (...args: any[]) => console.info(PREFIX, ...args),
    warn: (...args: any[]) => console.warn(PREFIX, ...args),
    error: (...args: any[]) => console.error(PREFIX, ...args),
};

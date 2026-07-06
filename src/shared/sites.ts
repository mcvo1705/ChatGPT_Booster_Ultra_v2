import sitesConfig from "../../sites.config.json";

export interface SiteSelectors { messageTurn: string; scrollContainer: string; scrollContainerAlt?: string; userMessageSelector?: string; }
export interface SiteConfig {
    id: string;
    name: string;
    hostnames: string[];
    urlPatterns: string[];
    selectors: SiteSelectors;
    messageIdAttribute?: string;
    statusAnchors?: { name?: string; controls?: string; bottom?: string };
    ui?: { loadMoreMargin?: string };
    fetchIntercept?: any;
    isDynamic?: boolean;
}
export function detectCurrentSite(): SiteConfig | null {
    const host = window.location.hostname;
    for (const site of (sitesConfig as SiteConfig[])) {
        if (site.hostnames.some(h => host === h || host.endsWith(`.${h}`))) return site;
    }
    return null;
}
export function getAllUrlPatterns(): string[] {
    return (sitesConfig as SiteConfig[]).flatMap(s => s.urlPatterns);
}

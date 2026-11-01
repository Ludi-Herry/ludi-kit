export const TIANSHU_NOTICE_EVENT = "tianshu:demo-notice";

export function emitTianshuNotice(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(TIANSHU_NOTICE_EVENT, { detail: message }));
}

export function navigateTianshu(path: string) {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.startsWith("/tianshu")) {
    window.location.assign(path);
    return;
  }
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

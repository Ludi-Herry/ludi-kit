// 本地记忆读写（第 4 阶段共用核心）：各页控制器共用。不直接碰 window，存储由调用方传入，测试里可传内存实现。

/** 本地存储的最小接口；浏览器里传 window.localStorage。 */
export type KeyValueStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function readStored<T>(store: KeyValueStore | undefined, key: string): T | null {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeStored(store: KeyValueStore | undefined, key: string, value: unknown) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // 浏览器禁用存储时只是不记忆，不影响使用。
  }
}

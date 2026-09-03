// 本地存储封装：隐私模式 / 配额异常时静默降级，不抛错

function withStorage<T>(getStorage: () => Storage, fn: (s: Storage) => T, fallback: T): T {
  try {
    return fn(getStorage())
  } catch {
    return fallback
  }
}

function createStore(getStorage: () => Storage) {
  return {
    read<T>(key: string, fallback: T): T {
      return withStorage(
        getStorage,
        (s) => {
          const raw = s.getItem(key)
          return raw === null ? fallback : (JSON.parse(raw) as T)
        },
        fallback,
      )
    },
    write(key: string, value: unknown): void {
      withStorage(getStorage, (s) => s.setItem(key, JSON.stringify(value)), undefined)
    },
    remove(key: string): void {
      withStorage(getStorage, (s) => s.removeItem(key), undefined)
    },
  }
}

/** localStorage：跨会话持久化（身份、资料、私人标记） */
export const local = createStore(() => window.localStorage)

/** sessionStorage：仅当前标签页（当前房间码，刷新后可恢复） */
export const session = createStore(() => window.sessionStorage)

// 极简持久化：JSON Lines 追加写文件，启动时整文件读回；DATA_DIR 为空时退化为纯内存（测试 / 本地开发）
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Persistence<T> {
  load(): T[]
  append(item: T): void
}

export class MemoryList<T> implements Persistence<T> {
  private items: T[] = []

  load(): T[] {
    return [...this.items]
  }

  append(item: T): void {
    this.items.push(item)
  }
}

export class JsonlFile<T> implements Persistence<T> {
  constructor(private readonly path: string) {}

  load(): T[] {
    if (!existsSync(this.path)) return []
    const out: T[] = []
    for (const line of readFileSync(this.path, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        out.push(JSON.parse(trimmed) as T)
      } catch {
        // 半行写入（掉电）等损坏记录跳过，不影响其余数据
      }
    }
    return out
  }

  append(item: T): void {
    appendFileSync(this.path, `${JSON.stringify(item)}\n`, 'utf8')
  }
}

export function openPersistence<T>(dataDir: string, fileName: string): Persistence<T> {
  if (!dataDir) return new MemoryList<T>()
  mkdirSync(dataDir, { recursive: true })
  return new JsonlFile<T>(join(dataDir, fileName))
}

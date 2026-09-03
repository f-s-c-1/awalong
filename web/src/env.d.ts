/// <reference types="vite/client" />

// 单文件组件类型垫片（vue-tsc 会直接解析 .vue，此处兜底给其他工具链）
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

// 环境变量声明：不配置时走同源 + Vite 代理
interface ImportMetaEnv {
  /** REST 基地址，默认同源（空串） */
  readonly VITE_API_BASE?: string
  /** WebSocket 地址，默认 ws(s)://当前域名/ws */
  readonly VITE_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

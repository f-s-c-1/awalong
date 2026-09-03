import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useRoomStore } from './stores/room'
import { useGameStore } from './stores/game'
import { useMarksStore } from './stores/marks'
import './styles/tokens.css'
import './styles/base.css'

const app = createApp(App)
const pinia = createPinia()

// 先装 pinia 再装 router：路由守卫内需要读取 store
app.use(pinia)
app.use(router)

// 提前实例化会监听 WS 推送的 store，确保消息到达时处理器已注册
useRoomStore(pinia)
useGameStore(pinia)
useMarksStore(pinia)

app.mount('#app')

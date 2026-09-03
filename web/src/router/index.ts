import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useRoomStore } from '@/stores/room'
import { useUserStore } from '@/stores/user'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
  {
    path: '/welcome',
    name: 'welcome',
    component: () => import('@/views/WelcomeView.vue'),
    meta: { title: '设定名号' },
  },
  {
    path: '/join',
    name: 'join',
    component: () => import('@/views/JoinView.vue'),
    meta: { title: '加入房间' },
  },
  {
    path: '/r/:code',
    name: 'room',
    component: () => import('@/views/RoomView.vue'),
    meta: { title: '房间' },
  },
  {
    path: '/game',
    name: 'game',
    component: () => import('@/views/GameView.vue'),
    meta: { title: '对局' },
  },
  {
    path: '/result',
    name: 'result',
    component: () => import('@/views/ResultView.vue'),
    meta: { title: '结算' },
  },
  {
    path: '/rules',
    name: 'rules',
    component: () => import('@/views/RulesView.vue'),
    meta: { title: '游戏规则' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

const ROOM_CODE_RE = /^\d{6}$/

router.beforeEach((to) => {
  const room = useRoomStore()
  const user = useUserStore()

  if (to.name === 'room') {
    const code = String(to.params.code ?? '')
    if (!ROOM_CODE_RE.test(code)) return { path: '/' }
    room.setCode(code)
    // 未设置昵称/头像的玩家先去引导页，完成后跳回房间
    if (!user.initialized) {
      return { path: '/welcome', query: { redirect: to.fullPath } }
    }
    return true
  }

  if ((to.name === 'game' || to.name === 'result') && !room.code) {
    return { path: '/' }
  }

  return true
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = title ? `${title} · 阿瓦隆` : '阿瓦隆'
})

export default router

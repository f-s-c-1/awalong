<script setup lang="ts">
// 封面首页：圣剑徽章对称构图（星幕 + 环形圆桌纹 + 竖剑徽章），忠实还原 Main 画板
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, ApiError, loadAuth } from '@/services/api'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const route = useRoute()
const user = useUserStore()

const creating = ref(false)
const error = ref('')
/** 服务端记录的所在房间：关掉页面后重新打开可直接回去 */
const activeRoom = ref<string | null>(null)

async function createRoom(): Promise<void> {
  if (creating.value) return
  // 建房前必须先有昵称与头像（匿名登录也需要），完成后带 create=1 回到首页自动继续
  if (!user.initialized) {
    await router.push({ path: '/welcome', query: { redirect: '/?create=1' } })
    return
  }
  creating.value = true
  error.value = ''
  try {
    await user.ensureAuth()
    const room = await api.createRoom(undefined, user.currentProfile)
    await router.push(`/r/${room.code}`)
  } catch (err) {
    error.value = err instanceof ApiError ? `创建失败：${err.message}` : '创建失败，请稍后再试'
  } finally {
    creating.value = false
  }
}

function goJoin(): void {
  void router.push('/join')
}

async function loadActiveRoom(): Promise<void> {
  if (!loadAuth()) return
  try {
    const me = await api.getMe()
    activeRoom.value = me.roomCode
  } catch {
    // 凭证失效或网络异常：不显示回房入口即可
  }
}

onMounted(() => {
  if (route.query.create === '1' && user.initialized) {
    void router.replace({ path: '/' })
    void createRoom()
    return
  }
  void loadActiveRoom()
})
</script>

<template>
  <main class="home serif">
    <div class="home__glow" aria-hidden="true"></div>
    <div class="home__haze" aria-hidden="true"></div>

    <svg class="home__stars" viewBox="0 0 390 480" fill="none" aria-hidden="true">
      <circle cx="42" cy="88" r="1.2" fill="#EDE8F2" opacity="0.5" />
      <circle cx="94" cy="46" r="0.9" fill="#EDE8F2" opacity="0.35" />
      <circle cx="158" cy="72" r="1.1" fill="#C9A227" opacity="0.45" />
      <circle cx="236" cy="38" r="1.0" fill="#EDE8F2" opacity="0.4" />
      <circle cx="298" cy="84" r="1.3" fill="#EDE8F2" opacity="0.5" />
      <circle cx="348" cy="52" r="0.8" fill="#C9A227" opacity="0.4" />
      <circle cx="26" cy="196" r="0.9" fill="#EDE8F2" opacity="0.3" />
      <circle cx="362" cy="176" r="1.1" fill="#EDE8F2" opacity="0.4" />
      <circle cx="330" cy="286" r="0.9" fill="#C9A227" opacity="0.35" />
      <circle cx="52" cy="322" r="1.0" fill="#EDE8F2" opacity="0.3" />
      <circle cx="196" cy="24" r="1.2" fill="#EDE8F2" opacity="0.45" />
      <circle cx="126" cy="132" r="0.8" fill="#EDE8F2" opacity="0.25" />
      <circle cx="272" cy="150" r="0.9" fill="#EDE8F2" opacity="0.3" />
      <circle cx="70" cy="428" r="1.0" fill="#EDE8F2" opacity="0.25" />
      <circle cx="318" cy="412" r="1.1" fill="#C9A227" opacity="0.3" />
    </svg>

    <svg class="home__rule" viewBox="0 0 160 12" fill="none" aria-hidden="true">
      <line x1="4" y1="6" x2="66" y2="6" stroke="#4A3F5C" stroke-width="1" />
      <path d="M80 1 L85 6 L80 11 L75 6 Z" fill="#C9A227" />
      <line x1="94" y1="6" x2="156" y2="6" stroke="#4A3F5C" stroke-width="1" />
    </svg>

    <svg class="home__emblem" viewBox="0 0 200 240" fill="none" role="img" aria-label="圣剑徽章">
      <circle cx="100" cy="130" r="78" stroke="#C9A227" stroke-width="1.5" opacity="0.45" />
      <circle cx="100" cy="130" r="70" stroke="#C9A227" stroke-width="0.8" opacity="0.22" />
      <path d="M174 149 L178 154 L174 159 L170 154 Z" fill="#C9A227" opacity="0.85" />
      <path d="M100 203 L104 208 L100 213 L96 208 Z" fill="#C9A227" opacity="0.85" />
      <path d="M26 149 L30 154 L26 159 L22 154 Z" fill="#C9A227" opacity="0.85" />
      <path d="M54 62 L58 67 L54 72 L50 67 Z" fill="#C9A227" opacity="0.85" />
      <path d="M146 62 L150 67 L146 72 L142 67 Z" fill="#C9A227" opacity="0.85" />
      <defs>
        <linearGradient id="home-blade-grad" x1="100" y1="66" x2="100" y2="195" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#EDE0A8" />
          <stop offset="0.55" stop-color="#C9A227" />
          <stop offset="1" stop-color="#8A6D1F" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="26" r="6" stroke="#C9A227" stroke-width="2" />
      <circle cx="100" cy="26" r="1.6" fill="#C9A227" />
      <rect x="96.5" y="34" width="7" height="22" rx="2" fill="#A8851C" />
      <path d="M68 63 Q100 52 132 63" stroke="#141019" stroke-width="9" stroke-linecap="round" />
      <path d="M68 63 Q100 52 132 63" stroke="#C9A227" stroke-width="5" stroke-linecap="round" />
      <path d="M94 64 L106 64 L103 170 L100 195 L97 170 Z" fill="url(#home-blade-grad)" />
      <line x1="100" y1="74" x2="100" y2="162" stroke="#141019" stroke-width="1.4" opacity="0.45" />
    </svg>

    <div class="home__title">
      <h1 class="home__name">阿瓦隆</h1>
      <div class="home__latin latin">AVALON</div>
      <p class="home__tagline">圆桌之上，忠诚与背叛共存</p>
    </div>

    <ul class="home__tags" aria-label="游戏特性">
      <li class="chip">5-10人</li>
      <li class="chip">实时语音</li>
      <li class="chip">社交推理</li>
    </ul>

    <div class="home__actions">
      <RouterLink v-if="activeRoom" class="home__resume" :to="`/r/${activeRoom}`">
        回到房间 {{ activeRoom }}
      </RouterLink>
      <button
        type="button"
        class="btn btn-primary"
        :class="{ 'is-loading': creating }"
        :aria-busy="creating"
        @click="createRoom"
      >
        {{ creating ? '正在创建…' : '创建房间' }}
      </button>
      <button type="button" class="btn btn-secondary" @click="goJoin">输入房间码加入</button>
      <p v-if="error" class="error-text home__error" role="alert">{{ error }}</p>
    </div>

    <nav class="home__links" aria-label="更多">
      <RouterLink class="home__link" to="/rules">游戏规则</RouterLink>
      <span class="home__dot" aria-hidden="true"></span>
      <span class="home__link home__link--soon" aria-disabled="true" title="即将上线">我的战绩</span>
    </nav>
  </main>
</template>

<style scoped>
.home {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: var(--page-max);
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0 auto;
  padding: calc(5.6rem + var(--safe-top)) 2.8rem calc(4rem + var(--safe-bottom));
  overflow-x: hidden;
  background: var(--bg);
}

.home__glow {
  position: absolute;
  top: 9.6rem;
  left: 50%;
  width: 42rem;
  height: 42rem;
  margin-left: -21rem;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(201, 162, 39, 0.13) 0%,
    rgba(201, 162, 39, 0.04) 42%,
    rgba(20, 16, 25, 0) 68%
  );
  pointer-events: none;
}

.home__haze {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 118%, rgba(74, 52, 92, 0.32) 0%, rgba(20, 16, 25, 0) 52%);
  pointer-events: none;
}

.home__stars {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: auto;
  pointer-events: none;
}

.home__rule {
  position: relative;
  width: 16rem;
  height: 1.2rem;
}

.home__emblem {
  position: relative;
  width: 20rem;
  height: 24rem;
  margin-top: 4rem;
}

.home__title {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  margin-top: 3.6rem;
}

.home__name {
  margin: 0 0 0 0.5rem;
  font-size: 6rem;
  font-weight: 900;
  letter-spacing: 1rem;
  line-height: 1;
  color: var(--text);
}

.home__latin {
  margin-left: 0.55rem;
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 1.1rem;
  color: var(--gold);
}

.home__tagline {
  margin: 0;
  font-size: 1.3rem;
  letter-spacing: 0.3rem;
  color: var(--muted);
}

.home__tags {
  position: relative;
  display: flex;
  gap: 1rem;
  margin: 4.4rem 0 0;
  padding: 0;
  list-style: none;
}

.home__actions {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  width: 100%;
  margin-top: auto;
  padding-top: 3.2rem;
}

.home__resume {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  min-height: 4.4rem;
  padding: 0 1.2rem;
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
  color: var(--gold);
}

.home__error {
  text-align: center;
}

.home__links {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1.4rem;
  margin-top: 2.4rem;
}

.home__link {
  display: inline-flex;
  align-items: center;
  min-height: 4.4rem;
  padding: 0 0.4rem;
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
  color: var(--muted);
  transition: color 200ms ease;
}

a.home__link:hover,
a.home__link:focus-visible {
  color: var(--gold);
}

.home__link--soon {
  opacity: 0.6;
  cursor: default;
}

.home__dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--dim);
}

/* 矮屏（如 667px 高）收紧徽章与标题，避免主按钮被挤出首屏 */
@media (max-height: 700px) {
  .home__emblem {
    width: 16rem;
    height: 19.2rem;
    margin-top: 2rem;
  }

  .home__title {
    margin-top: 2.4rem;
  }

  .home__name {
    font-size: 5rem;
  }

  .home__tags {
    margin-top: 2.8rem;
  }
}

/* 平板 / PC ≥768px：保持竖排，整体居中并放大 1.2 倍；背景交给 body 的光晕 */
@media (min-width: 768px) {
  .home {
    max-width: var(--page-narrow);
    justify-content: center;
    padding: calc(4.8rem + var(--safe-top)) 3.2rem calc(4.8rem + var(--safe-bottom));
    background: transparent;
  }

  .home__glow {
    top: 50%;
    transform: translateY(-62%);
  }

  .home__rule {
    width: 19.2rem;
    height: 1.44rem;
  }

  .home__emblem {
    width: 24rem;
    height: 28.8rem;
    margin-top: 4.8rem;
  }

  .home__title {
    gap: 1.4rem;
    margin-top: 4.3rem;
  }

  .home__name {
    font-size: 7.2rem;
    letter-spacing: 1.2rem;
  }

  .home__latin {
    font-size: 1.7rem;
    letter-spacing: 1.3rem;
  }

  .home__tagline {
    font-size: 1.6rem;
    letter-spacing: 0.36rem;
  }

  .home__tags {
    gap: 1.2rem;
    margin-top: 5.2rem;
  }

  .home__tags .chip {
    padding: 0.7rem 1.7rem;
    font-size: 1.4rem;
  }

  .home__actions {
    max-width: 40rem;
    gap: 1.4rem;
    margin-top: 0;
    padding-top: 4rem;
  }

  .home__actions .btn {
    height: 6.2rem;
    font-size: 2rem;
  }

  .home__resume,
  .home__link {
    font-size: 1.5rem;
  }

  .home__links {
    margin-top: 3.2rem;
  }
}

/* 桌面 ≥1024px：徽章 28rem、标题 8rem，两个主按钮并排（各 24rem） */
@media (min-width: 1024px) {
  .home {
    max-width: 72rem;
  }

  .home__glow {
    width: 56rem;
    height: 56rem;
    margin-left: -28rem;
  }

  .home__emblem {
    width: 28rem;
    height: 33.6rem;
  }

  .home__name {
    font-size: 8rem;
    letter-spacing: 1.4rem;
  }

  .home__actions {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    max-width: none;
    gap: 1.6rem;
  }

  .home__actions .btn {
    width: 24rem;
  }

  .home__resume,
  .home__error {
    flex-basis: 100%;
  }
}

/* 桌面矮视口（如 1366×768 笔记本减去浏览器栏）：收紧徽章与标题，保证按钮不出首屏 */
@media (min-width: 1024px) and (max-height: 760px) {
  .home__emblem {
    width: 22rem;
    height: 26.4rem;
    margin-top: 2.4rem;
  }

  .home__title {
    margin-top: 2.8rem;
  }

  .home__name {
    font-size: 6.4rem;
  }

  .home__tags {
    margin-top: 3.2rem;
  }

  .home__actions {
    padding-top: 3.2rem;
  }
}
</style>

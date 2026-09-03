// 用户身份：设备匿名账号（uid + JWT）与本地资料（昵称、头像 id）
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, clearAuth as clearStoredAuth, loadAuth } from '@/services/api'
import type { AuthInfo, AuthProfile } from '@/services/api'
import { isAvatarId } from '@/assets/avatars'
import { local } from '@/utils/storage'

const PROFILE_KEY = 'avalon.profile'
const NICKNAME_MAX = 8

interface Profile {
  nickname: string
  avatar: string
}

function readProfile(): Profile {
  const p = local.read<Partial<Profile> | null>(PROFILE_KEY, null)
  return {
    nickname: typeof p?.nickname === 'string' ? p.nickname.slice(0, NICKNAME_MAX) : '',
    avatar: typeof p?.avatar === 'string' ? p.avatar : '',
  }
}

export const useUserStore = defineStore('user', () => {
  const stored = loadAuth()
  const profile = readProfile()

  const uid = ref(stored?.uid ?? '')
  const token = ref(stored?.token ?? '')
  const nickname = ref(profile.nickname)
  const avatar = ref(profile.avatar)

  /** 资料是否已设置（匿名登录与进房都要求昵称、头像非空） */
  const initialized = computed(
    () => nickname.value.trim().length > 0 && avatar.value.length > 0 && isAvatarId(avatar.value),
  )

  const currentProfile = computed<AuthProfile>(() => ({
    nickname: nickname.value,
    avatar: avatar.value,
  }))

  function setProfile(nextNickname: string, nextAvatar: string): void {
    nickname.value = nextNickname.trim().slice(0, NICKNAME_MAX)
    avatar.value = nextAvatar
    local.write(PROFILE_KEY, { nickname: nickname.value, avatar: avatar.value } satisfies Profile)
    // 已登录则同步到服务端（房间内昵称来自服务端用户表）；失败不影响本地使用
    if (token.value && initialized.value) {
      void api.updateMe(currentProfile.value).catch(() => undefined)
    }
  }

  /** 确保持有服务端签发的凭证；首次进入时用当前资料匿名注册 */
  async function ensureAuth(): Promise<AuthInfo> {
    if (!initialized.value) throw new Error('请先设置昵称与头像')
    const auth = await api.ensureAuth(currentProfile.value)
    uid.value = auth.uid
    token.value = auth.token
    return auth
  }

  function clearAuth(): void {
    clearStoredAuth()
    uid.value = ''
    token.value = ''
  }

  return {
    uid,
    token,
    nickname,
    avatar,
    initialized,
    currentProfile,
    nicknameMax: NICKNAME_MAX,
    setProfile,
    ensureAuth,
    clearAuth,
  }
})

<script setup lang="ts">
// 预设头像徽记：按字符串 id 渲染 12 个单色描边 SVG 之一
import { computed } from 'vue'
import { avatarById } from '@/assets/avatars'

const props = defineProps<{
  id: string
}>()

const path = computed(() => avatarById(props.id).path)
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="path" />
  </svg>
</template>

// 由 public/favicon.svg 与 public/share-cover.svg 生成各尺寸 PNG：node scripts/icons.mjs
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const root = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(root, '..', 'public')

const favicon = await readFile(path.join(pub, 'favicon.svg'))
const cover = await readFile(path.join(pub, 'share-cover.svg'))

const jobs = [
  ['favicon-32.png', favicon, 32],
  ['favicon-192.png', favicon, 192],
  ['apple-touch-icon.png', favicon, 180],
  ['share-cover.png', cover, 300],
  ['og-cover.png', cover, 600],
]

for (const [name, svg, size] of jobs) {
  await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(pub, name))
  console.log(`生成 ${name} ${size}×${size}`)
}

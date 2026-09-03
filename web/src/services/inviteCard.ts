// 邀请图片：房间码 + 二维码，微信里长按图片即可识别进房。
// 微信对未接入公众号 JS-SDK 的网页分享一律降级为纯链接，图片是个人开发者唯一稳定的传播载体。
import QRCode from 'qrcode'

export interface InviteCardInput {
  code: string
  url: string
  host: string
}

const W = 750
const H = 1000

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 生成邀请图片，返回 PNG data URL */
export async function renderInviteCard(input: InviteCardInput): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持生成图片')

  ctx.fillStyle = '#141019'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 250, 20, W / 2, 250, 420)
  glow.addColorStop(0, 'rgba(201,162,39,0.16)')
  glow.addColorStop(1, 'rgba(20,16,25,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, 620)

  ctx.strokeStyle = 'rgba(201,162,39,0.35)'
  ctx.lineWidth = 2
  roundRect(ctx, 24, 24, W - 48, H - 48, 20)
  ctx.stroke()

  const cover = await loadImage('/share-cover.png')
  if (cover) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(W / 2, 250, 150, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(cover, W / 2 - 150, 100, 300, 300)
    ctx.restore()
    ctx.strokeStyle = 'rgba(201,162,39,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(W / 2, 250, 152, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#EDE8F2'
  ctx.font = '600 34px "Noto Serif SC", "PingFang SC", "Microsoft YaHei", serif'
  ctx.fillText('邀请你来一局阿瓦隆', W / 2, 470)

  ctx.fillStyle = '#948AA6'
  ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('房 间 码', W / 2, 530)

  ctx.fillStyle = '#C9A227'
  ctx.font = '900 84px "Cinzel", "Times New Roman", serif'
  ctx.fillText(input.code.split('').join(' '), W / 2, 620)

  const qrSize = 220
  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, input.url, {
    width: qrSize,
    margin: 1,
    color: { dark: '#141019', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  })
  const qrX = W / 2 - qrSize / 2
  const qrY = 670
  ctx.fillStyle = '#FFFFFF'
  roundRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 16)
  ctx.fill()
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize)

  ctx.fillStyle = '#9B93AB'
  ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('长按识别二维码进入房间', W / 2, 940)
  ctx.fillStyle = '#5C5175'
  ctx.font = '20px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(input.host, W / 2, 972)

  return canvas.toDataURL('image/png')
}

/** 邀请文案：微信里粘贴后链接可点击 */
export function inviteText(code: string, url: string): string {
  return `来一局阿瓦隆！房间码 ${code}\n点开加入：${url}`
}

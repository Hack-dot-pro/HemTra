// P0-T5/T7: copy + nén tài nguyên user cung cấp. Chạy: node scripts/assets.mjs
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import sharp from 'sharp'

mkdirSync('src/assets', { recursive: true })
mkdirSync('public/icons', { recursive: true })

const copies = [
  ['Logo.png', 'src/assets/logo.png'],
  ['Favicon.png', 'src/assets/favicon.png'],
  ['background.png', 'src/assets/background.png'],
  ['chart 1.png', 'src/assets/chart-line.png'],
  ['chart 2.png', 'src/assets/chart-radial.png'],
  ['Favicon.png', 'public/favicon.png'],
]
for (const [from, to] of copies) copyFileSync(from, to)

// Nén ảnh nền: WebP (dùng chính) + PNG gốc (dự phòng) — dùng <picture>
await sharp('background.png').webp({ quality: 80 }).toFile('src/assets/background.webp')

const size = (f) => statSync(f).size
console.log('background.png:', size('src/assets/background.png'), 'bytes')
console.log('background.webp:', size('src/assets/background.webp'), 'bytes')

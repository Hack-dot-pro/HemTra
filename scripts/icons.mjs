// P0-T7: sinh icon PWA từ Favicon.png (1254x1254). Chạy: node scripts/icons.mjs
import sharp from 'sharp'

const SRC = 'src/assets/favicon.png'
const OUT = 'public/icons'

// Icon thường: resize trực tiếp (ảnh gốc đã vuông)
for (const size of [192, 512]) {
  await sharp(SRC).resize(size, size).png().toFile(`${OUT}/icon-${size}.png`)
  console.log(`icon-${size}.png OK`)
}

// Maskable: nội dung nằm trong safe zone — logo 72% giữa nền #1e8fe8
for (const size of [192, 512]) {
  const logo = await sharp(SRC)
    .resize(Math.round(size * 0.72), Math.round(size * 0.72))
    .png()
    .toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: '#1e8fe8' },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/icon-maskable-${size}.png`)
  console.log(`icon-maskable-${size}.png OK`)
}

// Apple touch: 180x180, nền trắng (iOS không hỗ trợ alpha tốt)
await sharp(SRC).resize(180, 180).flatten({ background: '#ffffff' }).png().toFile(`${OUT}/apple-touch-icon.png`)
console.log('apple-touch-icon.png OK')

// Run with:  npm run images   (after adding or replacing a photo in front/public/images)
//
// For every .jpg/.jpeg/.png under front/public/images:
//   - shrinks it to at most 1600px wide, in place (same name, so
//     recipes.image_path and CSS keep working)
//   - writes x.webp next to it; the server sends that to browsers that support
//     it (src/assets.js)
//   - writes 480px and 960px copies (x-480.jpg/.webp, x-960.jpg/.webp) for
//     srcset (src/assets.js), so small screens download small files
//
// Safe to run again: files that are already small with an up-to-date .webp are skipped.
// Restart the server afterwards so it sees the new files.
import sharp from 'sharp'
import { readdirSync, statSync, renameSync } from 'node:fs'
import { join, extname } from 'node:path'
import { publicPath, SIZES, LARGE_WIDTH, sizedName } from '../src/assets.js'

const imagesDir = join(publicPath, 'images')
const isCopy = (file) => new RegExp(`-(${SIZES.join('|')})\\.\\w+$`).test(file)
const sources = readdirSync(imagesDir, { recursive: true })
  .filter((file) => /\.(jpe?g|png)$/i.test(file) && !isCopy(file))

const newer = (a, b) => {
  try { return statSync(a).mtimeMs >= statSync(b).mtimeMs } catch { return false }
}

async function write(input, output, width) {
  // By width only, so x-480.jpg really is 480px wide (srcset's 480w says so)
  const image = sharp(input).rotate().resize({ width, withoutEnlargement: true })
  if (output.endsWith('.webp')) await image.webp({ quality: 64, effort: 6 }).toFile(output)
  else if (output.endsWith('.png')) await image.png({ compressionLevel: 9, palette: true }).toFile(output)
  else await image.jpeg({ quality: 76, mozjpeg: true }).toFile(output)
}

for (const file of sources) {
  const path = join(imagesDir, file)
  const ext = extname(path)
  const base = path.slice(0, -ext.length)
  const before = statSync(path).size
  const { width } = await sharp(path).metadata()

  const outputs = [`${base}.webp`, ...SIZES.flatMap((w) => [sizedName(path, w), `${base}-${w}.webp`])]
  if (width <= LARGE_WIDTH && outputs.every((out) => newer(out, path))) continue

  // Write to a temp file first: sharp can't read and write the same file.
  if (width > LARGE_WIDTH) {
    await write(path, `${base}.tmp${ext}`, LARGE_WIDTH)
    renameSync(`${base}.tmp${ext}`, path)
  }
  await write(path, `${base}.webp`, LARGE_WIDTH)
  for (const w of SIZES) {
    await write(path, sizedName(path, w), w)
    await write(path, `${base}-${w}.webp`, w)
  }
  const kb = (bytes) => `${Math.round(bytes / 1024)} KB`
  console.log(`${file}: ${kb(before)} -> ${kb(statSync(path).size)} (webp ${kb(statSync(`${base}.webp`).size)})`)
}

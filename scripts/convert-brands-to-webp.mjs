#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const brandsDir = path.resolve('public/brands')

async function convertOne(pngPath) {
  const src = path.resolve(brandsDir, pngPath)
  const dst = src.replace(/\.png$/i, '.webp')
  try {
    const img = sharp(src)
    // Logos: mejor webp lossless para mantener bordes nítidos
    const buf = await img.webp({ lossless: true, effort: 4 }).toBuffer()
    await fs.promises.writeFile(dst, buf)
    const sOld = (await fs.promises.stat(src)).size
    const sNew = (await fs.promises.stat(dst)).size
    console.log(`✓ ${path.basename(pngPath)} -> ${path.basename(dst)} ${(sOld/1024).toFixed(1)}KB → ${(sNew/1024).toFixed(1)}KB`)
  } catch (err) {
    console.error('x Failed for', pngPath, err?.message || err)
  }
}

async function main() {
  const files = await fs.promises.readdir(brandsDir)
  const pngs = files.filter(f => /\.png$/i.test(f))
  if (!pngs.length) {
    console.log('No PNGs found in', brandsDir)
    return
  }
  for (const f of pngs) {
    await convertOne(f)
  }
}

main().catch(err => { console.error(err); process.exit(1) })


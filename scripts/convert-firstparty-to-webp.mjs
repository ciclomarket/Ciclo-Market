#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const files = [
  'public/site-logo.png',
  'public/strava.png',
  'public/whatsapp.png',
  'public/call.png',
]

async function convert(srcPath) {
  const dstPath = srcPath.replace(/\.png$/i, '.webp')
  const img = sharp(srcPath)
  // Para iconos pequeños: webp lossless mantiene nitidez
  const buf = await img.webp({ lossless: true, effort: 4 }).toBuffer()
  await fs.promises.writeFile(dstPath, buf)
  const sOld = (await fs.promises.stat(srcPath)).size
  const sNew = (await fs.promises.stat(dstPath)).size
  console.log(`✓ ${path.basename(srcPath)} -> ${path.basename(dstPath)} ${(sOld/1024).toFixed(1)}KB → ${(sNew/1024).toFixed(1)}KB`)
}

async function main() {
  for (const f of files) {
    const full = path.resolve(f)
    if (!fs.existsSync(full)) { console.warn('skip (not found):', f); continue }
    await convert(full)
  }
}

main().catch(err => { console.error(err); process.exit(1) })


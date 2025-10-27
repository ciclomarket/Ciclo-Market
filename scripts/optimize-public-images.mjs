#!/usr/bin/env node
/**
 * Optimize images in public/ by generating WebP copies next to originals.
 * - Keeps originals (important for OG scrapers that may not support WebP).
 * - Skips small files and already-optimized/newer WebPs.
 * - Chooses quality based on size bucket.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const PUBLIC_DIR = path.join(ROOT, 'public')

async function tryImportSharp() {
  try {
    const mod = await import('sharp')
    return mod.default || mod
  } catch (err) {
    console.log('[optimize-images] sharp not installed. Skipping optimization.')
    console.log('  Hint: npm i -D sharp')
    return null
  }
}

function pickQuality(bytes) {
  // Heurística simple por tamaño del archivo de entrada
  if (bytes >= 3 * 1024 * 1024) return 70
  if (bytes >= 1024 * 1024) return 75
  return 80
}

function shouldSkipByName(name) {
  // No tocar assets OG por compatibilidad; sólo generamos .webp al lado
  // (no los renombramos ni destruimos)
  return false
}

async function* walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      yield* walk(p)
    } else {
      yield p
    }
  }
}

function isCandidate(file) {
  const ext = path.extname(file).toLowerCase()
  return ext === '.png' || ext === '.jpg' || ext === '.jpeg'
}

async function main() {
  const sharp = await tryImportSharp()
  if (!sharp) return
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.log('[optimize-images] public/ directory not found; nothing to do.')
    return
  }

  let converted = 0
  let skipped = 0
  for await (const file of walk(PUBLIC_DIR)) {
    if (!isCandidate(file)) continue
    if (shouldSkipByName(file)) { skipped++; continue }
    const stat = await fsp.stat(file)
    // Evitar trabajo en archivos chicos
    if (stat.size < 150 * 1024) { skipped++; continue }
    const out = file.replace(/\.[^.]+$/, '.webp')
    // Si el webp existe y es más nuevo y no más pesado, saltar
    if (fs.existsSync(out)) {
      try {
        const o = await fsp.stat(out)
        if (o.mtimeMs >= stat.mtimeMs && o.size <= stat.size) { skipped++; continue }
      } catch { /* ignore */ }
    }
    const q = pickQuality(stat.size)
    try {
      await sharp(file)
        // No forzamos resize aquí para no romper diseños; sólo cambiamos formato+calidad
        .webp({ quality: q, effort: 5 })
        .toFile(out)
      const newStat = await fsp.stat(out)
      console.log(`[optimize-images] ${path.relative(PUBLIC_DIR, file)} -> ${path.relative(PUBLIC_DIR, out)} (${(stat.size/1024).toFixed(0)}KB -> ${(newStat.size/1024).toFixed(0)}KB @q${q})`)
      converted++
    } catch (err) {
      console.warn(`[optimize-images] Failed on ${file}:`, err?.message || err)
      skipped++
    }
  }
  console.log(`[optimize-images] Done. Converted: ${converted}, Skipped: ${skipped}`)
}

main().catch((err) => {
  console.error('[optimize-images] Unexpected error:', err)
  process.exit(0)
})


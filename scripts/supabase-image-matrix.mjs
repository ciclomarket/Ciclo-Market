#!/usr/bin/env node

/**
 * Generate a quick matrix of Supabase Storage image URLs for manual regression checks.
 * Usage: node scripts/supabase-image-matrix.mjs <bucket/path/to/file.ext>
 *
 * Reads VITE_SUPABASE_URL or SUPABASE_URL from the environment.
 */

const [, , rawPath] = process.argv
if (!rawPath) {
  console.error('Usage: node scripts/supabase-image-matrix.mjs <bucket/path/to/file.ext>')
  process.exit(1)
}

const projectUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
if (!projectUrl) {
  console.error('Missing SUPABASE URL. Set VITE_SUPABASE_URL or SUPABASE_URL before running the script.')
  process.exit(1)
}

const trimmedPath = rawPath.replace(/^\/+/, '')
const baseObjectUrl = new URL(`/storage/v1/object/public/${trimmedPath}`, projectUrl).toString()
const baseRenderUrl = new URL(`/storage/v1/render/image/public/${trimmedPath}`, projectUrl).toString()

const variants = [
  ['Original object', baseObjectUrl],
  ['Width=320', `${baseRenderUrl}?width=320`],
  ['Width=320&format=jpg', `${baseRenderUrl}?width=320&format=jpeg`],
  ['Width=320&format=webp', `${baseRenderUrl}?width=320&format=webp`],
  ['Width=320&format=webp&quality=70', `${baseRenderUrl}?width=320&format=webp&quality=70`],
]

console.log('\nSupabase image variant URLs\n')
for (const [label, url] of variants) {
  console.log(`${label.padEnd(32)} ${url}`)
}
console.log('\nTip: paste each URL into Chrome, Firefox, and iOS Safari to confirm 200 responses.\n')

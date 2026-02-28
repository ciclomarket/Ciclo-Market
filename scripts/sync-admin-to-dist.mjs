import { cp, mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const srcDir = path.join(repoRoot, 'dist-admin')
const dstDir = path.join(repoRoot, 'dist', 'admin')

async function exists(dir) {
  try {
    const info = await stat(dir)
    return info.isDirectory()
  } catch {
    return false
  }
}

if (!(await exists(srcDir))) {
  console.error(`[sync-admin] missing ${srcDir}; run build:admin first`)
  process.exit(1)
}

await rm(dstDir, { recursive: true, force: true })
await mkdir(dstDir, { recursive: true })
await cp(srcDir, dstDir, { recursive: true })

console.log(`[sync-admin] copied ${srcDir} -> ${dstDir}`)


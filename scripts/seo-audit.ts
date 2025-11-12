#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

type AuditResult = { url: string; issues: string[]; warnings: string[] }

function parseCli(argv: string[]) {
  const directUrls: string[] = []
  const files: string[] = []
  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--file' || arg === '-f') {
      const filePath = argv[i + 1]
      if (!filePath) {
        throw new Error('Debes indicar un archivo después de --file')
      }
      files.push(filePath)
      i += 2
    } else {
      directUrls.push(arg)
      i += 1
    }
  }
  return { directUrls, files }
}

async function fetchHtml(url: string) {
  const response = await fetch(url, { redirect: 'manual' })
  return response
}

function extractCanonical(html: string) {
  const match = html.match(/<link[^>]*rel=["']?canonical["']?[^>]*>/i)
  if (!match) return null
  const hrefMatch = match[0].match(/href=["']([^"']+)["']/i)
  return hrefMatch ? hrefMatch[1].trim() : null
}

function extractMetaDescription(html: string) {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*>/i)
  if (!match) return null
  const contentMatch = match[0].match(/content=["']([\s\S]*?)["']/i)
  return contentMatch ? contentMatch[1].trim() : null
}

function extractJsonLdBlocks(html: string) {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  return scripts.map((match) => match[1].trim())
}

async function auditUrl(url: string): Promise<AuditResult> {
  const issues: string[] = []
  const warnings: string[] = []
  let response: Response

  try {
    response = await fetchHtml(url)
  } catch (error) {
    issues.push(`No se pudo obtener la página: ${(error as Error).message}`)
    return { url, issues, warnings }
  }

  if (response.status >= 300 && response.status < 400) {
    const locationHeader = response.headers.get('location')
    issues.push(`Respuesta ${response.status} con redirección a ${locationHeader ?? 'desconocida'}`)
    return { url, issues, warnings }
  }

  if (response.status !== 200) {
    issues.push(`Respuesta HTTP ${response.status}`)
    return { url, issues, warnings }
  }

  const html = await response.text()
  const canonicalHref = extractCanonical(html)
  if (!canonicalHref) {
    issues.push('Falta <link rel="canonical">')
  } else {
    try {
      const resolved = new URL(canonicalHref, url)
      if (resolved.hostname !== 'www.ciclomarket.ar') {
        issues.push(`Canonical apunta a un host no preferido: ${resolved.hostname}`)
      }
    } catch (error) {
      issues.push(`Canonical inválido (${(error as Error).message})`)
    }
  }

  const metaDescription = extractMetaDescription(html)
  if (!metaDescription) {
    issues.push('Falta meta description')
  } else if (metaDescription.length > 160) {
    issues.push(`Meta description supera 160 caracteres (${metaDescription.length})`)
  }

  const jsonLdBlocks = extractJsonLdBlocks(html)
  if (!jsonLdBlocks.length) {
    warnings.push('Sin JSON-LD detectado')
  } else {
    for (const block of jsonLdBlocks) {
      try {
        JSON.parse(block)
      } catch (error) {
        issues.push(`JSON-LD inválido: ${(error as Error).message}`)
        break
      }
    }
  }

  return { url, issues, warnings }
}

async function main() {
  const argv = process.argv.slice(2)
  const { directUrls, files } = parseCli(argv)
  const urls: string[] = [...directUrls]
  for (const filePath of files) {
    try {
      const content = await readFile(filePath, 'utf-8')
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      urls.push(...lines)
    } catch (error) {
      console.error(`No se pudo leer el archivo ${filePath}: ${(error as Error).message}`)
      process.exitCode = 1
    }
  }

  if (!urls.length) {
    console.error('Uso: npx ts-node --esm scripts/seo-audit.ts <url1> <url2> ... [--file lista.txt]')
    process.exit(1)
  }

  for (const rawUrl of urls) {
    let normalizedUrl = rawUrl
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`
    }
    let result: AuditResult
    try {
      result = await auditUrl(normalizedUrl)
    } catch (error) {
      console.log(`❌ ${normalizedUrl}`)
      console.log(`  - Error inesperado: ${(error as Error).message}`)
      continue
    }

    const statusEmoji = result.issues.length ? '❌' : '✅'
    console.log(`${statusEmoji} ${normalizedUrl}`)
    if (result.issues.length) {
      for (const issue of result.issues) {
        console.log(`  - ${issue}`)
      }
    } else {
      console.log('  - Canonical, meta description y JSON-LD OK')
    }
    for (const warning of result.warnings) {
      console.log(`  ▸ Aviso: ${warning}`)
    }
  }
}

await main().catch((error) => {
  console.error(`Error: ${(error as Error).message}`)
  process.exit(1)
})

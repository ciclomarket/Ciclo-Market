#!/usr/bin/env node
'use strict'

/**
 * Standalone CLI prototype.
 * Usage: node generate-post.js [output.png]
 */

const path = require('path')
const fs = require('fs')
const { renderListingCard } = require('../server/src/lib/instagramCard/render')

const data = require('./sample-listing.json')
const outPath = process.argv[2] || path.join(__dirname, 'preview-output.png')

async function main() {
  console.log('Rendering card…')
  const buffer = await renderListingCard(data)
  fs.writeFileSync(outPath, buffer)
  console.log(`Saved → ${outPath}  (${(buffer.length / 1024).toFixed(0)} KB)`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Failed:', err.message)
  process.exit(1)
})

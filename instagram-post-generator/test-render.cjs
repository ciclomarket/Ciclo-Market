#!/usr/bin/env node
'use strict'

const path = require('path')
const fs   = require('fs')
const { renderListingCard } = require('../server/src/lib/instagramCard/render')

const OUT = path.join(__dirname, 'test-output')

const cases = [
  {
    // Case 1 spec: Bianchi Impulso RC 2025, U$D 8.500, talle M
    name: '1-bianchi-impulso-usd',
    data: {
      brand: 'Bianchi', model: 'Impulso RC', year: 2025,
      category: 'Ruta', title: 'Bianchi Impulso RC 2025',
      price: 8500, currency: 'USD', size: 'M', imageUrl: null,
    },
  },
  {
    // Case 2 spec: S-Works Tarmac SL8 — brand >10 chars → 80px
    name: '2-sworks-tarmac-usd',
    data: {
      brand: 'Specialized', model: 'S-Works Tarmac SL8', year: 2025,
      category: 'Ruta', title: 'Specialized S-Works Tarmac SL8 2025',
      price: 9500, currency: 'USD', size: 'S', imageUrl: null,
    },
  },
  {
    // Case 3 spec: Cannondale Synapse Carbon Disc, $8.500.000 ARS, sin talle
    name: '3-cannondale-synapse-ars',
    data: {
      brand: 'Cannondale', model: 'Synapse Carbon Disc', year: null,
      category: 'Ruta', title: 'Cannondale Synapse Carbon Disc',
      price: 8500000, currency: 'ARS', size: null, imageUrl: null,
    },
  },
]

;(async () => {
  for (const { name, data } of cases) {
    process.stdout.write(`Rendering ${name}… `)
    try {
      const buf     = await renderListingCard(data)
      const outPath = path.join(OUT, `${name}.png`)
      fs.writeFileSync(outPath, buf)
      console.log(`✓  ${(buf.length / 1024).toFixed(0)} KB → ${outPath}`)
    } catch (err) {
      console.error(`✗  ${err.message}`)
    }
  }
  process.exit(0)
})()

#!/usr/bin/env node
'use strict'

const path = require('path')
const { renderListingCard } = require('../server/src/lib/instagramCard/render')
const fs = require('fs')

const OUT = path.join(__dirname, 'test-output')

const cases = [
  {
    name: '1-sworks-usd',
    data: {
      title: 'S-Works Tarmac SL8 2024',
      brand: 'Specialized',
      model: 'Tarmac SL8',
      year: 2024,
      category: 'Ruta',
      price: 9500,
      currency: 'USD',
      sellerName: 'Rodrigo Zalazar',
      imageUrl: null,
    },
  },
  {
    name: '2-long-title-ars',
    data: {
      title: 'Trek Marlin 7 Gen 3 – casi sin uso, full equipada lista para salir',
      brand: 'Trek',
      model: 'Marlin 7',
      year: 2023,
      category: 'MTB',
      price: 850000,
      currency: 'ARS',
      sellerName: 'Lucas Rodríguez',
      imageUrl: null,
    },
  },
  {
    name: '3-million-price-ars',
    data: {
      title: 'Canyon Aeroad CF SLX 9 Disc',
      brand: 'Canyon',
      model: 'Aeroad CF SLX',
      year: 2024,
      category: 'Ruta',
      price: 12500000,
      currency: 'ARS',
      sellerName: 'Ciclo Market Store',
      imageUrl: null,
    },
  },
]

;(async () => {
  for (const { name, data } of cases) {
    process.stdout.write(`Rendering ${name}… `)
    try {
      const buf = await renderListingCard(data)
      const outPath = path.join(OUT, `${name}.png`)
      fs.writeFileSync(outPath, buf)
      console.log(`✓  ${(buf.length / 1024).toFixed(0)} KB → ${outPath}`)
    } catch (err) {
      console.error(`✗  ${err.message}`)
    }
  }
  process.exit(0)
})()

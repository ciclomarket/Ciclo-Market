#!/usr/bin/env node
'use strict'

const path = require('path')
const fs   = require('fs')
const { renderListingCard } = require('../server/src/lib/instagramCard/render')

const OUT = path.join(__dirname, 'test-output-v2')
fs.mkdirSync(OUT, { recursive: true })

const cases = [
  {
    // Case 1: CUBE del screenshot actual — todos los campos presentes
    name: '1-cube-usd-full',
    data: {
      id:         '421bf143-7e2b-4293-aacd-290198094abb',
      brand:      'CUBE', model: 'C:62 One Elite', year: 2023,
      category:   'MTB',
      size:       'XL',
      drivetrain: 'SRAM GX Eagle',
      location:   'Córdoba',
      sellerName: 'Juan Ignacio Busso',
      price:      2000, currency: 'USD',
      imageUrl:   null,
    },
  },
  {
    // Case 2: sin drivetrain, sin location, sin seller, sin talle — todo opcional oculto
    name: '2-bianchi-minimal',
    data: {
      id:         'a1b2c3d4-0000-0000-0000-000000000001',
      brand:      'Bianchi', model: 'Impulso RC', year: 2025,
      category:   'Ruta',
      size:       null, drivetrain: null, location: null, sellerName: null,
      price:      8500, currency: 'USD',
      imageUrl:   null,
    },
  },
  {
    // Case 3: drivetrain largo — verificar ellipsis
    name: '3-canyon-long-drivetrain',
    data: {
      id:         'f9e8d7c6-1111-2222-3333-444455556666',
      brand:      'Canyon', model: 'Aeroad CF SLX', year: 2024,
      category:   'Ruta',
      size:       'M',
      drivetrain: 'Shimano Ultegra Di2 R8170 12s',
      location:   'Buenos Aires',
      sellerName: 'Rodrigo Zalazar',
      price:      12500000, currency: 'ARS',
      imageUrl:   null,
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

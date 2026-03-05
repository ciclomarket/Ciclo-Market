#!/usr/bin/env node
/**
 * Importar datos de MercadoLibre desde JSON a Supabase
 * Uso: node import-ml-json.js <archivo.json>
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parsePrice(priceStr) {
  // Limpiar precio: "3240000" → 3240000
  if (!priceStr) return 0;
  const clean = priceStr.replace(/[^\d]/g, '');
  return parseInt(clean) || 0;
}

function parseCurrency(currencyStr) {
  // "ARS $" → "ARS"
  if (!currencyStr) return 'ARS';
  if (currencyStr.includes('ARS')) return 'ARS';
  if (currencyStr.includes('USD')) return 'USD';
  return 'ARS';
}

async function importJSON(jsonFilePath) {
  console.log('📥 Importando datos de ML desde:', jsonFilePath);
  
  // Leer JSON
  const content = fs.readFileSync(jsonFilePath, 'utf-8');
  const items = JSON.parse(content);
  
  console.log(`Encontrados: ${items.length} items\n`);
  
  let imported = 0;
  let errors = 0;
  let skipped = 0;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Validar datos mínimos
    if (!item.SKU || !item.articuloTitulo || !item.nuevoPrecio) {
      console.log(`⚠️  Item ${i + 1}: Datos incompletos, saltando`);
      skipped++;
      continue;
    }
    
    const price = parsePrice(item.nuevoPrecio);
    if (price === 0) {
      console.log(`⚠️  Item ${i + 1}: Precio inválido "${item.nuevoPrecio}", saltando`);
      skipped++;
      continue;
    }
    
    // Preparar datos para price_listings
    const listingData = {
      source: 'mercadolibre',
      external_id: item.SKU,
      external_url: item.zdireccion || '',
      title: item.articuloTitulo,
      price: price,
      currency: parseCurrency(item.Moneda),
      condition: 'used', // Son bicis usadas
      status: 'active',
      listed_at: item.Tiempo || new Date().toISOString(),
      scraped_at: new Date().toISOString(),
      seller_type: item.Vendedor ? 'store' : 'individual',
      seller_id_external: item.Vendedor || null,
      raw_data: {
        vendedor: item.Vendedor,
        imagen: item.imgDireccion,
        envio: item.Envio,
        installments: item.installments,
        produtoCategoryID: item.produtoCategoryID,
        produtoDomainID: item.produtoDomainID
      }
    };
    
    // Insertar en Supabase
    const { error } = await supabase
      .from('price_listings')
      .upsert(listingData, {
        onConflict: 'source,external_id'
      });
    
    if (error) {
      console.error(`❌ Error ${item.SKU}:`, error.message);
      errors++;
    } else {
      imported++;
      process.stdout.write(`✅ ${i + 1}/${items.length}\r`);
    }
    
    // Pequeña pausa para no saturar
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('\n\n✅ Importación completada:');
  console.log(`   Importados: ${imported}`);
  console.log(`   Errores:    ${errors}`);
  console.log(`   Saltados:   ${skipped}`);
  console.log(`   Total:      ${items.length}`);
  
  // Mostrar total actual en DB
  const { count } = await supabase
    .from('price_listings')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'mercadolibre');
    
  console.log(`\n📊 Total de MercadoLibre en DB: ${count}`);
}

// Uso
const filePath = process.argv[2];
if (!filePath) {
  console.log('Uso: node import-ml-json.js <archivo.json>');
  console.log('Ejemplo: node import-ml-json.js ./ml-bicis.json');
  process.exit(1);
}

importJSON(filePath).catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Scraper de MercadoLibre - Versión Local
 * Corre esto desde tu máquina (IP residencial no bloqueada)
 * 
 * Pasos:
 * 1. cd /Users/timon/MundoBike
 * 2. npm install
 * 3. Crear .env con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 * 4. node scripts/scrape-ml-local.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 50;
const MAX_RESULTS = 1000;
const SITE_ID = 'MLA';

async function searchItems(offset = 0) {
  // Sin token, sin headers especiales - IP residencial debería funcionar
  const url = `https://api.mercadolibre.com/sites/${SITE_ID}/search?q=bicicleta&condition=used&limit=${BATCH_SIZE}&offset=${offset}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    console.error(`HTTP ${response.status}:`, await response.text());
    return null;
  }
  
  return response.json();
}

async function upsertListing(item) {
  const listingData = {
    source: 'mercadolibre',
    external_id: item.id,
    external_url: item.permalink,
    title: item.title,
    price: item.price,
    currency: item.currency_id || 'ARS',
    condition: item.condition === 'new' ? 'new' : 'used',
    listed_at: item.date_created,
    scraped_at: new Date().toISOString(),
    status: 'active',
    seller_type: item.official_store_id ? 'store' : 'individual',
    seller_id_external: item.seller?.id?.toString(),
    province: item.seller_address?.state?.name,
    city: item.seller_address?.city?.name,
    raw_data: {
      thumbnail: item.thumbnail,
      category_id: item.category_id,
      original_price: item.original_price,
      accepts_mercadopago: item.accepts_mercadopago
    }
  };
  
  const { error } = await supabase
    .from('price_listings')
    .upsert(listingData, { onConflict: 'source,external_id' });
    
  if (error) {
    console.error(`Error ${item.id}:`, error.message);
    return false;
  }
  
  return true;
}

async function main() {
  console.log('🚲 Scraper MercadoLibre - Modo Local\n');
  console.log('Conectando a Supabase...');
  
  // Test connection
  const { count, error } = await supabase
    .from('price_listings')
    .select('*', { count: 'exact', head: true });
    
  if (error) {
    console.error('❌ Error conectando a Supabase:', error.message);
    console.log('\nVerificá que el .env tenga:');
    console.log('SUPABASE_URL=https://tu-proyecto.supabase.co');
    console.log('SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key');
    process.exit(1);
  }
  
  console.log(`✅ Conectado. Hay ${count} listings en la DB.\n`);
  console.log(`Objetivo: Traer ${MAX_RESULTS} bicis usadas de MercadoLibre\n`);
  
  let total = 0;
  let inserted = 0;
  let updated = 0;
  let offset = 0;
  let page = 1;
  
  while (total < MAX_RESULTS && page <= 20) {
    console.log(`📄 Página ${page} (offset: ${offset})...`);
    
    const data = await searchItems(offset);
    
    if (!data || !data.results) {
      console.log('⚠️  Sin resultados o error');
      break;
    }
    
    console.log(`   API dice: ${data.paging?.total} total, ${data.results.length} en esta página`);
    
    if (data.results.length === 0) {
      console.log('⚠️  No hay más resultados');
      break;
    }
    
    // Procesar items
    let pageInserted = 0;
    let pageUpdated = 0;
    
    for (const item of data.results) {
      // Verificar si existe
      const { data: existing } = await supabase
        .from('price_listings')
        .select('id')
        .eq('source', 'mercadolibre')
        .eq('external_id', item.id)
        .maybeSingle();
      
      const success = await upsertListing(item);
      
      if (success) {
        if (existing) {
          pageUpdated++;
          updated++;
        } else {
          pageInserted++;
          inserted++;
        }
        total++;
      }
      
      // Pausa para no saturar
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`   ✅ Insertados: ${pageInserted}, Actualizados: ${pageUpdated}`);
    
    // Siguiente página
    offset += data.results.length;
    page++;
    
    // Pausa entre páginas
    if (total < MAX_RESULTS) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ SCRAPING COMPLETADO');
  console.log('='.repeat(50));
  console.log(`Insertados nuevos: ${inserted}`);
  console.log(`Actualizados:      ${updated}`);
  console.log(`Total procesados:  ${total}`);
  console.log('='.repeat(50));
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});

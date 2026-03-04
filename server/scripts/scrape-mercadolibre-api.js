#!/usr/bin/env node
/**
 * Scraper de MercadoLibre usando API oficial
 * Busca bicicletas usadas y las inserta en price_listings
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configuración
const BATCH_SIZE = 50; // ML permite máximo 50 por request
const MAX_RESULTS = 1000; // Total que queremos
const SITE_ID = 'MLA'; // Argentina

// Tokens de ML
let accessToken = process.env.MERCADOLIBRE_ACCESS_TOKEN;
const clientId = process.env.MELI_CLIENT_ID;
const clientSecret = process.env.MELI_CLIENT_SECRET;

/**
 * Renueva el access token si es necesario
 */
async function refreshAccessToken() {
  console.log('🔄 Renovando access token...');
  
  try {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      })
    });
    
    const data = await response.json();
    
    if (data.access_token) {
      accessToken = data.access_token;
      console.log('✅ Token renovado');
      return true;
    } else {
      console.error('❌ Error renovando token:', data);
      return false;
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

/**
 * Busca items en MercadoLibre
 */
async function searchItems(offset = 0) {
  // Búsqueda de bicicletas usadas
  // category MLB1055 = Bicicletas
  const url = `https://api.mercadolibre.com/sites/${SITE_ID}/search?` + new URLSearchParams({
    q: 'bicicleta',
    condition: 'used',
    category: 'MLB1055',
    limit: BATCH_SIZE.toString(),
    offset: offset.toString(),
    sort: 'relevance'
  });
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    // Si da 401, renovar token y reintentar
    if (response.status === 401) {
      console.log('Token expirado, renovando...');
      const renewed = await refreshAccessToken();
      if (renewed) {
        return searchItems(offset); // Reintentar
      }
      return null;
    }
    
    if (!response.ok) {
      console.error(`Error HTTP ${response.status}:`, await response.text());
      return null;
    }
    
    return await response.json();
    
  } catch (err) {
    console.error('Error en fetch:', err.message);
    return null;
  }
}

/**
 * Normaliza el estado de la bici
 */
function normalizeCondition(condition) {
  const map = {
    'new': 'new',
    'used': 'used',
    'not_specified': 'used'
  };
  return map[condition] || 'used';
}

/**
 * Inserta o actualiza un listing
 */
async function upsertListing(item) {
  const listingData = {
    source: 'mercadolibre',
    external_id: item.id,
    external_url: item.permalink,
    title: item.title,
    price: item.price,
    currency: item.currency_id || 'ARS',
    condition: normalizeCondition(item.condition),
    listed_at: item.date_created,
    scraped_at: new Date().toISOString(),
    status: item.status === 'active' ? 'active' : 'paused',
    seller_type: item.official_store_id ? 'store' : 'individual',
    seller_id_external: item.seller?.id?.toString(),
    seller_rating: item.seller?.power_seller_status ? 4.5 : null,
    images_count: item.pictures?.length || (item.thumbnail ? 1 : 0),
    raw_data: {
      thumbnail: item.thumbnail,
      category_id: item.category_id,
      original_price: item.original_price,
      accepts_mercadopago: item.accepts_mercadopago,
      shipping_free: item.shipping?.free_shipping,
      location: item.location
    }
  };
  
  // Agregar provincia/ciudad si existe
  if (item.seller_address) {
    listingData.province = item.seller_address.state?.name;
    listingData.city = item.seller_address.city?.name;
  }
  
  const { error } = await supabase
    .from('price_listings')
    .upsert(listingData, {
      onConflict: 'source,external_id'
    });
    
  if (error) {
    console.error(`Error insertando ${item.id}:`, error.message);
    return false;
  }
  
  return true;
}

/**
 * Función principal
 */
async function main() {
  console.log('🚲 Scraper de MercadoLibre API');
  console.log('================================');
  console.log(` objetivo: ${MAX_RESULTS} bicicletas usadas\n`);
  
  let totalInserted = 0;
  let totalUpdated = 0;
  let offset = 0;
  let hasMore = true;
  let page = 1;
  
  while (hasMore && offset < MAX_RESULTS) {
    console.log(`📄 Página ${page} (offset: ${offset})...`);
    
    const data = await searchItems(offset);
    
    if (!data || !data.results) {
      console.log('⚠️  No hay más resultados o error en la API');
      break;
    }
    
    const items = data.results;
    console.log(`   Encontrados: ${items.length} items`);
    
    if (items.length === 0) {
      hasMore = false;
      break;
    }
    
    // Procesar cada item
    let pageInserted = 0;
    let pageUpdated = 0;
    
    for (const item of items) {
      // Verificar si ya existe
      const { data: existing } = await supabase
        .from('price_listings')
        .select('id')
        .eq('source', 'mercadolibre')
        .eq('external_id', item.id)
        .maybeSingle();
      
      const success = await upsertListing(item);
      
      if (success) {
        if (existing) {
          totalUpdated++;
          pageUpdated++;
        } else {
          totalInserted++;
          pageInserted++;
        }
      }
      
      // Pequeña pausa para no sobrecargar
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`   ✅ Insertados: ${pageInserted}, Actualizados: ${pageUpdated}`);
    
    // Preparar siguiente página
    offset += items.length;
    page++;
    
    // Pausa entre páginas (rate limiting amigable)
    if (hasMore && offset < MAX_RESULTS) {
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Safety check
    if (page > 50) {
      console.log('⚠️  Límite de páginas alcanzado');
      break;
    }
  }
  
  console.log('\n✅ Scraping completado!');
  console.log(`   Total insertados: ${totalInserted}`);
  console.log(`   Total actualizados: ${totalUpdated}`);
  console.log(`   Total procesados: ${totalInserted + totalUpdated}`);
  
  // Mostrar estadísticas finales
  const { count: totalML } = await supabase
    .from('price_listings')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'mercadolibre');
    
  console.log(`\n📊 Total de MercadoLibre en DB: ${totalML}`);
}

// Ejecutar
main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});

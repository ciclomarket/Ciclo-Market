const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const accessToken = process.env.MERCADOLIBRE_ACCESS_TOKEN;

async function main() {
  console.log('Buscando bicis...');
  const res = await fetch('https://api.mercadolibre.com/sites/MLA/search?q=bicicleta&condition=used&limit=50', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await res.json();
  console.log('Encontradas:', data.results.length);
  
  for (const item of data.results) {
    await supabase.from('price_listings').upsert({
      source: 'mercadolibre',
      external_id: item.id,
      external_url: item.permalink,
      title: item.title,
      price: item.price,
      currency: item.currency_id || 'ARS',
      condition: 'used',
      scraped_at: new Date().toISOString(),
      status: 'active'
    }, { onConflict: 'source,external_id' });
  }
  console.log('Done!');
}
main();

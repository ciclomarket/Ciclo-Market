/**
 * Importar leads desde CSV (de MailerFind u otra fuente)
 * Formato esperado: nombre,email,instagram,telefono,categoria
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function importLeads(csvFilePath) {
  console.log('📥 Importando leads desde:', csvFilePath);
  
  // Leer CSV
  const content = fs.readFileSync(csvFilePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  // Parsear (asumiendo formato: nombre,email,instagram,telefono)
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  let imported = 0;
  let errors = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    
    const lead = {
      name: cols[0] || '',
      email: cols[1] || '',
      instagram: cols[2] || '',
      phone: cols[3] || '',
      source: 'mailerfind_import',
      status: 'new',
      tags: ['bicicleteria', 'lead_importado']
    };
    
    // Validar email
    if (!lead.email || !lead.email.includes('@')) {
      console.log(`⚠️  Fila ${i}: email inválido, saltando`);
      continue;
    }
    
    // Insertar en tabla leads (si existe) o crear tabla
    const { error } = await supabase
      .from('seller_leads')
      .upsert(lead, { onConflict: 'email' });
    
    if (error) {
      console.error(`❌ Error fila ${i}:`, error.message);
      errors++;
    } else {
      imported++;
    }
  }
  
  console.log(`\n✅ Importación completa:`);
  console.log(`   Importados: ${imported}`);
  console.log(`   Errores: ${errors}`);
}

// Uso: node import-leads-csv.js /ruta/al/archivo.csv
const filePath = process.argv[2];
if (!filePath) {
  console.log('Uso: node import-leads-csv.js <ruta-al-csv>');
  process.exit(1);
}

importLeads(filePath).catch(console.error);

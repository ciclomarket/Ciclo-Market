-- WhatsApp Cloud API Integration Tables
-- Ejecutar en Supabase SQL Editor

-- Tabla para almacenar conversaciones de WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  last_inbound_at TIMESTAMP WITH TIME ZONE,
  last_outbound_at TIMESTAMP WITH TIME ZONE,
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(seller_id)
);

-- Índices para whatsapp_conversations
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_seller ON whatsapp_conversations(seller_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_phone ON whatsapp_conversations(phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_inbound ON whatsapp_conversations(last_inbound_at);

-- Tabla para almacenar mensajes individuales
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_id TEXT, -- ID del mensaje de WhatsApp
  content TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para whatsapp_messages
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_seller ON whatsapp_messages(seller_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_timestamp ON whatsapp_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction ON whatsapp_messages(direction);

-- Agregar campo tags a seller_pipeline si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'seller_pipeline' AND column_name = 'tags'
  ) THEN
    ALTER TABLE seller_pipeline ADD COLUMN tags JSONB DEFAULT '[]';
  END IF;
END $$;

-- Vista para obtener conversaciones con info del seller
CREATE OR REPLACE VIEW admin_whatsapp_conversations AS
SELECT 
  wc.*,
  u.full_name as seller_name,
  u.store_name,
  u.store_enabled,
  cps.stage as current_stage,
  cps.score
FROM whatsapp_conversations wc
JOIN users u ON wc.seller_id = u.id
LEFT JOIN crm_seller_summary cps ON wc.seller_id = cps.seller_id;

-- Función para incrementar contador (usada en webhooks)
CREATE OR REPLACE FUNCTION increment(amount INTEGER DEFAULT 1)
RETURNS INTEGER AS $$
BEGIN
  RETURN amount;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_whatsapp_conversations_updated_at ON whatsapp_conversations;
CREATE TRIGGER update_whatsapp_conversations_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Políticas RLS para whatsapp_conversations
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all conversations" ON whatsapp_conversations;
CREATE POLICY "Admins can view all conversations"
  ON whatsapp_conversations
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  ));

DROP POLICY IF EXISTS "Admins can manage conversations" ON whatsapp_conversations;
CREATE POLICY "Admins can manage conversations"
  ON whatsapp_conversations
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  ));

-- Políticas RLS para whatsapp_messages
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all messages" ON whatsapp_messages;
CREATE POLICY "Admins can view all messages"
  ON whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  ));

DROP POLICY IF EXISTS "Admins can insert messages" ON whatsapp_messages;
CREATE POLICY "Admins can insert messages"
  ON whatsapp_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  ));

-- Comentarios para documentación
COMMENT ON TABLE whatsapp_conversations IS 'Conversaciones activas de WhatsApp por seller';
COMMENT ON TABLE whatsapp_messages IS 'Mensajes individuales de WhatsApp (inbound y outbound)';
COMMENT ON COLUMN whatsapp_conversations.unread_count IS 'Cantidad de mensajes no leídos por los admins';
COMMENT ON COLUMN whatsapp_messages.direction IS 'inbound: recibido, outbound: enviado';

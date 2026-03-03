-- Migration: Review reminders con delay de 60 minutos
-- Fecha: 2026-03-03
-- 
-- Cambios:
-- 1. Actualiza el trigger para que ready_at sea now() + 60 minutos
-- 2. Actualiza reminders existentes para que respeten el nuevo delay
-- 3. Agrega listing_id al contexto del reminder (ya existe en la tabla)

-- 1. Actualizar el trigger para usar delay de 60 minutos
CREATE OR REPLACE FUNCTION public.trg_contact_events_create_review_reminder()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_exists boolean;
  v_first_contact timestamptz;
  v_seller uuid;
  v_buyer uuid;
  v_listing uuid;
begin
  -- Solo procesar si hay buyer_id (usuario logueado)
  if new.buyer_id is null then
    return new;
  end if;

  -- Cast seguro de seller/buyer
  begin
    v_seller := new.seller_id::uuid;
    v_buyer := new.buyer_id::uuid;
  exception when others then
    return new;
  end;

  -- Cast seguro de listing_id
  begin
    v_listing := new.listing_id::uuid;
  exception when others then
    v_listing := null;
  end;

  -- Si ya existe reminder para este buyer/seller, no crear otro
  select exists(
    select 1 from public.review_reminders
    where seller_id = v_seller and buyer_id = v_buyer
  ) into v_exists;
  
  if v_exists then
    return new;
  end if;

  -- Buscar primer contacto entre estas partes
  select min(created_at) into v_first_contact
  from public.contact_events
  where seller_id::text = new.seller_id::text
    and buyer_id::text = new.buyer_id::text;

  if v_first_contact is null then
    v_first_contact := coalesce(new.created_at, now());
  end if;

  -- Crear reminder con ready_at = primer contacto + 60 minutos
  insert into public.review_reminders (
    seller_id, buyer_id, listing_id, contact_event_id, ready_at
  ) values (
    v_seller, v_buyer, v_listing, new.id, 
    v_first_contact + interval '60 minutes'
  )
  on conflict (seller_id, buyer_id) do nothing;

  return new;
end;
$$;

-- 2. Actualizar reminders existentes que aún no fueron enviados
-- y tienen ready_at en el pasado o inmediato
UPDATE public.review_reminders
SET ready_at = created_at + interval '60 minutes'
WHERE sent_email = false 
  AND sent_inapp = false
  AND ready_at < (now() + interval '60 minutes');

-- Comentario para documentar
COMMENT ON FUNCTION public.trg_contact_events_create_review_reminder() IS 
'Crea un review_reminder 60 minutos después del primer contacto entre buyer y seller. 
Si ya existe reminder para el par buyer/seller, no hace nada (una sola reseña por vendedor).';

-- Moderación server-side: bloquear teléfonos/whatsapp en descripciones, extras y preguntas
-- Ejecutar en el SQL Editor de Supabase

-- 1) Función que detecta patrones de teléfonos/whatsapp
create or replace function public.contains_phone_like(txt text)
returns boolean language plpgsql immutable
set search_path = public
as $$
declare
  t text := lower(coalesce(txt,''));
  digits int;
begin
  if t like '%wa.me/%' or t like '%whatsapp.com%' or t like '%whatsapp.me%' then
    return true;
  end if;
  -- contar dígitos en total (ignorando todo lo que no sea dígito)
  select length(regexp_replace(t, '\D', '', 'g')) into digits;
  -- Regla fuerte: 9–13 dígitos se consideran teléfono (bloquea casos "encriptados")
  if digits between 9 and 13 then
    return true;
  end if;
  -- Regla complementaria: patrón con separadores comunes
  if digits >= 8 and t ~ '(\+?\d{1,3}[\s-]*)?(\(?\d{2,4}\)?[\s-]*)?\d{3,4}[\s-]*\d{3,4}' then
    return true;
  end if;
  return false;
end;
$$;

-- 2) Trigger para listings (descripcion y extras)
create or replace function public.trg_listings_no_phones()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if public.contains_phone_like(new.description) or public.contains_phone_like(new.extras) then
    raise exception 'Por seguridad no se permiten teléfonos/WhatsApp en descripción o extras.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_listings_no_phones_biu') then
    execute 'create trigger trg_listings_no_phones_biu before insert or update on public.listings for each row execute function public.trg_listings_no_phones()';
  end if;
end $$;

-- 3) Trigger para preguntas (listing_questions.question_body, answer_body)
create or replace function public.trg_questions_no_phones()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if public.contains_phone_like(new.question_body) or public.contains_phone_like(new.answer_body) then
    raise exception 'Por seguridad no se permiten teléfonos/WhatsApp en preguntas o respuestas.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_questions_no_phones_biu') then
    execute 'create trigger trg_questions_no_phones_biu before insert or update on public.listing_questions for each row execute function public.trg_questions_no_phones()';
  end if;
end $$;

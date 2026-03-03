--
-- PostgreSQL database dump
--

\restrict 6EIbuhjUzzxbRx77x5zQp1e4apssMUi6DPNqGQ5iQoJ0RZUSKw5wQkIZrR1vb93

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: chat_thread_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.chat_thread_status AS ENUM (
    'open',
    'archived',
    'blocked'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'marketing',
    'chat',
    'offer',
    'system',
    'question'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'user',
    'moderator',
    'admin'
);


--
-- Name: admin_funnel_counts_compare(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_funnel_counts_compare(p_days integer DEFAULT 30) RETURNS TABLE(site_views_current integer, site_views_prev integer, listing_views_current integer, listing_views_prev integer, contact_intent_current integer, contact_intent_prev integer, contact_logged_current integer, contact_logged_prev integer, sale_confirmed_current integer, sale_confirmed_prev integer)
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_days int := greatest(coalesce(p_days, 30), 1);
begin
  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('moderator', 'admin')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with bounds as (
    select
      date_trunc('day', now()) as today,
      (date_trunc('day', now()) - make_interval(days => v_days)) as cur_from,
      (date_trunc('day', now()) - make_interval(days => v_days * 2)) as prev_from
  ),
  events_sum as (
    select
      sum(case when e.type = 'site_view' and e.day >= b.cur_from then e.total else 0 end)::int as site_cur,
      sum(case when e.type = 'site_view' and e.day >= b.prev_from and e.day < b.cur_from then e.total else 0 end)::int as site_prev,
      sum(case when e.type = 'listing_view' and e.day >= b.cur_from then e.total else 0 end)::int as listing_cur,
      sum(case when e.type = 'listing_view' and e.day >= b.prev_from and e.day < b.cur_from then e.total else 0 end)::int as listing_prev
    from public.admin_events_daily e
    cross join bounds b
    where e.day >= (select prev_from from bounds)
      and e.type in ('site_view','listing_view')
  ),
  contacts_sum as (
    select
      count(*) filter (where ce.created_at >= b.cur_from)::int as contact_cur,
      count(*) filter (where ce.created_at >= b.prev_from and ce.created_at < b.cur_from)::int as contact_prev
    from public.contact_events_enriched ce
    cross join bounds b
    where ce.type in ('whatsapp','email')
      and ce.created_at >= (select prev_from from bounds)
  ),
  sales_sum as (
    select
      count(*) filter (where s.confirmed = true and s.created_at >= b.cur_from)::int as sold_cur,
      count(*) filter (where s.confirmed = true and s.created_at >= b.prev_from and s.created_at < b.cur_from)::int as sold_prev
    from public.seller_sale_confirmations s
    cross join bounds b
    where s.created_at >= (select prev_from from bounds)
  )
  select
    coalesce(es.site_cur, 0) as site_views_current,
    coalesce(es.site_prev, 0) as site_views_prev,
    coalesce(es.listing_cur, 0) as listing_views_current,
    coalesce(es.listing_prev, 0) as listing_views_prev,
    coalesce(cs.contact_cur, 0) as contact_intent_current,
    coalesce(cs.contact_prev, 0) as contact_intent_prev,
    coalesce(cs.contact_cur, 0) as contact_logged_current,
    coalesce(cs.contact_prev, 0) as contact_logged_prev,
    coalesce(ss.sold_cur, 0) as sale_confirmed_current,
    coalesce(ss.sold_prev, 0) as sale_confirmed_prev
  from events_sum es
  cross join contacts_sum cs
  cross join sales_sum ss;
end;
$$;


--
-- Name: FUNCTION admin_funnel_counts_compare(p_days integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_funnel_counts_compare(p_days integer) IS 'Returns funnel counts for last N days vs previous N days. Uses admin_events_daily + contact_events_enriched + seller_sale_confirmations. Restricted to moderator/admin.';


--
-- Name: admin_get_my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_get_my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (
      select ur.role
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role in ('admin', 'moderator')
      order by case when ur.role = 'admin' then 0 else 1 end
      limit 1
    ),
    'user'
  );
$$;


--
-- Name: FUNCTION admin_get_my_role(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_get_my_role() IS 'Returns current user role for Admin SPA (admin|moderator|user) without exposing user_roles rows. Intended for UI gating only.';


--
-- Name: admin_store_checkouts_compare(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_store_checkouts_compare(p_seller_id uuid, p_days integer DEFAULT 30) RETURNS TABLE(current_count integer, previous_count integer)
    LANGUAGE sql STABLE
    AS $$
  with base as (
    select p.created_at
    from public.admin_payments_enriched p
    join public.listings l on l.id = p.listing_id
    where p.payment_status = 'succeeded'
      and l.seller_id = p_seller_id
      and p.created_at >= (now() - make_interval(days => greatest(p_days, 1) * 2))
  )
  select
    count(*) filter (where created_at >= (now() - make_interval(days => greatest(p_days, 1))))::integer as current_count,
    count(*) filter (
      where created_at < (now() - make_interval(days => greatest(p_days, 1)))
        and created_at >= (now() - make_interval(days => greatest(p_days, 1) * 2))
    )::integer as previous_count
  from base;
$$;


--
-- Name: FUNCTION admin_store_checkouts_compare(p_seller_id uuid, p_days integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_store_checkouts_compare(p_seller_id uuid, p_days integer) IS 'Returns succeeded checkout counts for a seller_id in the last N days vs the previous N days. Uses admin_payments_enriched + listings join to avoid client-side IN(listingIds).';


--
-- Name: contains_phone_like(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.contains_phone_like(txt text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    brand text NOT NULL,
    model text NOT NULL,
    year integer,
    category text NOT NULL,
    price numeric NOT NULL,
    price_currency text,
    original_price numeric,
    location text,
    description text,
    images text[] DEFAULT '{}'::text[],
    seller_id uuid NOT NULL,
    seller_name text,
    seller_plan text,
    seller_plan_expires timestamp with time zone,
    seller_location text,
    seller_whatsapp text,
    seller_avatar text,
    material text,
    frame_size text,
    drivetrain text,
    drivetrain_detail text,
    wheelset text,
    wheel_size text,
    extras text,
    plan text,
    created_at timestamp with time zone DEFAULT now(),
    slug text,
    plan_code text,
    plan_price numeric,
    plan_photo_limit integer,
    featured_until timestamp with time zone,
    seo_boost boolean DEFAULT false,
    whatsapp_enabled boolean DEFAULT false,
    social_boost boolean DEFAULT false,
    expires_at timestamp with time zone,
    status text DEFAULT 'draft'::text,
    contact_methods text[] DEFAULT ARRAY['email'::text, 'chat'::text],
    renewal_notified_at timestamp with time zone,
    moderation_state text DEFAULT 'approved'::text NOT NULL,
    moderated_by uuid,
    moderated_at timestamp with time zone,
    archived_at timestamp with time zone,
    archived_by uuid,
    seller_email text,
    subcategory text,
    highlight_expires timestamp with time zone,
    granted_visible_photos integer DEFAULT 4 NOT NULL,
    whatsapp_cap_granted boolean DEFAULT false NOT NULL,
    rank_boost_until timestamp with time zone,
    visible_images_count integer DEFAULT 4 NOT NULL,
    whatsapp_user_disabled boolean DEFAULT false NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT listings_images_limit CHECK (((images IS NULL) OR (array_length(images, 1) <= 12))),
    CONSTRAINT listings_moderation_state_check CHECK ((moderation_state = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: COLUMN listings.granted_visible_photos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.granted_visible_photos IS 'Persistent per-listing capacity of visible photos (4 default, 8 after premium). Never decreases.';


--
-- Name: COLUMN listings.whatsapp_cap_granted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.whatsapp_cap_granted IS 'Permanent right to enable WhatsApp for this listing (granted by premium once).';


--
-- Name: COLUMN listings.rank_boost_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.rank_boost_until IS 'Temporal rank boost expiration (premium priority window).';


--
-- Name: COLUMN listings.visible_images_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.visible_images_count IS 'How many images to show (UI/editor). Public display derives 4/8 by boost; this feeds My Listings view.';


--
-- Name: COLUMN listings.whatsapp_user_disabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.listings.whatsapp_user_disabled IS 'If true, seller explicitly disabled WhatsApp; upgrades must not force-enable.';


--
-- Name: admin_store_active_listings; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_store_active_listings WITH (security_invoker='true') AS
 SELECT seller_id,
    (count(*))::integer AS active_count
   FROM public.listings l
  WHERE ((seller_id IS NOT NULL) AND (archived_at IS NULL) AND ((expires_at IS NULL) OR (expires_at > now())) AND ((status IS NULL) OR (lower(status) = ANY (ARRAY['active'::text, 'published'::text]))) AND (COALESCE(lower(moderation_state), 'approved'::text) = 'approved'::text))
  GROUP BY seller_id;


--
-- Name: VIEW admin_store_active_listings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.admin_store_active_listings IS 'Active listings count per seller_id for admin dashboards. Definition: not archived, not expired, approved moderation, status active/published (null treated as legacy active).';


--
-- Name: contact_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id text NOT NULL,
    buyer_id text,
    listing_id text,
    type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_events_type_check CHECK ((type = ANY (ARRAY['whatsapp'::text, 'email'::text])))
);

ALTER TABLE ONLY public.contact_events FORCE ROW LEVEL SECURITY;


--
-- Name: seller_comm_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_comm_prefs (
    seller_id uuid NOT NULL,
    whatsapp_opt_out boolean DEFAULT false NOT NULL,
    email_opt_out boolean DEFAULT false NOT NULL,
    cooldown_until timestamp with time zone,
    last_contacted_at timestamp with time zone
);


--
-- Name: seller_outreach; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_outreach (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    listing_id uuid,
    channel text NOT NULL,
    template_key text,
    message_preview text,
    status text DEFAULT 'queued'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT seller_outreach_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text]))),
    CONSTRAINT seller_outreach_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'replied'::text, 'stop'::text])))
);


--
-- Name: seller_pipeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_pipeline (
    seller_id uuid NOT NULL,
    stage text DEFAULT 'active'::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    owner_admin_user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    username text,
    full_name text,
    province text,
    city text,
    bike_preferences text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    avatar_url text,
    profile_slug text,
    preferred_bike text,
    instagram_handle text,
    facebook_handle text,
    website_url text,
    verified boolean DEFAULT false NOT NULL,
    whatsapp_number text,
    store_enabled boolean DEFAULT false,
    store_name text,
    store_slug text,
    store_address text,
    store_phone text,
    store_instagram text,
    store_facebook text,
    store_website text,
    store_banner_url text,
    store_avatar_url text,
    store_banner_position_y numeric DEFAULT 50,
    bio text,
    store_hours text,
    store_lat double precision,
    store_lon double precision,
    CONSTRAINT users_store_slug_lower_chk CHECK (((store_slug IS NULL) OR (store_slug = lower(store_slug))))
);

ALTER TABLE ONLY public.users FORCE ROW LEVEL SECURITY;


--
-- Name: crm_seller_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.crm_seller_summary WITH (security_invoker='true') AS
 WITH active_listings AS (
         SELECT admin_store_active_listings.seller_id,
            admin_store_active_listings.active_count
           FROM public.admin_store_active_listings
        ), last_contact AS (
         SELECT
                CASE
                    WHEN (ce.seller_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text) THEN (ce.seller_id)::uuid
                    ELSE NULL::uuid
                END AS seller_id,
            max(ce.created_at) AS last_lead_at,
            (array_agg(
                CASE
                    WHEN ((ce.listing_id IS NOT NULL) AND (ce.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text)) THEN (ce.listing_id)::uuid
                    ELSE NULL::uuid
                END ORDER BY ce.created_at DESC) FILTER (WHERE (ce.listing_id IS NOT NULL)))[1] AS last_lead_listing_id,
            (count(*) FILTER (WHERE ((ce.type = 'whatsapp'::text) AND (ce.created_at >= (now() - '7 days'::interval)))))::integer AS wa_contacts_7d,
            (count(*) FILTER (WHERE ((ce.type = 'whatsapp'::text) AND (ce.created_at >= (now() - '30 days'::interval)))))::integer AS wa_contacts_30d,
            (count(*) FILTER (WHERE (ce.created_at >= (now() - '7 days'::interval))))::integer AS contacts_total_7d,
            (count(*) FILTER (WHERE (ce.created_at >= (now() - '30 days'::interval))))::integer AS contacts_total_30d,
            (count(*) FILTER (WHERE ((ce.type = 'email'::text) AND (ce.created_at >= (now() - '7 days'::interval)))))::integer AS email_contacts_7d,
            (count(*) FILTER (WHERE ((ce.type = 'email'::text) AND (ce.created_at >= (now() - '30 days'::interval)))))::integer AS email_contacts_30d
           FROM public.contact_events ce
          GROUP BY
                CASE
                    WHEN (ce.seller_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text) THEN (ce.seller_id)::uuid
                    ELSE NULL::uuid
                END
        ), last_outreach AS (
         SELECT o.seller_id,
            max(COALESCE(o.sent_at, o.created_at)) AS last_outreach_at
           FROM public.seller_outreach o
          GROUP BY o.seller_id
        )
 SELECT u.id AS seller_id,
    COALESCE(NULLIF(u.full_name, ''::text), NULLIF(u.store_name, ''::text), NULLIF(split_part(u.email, '@'::text, 1), ''::text), 'Seller'::text) AS seller_name,
    u.email,
    u.whatsapp_number,
    COALESCE(u.store_enabled, false) AS is_store,
    u.city,
    u.province,
    COALESCE(al.active_count, 0) AS active_listings_count,
    COALESCE(lc.wa_contacts_7d, 0) AS wa_clicks_7d,
    COALESCE(lc.wa_contacts_30d, 0) AS wa_clicks_30d,
    lc.last_lead_at,
    lo.last_outreach_at,
    COALESCE(p.stage, 'active'::text) AS stage,
    COALESCE(p.priority, 0) AS priority,
    p.owner_admin_user_id,
    COALESCE(cp.whatsapp_opt_out, false) AS whatsapp_opt_out,
    COALESCE(cp.email_opt_out, false) AS email_opt_out,
    cp.cooldown_until,
    cp.last_contacted_at,
    (((((COALESCE(p.priority, 0) * 100) + (LEAST(COALESCE(lc.wa_contacts_7d, 0), 5000) / 10)) + (COALESCE(al.active_count, 0) * 10)) -
        CASE
            WHEN (COALESCE(cp.whatsapp_opt_out, false) OR COALESCE(cp.email_opt_out, false)) THEN 500
            ELSE 0
        END) -
        CASE
            WHEN ((cp.cooldown_until IS NOT NULL) AND (cp.cooldown_until > now())) THEN 250
            ELSE 0
        END) AS score,
    COALESCE(lc.contacts_total_7d, 0) AS contacts_total_7d,
    COALESCE(lc.contacts_total_30d, 0) AS contacts_total_30d,
    COALESCE(lc.email_contacts_7d, 0) AS email_contacts_7d,
    COALESCE(lc.email_contacts_30d, 0) AS email_contacts_30d,
    lc.last_lead_listing_id,
    l.slug AS last_lead_listing_slug,
    l.title AS last_lead_listing_title
   FROM ((((((public.users u
     LEFT JOIN active_listings al ON ((al.seller_id = u.id)))
     LEFT JOIN last_contact lc ON ((lc.seller_id = u.id)))
     LEFT JOIN public.listings l ON ((l.id = lc.last_lead_listing_id)))
     LEFT JOIN last_outreach lo ON ((lo.seller_id = u.id)))
     LEFT JOIN public.seller_pipeline p ON ((p.seller_id = u.id)))
     LEFT JOIN public.seller_comm_prefs cp ON ((cp.seller_id = u.id)))
  WHERE ((COALESCE(u.store_enabled, false) = true) OR (COALESCE(al.active_count, 0) > 0) OR (p.seller_id IS NOT NULL));


--
-- Name: VIEW crm_seller_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.crm_seller_summary IS 'Seller Ops Console summary: users + contacts (contact_events) + active listings + last outreach + pipeline/prefs, with a simple score for ranking.';


--
-- Name: crm_fetch_seller_inbox(jsonb, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_fetch_seller_inbox(p_filters jsonb DEFAULT '{}'::jsonb, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25, p_sort text DEFAULT 'score_desc'::text) RETURNS SETOF public.crm_seller_summary
    LANGUAGE plpgsql STABLE
    AS $_$
declare
  v_is_store boolean;
  v_stage text;
  v_opted_out boolean;
  v_cooldown_active boolean;
  v_active_only boolean;
  v_min_score int;
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_page_size int := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_offset int;
  v_txt text;
  v_sort text := lower(coalesce(nullif(p_sort, ''), 'score_desc'));
begin
  -- Authorization: moderators/admin only
  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('moderator', 'admin')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  -- is_store (boolean)
  v_txt := nullif(p_filters->>'is_store', '');
  if v_txt is not null then
    if lower(v_txt) in ('true', 'false') then
      v_is_store := (lower(v_txt) = 'true');
    end if;
  end if;

  -- stage (text)
  v_stage := nullif(p_filters->>'stage', '');

  -- opted_out (boolean) -> whatsapp_opt_out
  v_txt := nullif(p_filters->>'opted_out', '');
  if v_txt is not null then
    if lower(v_txt) in ('true', 'false') then
      v_opted_out := (lower(v_txt) = 'true');
    end if;
  end if;

  -- cooldown_active (boolean) -> cooldown_until > now()
  v_txt := nullif(p_filters->>'cooldown_active', '');
  if v_txt is not null then
    if lower(v_txt) in ('true', 'false') then
      v_cooldown_active := (lower(v_txt) = 'true');
    end if;
  end if;

  -- active_only (boolean) -> active_listings_count > 0
  v_txt := nullif(p_filters->>'active_only', '');
  if v_txt is not null then
    if lower(v_txt) in ('true', 'false') then
      v_active_only := (lower(v_txt) = 'true');
    end if;
  end if;

  -- min_score (int)
  v_txt := nullif(p_filters->>'min_score', '');
  if v_txt is not null and v_txt ~ '^-?\d+$' then
    v_min_score := v_txt::int;
  end if;

  if v_sort = 'contacts_30d_asc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.contacts_total_30d asc nulls last, s.score desc
    offset v_offset
    limit v_page_size;
  elsif v_sort = 'contacts_30d_desc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.contacts_total_30d desc nulls last, s.score desc
    offset v_offset
    limit v_page_size;
  elsif v_sort = 'email_30d_asc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.email_contacts_30d asc nulls last, s.score desc
    offset v_offset
    limit v_page_size;
  elsif v_sort = 'email_30d_desc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.email_contacts_30d desc nulls last, s.score desc
    offset v_offset
    limit v_page_size;
  elsif v_sort = 'wa_30d_asc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.wa_clicks_30d asc nulls last, s.score desc
    offset v_offset
    limit v_page_size;
  elsif v_sort = 'wa_30d_desc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.wa_clicks_30d desc nulls last, s.score desc
    offset v_offset
    limit v_page_size;
  elsif v_sort = 'active_listings_asc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.active_listings_count asc nulls last, s.score desc
    offset v_offset
    limit v_page_size;
  elsif v_sort = 'active_listings_desc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.active_listings_count desc nulls last, s.score desc
    offset v_offset
    limit v_page_size;
  elsif v_sort = 'last_lead_asc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.last_lead_at asc nulls last, s.score desc
    offset v_offset
    limit v_page_size;
  elsif v_sort = 'last_lead_desc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.last_lead_at desc nulls last, s.score desc
    offset v_offset
    limit v_page_size;
  elsif v_sort = 'score_asc' then
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.score asc
    offset v_offset
    limit v_page_size;
  else
    return query
    select s.*
    from public.crm_seller_summary s
    where (v_is_store is null or s.is_store = v_is_store)
      and (v_stage is null or s.stage = v_stage)
      and (v_opted_out is null or s.whatsapp_opt_out = v_opted_out)
      and (
        v_cooldown_active is null
        or ((s.cooldown_until is not null and s.cooldown_until > now()) = v_cooldown_active)
      )
      and (coalesce(v_active_only, false) = false or s.active_listings_count > 0)
      and (v_min_score is null or s.score >= v_min_score)
    order by s.score desc
    offset v_offset
    limit v_page_size;
  end if;
end;
$_$;


--
-- Name: FUNCTION crm_fetch_seller_inbox(p_filters jsonb, p_page integer, p_page_size integer, p_sort text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.crm_fetch_seller_inbox(p_filters jsonb, p_page integer, p_page_size integer, p_sort text) IS 'Fetches Seller Ops Action Inbox rows from crm_seller_summary with server-side filters + pagination + sorting. Restricted to moderator/admin.';


--
-- Name: crm_log_whatsapp_outreach(uuid, text, uuid, uuid, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_log_whatsapp_outreach(p_seller_id uuid, p_message_preview text, p_listing_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid, p_meta jsonb DEFAULT '{}'::jsonb, p_cooldown_days integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
declare
  v_id uuid;
  v_now timestamptz := now();
  v_opt_out boolean := false;
begin
  -- Authorization: moderators/admin only
  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('moderator', 'admin')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_seller_id is null then
    raise exception 'seller_id_required' using errcode = '22023';
  end if;

  -- Guardrail: respect explicit opt-out (compliance).
  select coalesce(cp.whatsapp_opt_out, false)
  into v_opt_out
  from public.seller_comm_prefs cp
  where cp.seller_id = p_seller_id;

  if v_opt_out then
    raise exception 'whatsapp_opt_out' using errcode = '42501';
  end if;

  insert into public.seller_outreach (
    seller_id,
    listing_id,
    channel,
    template_key,
    message_preview,
    status,
    created_by,
    created_at,
    sent_at,
    meta
  ) values (
    p_seller_id,
    p_listing_id,
    'whatsapp',
    null,
    nullif(left(trim(coalesce(p_message_preview, '')), 280), ''),
    'sent',
    p_created_by,
    v_now,
    v_now,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_id;

  -- Keep last_contacted_at, but do NOT set cooldown.
  insert into public.seller_comm_prefs (seller_id, last_contacted_at, cooldown_until)
  values (p_seller_id, v_now, null)
  on conflict (seller_id) do update
  set last_contacted_at = excluded.last_contacted_at;

  return v_id;
end;
$$;


--
-- Name: FUNCTION crm_log_whatsapp_outreach(p_seller_id uuid, p_message_preview text, p_listing_id uuid, p_created_by uuid, p_meta jsonb, p_cooldown_days integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.crm_log_whatsapp_outreach(p_seller_id uuid, p_message_preview text, p_listing_id uuid, p_created_by uuid, p_meta jsonb, p_cooldown_days integer) IS 'Logs a WhatsApp outreach (seller_outreach) and updates last_contacted_at. Cooldown is disabled; still respects whatsapp_opt_out. Restricted to moderator/admin.';


--
-- Name: decrement_gift_uses(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_gift_uses(p_code text) RETURNS void
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$ UPDATE gift_codes SET uses_left = GREATEST(uses_left - 1, 0) WHERE code = p_code; $$;


--
-- Name: enforce_free_listing_expiry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_free_listing_expiry() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_code text;
  v_min_expiry timestamptz;
begin
  -- ignorar borradas/archivadas
  if new.status is not null and lower(trim(new.status::text)) in ('deleted','archived') then
    return new;
  end if;

  -- resolver plan
  v_code := coalesce(
    lower(trim(new.plan_code)),
    lower(trim(new.plan)),
    lower(trim(new.seller_plan))
  );

  if v_code = 'free' then
    v_min_expiry := (now() at time zone 'utc') + interval '15 days';

    -- si no tenía fecha o quedó por debajo del mínimo, ajustar
    if new.expires_at is null or new.expires_at < v_min_expiry then
      new.expires_at := v_min_expiry;
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: fn_add_participant_on_listing(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_add_participant_on_listing() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_sweep public.sweepstakes;
begin
  select *
  into v_sweep
  from public.sweepstakes
  where now() between start_at and end_at
  order by start_at asc
  limit 1;

  if not found then
    return new;
  end if;

  if new.seller_id is null then
    return new;
  end if;

  insert into public.sweepstakes_participants (sweepstake_id, user_id, first_listing_id)
  values (v_sweep.id, new.seller_id, new.id)
  on conflict (sweepstake_id, user_id) do update
    set first_listing_id = public.sweepstakes_participants.first_listing_id;

  return new;
end;
$$;


--
-- Name: fn_increment_listing_view_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_increment_listing_view_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.listings
  set view_count = view_count + 1
  where id = new.listing_id;
  return new;
end;
$$;


--
-- Name: generate_listing_slug(text, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_listing_slug(p_title text, p_model text, p_year integer, p_exclude_id text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  base text;
  candidate text;
  counter int := 2;
  exists_slug boolean := true;
begin
  base := coalesce(public.to_slug(trim(coalesce(p_title,'')||' '||coalesce(p_model,'')||' '||coalesce(p_year::text,''))), 'listing');
  base := left(base, 80); -- limitar longitud base
  candidate := base;

  while exists_slug loop
    select exists(
      select 1 from public.listings
      where slug = candidate and (p_exclude_id is null or id::text <> p_exclude_id)
    ) into exists_slug;
    if exists_slug then
      candidate := left(base || '-' || counter::text, 96);
      counter := counter + 1;
    end if;
  end loop;
  return candidate;
end;
$$;


--
-- Name: generate_store_weekly_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_store_weekly_summary(store_user_id uuid) RETURNS TABLE(total_views bigint, total_contacts bigint, new_listings bigint, top_listing_title text, top_listing_views bigint, week_start date, week_end date)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  week_start_date DATE;
  week_end_date DATE;
BEGIN
  -- Calcular rango de la semana pasada (lunes a domingo)
  week_end_date := CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER;
  week_start_date := week_end_date - 6;
  
  RETURN QUERY
  WITH weekly_stats AS (
    SELECT 
      COALESCE(SUM(CASE WHEN e.event_type = 'listing_view' THEN 1 ELSE 0 END), 0) as views,
      COALESCE(SUM(CASE WHEN e.event_type = 'contact_seller' THEN 1 ELSE 0 END), 0) as contacts
    FROM events e
    WHERE e.user_id = store_user_id
      AND e.created_at >= week_start_date
      AND e.created_at < week_end_date + 1
  ),
  new_listings_count AS (
    SELECT COUNT(*) as count
    FROM listings l
    WHERE l.seller_id = store_user_id
      AND l.created_at >= week_start_date
      AND l.created_at < week_end_date + 1
  ),
  top_listing AS (
    SELECT 
      l.title,
      COALESCE(l.view_count, 0) as views
    FROM listings l
    WHERE l.seller_id = store_user_id
      AND l.status = 'active'
    ORDER BY l.view_count DESC NULLS LAST
    LIMIT 1
  )
  SELECT 
    ws.views,
    ws.contacts,
    nlc.count,
    COALESCE(tl.title, 'Sin publicaciones'),
    COALESCE(tl.views, 0),
    week_start_date,
    week_end_date
  FROM weekly_stats ws
  CROSS JOIN new_listings_count nlc
  CROSS JOIN top_listing tl;
END;
$$;


--
-- Name: FUNCTION generate_store_weekly_summary(store_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.generate_store_weekly_summary(store_user_id uuid) IS 'Genera estadísticas semanales para una tienda específica';


--
-- Name: get_conversion_funnel(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_conversion_funnel(p_period text) RETURNS TABLE(views bigint, inquiries bigint, whatsapp_clicks bigint, confirmed_sales bigint, conversion_rate numeric, stage_rates jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE v_views BIGINT; v_inquiries BIGINT; v_wa_clicks BIGINT; v_sales BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_views FROM listing_views WHERE created_at >= NOW() - p_period::INTERVAL;
    SELECT COUNT(*) INTO v_inquiries FROM listing_inquiries WHERE created_at >= NOW() - p_period::INTERVAL;
    SELECT COUNT(*) INTO v_wa_clicks FROM listing_whatsapp_clicks WHERE clicked_at >= NOW() - p_period::INTERVAL;
    SELECT COUNT(*) INTO v_sales FROM listing_sales WHERE sold_at >= NOW() - p_period::INTERVAL;
    RETURN QUERY SELECT v_views as views, v_inquiries as inquiries, v_wa_clicks as whatsapp_clicks, v_sales as confirmed_sales,
        CASE WHEN v_views > 0 THEN ROUND((v_sales::DECIMAL / v_views) * 100, 2) ELSE 0 END as conversion_rate,
        jsonb_build_object('view_to_inquiry', CASE WHEN v_views > 0 THEN ROUND((v_inquiries::DECIMAL / v_views) * 100, 2) ELSE 0 END,
            'inquiry_to_whatsapp', CASE WHEN v_inquiries > 0 THEN ROUND((v_wa_clicks::DECIMAL / v_inquiries) * 100, 2) ELSE 0 END,
            'whatsapp_to_sale', CASE WHEN v_wa_clicks > 0 THEN ROUND((v_sales::DECIMAL / v_wa_clicks) * 100, 2) ELSE 0 END) as stage_rates;
END;
$$;


--
-- Name: get_impact_metrics(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_impact_metrics(p_period text) RETURNS TABLE(period text, confirmed_sales bigint, total_revenue bigint, conversion_rate numeric, avg_time_to_sale numeric, active_listings bigint, total_leads bigint, gmv_per_listing numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT p_period as period,
        COUNT(DISTINCT s.id) FILTER (WHERE s.sold_at IS NOT NULL) as confirmed_sales,
        COALESCE(SUM(s.price), 0)::BIGINT as total_revenue,
        CASE WHEN COUNT(DISTINCT l.id) > 0 THEN ROUND((COUNT(DISTINCT s.id) FILTER (WHERE s.sold_at IS NOT NULL)::DECIMAL / COUNT(DISTINCT l.id)) * 100, 2) ELSE 0 END as conversion_rate,
        COALESCE(AVG(EXTRACT(DAY FROM (s.sold_at - l.created_at))) FILTER (WHERE s.sold_at IS NOT NULL), 0)::DECIMAL(10,2) as avg_time_to_sale,
        COUNT(DISTINCT l.id) FILTER (WHERE l.status IN ('active', 'published')) as active_listings,
        COUNT(DISTINCT li.id) as total_leads,
        CASE WHEN COUNT(DISTINCT l.id) > 0 THEN ROUND(COALESCE(SUM(s.price), 0) / COUNT(DISTINCT l.id), 2) ELSE 0 END as gmv_per_listing
    FROM listings l
    LEFT JOIN listing_sales s ON s.listing_id = l.id AND s.sold_at >= NOW() - p_period::INTERVAL
    LEFT JOIN listing_inquiries li ON li.listing_id = l.id AND li.created_at >= NOW() - p_period::INTERVAL
    WHERE l.created_at >= NOW() - p_period::INTERVAL;
END;
$$;


--
-- Name: get_kanban_metrics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_kanban_metrics() RETURNS TABLE(by_stage jsonb, recent_moves jsonb, avg_time_in_stage jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY SELECT jsonb_object_agg(stage, cnt) as by_stage, '[]'::JSONB as recent_moves, '{}'::JSONB as avg_time_in_stage
    FROM (SELECT stage, COUNT(*) as cnt FROM kanban_cards GROUP BY stage) sub;
END;
$$;


--
-- Name: get_price_suggestion(character varying, character varying, integer, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_price_suggestion(p_brand character varying, p_model character varying, p_year integer, p_condition character varying, p_currency character varying DEFAULT 'ARS'::character varying) RETURNS TABLE(exact_matches integer, exact_avg integer, similar_count integer, similar_avg integer, confidence character varying, suggestion integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  WITH exact_query AS (
    SELECT 
      COUNT(*)::INTEGER as cnt,
      COALESCE(AVG(pl.price), 0)::INTEGER as avg_price
    FROM price_listings pl
    JOIN bike_models bm ON bm.id = pl.bike_model_id
    WHERE bm.brand ILIKE p_brand
      AND bm.model ILIKE p_model
      AND pl.year = p_year
      AND (p_condition IS NULL OR pl.condition = p_condition)
      AND pl.currency = p_currency
      AND pl.status = 'active'
      AND pl.listed_at > NOW() - INTERVAL '90 days'
  ),
  similar_query AS (
    SELECT 
      COUNT(*)::INTEGER as cnt,
      COALESCE(AVG(pl.price), 0)::INTEGER as avg_price
    FROM price_listings pl
    JOIN bike_models bm ON bm.id = pl.bike_model_id
    WHERE bm.brand ILIKE p_brand
      AND (pl.year BETWEEN p_year - 2 AND p_year + 2)
      AND (p_condition IS NULL OR pl.condition = p_condition)
      AND pl.currency = p_currency
      AND pl.status = 'active'
      AND pl.listed_at > NOW() - INTERVAL '90 days'
  )
  SELECT 
    exact_query.cnt,
    exact_query.avg_price,
    GREATEST(similar_query.cnt - exact_query.cnt, 0),
    similar_query.avg_price,
    CASE 
      WHEN exact_query.cnt >= 3 THEN 'high'
      WHEN similar_query.cnt >= 5 THEN 'medium'
      ELSE 'low'
    END::VARCHAR,
    CASE 
      WHEN exact_query.avg_price > 0 THEN exact_query.avg_price
      WHEN similar_query.avg_price > 0 THEN similar_query.avg_price
      ELSE 0
    END
  FROM exact_query, similar_query;
END;
$$;


--
-- Name: FUNCTION get_price_suggestion(p_brand character varying, p_model character varying, p_year integer, p_condition character varying, p_currency character varying); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_price_suggestion(p_brand character varying, p_model character varying, p_year integer, p_condition character varying, p_currency character varying) IS 'Obtiene sugerencia de precio basada en modelo, año y condición';


--
-- Name: get_users_for_weekly_digest(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_users_for_weekly_digest() RETURNS TABLE(user_id uuid, email text, store_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    COALESCE(us.store_name, us.full_name, 'Mi Tienda')
  FROM auth.users u
  JOIN user_notification_settings uns ON u.id = uns.user_id
  JOIN users us ON u.id = us.id
  WHERE uns.weekly_digest = true
    AND us.store_enabled = true;
END;
$$;


--
-- Name: FUNCTION get_users_for_weekly_digest(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_users_for_weekly_digest() IS 'Obtiene usuarios con tienda que activaron el resumen semanal';


--
-- Name: guard_premium_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_premium_fields() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if (select auth.role()) <> 'service_role' then
    if (new.rank_boost_until is distinct from old.rank_boost_until)
       or (new.granted_visible_photos is distinct from old.granted_visible_photos)
       or (new.whatsapp_cap_granted is distinct from old.whatsapp_cap_granted)
       or (new.visible_images_count is distinct from old.visible_images_count) then
      raise exception using message = 'premium_fields_update_forbidden';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: handle_blog_post_publish_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_blog_post_publish_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') then
    if new.published_at is null then
      new.published_at = timezone('utc', now());
    end if;
  elsif new.status <> 'published' then
    -- optional: keep published_at when unpublishing; comment next line if you prefer to clear it
    new.published_at = new.published_at;
  end if;
  return new;
end;
$$;


--
-- Name: handle_blog_post_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_blog_post_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


--
-- Name: has_moderator_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_moderator_role(uid uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = uid
       AND role IN ('moderator','admin')
  );
END;
$$;


--
-- Name: increment_blog_post_views(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_blog_post_views(p_slug text) RETURNS TABLE(views integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  updated_count integer;
begin
  update public.blog_posts
    set views = views + 1
  where slug = p_slug
    and status = 'published'
  returning views into updated_count;

  return query select coalesce(updated_count, 0);
end;
$$;


--
-- Name: increment_listing_view_from_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_listing_view_from_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update public.listings
  set view_count = coalesce(view_count, 0) + 1
  where id = new.listing_id;
  return new;
end;
$$;


--
-- Name: is_moderator(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_moderator() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
select exists (
select 1
from public.user_roles
where user_id = auth.uid()
and role in ('moderator','admin')
);
$$;


--
-- Name: is_moderator(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_moderator(uid uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = uid
      and ur.role in ('moderator', 'admin')
  );
$$;


--
-- Name: listings_apply_plan_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_apply_plan_snapshot() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  p RECORD;
BEGIN
  IF NEW.plan_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO p
  FROM plans
  WHERE code = NEW.plan_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', NEW.plan_code;
  END IF;

  -- Snapshot
  NEW.plan_price       := p.price;
  NEW.plan_photo_limit := p.max_photos;
  NEW.seo_boost        := COALESCE(p.seo_boost, FALSE);
  NEW.whatsapp_enabled := COALESCE(p.whatsapp_enabled, FALSE);
  NEW.social_boost     := COALESCE(p.social_boost, FALSE);

  -- Fechas (solo INSERT)
  IF TG_OP = 'INSERT' THEN
    IF p.period_days IS NOT NULL THEN
      NEW.expires_at := (now() + make_interval(days => p.period_days));
    END IF;

    IF p.featured_slots IS NOT NULL AND p.featured_slots > 0 THEN
      NEW.featured_until := (now() + make_interval(days => p.featured_slots));
    ELSE
      NEW.featured_until := NULL;
    END IF;
  END IF;

  -- Asegurar que contact_methods sea text[]
  NEW.contact_methods := COALESCE(NEW.contact_methods, ARRAY['email','chat']::text[]);

  -- Agregar / quitar whatsapp usando funciones de array
  IF COALESCE(p.whatsapp_enabled, FALSE) THEN
    IF NOT (NEW.contact_methods @> ARRAY['whatsapp']::text[]) THEN
      NEW.contact_methods := array_append(NEW.contact_methods, 'whatsapp');
    END IF;
  ELSE
    NEW.contact_methods := array_remove(NEW.contact_methods, 'whatsapp');
  END IF;

  -- Estado según precio
  IF COALESCE(p.price, 0) = 0 THEN
    NEW.status := 'published';
  ELSE
    IF NEW.status IS NULL OR NEW.status = 'draft' THEN
      NEW.status := 'pending_payment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: listings_plan_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_plan_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_plan_code text := lower(trim(new.plan_code));
  v_plan      text;
BEGIN
  IF v_plan_code IS NULL OR v_plan_code = '' THEN
    RAISE EXCEPTION 'Plan no especificado';
  END IF;

  SELECT code
  INTO   v_plan
  FROM   plans
  WHERE  lower(trim(code)) = v_plan_code
  LIMIT  1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % no encontrado', new.plan_code;
  END IF;

  -- Normalizamos el código antes de insertar
  NEW.plan_code := v_plan;
  NEW.plan      := COALESCE(NEW.plan, v_plan);
  RETURN NEW;
END;
$$;


--
-- Name: listings_slug_bi(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_slug_bi() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generate_listing_slug(new.title, new.model, new.year, null);
  end if;
  return new;
end;
$$;


--
-- Name: mark_notifications_read(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_notifications_read(p_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
update public.notifications
set read_at = now()
where id = any(p_ids)
and user_id = auth.uid();
end;
$$;


--
-- Name: mark_thread_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_thread_read(p_thread_id uuid) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_thread record;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() unavailable';
  END IF;

  SELECT seller_id, buyer_id INTO v_thread FROM public.chat_threads WHERE id = p_thread_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread % not found', p_thread_id;
  END IF;
  IF v_thread.seller_id <> v_uid AND v_thread.buyer_id <> v_uid AND NOT public.is_moderator(v_uid) THEN
    RAISE EXCEPTION 'not a participant';
  END IF;

  UPDATE public.chat_messages
     SET read_at = now()
   WHERE thread_id = p_thread_id
     AND author_id <> v_uid
     AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;


--
-- Name: notify_chat_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_chat_message() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_thread public.chat_threads;
  v_recipient uuid;
BEGIN
  SELECT * INTO v_thread FROM public.chat_threads WHERE id = NEW.thread_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.author_id = v_thread.seller_id THEN
    v_recipient := v_thread.buyer_id;
  ELSE
    v_recipient := v_thread.seller_id;
  END IF;

  IF v_recipient IS NULL OR v_recipient = NEW.author_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, metadata)
  VALUES (
    v_recipient,
    'chat',
    'Nuevo mensaje',
    left(NEW.body, 120),
    jsonb_build_object('thread_id', NEW.thread_id)
  );

  RETURN NEW;
END;
$$;


--
-- Name: recalculate_market_prices(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_market_prices() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO market_prices (
    bike_model_id, country, currency, condition, year,
    calculated_at, sample_size, avg_price, median_price,
    min_price, max_price, p25, p75
  )
  SELECT 
    pl.bike_model_id,
    pl.country,
    pl.currency,
    pl.condition,
    pl.year,
    NOW(),
    COUNT(*)::INTEGER,
    AVG(pl.price)::INTEGER,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pl.price)::INTEGER,
    MIN(pl.price)::INTEGER,
    MAX(pl.price)::INTEGER,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY pl.price)::INTEGER,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY pl.price)::INTEGER
  FROM price_listings pl
  WHERE pl.status = 'active'
    AND pl.listed_at > NOW() - INTERVAL '90 days'
    AND pl.bike_model_id IS NOT NULL
  GROUP BY pl.bike_model_id, pl.country, pl.currency, pl.condition, pl.year
  ON CONFLICT (bike_model_id, country, currency, condition, year)
  DO UPDATE SET
    calculated_at = NOW(),
    sample_size = EXCLUDED.sample_size,
    avg_price = EXCLUDED.avg_price,
    median_price = EXCLUDED.median_price,
    min_price = EXCLUDED.min_price,
    max_price = EXCLUDED.max_price,
    p25 = EXCLUDED.p25,
    p75 = EXCLUDED.p75;
END;
$$;


--
-- Name: FUNCTION recalculate_market_prices(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.recalculate_market_prices() IS 'Recalcula los precios de mercado. Ejecutar diariamente.';


--
-- Name: review_reminders_emit_ready_notifications(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_reminders_emit_ready_notifications(p_limit integer DEFAULT 100) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r record;
  v_count int := 0;
begin
  for r in (
    select id, buyer_id, seller_id
    from public.review_reminders
    where ready_at <= now() and sent_inapp = false
    order by ready_at asc
    limit greatest(1, p_limit)
  ) loop
    begin
      insert into public.notifications (user_id, type, title, body, cta_url, metadata)
      values (
        r.buyer_id,
        'system',
        'Podés dejar una reseña',
        'Tu reseña para este vendedor ya está disponible. ¡Contá tu experiencia y ayudá a otros!',
        '/vendedor/' || r.seller_id || '?review=1',
        jsonb_build_object('seller_id', r.seller_id)
      );
      update public.review_reminders set sent_inapp = true where id = r.id;
      v_count := v_count + 1;
    exception when others then
      -- continuar con el siguiente
      continue;
    end;
  end loop;
  return v_count;
end;
$$;


--
-- Name: review_reminders_mark_email_sent(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_reminders_mark_email_sent(p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v int; begin
  update public.review_reminders set sent_email = true where id = any(p_ids) and ready_at <= now();
  get diagnostics v = row_count;
  return v;
end; $$;


--
-- Name: safe_unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.safe_unaccent(input text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v text;
begin
  -- intentar en schema extensions (preferido)
  begin
    select extensions.unaccent(input) into v;
    return v;
  exception
    when undefined_function then
      -- fallback: si existe en public
      begin
        select public.unaccent(input) into v;
        return v;
      exception
        when undefined_function then
          return input;
        when others then
          return input;
      end;
    when others then
      return input;
  end;
end; $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
new.updated_at = now();
return new;
end;
$$;


--
-- Name: set_users_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_users_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: to_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.to_slug(input text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select trim(both '-' from regexp_replace(
    lower(public.safe_unaccent(input)),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;


--
-- Name: touch_thread_on_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_thread_on_message() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.chat_threads
     SET last_message_at = NEW.created_at,
         updated_at      = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;


--
-- Name: trg_contact_events_create_review_reminder(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_contact_events_create_review_reminder() RETURNS trigger
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
if new.buyer_id is null then
return new;
end if;

-- Cast seguro de seller/buyer; si falla, no interrumpe el insert original
begin
v_seller := new.seller_id::uuid;
v_buyer := new.buyer_id::uuid;
exception when others then
return new;
end;

-- Cast seguro de listing_id; si falla lo dejamos null
begin
v_listing := new.listing_id::uuid;
exception when others then
v_listing := null;
end;

select exists(
select 1 from public.review_reminders
where seller_id = v_seller and buyer_id = v_buyer
) into v_exists;
if v_exists then
return new;
end if;

select min(created_at) into v_first_contact
from public.contact_events
where seller_id::text = new.seller_id::text
and buyer_id::text = new.buyer_id::text;

if v_first_contact is null then
v_first_contact := coalesce(new.created_at, now());
end if;

insert into public.review_reminders (
seller_id, buyer_id, listing_id, contact_event_id, ready_at
) values (
v_seller, v_buyer, v_listing, new.id, now()
)
on conflict (seller_id, buyer_id) do nothing;

return new;
end;
$$;


--
-- Name: trg_listing_questions_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_listing_questions_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.id := coalesce(new.id, gen_random_uuid());
    new.asker_id := auth.uid();
    if new.asker_id is null then
      raise exception 'asker_id cannot be null (auth.uid() required)';
    end if;
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    new.answered_at := null;

  elsif tg_op = 'UPDATE' then
    if old.answer_body is not null then
      raise exception 'Esta consulta ya fue respondida.';
    end if;

    new.asker_id := old.asker_id;
    new.listing_id := old.listing_id;
    new.question_body := old.question_body;
    new.updated_at := now();

    if coalesce(new.answer_body, '') <> coalesce(old.answer_body, '') then
      if new.answer_body is null or char_length(new.answer_body) < 1 then
        new.answer_body := null;
        new.answerer_id := null;
        new.answered_at := null;
      else
        new.answerer_id := auth.uid();
        new.answered_at := now();
      end if;
    else
      new.answerer_id := old.answerer_id;
      new.answered_at := old.answered_at;
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: trg_listing_questions_set_meta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_listing_questions_set_meta() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
if tg_op = 'INSERT' then
new.created_at := coalesce(new.created_at, now());
new.updated_at := now();
if new.answer_body is not null then
new.answered_at := coalesce(new.answered_at, now());
new.answerer_id := coalesce(new.answerer_id, auth.uid());
end if;
return new;
elsif tg_op = 'UPDATE' then
new.updated_at := now();
if new.answer_body is not null and (old.answer_body is null or new.answer_body <> old.answer_body) then
new.answered_at := coalesce(new.answered_at, now());
new.answerer_id := coalesce(new.answerer_id, auth.uid());
end if;
return new;
end if;
return new;
end
$$;


--
-- Name: trg_listing_status_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_listing_status_events() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if (tg_op = 'INSERT') then
    insert into public.listing_status_events(listing_id, seller_id, previous_status, next_status, changed_at)
    values (new.id, new.seller_id, null, new.status, coalesce(new.created_at, now()));
    return new;
  end if;

  if (new.status is distinct from old.status) then
    insert into public.listing_status_events(listing_id, seller_id, previous_status, next_status, changed_at)
    values (new.id, new.seller_id, old.status, new.status, now());
  end if;
  return new;
end;
$$;


--
-- Name: trg_listings_apply_pro_for_stores(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_listings_apply_pro_for_stores() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
v_is_store boolean := false;
begin
if new.seller_id is not null then
select coalesce(store_enabled, false) into v_is_store
from public.users where id = new.seller_id;
end if;
if v_is_store then
new.seller_plan := 'pro';
if coalesce(new.plan, '') = '' then new.plan := 'pro'; end if;
if coalesce(new.plan_code, '') = '' then new.plan_code := 'pro'; end if;
new.seller_plan_expires := null;
new.expires_at := null;
end if;
return new;
end;
$$;


--
-- Name: trg_listings_no_phones(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_listings_no_phones() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  txt_raw text := lower(coalesce(NEW.description,'') || ' ' || coalesce(NEW.extras::text,''));
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  jwt_role text := coalesce(claims->>'role','');
  is_mod boolean := EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = auth.uid()
      AND r.role IN ('moderator','admin')
  );
  txt text;
BEGIN
  -- Bypass para service role (backend) y moderadores/admins
  IF jwt_role = 'service_role' OR is_mod THEN
    RETURN NEW;
  END IF;

  -- Limpia patrones técnicos típicos en ciclismo para reducir falsos positivos
  txt := txt_raw;
  -- medidas (700x28, 29x2.4, etc)
  txt := regexp_replace(txt, '\b\d{1,3}x\d{1,3}(\.\d+)?\b', '', 'gi');
  -- cassettes 11-50T, 10-52t, etc
  txt := regexp_replace(txt, '\b\d{1,2}-\d{1,2}t\b', '', 'gi');
  -- 29er, 27.5, 700c
  txt := regexp_replace(txt, '\b(29er|27\.5|700c)\b', '', 'gi');
  -- mm/psi/kg/gr/w
  txt := regexp_replace(txt, '\b\d{2,3}(mm|psi|kg|gr|w)\b', '', 'gi');

  -- Palabras clave explícitas de contacto
  IF txt ~* '\b(whatsapp|wpp|wasap|tel\.?|telefono|celular|llamame|escribime|contactame|comunicate)\b' THEN
    RAISE EXCEPTION 'Por seguridad no se permiten teléfonos/WhatsApp en descripción o extras.';
  END IF;

  -- Números con pinta de teléfono: 9+ dígitos permitiendo separadores
  IF EXISTS (
    SELECT 1
    FROM regexp_matches(txt, '((\+?\d[\s\-\(\)\.]*){9,})', 'g')
  ) THEN
    RAISE EXCEPTION 'Por seguridad no se permiten teléfonos/WhatsApp en descripción o extras.';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_lq_set_meta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_lq_set_meta() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
if tg_op = 'INSERT' then
new.created_at := coalesce(new.created_at, now());
new.updated_at := now();
if new.answer_body is not null then
new.answered_at := coalesce(new.answered_at, now());
new.answerer_id := coalesce(new.answerer_id, auth.uid());
end if;
return new;
elsif tg_op = 'UPDATE' then
new.updated_at := now();
if new.answer_body is not null and (old.answer_body is null or new.answer_body <> old.answer_body) then
new.answered_at := coalesce(new.answered_at, now());
new.answerer_id := coalesce(new.answerer_id, auth.uid());
end if;
return new;
end if;
return new;
end
$$;


--
-- Name: trg_questions_no_phones(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_questions_no_phones() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if public.contains_phone_like(new.question_body) or public.contains_phone_like(new.answer_body) then
    raise exception 'Por seguridad no se permiten teléfonos/WhatsApp en preguntas o respuestas.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


--
-- Name: trg_update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_users_store_slug_normalize(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_users_store_slug_normalize() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
begin
if new.store_slug is not null then
new.store_slug := lower(new.store_slug);
new.store_slug := regexp_replace(new.store_slug, '[^a-z0-9_-]+', '-', 'g');
new.store_slug := regexp_replace(new.store_slug, '(^-+|-+$)', '', 'g');
end if;
return new;
end;
$_$;


--
-- Name: unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $_$ SELECT extensions.unaccent($1) $_$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type text NOT NULL,
    listing_id uuid,
    store_user_id uuid,
    user_id uuid,
    anon_id text,
    path text,
    referrer text,
    ua text,
    meta jsonb,
    source text,
    CONSTRAINT events_type_check CHECK ((type = ANY (ARRAY['site_view'::text, 'listing_view'::text, 'store_view'::text, 'wa_click'::text])))
);


--
-- Name: admin_events_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_events_daily WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, created_at) AS day,
    type,
    count(*) AS total
   FROM public.events
  WHERE (created_at >= (now() - '90 days'::interval))
  GROUP BY (date_trunc('day'::text, created_at)), type
  ORDER BY (date_trunc('day'::text, created_at));


--
-- Name: listing_status_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_status_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    seller_id uuid,
    previous_status text,
    next_status text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_listing_activity_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_listing_activity_summary WITH (security_invoker='true') AS
 SELECT count(DISTINCT
        CASE
            WHEN (l.created_at >= (now() - '7 days'::interval)) THEN l.id
            ELSE NULL::uuid
        END) AS listings_created_7d,
    count(DISTINCT
        CASE
            WHEN ((l.created_at >= (now() - '14 days'::interval)) AND (l.created_at < (now() - '7 days'::interval))) THEN l.id
            ELSE NULL::uuid
        END) AS listings_created_prev_7d,
    count(DISTINCT
        CASE
            WHEN (l.created_at >= (now() - '30 days'::interval)) THEN l.id
            ELSE NULL::uuid
        END) AS listings_created_30d,
    count(DISTINCT
        CASE
            WHEN ((l.created_at >= (now() - '60 days'::interval)) AND (l.created_at < (now() - '30 days'::interval))) THEN l.id
            ELSE NULL::uuid
        END) AS listings_created_prev_30d,
    count(
        CASE
            WHEN ((e.next_status = 'paused'::text) AND (e.changed_at >= (now() - '7 days'::interval))) THEN 1
            ELSE NULL::integer
        END) AS listings_paused_7d,
    count(
        CASE
            WHEN ((e.next_status = 'paused'::text) AND (e.changed_at >= (now() - '14 days'::interval)) AND (e.changed_at < (now() - '7 days'::interval))) THEN 1
            ELSE NULL::integer
        END) AS listings_paused_prev_7d,
    count(
        CASE
            WHEN ((e.next_status = 'paused'::text) AND (e.changed_at >= (now() - '30 days'::interval))) THEN 1
            ELSE NULL::integer
        END) AS listings_paused_30d,
    count(
        CASE
            WHEN ((e.next_status = 'paused'::text) AND (e.changed_at >= (now() - '60 days'::interval)) AND (e.changed_at < (now() - '30 days'::interval))) THEN 1
            ELSE NULL::integer
        END) AS listings_paused_prev_30d
   FROM (public.listings l
     LEFT JOIN public.listing_status_events e ON (((e.listing_id = l.id) AND (e.changed_at >= (now() - '60 days'::interval)))));


--
-- Name: admin_listing_contact_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_listing_contact_summary WITH (security_invoker='true') AS
 SELECT (listing_id)::uuid AS listing_id,
    max(created_at) AS last_contact_at,
    (count(*) FILTER (WHERE (created_at >= (now() - '7 days'::interval))))::integer AS contacts_total_7d,
    (count(*) FILTER (WHERE (created_at >= (now() - '30 days'::interval))))::integer AS contacts_total_30d,
    (count(*) FILTER (WHERE ((type = 'whatsapp'::text) AND (created_at >= (now() - '7 days'::interval)))))::integer AS wa_contacts_7d,
    (count(*) FILTER (WHERE ((type = 'whatsapp'::text) AND (created_at >= (now() - '30 days'::interval)))))::integer AS wa_contacts_30d,
    (count(*) FILTER (WHERE ((type = 'email'::text) AND (created_at >= (now() - '7 days'::interval)))))::integer AS email_contacts_7d,
    (count(*) FILTER (WHERE ((type = 'email'::text) AND (created_at >= (now() - '30 days'::interval)))))::integer AS email_contacts_30d,
    0 AS chat_contacts_7d,
    0 AS chat_contacts_30d
   FROM public.contact_events ce
  WHERE (listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text)
  GROUP BY (listing_id)::uuid;


--
-- Name: VIEW admin_listing_contact_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.admin_listing_contact_summary IS 'Listing contact summary per listing_id (7d/30d) by channel. Source of truth: public.contact_events. Chat not tracked yet.';


--
-- Name: admin_listing_engagement_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_listing_engagement_summary WITH (security_invoker='true') AS
 SELECT l.id AS listing_id,
    l.seller_id,
    l.title,
    COALESCE(NULLIF(l.plan_code, ''::text), NULLIF(l.plan, ''::text), NULLIF(l.seller_plan, ''::text)) AS plan_code,
    sum(
        CASE
            WHEN ((e.type = 'listing_view'::text) AND (e.created_at >= (now() - '7 days'::interval))) THEN 1
            ELSE 0
        END) AS views_7d,
    sum(
        CASE
            WHEN ((e.type = 'listing_view'::text) AND (e.created_at >= (now() - '30 days'::interval))) THEN 1
            ELSE 0
        END) AS views_30d,
    sum(
        CASE
            WHEN ((e.type = 'listing_view'::text) AND (e.created_at >= (now() - '90 days'::interval))) THEN 1
            ELSE 0
        END) AS views_90d,
    sum(
        CASE
            WHEN ((e.type = 'wa_click'::text) AND (e.created_at >= (now() - '7 days'::interval))) THEN 1
            ELSE 0
        END) AS wa_clicks_7d,
    sum(
        CASE
            WHEN ((e.type = 'wa_click'::text) AND (e.created_at >= (now() - '30 days'::interval))) THEN 1
            ELSE 0
        END) AS wa_clicks_30d,
    sum(
        CASE
            WHEN ((e.type = 'wa_click'::text) AND (e.created_at >= (now() - '90 days'::interval))) THEN 1
            ELSE 0
        END) AS wa_clicks_90d
   FROM (public.listings l
     LEFT JOIN public.events e ON (((e.listing_id = l.id) AND (e.created_at >= (now() - '90 days'::interval)))))
  GROUP BY l.id, l.seller_id, l.title, COALESCE(NULLIF(l.plan_code, ''::text), NULLIF(l.plan, ''::text), NULLIF(l.seller_plan, ''::text));


--
-- Name: admin_listing_engagement_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_listing_engagement_stats WITH (security_invoker='true') AS
 SELECT count(*) AS listings_total,
    avg(views_30d) AS avg_views_30d,
    avg(wa_clicks_30d) AS avg_wa_clicks_30d
   FROM public.admin_listing_engagement_summary;


--
-- Name: admin_listing_views_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_listing_views_daily WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, created_at) AS day,
    listing_id,
    count(*) AS total
   FROM public.events
  WHERE ((type = 'listing_view'::text) AND (created_at >= (now() - '90 days'::interval)))
  GROUP BY (date_trunc('day'::text, created_at)), listing_id
  ORDER BY (date_trunc('day'::text, created_at));


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    listing_id uuid,
    amount numeric(12,2) NOT NULL,
    currency text NOT NULL,
    status text NOT NULL,
    provider text DEFAULT 'mercadopago'::text NOT NULL,
    provider_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    applied boolean DEFAULT false,
    applied_at timestamp with time zone,
    CONSTRAINT payments_currency_check CHECK ((currency = ANY (ARRAY['ARS'::text, 'USD'::text]))),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])))
);


--
-- Name: COLUMN payments.applied; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.applied IS 'Indica si el pago ya se aplicó (p. ej. destaque otorgado).';


--
-- Name: COLUMN payments.applied_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.applied_at IS 'Fecha en la que se aplicó el pago.';


--
-- Name: publish_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.publish_credits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    plan_code text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider text DEFAULT 'mercadopago'::text NOT NULL,
    provider_ref text,
    preference_id text,
    used_at timestamp with time zone,
    expires_at timestamp with time zone,
    listing_id uuid,
    applied boolean DEFAULT false,
    applied_at timestamp with time zone,
    CONSTRAINT publish_credits_plan_code_check CHECK ((plan_code = ANY (ARRAY['basic'::text, 'premium'::text]))),
    CONSTRAINT publish_credits_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'available'::text, 'used'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: admin_payments_enriched; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_payments_enriched WITH (security_invoker='true') AS
 SELECT p.id,
    p.created_at,
    p.user_id,
    u.email AS user_email,
    p.listing_id,
    p.amount,
    p.currency,
    p.status AS payment_status,
    p.applied,
    p.applied_at,
    p.provider,
    p.provider_ref,
    c.id AS credit_id,
    c.status AS credit_status,
    c.preference_id AS credit_preference_id,
    c.plan_code AS credit_plan_code,
    c.expires_at AS credit_expires_at
   FROM ((public.payments p
     LEFT JOIN public.users u ON ((u.id = p.user_id)))
     LEFT JOIN LATERAL ( SELECT c2.id,
            c2.created_at,
            c2.user_id,
            c2.plan_code,
            c2.status,
            c2.provider,
            c2.provider_ref,
            c2.preference_id,
            c2.used_at,
            c2.expires_at,
            c2.listing_id,
            c2.applied,
            c2.applied_at
           FROM public.publish_credits c2
          WHERE ((c2.provider = p.provider) AND (((p.provider_ref IS NOT NULL) AND (c2.provider_ref = p.provider_ref)) OR ((p.provider_ref IS NULL) AND (c2.user_id = p.user_id))))
          ORDER BY
                CASE
                    WHEN ((p.provider_ref IS NOT NULL) AND (c2.provider_ref = p.provider_ref)) THEN 0
                    ELSE 1
                END, (abs(EXTRACT(epoch FROM (c2.created_at - p.created_at))))
         LIMIT 1) c ON (true))
  ORDER BY p.created_at DESC;


--
-- Name: admin_publish_credits_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_publish_credits_daily WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, created_at) AS day,
    status,
    plan_code,
    count(*) AS total
   FROM public.publish_credits
  WHERE (created_at >= (now() - '90 days'::interval))
  GROUP BY (date_trunc('day'::text, created_at)), status, plan_code
  ORDER BY (date_trunc('day'::text, created_at));


--
-- Name: seller_sale_confirmations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_sale_confirmations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    listing_id uuid,
    confirmed boolean NOT NULL,
    source text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seller_sale_confirmations_source_check CHECK ((source = ANY (ARRAY['admin_manual'::text, 'seller_form'::text])))
);


--
-- Name: admin_sales_confirmed_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_sales_confirmed_daily WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, created_at) AS day,
    confirmed,
    count(*) AS total
   FROM public.seller_sale_confirmations
  WHERE (created_at >= (now() - '90 days'::interval))
  GROUP BY (date_trunc('day'::text, created_at)), confirmed
  ORDER BY (date_trunc('day'::text, created_at));


--
-- Name: admin_store_engagement_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_store_engagement_summary WITH (security_invoker='true') AS
 SELECT u.id AS store_user_id,
    u.store_name,
    sum(
        CASE
            WHEN ((e.type = 'store_view'::text) AND (e.created_at >= (now() - '7 days'::interval))) THEN 1
            ELSE 0
        END) AS store_views_7d,
    sum(
        CASE
            WHEN ((e.type = 'store_view'::text) AND (e.created_at >= (now() - '30 days'::interval))) THEN 1
            ELSE 0
        END) AS store_views_30d,
    sum(
        CASE
            WHEN ((e.type = 'store_view'::text) AND (e.created_at >= (now() - '90 days'::interval))) THEN 1
            ELSE 0
        END) AS store_views_90d,
    sum(
        CASE
            WHEN ((e.type = 'listing_view'::text) AND (e.created_at >= (now() - '7 days'::interval))) THEN 1
            ELSE 0
        END) AS listing_views_7d,
    sum(
        CASE
            WHEN ((e.type = 'listing_view'::text) AND (e.created_at >= (now() - '30 days'::interval))) THEN 1
            ELSE 0
        END) AS listing_views_30d,
    sum(
        CASE
            WHEN ((e.type = 'listing_view'::text) AND (e.created_at >= (now() - '90 days'::interval))) THEN 1
            ELSE 0
        END) AS listing_views_90d,
    sum(
        CASE
            WHEN ((e.type = 'wa_click'::text) AND (e.created_at >= (now() - '7 days'::interval))) THEN 1
            ELSE 0
        END) AS wa_clicks_7d,
    sum(
        CASE
            WHEN ((e.type = 'wa_click'::text) AND (e.created_at >= (now() - '30 days'::interval))) THEN 1
            ELSE 0
        END) AS wa_clicks_30d,
    sum(
        CASE
            WHEN ((e.type = 'wa_click'::text) AND (e.created_at >= (now() - '90 days'::interval))) THEN 1
            ELSE 0
        END) AS wa_clicks_90d
   FROM (public.users u
     LEFT JOIN public.events e ON (((e.store_user_id = u.id) AND (e.created_at >= (now() - '90 days'::interval)))))
  WHERE (COALESCE(u.store_enabled, false) = true)
  GROUP BY u.id, u.store_name;


--
-- Name: admin_store_views_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_store_views_daily WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, created_at) AS day,
    store_user_id,
    count(*) AS total
   FROM public.events
  WHERE ((type = 'store_view'::text) AND (created_at >= (now() - '90 days'::interval)))
  GROUP BY (date_trunc('day'::text, created_at)), store_user_id
  ORDER BY (date_trunc('day'::text, created_at));


--
-- Name: admin_user_growth_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_user_growth_summary WITH (security_invoker='true') AS
 SELECT count(*) FILTER (WHERE (created_at >= (now() - '7 days'::interval))) AS users_7d,
    count(*) FILTER (WHERE ((created_at >= (now() - '14 days'::interval)) AND (created_at < (now() - '7 days'::interval)))) AS users_prev_7d,
    count(*) FILTER (WHERE (created_at >= (now() - '30 days'::interval))) AS users_30d,
    count(*) FILTER (WHERE ((created_at >= (now() - '60 days'::interval)) AND (created_at < (now() - '30 days'::interval)))) AS users_prev_30d,
    count(*) FILTER (WHERE (created_at >= (now() - '90 days'::interval))) AS users_90d,
    count(*) FILTER (WHERE ((created_at >= (now() - '180 days'::interval)) AND (created_at < (now() - '90 days'::interval)))) AS users_prev_90d
   FROM public.users u;


--
-- Name: admin_wa_clicks_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_wa_clicks_daily WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, created_at) AS day,
    listing_id,
    count(*) AS total
   FROM public.events
  WHERE ((type = 'wa_click'::text) AND (created_at >= (now() - '90 days'::interval)))
  GROUP BY (date_trunc('day'::text, created_at)), listing_id
  ORDER BY (date_trunc('day'::text, created_at));


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automation_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id uuid NOT NULL,
    executed_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_id uuid NOT NULL,
    details jsonb,
    error_message text,
    CONSTRAINT automation_logs_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['seller'::character varying, 'listing'::character varying])::text[]))),
    CONSTRAINT automation_logs_status_check CHECK (((status)::text = ANY ((ARRAY['success'::character varying, 'failed'::character varying, 'skipped'::character varying])::text[])))
);


--
-- Name: automation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    condition character varying(100) NOT NULL,
    condition_config jsonb DEFAULT '{}'::jsonb,
    action character varying(50) NOT NULL,
    action_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    run_count integer DEFAULT 0 NOT NULL,
    last_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT automation_rules_action_check CHECK (((action)::text = ANY ((ARRAY['send_email'::character varying, 'send_whatsapp'::character varying, 'create_task'::character varying, 'add_tag'::character varying, 'notify_admin'::character varying, 'move_kanban_stage'::character varying, 'mark_at_risk'::character varying])::text[]))),
    CONSTRAINT automation_rules_condition_check CHECK (((condition)::text = ANY ((ARRAY['listing_expiring_24h'::character varying, 'listing_expiring_72h'::character varying, 'no_leads_7d'::character varying, 'no_leads_14d'::character varying, 'new_lead_received'::character varying, 'high_ctr_low_leads'::character varying, 'seller_not_responded_24h'::character varying, 'seller_not_responded_48h'::character varying, 'whatsapp_not_enabled'::character varying, 'phone_not_verified'::character varying, 'photos_low_quality'::character varying, 'price_above_market'::character varying, 'seller_at_risk_churn'::character varying])::text[])))
);


--
-- Name: bike_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bike_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand character varying(100) NOT NULL,
    model character varying(200) NOT NULL,
    category character varying(50),
    subcategory character varying(100),
    frame_material character varying(50),
    wheel_size character varying(20),
    original_msrp_usd integer,
    year_released integer,
    year_discontinued integer,
    is_popular boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE bike_models; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bike_models IS 'Catálogo de modelos de bicicletas para el sistema de pricing';


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    excerpt text,
    cover_image_url text,
    html_content text NOT NULL,
    author_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    published_at timestamp with time zone,
    views integer DEFAULT 0 NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    seo_title text,
    seo_description text,
    canonical_url text,
    og_image_url text,
    json_ld jsonb,
    theme jsonb,
    CONSTRAINT blog_posts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: TABLE blog_posts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.blog_posts IS 'Blog posts authored by moderators/admins for Ciclo Market';


--
-- Name: COLUMN blog_posts.html_content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_posts.html_content IS 'Stores full HTML body (already sanitized before persistence)';


--
-- Name: COLUMN blog_posts.tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_posts.tags IS 'Array of lowercase tags used for filtering and related content';


--
-- Name: contact_events_enriched; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.contact_events_enriched AS
 SELECT ce.id,
    ce.seller_id,
    ce.buyer_id,
    ce.listing_id,
    ce.type,
    ce.created_at,
    u.full_name AS seller_full_name,
    l.title AS listing_title
   FROM ((public.contact_events ce
     LEFT JOIN public.users u ON ((u.id =
        CASE
            WHEN (ce.seller_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text) THEN (ce.seller_id)::uuid
            ELSE NULL::uuid
        END)))
     LEFT JOIN public.listings l ON ((l.id =
        CASE
            WHEN (ce.listing_id IS NULL) THEN NULL::uuid
            WHEN (ce.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text) THEN (ce.listing_id)::uuid
            ELSE NULL::uuid
        END)));


--
-- Name: VIEW contact_events_enriched; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.contact_events_enriched IS 'Contact events with seller full_name and listing title for easier inspection in Supabase UI.';


--
-- Name: follow_up_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_up_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    listing_id uuid,
    scheduled_for timestamp with time zone NOT NULL,
    type character varying(20) NOT NULL,
    template_key character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    sent_at timestamp with time zone,
    sent_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT follow_up_schedules_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'sent'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT follow_up_schedules_type_check CHECK (((type)::text = ANY ((ARRAY['whatsapp'::character varying, 'email'::character varying, 'call'::character varying])::text[])))
);


--
-- Name: gift_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_codes (
    code text NOT NULL,
    plan text NOT NULL,
    uses_left integer DEFAULT 1 NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gift_codes_plan_check CHECK ((plan = ANY (ARRAY['basic'::text, 'premium'::text])))
);

ALTER TABLE ONLY public.gift_codes FORCE ROW LEVEL SECURITY;


--
-- Name: gift_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    seller_id text NOT NULL,
    redeemed_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.gift_redemptions FORCE ROW LEVEL SECURITY;


--
-- Name: kanban_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanban_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    listing_id uuid,
    stage character varying(50) NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    notes text,
    estimated_value integer,
    source character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_contact_at timestamp with time zone DEFAULT now() NOT NULL,
    moved_at timestamp with time zone,
    assigned_to uuid,
    seller_name text,
    whatsapp_number text,
    listing_title text,
    CONSTRAINT kanban_cards_priority_check CHECK (((priority)::text = ANY ((ARRAY['urgent'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[]))),
    CONSTRAINT kanban_cards_source_check CHECK (((source)::text = ANY ((ARRAY['whatsapp'::character varying, 'email'::character varying, 'manual'::character varying, 'automation'::character varying])::text[]))),
    CONSTRAINT kanban_cards_stage_check CHECK (((stage)::text = ANY ((ARRAY['contacted'::character varying, 'responded'::character varying, 'sold_cm'::character varying, 'sold_elsewhere'::character varying, 'not_sold'::character varying, 'needs_help'::character varying, 'price_drop'::character varying])::text[])))
);


--
-- Name: kanban_moves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanban_moves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    card_id uuid NOT NULL,
    from_stage character varying(50) NOT NULL,
    to_stage character varying(50) NOT NULL,
    moved_by uuid,
    moved_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


--
-- Name: listing_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_likes (
    listing_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_plan_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_plan_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    plan_code text NOT NULL,
    started_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    payment_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: TABLE listing_plan_periods; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.listing_plan_periods IS 'History of premium periods per listing (auditable).';


--
-- Name: listing_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    question_body text NOT NULL,
    asker_id uuid NOT NULL,
    answer_body text,
    answerer_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    asker_full_name text,
    asker_name text,
    answerer_full_name text,
    answerer_name text,
    CONSTRAINT listing_questions_answer_length CHECK (((answer_body IS NULL) OR ((char_length(answer_body) >= 1) AND (char_length(answer_body) <= 600)))),
    CONSTRAINT listing_questions_question_body_check CHECK (((char_length(question_body) >= 5) AND (char_length(question_body) <= 400)))
);


--
-- Name: listing_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listings_active; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.listings_active WITH (security_invoker='true') AS
 SELECT id,
    title,
    brand,
    model,
    year,
    category,
    price,
    price_currency,
    original_price,
    location,
    description,
    images,
    seller_id,
    seller_name,
    seller_plan,
    seller_plan_expires,
    seller_location,
    seller_whatsapp,
    seller_avatar,
    material,
    frame_size,
    drivetrain,
    drivetrain_detail,
    wheelset,
    wheel_size,
    extras,
    plan,
    created_at,
    slug,
    plan_code,
    plan_price,
    plan_photo_limit,
    featured_until,
    seo_boost,
    whatsapp_enabled,
    social_boost,
    expires_at,
    status,
    contact_methods,
    renewal_notified_at,
    moderation_state,
    moderated_by,
    moderated_at,
    archived_at,
    archived_by,
    seller_email,
    subcategory,
    highlight_expires
   FROM public.listings
  WHERE (status = ANY (ARRAY['active'::text, 'published'::text]));


--
-- Name: listings_enriched; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.listings_enriched AS
 WITH src AS (
         SELECT l.id,
            l.title,
            l.brand,
            l.model,
            l.year,
            l.category,
            l.price,
            l.price_currency,
            l.original_price,
            l.location,
            l.description,
            l.images,
            l.seller_id,
            l.seller_name,
            l.seller_plan,
            l.seller_plan_expires,
            l.seller_location,
            l.seller_whatsapp,
            l.seller_avatar,
            l.material,
            l.frame_size,
            l.drivetrain,
            l.drivetrain_detail,
            l.wheelset,
            l.wheel_size,
            l.extras,
            l.plan,
            l.created_at,
            l.slug,
            l.plan_code,
            l.plan_price,
            l.plan_photo_limit,
            l.featured_until,
            l.seo_boost,
            l.whatsapp_enabled,
            l.social_boost,
            l.expires_at,
            l.status,
            l.contact_methods,
            l.renewal_notified_at,
            l.moderation_state,
            l.moderated_by,
            l.moderated_at,
            l.archived_at,
            l.archived_by,
            l.seller_email,
            l.subcategory,
            l.highlight_expires,
            l.granted_visible_photos,
            l.whatsapp_cap_granted,
            l.rank_boost_until,
            l.visible_images_count,
            l.whatsapp_user_disabled,
            l.view_count,
            COALESCE(u.store_enabled, false) AS seller_store_enabled,
            lower(COALESCE(l.plan_code, ''::text)) AS plan_code_lc,
            lower(COALESCE(l.seller_plan, ''::text)) AS seller_plan_lc
           FROM (public.listings l
             LEFT JOIN public.users u ON ((u.id = l.seller_id)))
        ), mapped AS (
         SELECT s.id,
            s.title,
            s.brand,
            s.model,
            s.year,
            s.category,
            s.price,
            s.price_currency,
            s.original_price,
            s.location,
            s.description,
            s.images,
            s.seller_id,
            s.seller_name,
            s.seller_plan,
            s.seller_plan_expires,
            s.seller_location,
            s.seller_whatsapp,
            s.seller_avatar,
            s.material,
            s.frame_size,
            s.drivetrain,
            s.drivetrain_detail,
            s.wheelset,
            s.wheel_size,
            s.extras,
            s.plan,
            s.created_at,
            s.slug,
            s.plan_code,
            s.plan_price,
            s.plan_photo_limit,
            s.featured_until,
            s.seo_boost,
            s.whatsapp_enabled,
            s.social_boost,
            s.expires_at,
            s.status,
            s.contact_methods,
            s.renewal_notified_at,
            s.moderation_state,
            s.moderated_by,
            s.moderated_at,
            s.archived_at,
            s.archived_by,
            s.seller_email,
            s.subcategory,
            s.highlight_expires,
            s.granted_visible_photos,
            s.whatsapp_cap_granted,
            s.rank_boost_until,
            s.visible_images_count,
            s.whatsapp_user_disabled,
            s.view_count,
            s.seller_store_enabled,
            s.plan_code_lc,
            s.seller_plan_lc,
                CASE
                    WHEN (s.seller_plan_lc = ANY (ARRAY['básico'::text, 'basico'::text])) THEN 'premium'::text
                    WHEN (s.seller_plan_lc = 'premium'::text) THEN 'pro'::text
                    WHEN (s.plan_code_lc = ANY (ARRAY['básico'::text, 'basico'::text])) THEN 'premium'::text
                    WHEN (s.plan_code_lc = 'premium'::text) THEN 'pro'::text
                    WHEN (s.plan_code_lc = 'pro'::text) THEN 'pro'::text
                    ELSE COALESCE(s.plan_code_lc, s.seller_plan_lc)
                END AS mapped_code
           FROM src s
        )
 SELECT id AS listing_id,
    id,
    slug,
    seller_id,
    title,
    brand,
    model,
    year,
    category,
    subcategory,
    material,
    frame_size,
    wheelset,
    wheel_size,
    drivetrain,
    drivetrain_detail,
    extras,
    plan,
    seller_plan,
    plan_code,
    price,
    price_currency,
    original_price,
    location,
    description,
    images,
    seller_whatsapp,
    cardinality(COALESCE(images, '{}'::text[])) AS photos_total,
    LEAST(cardinality(COALESCE(images, '{}'::text[])), COALESCE(visible_images_count, 4), COALESCE(granted_visible_photos, 4), 12) AS photos_visible,
    granted_visible_photos,
    ((mapped_code = 'tienda'::text) OR seller_store_enabled) AS is_tienda,
        CASE
            WHEN ((mapped_code = 'tienda'::text) OR seller_store_enabled) THEN 'PRO'::text
            WHEN (mapped_code = 'pro'::text) THEN 'PRO'::text
            WHEN (mapped_code = 'premium'::text) THEN 'PREMIUM'::text
            WHEN ((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now())) AND (COALESCE(granted_visible_photos, 4) >= 12)) THEN 'PRO'::text
            WHEN ((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now())) AND (COALESCE(granted_visible_photos, 4) >= 8)) THEN 'PREMIUM'::text
            ELSE 'FREE'::text
        END AS plan_status,
    (((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now()))) OR (mapped_code = ANY (ARRAY['pro'::text, 'premium'::text])) OR ((mapped_code = 'tienda'::text) OR seller_store_enabled)) AS priority_active,
    rank_boost_until,
    whatsapp_cap_granted,
    COALESCE(whatsapp_enabled, false) AS whatsapp_enabled,
    whatsapp_user_disabled,
    (NOT (((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now()))) OR ((mapped_code = 'tienda'::text) OR seller_store_enabled))) AS can_upgrade,
    ((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now()))) AS premium_active,
        CASE
            WHEN ((mapped_code = 'tienda'::text) OR seller_store_enabled) THEN 'PRO'::text
            WHEN (mapped_code = 'pro'::text) THEN 'PRO'::text
            WHEN (mapped_code = 'premium'::text) THEN 'PREMIUM'::text
            WHEN ((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now())) AND (COALESCE(granted_visible_photos, 4) >= 12)) THEN 'PRO'::text
            WHEN ((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now())) AND (COALESCE(granted_visible_photos, 4) >= 8)) THEN 'PREMIUM'::text
            ELSE 'FREE'::text
        END AS plan_tier,
        CASE
            WHEN ((mapped_code = 'tienda'::text) OR seller_store_enabled) THEN 12
            WHEN (mapped_code = 'pro'::text) THEN 12
            WHEN (mapped_code = 'premium'::text) THEN 8
            WHEN ((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now())) AND (COALESCE(granted_visible_photos, 4) >= 12)) THEN 12
            WHEN ((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now())) AND (COALESCE(granted_visible_photos, 4) >= 8)) THEN 8
            ELSE 4
        END AS public_photos_limit,
    LEAST(cardinality(COALESCE(images, '{}'::text[])),
        CASE
            WHEN ((mapped_code = 'tienda'::text) OR seller_store_enabled) THEN 12
            WHEN (mapped_code = 'pro'::text) THEN 12
            WHEN (mapped_code = 'premium'::text) THEN 8
            WHEN ((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now())) AND (COALESCE(granted_visible_photos, 4) >= 12)) THEN 12
            WHEN ((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now())) AND (COALESCE(granted_visible_photos, 4) >= 8)) THEN 8
            ELSE 4
        END) AS public_photos_visible,
    (((mapped_code = 'tienda'::text) OR seller_store_enabled OR ((rank_boost_until IS NOT NULL) AND (rank_boost_until > timezone('utc'::text, now()))) OR (mapped_code = ANY (ARRAY['pro'::text, 'premium'::text]))) AND (COALESCE(granted_visible_photos, 4) >= 8) AND COALESCE(whatsapp_enabled, false) AND (NOT COALESCE(whatsapp_user_disabled, false))) AS wa_public,
    COALESCE(view_count, 0) AS view_count,
    created_at,
    status
   FROM mapped m;


--
-- Name: VIEW listings_enriched; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.listings_enriched IS 'Seller UX + public derivations. Includes product/spec fields from listings (year, material, frame_size, wheel_size, drivetrain, etc.). Tienda se trata como PRO permanente (12 fotos, WA on si habilitado).';


--
-- Name: market_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bike_model_id uuid,
    country character varying(100) DEFAULT 'Argentina'::character varying,
    currency character varying(3) DEFAULT 'ARS'::character varying,
    condition character varying(50),
    year integer,
    calculated_at timestamp with time zone DEFAULT now(),
    sample_size integer DEFAULT 0 NOT NULL,
    avg_price integer,
    median_price integer,
    min_price integer,
    max_price integer,
    std_deviation integer,
    p25 integer,
    p75 integer,
    trend_percent numeric(5,2)
);


--
-- Name: TABLE market_prices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.market_prices IS 'Precios de mercado calculados y cacheados';


--
-- Name: marketing_automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    seller_id uuid,
    scenario text NOT NULL,
    email_to text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_automations_scenario_check CHECK (((scenario IS NOT NULL) AND (btrim(scenario) <> ''::text) AND (scenario ~ '^[a-z0-9_]+$'::text)))
);


--
-- Name: marketing_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_interests (
    id bigint NOT NULL,
    email text NOT NULL,
    category text NOT NULL,
    size text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: marketing_interests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.marketing_interests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.marketing_interests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    type public.notification_type DEFAULT 'system'::public.notification_type NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    cta_url text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid DEFAULT auth.uid() NOT NULL,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['marketing'::public.notification_type, 'question'::public.notification_type, 'offer'::public.notification_type, 'system'::public.notification_type])))
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'ARS'::text NOT NULL,
    period_days integer DEFAULT 30 NOT NULL,
    listing_duration_days integer,
    max_listings integer DEFAULT 1 NOT NULL,
    max_photos integer DEFAULT 4 NOT NULL,
    featured_days integer DEFAULT 0 NOT NULL,
    whatsapp_enabled boolean DEFAULT false NOT NULL,
    social_boost boolean DEFAULT false NOT NULL,
    description text,
    accent_color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seo_boost boolean DEFAULT false NOT NULL,
    featured_slots integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.plans FORCE ROW LEVEL SECURITY;


--
-- Name: price_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    price_listing_id uuid,
    old_price integer NOT NULL,
    new_price integer NOT NULL,
    changed_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: price_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    bike_model_id uuid,
    condition character varying(50),
    max_price integer NOT NULL,
    currency character varying(3) DEFAULT 'ARS'::character varying,
    is_active boolean DEFAULT true,
    last_notified_at timestamp with time zone,
    notification_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE price_alerts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.price_alerts IS 'Alertas de precio configuradas por usuarios';


--
-- Name: price_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bike_model_id uuid,
    source character varying(50) NOT NULL,
    external_id character varying(255),
    external_url text,
    price integer NOT NULL,
    currency character varying(3) DEFAULT 'ARS'::character varying,
    price_usd integer,
    year integer,
    condition character varying(50),
    size character varying(20),
    color character varying(50),
    has_upgrades boolean DEFAULT false,
    country character varying(100) DEFAULT 'Argentina'::character varying,
    province character varying(100),
    city character varying(100),
    listed_at timestamp with time zone,
    scraped_at timestamp with time zone DEFAULT now(),
    sold_at timestamp with time zone,
    status character varying(20) DEFAULT 'active'::character varying,
    raw_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT price_listings_condition_check CHECK (((condition)::text = ANY ((ARRAY['new'::character varying, 'like_new'::character varying, 'used'::character varying, 'good'::character varying, 'fair'::character varying, 'poor'::character varying])::text[]))),
    CONSTRAINT price_listings_price_check CHECK ((price > 0)),
    CONSTRAINT price_listings_source_check CHECK (((source)::text = ANY ((ARRAY['ciclomarket'::character varying, 'mercadolibre'::character varying, 'facebook'::character varying, 'instagram'::character varying, 'manual'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT price_listings_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'sold'::character varying, 'expired'::character varying, 'deleted'::character varying])::text[])))
);


--
-- Name: TABLE price_listings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.price_listings IS 'Publicaciones de precios de todas las fuentes (Ciclo Market, ML, etc)';


--
-- Name: processed_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_payments (
    payment_id text NOT NULL,
    status text DEFAULT 'processing'::text NOT NULL,
    processed_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recommended_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommended_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    icon character varying(50),
    reason text NOT NULL,
    seller_id uuid,
    listing_id uuid,
    expected_conversion_lift numeric(5,4),
    estimated_value integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    dismissed boolean DEFAULT false NOT NULL,
    dismissed_at timestamp with time zone,
    completed boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    completed_by uuid,
    CONSTRAINT recommended_actions_priority_check CHECK (((priority)::text = ANY ((ARRAY['critical'::character varying, 'high'::character varying, 'medium'::character varying, 'low'::character varying])::text[]))),
    CONSTRAINT recommended_actions_type_check CHECK (((type)::text = ANY ((ARRAY['contact_whatsapp'::character varying, 'contact_email'::character varying, 'send_template'::character varying, 'create_task'::character varying, 'suggest_price_drop'::character varying, 'suggest_improve_photos'::character varying, 'suggest_verify_identity'::character varying, 'suggest_add_whatsapp'::character varying, 'mark_at_risk'::character varying, 'schedule_followup'::character varying, 'manual_review'::character varying])::text[])))
);


--
-- Name: review_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    listing_id uuid,
    contact_event_id uuid,
    ready_at timestamp with time zone NOT NULL,
    sent_email boolean DEFAULT false NOT NULL,
    sent_inapp boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.review_reminders FORCE ROW LEVEL SECURITY;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id text NOT NULL,
    buyer_id text NOT NULL,
    listing_id text,
    rating integer NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'published'::text NOT NULL,
    seller_reply text,
    seller_reply_at timestamp with time zone,
    is_verified_sale boolean DEFAULT false NOT NULL,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_rating_range_chk CHECK (((rating >= 1) AND (rating <= 5)))
);

ALTER TABLE ONLY public.reviews FORCE ROW LEVEL SECURITY;


--
-- Name: saved_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_searches (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    criteria jsonb NOT NULL,
    name character varying(255),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_searches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.saved_searches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: saved_searches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.saved_searches_id_seq OWNED BY public.saved_searches.id;


--
-- Name: seller_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    note text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seller_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seller_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    type text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    due_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT seller_tasks_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'automation'::text]))),
    CONSTRAINT seller_tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'done'::text, 'snoozed'::text])))
);


--
-- Name: share_boosts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_boosts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id text NOT NULL,
    listing_id text NOT NULL,
    type text NOT NULL,
    handle text,
    proof_url text,
    note text,
    reward text DEFAULT 'boost7'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by text,
    CONSTRAINT share_boosts_type_check CHECK ((type = ANY (ARRAY['story'::text, 'post'::text])))
);

ALTER TABLE ONLY public.share_boosts FORCE ROW LEVEL SECURITY;


--
-- Name: store_listing_summary_30d; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.store_listing_summary_30d WITH (security_invoker='true') AS
 WITH base AS (
         SELECT e.listing_id,
            e.store_user_id,
            sum(
                CASE
                    WHEN (e.type = 'listing_view'::text) THEN 1
                    ELSE 0
                END) AS views,
            sum(
                CASE
                    WHEN (e.type = 'wa_click'::text) THEN 1
                    ELSE 0
                END) AS wa_clicks
           FROM (public.events e
             JOIN public.listings l ON (((l.id = e.listing_id) AND (COALESCE(l.status, ''::text) = 'active'::text))))
          WHERE ((e.created_at >= (now() - '30 days'::interval)) AND (e.store_user_id IS NOT NULL))
          GROUP BY e.listing_id, e.store_user_id
        )
 SELECT listing_id,
    store_user_id,
    views,
    wa_clicks,
        CASE
            WHEN (views > 0) THEN round(((100.0 * (wa_clicks)::numeric) / (views)::numeric), 2)
            ELSE (0)::numeric
        END AS ctr
   FROM base
  ORDER BY wa_clicks DESC NULLS LAST, views DESC NULLS LAST;


--
-- Name: store_metrics_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.store_metrics_daily WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, created_at) AS day,
    type,
    listing_id,
    store_user_id,
    count(*) AS total
   FROM public.events
  WHERE ((created_at >= (now() - '90 days'::interval)) AND (store_user_id IS NOT NULL))
  GROUP BY (date_trunc('day'::text, created_at)), type, listing_id, store_user_id
  ORDER BY (date_trunc('day'::text, created_at));


--
-- Name: store_summary_30d; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.store_summary_30d WITH (security_invoker='true') AS
 SELECT e.store_user_id,
    sum(
        CASE
            WHEN (e.type = 'store_view'::text) THEN 1
            ELSE 0
        END) AS store_views,
    sum(
        CASE
            WHEN ((e.type = 'listing_view'::text) AND (COALESCE(l.status, ''::text) = 'active'::text)) THEN 1
            ELSE 0
        END) AS listing_views,
    sum(
        CASE
            WHEN ((e.type = 'wa_click'::text) AND (COALESCE(l.status, ''::text) = 'active'::text)) THEN 1
            ELSE 0
        END) AS wa_clicks
   FROM (public.events e
     LEFT JOIN public.listings l ON ((l.id = e.listing_id)))
  WHERE ((e.created_at >= (now() - '30 days'::interval)) AND (e.store_user_id IS NOT NULL))
  GROUP BY e.store_user_id;


--
-- Name: support_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_requests (
    id bigint NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: support_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.support_requests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.support_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sweepstakes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sweepstakes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sweepstakes_check CHECK ((start_at < end_at))
);


--
-- Name: sweepstakes_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sweepstakes_participants (
    sweepstake_id uuid NOT NULL,
    user_id uuid NOT NULL,
    first_listing_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sweepstakes_winners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sweepstakes_winners (
    sweepstake_id uuid NOT NULL,
    user_id uuid NOT NULL,
    selected_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    weekly_digest boolean DEFAULT true,
    new_contacts boolean DEFAULT true,
    price_drops boolean DEFAULT false,
    listing_expiring boolean DEFAULT true,
    marketing_emails boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE user_notification_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_notification_settings IS 'Preferencias de notificaciones por usuario para el dashboard de tienda';


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: v_review_reminders_ready; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_review_reminders_ready WITH (security_invoker='true') AS
 SELECT id,
    seller_id,
    buyer_id,
    listing_id,
    contact_event_id,
    ready_at,
    sent_email,
    sent_inapp,
    created_at
   FROM public.review_reminders r
  WHERE ((ready_at <= now()) AND ((NOT sent_email) OR (NOT sent_inapp)));


--
-- Name: verification_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    instagram text,
    phone text,
    message text NOT NULL,
    attachments text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_searches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches ALTER COLUMN id SET DEFAULT nextval('public.saved_searches_id_seq'::regclass);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: automation_logs automation_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_pkey PRIMARY KEY (id);


--
-- Name: automation_rules automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);


--
-- Name: bike_models bike_models_brand_model_year_released_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bike_models
    ADD CONSTRAINT bike_models_brand_model_year_released_key UNIQUE (brand, model, year_released);


--
-- Name: bike_models bike_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bike_models
    ADD CONSTRAINT bike_models_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_slug_key UNIQUE (slug);


--
-- Name: contact_events contact_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_events
    ADD CONSTRAINT contact_events_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: follow_up_schedules follow_up_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_schedules
    ADD CONSTRAINT follow_up_schedules_pkey PRIMARY KEY (id);


--
-- Name: gift_codes gift_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_codes
    ADD CONSTRAINT gift_codes_pkey PRIMARY KEY (code);


--
-- Name: gift_redemptions gift_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_redemptions
    ADD CONSTRAINT gift_redemptions_pkey PRIMARY KEY (id);


--
-- Name: kanban_cards kanban_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_cards
    ADD CONSTRAINT kanban_cards_pkey PRIMARY KEY (id);


--
-- Name: kanban_moves kanban_moves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_moves
    ADD CONSTRAINT kanban_moves_pkey PRIMARY KEY (id);


--
-- Name: listing_likes listing_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_likes
    ADD CONSTRAINT listing_likes_pkey PRIMARY KEY (listing_id, user_id);


--
-- Name: listing_plan_periods listing_plan_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_plan_periods
    ADD CONSTRAINT listing_plan_periods_pkey PRIMARY KEY (id);


--
-- Name: listing_questions listing_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_questions
    ADD CONSTRAINT listing_questions_pkey PRIMARY KEY (id);


--
-- Name: listing_status_events listing_status_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_status_events
    ADD CONSTRAINT listing_status_events_pkey PRIMARY KEY (id);


--
-- Name: listing_views listing_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_views
    ADD CONSTRAINT listing_views_pkey PRIMARY KEY (id);


--
-- Name: listings listings_images_max12_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.listings
    ADD CONSTRAINT listings_images_max12_chk CHECK (((images IS NULL) OR (array_length(images, 1) <= 12))) NOT VALID;


--
-- Name: listings listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);


--
-- Name: listings listings_visible_images_le_granted_chk; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.listings
    ADD CONSTRAINT listings_visible_images_le_granted_chk CHECK ((visible_images_count <= granted_visible_photos)) NOT VALID;


--
-- Name: market_prices market_prices_bike_model_id_country_currency_condition_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_prices
    ADD CONSTRAINT market_prices_bike_model_id_country_currency_condition_year_key UNIQUE (bike_model_id, country, currency, condition, year);


--
-- Name: market_prices market_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_prices
    ADD CONSTRAINT market_prices_pkey PRIMARY KEY (id);


--
-- Name: marketing_automations marketing_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_automations
    ADD CONSTRAINT marketing_automations_pkey PRIMARY KEY (id);


--
-- Name: marketing_interests marketing_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_interests
    ADD CONSTRAINT marketing_interests_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: plans plans_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_code_key UNIQUE (code);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: price_adjustments price_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_adjustments
    ADD CONSTRAINT price_adjustments_pkey PRIMARY KEY (id);


--
-- Name: price_alerts price_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_alerts
    ADD CONSTRAINT price_alerts_pkey PRIMARY KEY (id);


--
-- Name: price_listings price_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_listings
    ADD CONSTRAINT price_listings_pkey PRIMARY KEY (id);


--
-- Name: processed_payments processed_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_payments
    ADD CONSTRAINT processed_payments_pkey PRIMARY KEY (payment_id);


--
-- Name: publish_credits publish_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.publish_credits
    ADD CONSTRAINT publish_credits_pkey PRIMARY KEY (id);


--
-- Name: recommended_actions recommended_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommended_actions
    ADD CONSTRAINT recommended_actions_pkey PRIMARY KEY (id);


--
-- Name: review_reminders review_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_reminders
    ADD CONSTRAINT review_reminders_pkey PRIMARY KEY (id);


--
-- Name: review_reminders review_reminders_seller_id_buyer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_reminders
    ADD CONSTRAINT review_reminders_seller_id_buyer_id_key UNIQUE (seller_id, buyer_id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_seller_id_buyer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_seller_id_buyer_id_key UNIQUE (seller_id, buyer_id);


--
-- Name: saved_searches saved_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_pkey PRIMARY KEY (id);


--
-- Name: seller_comm_prefs seller_comm_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_comm_prefs
    ADD CONSTRAINT seller_comm_prefs_pkey PRIMARY KEY (seller_id);


--
-- Name: seller_notes seller_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_notes
    ADD CONSTRAINT seller_notes_pkey PRIMARY KEY (id);


--
-- Name: seller_outreach seller_outreach_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_outreach
    ADD CONSTRAINT seller_outreach_pkey PRIMARY KEY (id);


--
-- Name: seller_pipeline seller_pipeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_pipeline
    ADD CONSTRAINT seller_pipeline_pkey PRIMARY KEY (seller_id);


--
-- Name: seller_sale_confirmations seller_sale_confirmations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_sale_confirmations
    ADD CONSTRAINT seller_sale_confirmations_pkey PRIMARY KEY (id);


--
-- Name: seller_tasks seller_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_tasks
    ADD CONSTRAINT seller_tasks_pkey PRIMARY KEY (id);


--
-- Name: share_boosts share_boosts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_boosts
    ADD CONSTRAINT share_boosts_pkey PRIMARY KEY (id);


--
-- Name: support_requests support_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_requests
    ADD CONSTRAINT support_requests_pkey PRIMARY KEY (id);


--
-- Name: sweepstakes_participants sweepstakes_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sweepstakes_participants
    ADD CONSTRAINT sweepstakes_participants_pkey PRIMARY KEY (sweepstake_id, user_id);


--
-- Name: sweepstakes sweepstakes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sweepstakes
    ADD CONSTRAINT sweepstakes_pkey PRIMARY KEY (id);


--
-- Name: sweepstakes sweepstakes_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sweepstakes
    ADD CONSTRAINT sweepstakes_slug_key UNIQUE (slug);


--
-- Name: sweepstakes_winners sweepstakes_winners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sweepstakes_winners
    ADD CONSTRAINT sweepstakes_winners_pkey PRIMARY KEY (sweepstake_id);


--
-- Name: user_notification_settings user_notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_settings
    ADD CONSTRAINT user_notification_settings_pkey PRIMARY KEY (id);


--
-- Name: user_notification_settings user_notification_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_settings
    ADD CONSTRAINT user_notification_settings_user_id_key UNIQUE (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_store_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_store_slug_key UNIQUE (store_slug);


--
-- Name: verification_requests verification_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_requests
    ADD CONSTRAINT verification_requests_pkey PRIMARY KEY (id);


--
-- Name: blog_posts_status_published_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_status_published_at_idx ON public.blog_posts USING btree (status, published_at DESC);


--
-- Name: blog_posts_tags_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blog_posts_tags_gin_idx ON public.blog_posts USING gin (tags);


--
-- Name: contact_events_listing_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_events_listing_id_created_at_idx ON public.contact_events USING btree (listing_id, created_at DESC);


--
-- Name: contact_events_seller_buyer_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_events_seller_buyer_created_idx ON public.contact_events USING btree (seller_id, buyer_id, created_at DESC);


--
-- Name: contact_events_seller_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_events_seller_id_created_at_idx ON public.contact_events USING btree (seller_id, created_at DESC);


--
-- Name: events_listing_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_listing_created_at_idx ON public.events USING btree (listing_id, created_at DESC);


--
-- Name: events_store_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_store_created_at_idx ON public.events USING btree (store_user_id, created_at DESC);


--
-- Name: events_type_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_type_created_at_idx ON public.events USING btree (type, created_at DESC);


--
-- Name: idx_bike_models_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bike_models_brand ON public.bike_models USING btree (brand);


--
-- Name: idx_bike_models_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bike_models_category ON public.bike_models USING btree (category);


--
-- Name: idx_bike_models_popular; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bike_models_popular ON public.bike_models USING btree (is_popular) WHERE (is_popular = true);


--
-- Name: idx_kanban_cards_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_cards_assigned ON public.kanban_cards USING btree (assigned_to);


--
-- Name: idx_kanban_cards_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_cards_priority ON public.kanban_cards USING btree (priority);


--
-- Name: idx_kanban_cards_seller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_cards_seller ON public.kanban_cards USING btree (seller_id);


--
-- Name: idx_kanban_cards_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_cards_stage ON public.kanban_cards USING btree (stage);


--
-- Name: idx_kanban_moves_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_moves_card ON public.kanban_moves USING btree (card_id);


--
-- Name: idx_listing_questions_listing_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listing_questions_listing_created ON public.listing_questions USING btree (listing_id, created_at);


--
-- Name: idx_listings_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_expires_at ON public.listings USING btree (expires_at);


--
-- Name: idx_listings_highlight_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_highlight_expires ON public.listings USING btree (highlight_expires DESC NULLS LAST);


--
-- Name: idx_listings_plan_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_plan_code ON public.listings USING btree (plan_code);


--
-- Name: idx_listings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_status ON public.listings USING btree (status);


--
-- Name: idx_lq_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lq_created ON public.listing_questions USING btree (created_at);


--
-- Name: idx_market_prices_calculated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_prices_calculated ON public.market_prices USING btree (calculated_at);


--
-- Name: idx_market_prices_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_prices_model ON public.market_prices USING btree (bike_model_id);


--
-- Name: idx_marketing_automations_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_automations_listing ON public.marketing_automations USING btree (listing_id, scenario, sent_at DESC);


--
-- Name: idx_marketing_automations_scenario_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_automations_scenario_sent ON public.marketing_automations USING btree (scenario, sent_at DESC);


--
-- Name: idx_notif_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_user ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_price_adjustments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_adjustments_date ON public.price_adjustments USING btree (changed_at);


--
-- Name: idx_price_adjustments_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_adjustments_listing ON public.price_adjustments USING btree (price_listing_id);


--
-- Name: idx_price_alerts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_alerts_active ON public.price_alerts USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_price_alerts_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_alerts_model ON public.price_alerts USING btree (bike_model_id);


--
-- Name: idx_price_alerts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_alerts_user ON public.price_alerts USING btree (user_id);


--
-- Name: idx_price_listings_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_listings_date ON public.price_listings USING btree (listed_at);


--
-- Name: idx_price_listings_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_listings_location ON public.price_listings USING btree (province, city);


--
-- Name: idx_price_listings_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_listings_model ON public.price_listings USING btree (bike_model_id);


--
-- Name: idx_price_listings_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_listings_price ON public.price_listings USING btree (price_usd);


--
-- Name: idx_price_listings_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_listings_source ON public.price_listings USING btree (source);


--
-- Name: idx_price_listings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_listings_status ON public.price_listings USING btree (status) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_publish_credits_preference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publish_credits_preference ON public.publish_credits USING btree (provider, preference_id);


--
-- Name: idx_publish_credits_provider_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publish_credits_provider_ref ON public.publish_credits USING btree (provider, provider_ref);


--
-- Name: idx_publish_credits_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_publish_credits_user ON public.publish_credits USING btree (user_id, status);


--
-- Name: idx_recommended_actions_dismissed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommended_actions_dismissed ON public.recommended_actions USING btree (dismissed, completed);


--
-- Name: idx_recommended_actions_seller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recommended_actions_seller ON public.recommended_actions USING btree (seller_id);


--
-- Name: idx_user_notification_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notification_settings_user_id ON public.user_notification_settings USING btree (user_id);


--
-- Name: ix_contact_events_seller_buyer_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contact_events_seller_buyer_created_at ON public.contact_events USING btree (seller_id, buyer_id, created_at);


--
-- Name: ix_listings_subcategory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_listings_subcategory ON public.listings USING btree (subcategory);


--
-- Name: ix_review_reminders_buyer_ready; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_review_reminders_buyer_ready ON public.review_reminders USING btree (buyer_id, ready_at);


--
-- Name: ix_review_reminders_ready_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_review_reminders_ready_at ON public.review_reminders USING btree (ready_at);


--
-- Name: ix_reviews_seller_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_reviews_seller_id ON public.reviews USING btree (seller_id);


--
-- Name: ix_reviews_seller_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_reviews_seller_id_created_at ON public.reviews USING btree (seller_id, created_at DESC);


--
-- Name: ix_sweepstakes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sweepstakes_active ON public.sweepstakes USING btree (start_at, end_at);


--
-- Name: ix_sweepstakes_participants_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sweepstakes_participants_created ON public.sweepstakes_participants USING btree (created_at DESC);


--
-- Name: ix_sweepstakes_participants_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sweepstakes_participants_listing ON public.sweepstakes_participants USING btree (first_listing_id);


--
-- Name: ix_users_store_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_store_enabled ON public.users USING btree (store_enabled) WHERE (store_enabled = true);


--
-- Name: ix_users_store_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_users_store_slug ON public.users USING btree (store_slug);


--
-- Name: listing_plan_periods_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_plan_periods_listing_idx ON public.listing_plan_periods USING btree (listing_id, started_at DESC);


--
-- Name: listing_questions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_questions_created_at_idx ON public.listing_questions USING btree (created_at DESC);


--
-- Name: listing_questions_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_questions_listing_id_idx ON public.listing_questions USING btree (listing_id);


--
-- Name: listing_status_events_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_status_events_listing_idx ON public.listing_status_events USING btree (listing_id, changed_at DESC);


--
-- Name: listing_status_events_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_status_events_status_idx ON public.listing_status_events USING btree (next_status, changed_at DESC);


--
-- Name: listing_views_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_views_created_at_idx ON public.listing_views USING btree (created_at DESC);


--
-- Name: listing_views_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_views_listing_id_idx ON public.listing_views USING btree (listing_id);


--
-- Name: listings_admin_active_counts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_admin_active_counts_idx ON public.listings USING btree (seller_id, expires_at) WHERE ((archived_at IS NULL) AND ((status IS NULL) OR (lower(status) = ANY (ARRAY['active'::text, 'published'::text]))) AND ((moderation_state IS NULL) OR (lower(moderation_state) = 'approved'::text)));


--
-- Name: listings_moderation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_moderation_idx ON public.listings USING btree (moderation_state);


--
-- Name: listings_rank_boost_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_rank_boost_idx ON public.listings USING btree (rank_boost_until) WHERE (status = ANY (ARRAY['active'::text, 'published'::text]));


--
-- Name: listings_seller_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_seller_status_idx ON public.listings USING btree (seller_id, status);


--
-- Name: listings_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX listings_slug_unique ON public.listings USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: listings_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_status_created_idx ON public.listings USING btree (status, created_at DESC);


--
-- Name: notifications_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at);


--
-- Name: processed_payments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX processed_payments_status_idx ON public.processed_payments USING btree (status);


--
-- Name: publish_credits_preference_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX publish_credits_preference_id_key ON public.publish_credits USING btree (preference_id, provider) WHERE (preference_id IS NOT NULL);


--
-- Name: publish_credits_provider_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX publish_credits_provider_ref_key ON public.publish_credits USING btree (provider_ref, provider) WHERE (provider_ref IS NOT NULL);


--
-- Name: publish_credits_used_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX publish_credits_used_at_idx ON public.publish_credits USING btree (status, used_at, listing_id);


--
-- Name: publish_credits_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX publish_credits_user_status_idx ON public.publish_credits USING btree (user_id, status, created_at DESC);


--
-- Name: publish_credits_welcome_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX publish_credits_welcome_once ON public.publish_credits USING btree (user_id, provider) WHERE (provider = 'welcome'::text);


--
-- Name: reviews_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reviews_buyer_idx ON public.reviews USING btree (buyer_id);


--
-- Name: saved_searches_criteria_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_searches_criteria_gin ON public.saved_searches USING gin (criteria);


--
-- Name: saved_searches_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_searches_user_id_idx ON public.saved_searches USING btree (user_id);


--
-- Name: seller_notes_seller_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_notes_seller_created_idx ON public.seller_notes USING btree (seller_id, created_at DESC);


--
-- Name: seller_outreach_seller_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_outreach_seller_created_idx ON public.seller_outreach USING btree (seller_id, created_at DESC);


--
-- Name: seller_outreach_seller_sent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_outreach_seller_sent_idx ON public.seller_outreach USING btree (seller_id, sent_at DESC);


--
-- Name: seller_sale_confirmations_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_sale_confirmations_listing_idx ON public.seller_sale_confirmations USING btree (listing_id);


--
-- Name: seller_sale_confirmations_seller_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_sale_confirmations_seller_created_idx ON public.seller_sale_confirmations USING btree (seller_id, created_at DESC);


--
-- Name: seller_tasks_due_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_tasks_due_status_idx ON public.seller_tasks USING btree (due_at, status);


--
-- Name: seller_tasks_seller_status_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX seller_tasks_seller_status_due_idx ON public.seller_tasks USING btree (seller_id, status, due_at);


--
-- Name: share_boosts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX share_boosts_status_idx ON public.share_boosts USING btree (status, created_at DESC);


--
-- Name: users_avatar_url_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_avatar_url_idx ON public.users USING btree (avatar_url);


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_idx ON public.users USING btree (email);


--
-- Name: users_profile_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_profile_slug_idx ON public.users USING btree (profile_slug);


--
-- Name: users_profile_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_profile_slug_key ON public.users USING btree (lower(profile_slug)) WHERE ((profile_slug IS NOT NULL) AND (profile_slug <> ''::text));


--
-- Name: ux_users_store_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_users_store_slug ON public.users USING btree (store_slug) WHERE (store_slug IS NOT NULL);


--
-- Name: blog_posts blog_posts_set_published_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blog_posts_set_published_at BEFORE INSERT OR UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.handle_blog_post_publish_timestamp();


--
-- Name: blog_posts blog_posts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blog_posts_set_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.handle_blog_post_updated_at();


--
-- Name: contact_events contact_events_create_review_reminder; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contact_events_create_review_reminder AFTER INSERT ON public.contact_events FOR EACH ROW EXECUTE FUNCTION public.trg_contact_events_create_review_reminder();


--
-- Name: listings listings_apply_pro_for_stores; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_apply_pro_for_stores BEFORE INSERT OR UPDATE OF seller_id, seller_plan, plan, plan_code, expires_at, seller_plan_expires ON public.listings FOR EACH ROW EXECUTE FUNCTION public.trg_listings_apply_pro_for_stores();


--
-- Name: listings listings_no_phones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_no_phones BEFORE INSERT OR UPDATE OF description, extras ON public.listings FOR EACH ROW EXECUTE FUNCTION public.trg_listings_no_phones();


--
-- Name: app_settings trg_app_settings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_settings_set_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: listings trg_enforce_free_listing_expiry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_free_listing_expiry BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.enforce_free_listing_expiry();


--
-- Name: listings trg_guard_premium_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_premium_fields BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.guard_premium_fields();


--
-- Name: listing_views trg_increment_listing_view_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_increment_listing_view_count AFTER INSERT ON public.listing_views FOR EACH ROW EXECUTE FUNCTION public.fn_increment_listing_view_count();


--
-- Name: listings trg_listing_participation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_listing_participation AFTER INSERT ON public.listings FOR EACH ROW EXECUTE FUNCTION public.fn_add_participant_on_listing();


--
-- Name: listing_questions trg_listing_questions_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_listing_questions_audit BEFORE INSERT OR UPDATE ON public.listing_questions FOR EACH ROW EXECUTE FUNCTION public.trg_listing_questions_audit();


--
-- Name: listing_questions trg_listing_questions_meta; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_listing_questions_meta BEFORE INSERT OR UPDATE ON public.listing_questions FOR EACH ROW EXECUTE FUNCTION public.trg_listing_questions_set_meta();


--
-- Name: listings trg_listing_status_events_biu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_listing_status_events_biu AFTER INSERT OR UPDATE OF status ON public.listings FOR EACH ROW EXECUTE FUNCTION public.trg_listing_status_events();


--
-- Name: listings trg_listings_apply_plan; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_listings_apply_plan BEFORE INSERT OR UPDATE OF plan_code ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_apply_plan_snapshot();


--
-- Name: listings trg_listings_no_phones_biu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_listings_no_phones_biu BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.trg_listings_no_phones();


--
-- Name: listings trg_listings_plan_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_listings_plan_guard BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_plan_guard();


--
-- Name: listings trg_listings_slug_bi; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_listings_slug_bi BEFORE INSERT ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_slug_bi();


--
-- Name: listings trg_listings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_listings_updated_at BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.trg_update_updated_at();


--
-- Name: listing_questions trg_lq_meta; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lq_meta BEFORE INSERT OR UPDATE ON public.listing_questions FOR EACH ROW EXECUTE FUNCTION public.trg_lq_set_meta();


--
-- Name: listing_questions trg_questions_no_phones_biu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_questions_no_phones_biu BEFORE INSERT OR UPDATE ON public.listing_questions FOR EACH ROW EXECUTE FUNCTION public.trg_questions_no_phones();


--
-- Name: users trg_users_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();


--
-- Name: bike_models update_bike_models_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bike_models_updated_at BEFORE UPDATE ON public.bike_models FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: price_listings update_price_listings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_price_listings_updated_at BEFORE UPDATE ON public.price_listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_notification_settings update_user_notification_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_notification_settings_updated_at BEFORE UPDATE ON public.user_notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users users_store_slug_normalize; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER users_store_slug_normalize BEFORE INSERT OR UPDATE OF store_slug ON public.users FOR EACH ROW EXECUTE FUNCTION public.trg_users_store_slug_normalize();


--
-- Name: automation_logs automation_logs_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_logs
    ADD CONSTRAINT automation_logs_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.automation_rules(id) ON DELETE CASCADE;


--
-- Name: blog_posts blog_posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: follow_up_schedules follow_up_schedules_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_schedules
    ADD CONSTRAINT follow_up_schedules_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: follow_up_schedules follow_up_schedules_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_up_schedules
    ADD CONSTRAINT follow_up_schedules_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: gift_redemptions gift_redemptions_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_redemptions
    ADD CONSTRAINT gift_redemptions_code_fkey FOREIGN KEY (code) REFERENCES public.gift_codes(code);


--
-- Name: kanban_cards kanban_cards_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_cards
    ADD CONSTRAINT kanban_cards_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: kanban_cards kanban_cards_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_cards
    ADD CONSTRAINT kanban_cards_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: kanban_moves kanban_moves_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_moves
    ADD CONSTRAINT kanban_moves_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.kanban_cards(id) ON DELETE CASCADE;


--
-- Name: listing_plan_periods listing_plan_periods_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_plan_periods
    ADD CONSTRAINT listing_plan_periods_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_questions listing_questions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_questions
    ADD CONSTRAINT listing_questions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_views listing_views_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_views
    ADD CONSTRAINT listing_views_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id);


--
-- Name: listings listings_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES auth.users(id);


--
-- Name: listings listings_moderated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES auth.users(id);


--
-- Name: listings listings_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: market_prices market_prices_bike_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_prices
    ADD CONSTRAINT market_prices_bike_model_id_fkey FOREIGN KEY (bike_model_id) REFERENCES public.bike_models(id) ON DELETE CASCADE;


--
-- Name: marketing_automations marketing_automations_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_automations
    ADD CONSTRAINT marketing_automations_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: marketing_automations marketing_automations_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_automations
    ADD CONSTRAINT marketing_automations_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id);


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: price_adjustments price_adjustments_price_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_adjustments
    ADD CONSTRAINT price_adjustments_price_listing_id_fkey FOREIGN KEY (price_listing_id) REFERENCES public.price_listings(id) ON DELETE CASCADE;


--
-- Name: price_alerts price_alerts_bike_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_alerts
    ADD CONSTRAINT price_alerts_bike_model_id_fkey FOREIGN KEY (bike_model_id) REFERENCES public.bike_models(id) ON DELETE CASCADE;


--
-- Name: price_alerts price_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_alerts
    ADD CONSTRAINT price_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: price_listings price_listings_bike_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_listings
    ADD CONSTRAINT price_listings_bike_model_id_fkey FOREIGN KEY (bike_model_id) REFERENCES public.bike_models(id) ON DELETE SET NULL;


--
-- Name: recommended_actions recommended_actions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommended_actions
    ADD CONSTRAINT recommended_actions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: recommended_actions recommended_actions_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommended_actions
    ADD CONSTRAINT recommended_actions_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_searches saved_searches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: seller_comm_prefs seller_comm_prefs_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_comm_prefs
    ADD CONSTRAINT seller_comm_prefs_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: seller_notes seller_notes_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_notes
    ADD CONSTRAINT seller_notes_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: seller_outreach seller_outreach_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_outreach
    ADD CONSTRAINT seller_outreach_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: seller_outreach seller_outreach_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_outreach
    ADD CONSTRAINT seller_outreach_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: seller_pipeline seller_pipeline_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_pipeline
    ADD CONSTRAINT seller_pipeline_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: seller_sale_confirmations seller_sale_confirmations_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_sale_confirmations
    ADD CONSTRAINT seller_sale_confirmations_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: seller_sale_confirmations seller_sale_confirmations_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_sale_confirmations
    ADD CONSTRAINT seller_sale_confirmations_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: seller_tasks seller_tasks_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seller_tasks
    ADD CONSTRAINT seller_tasks_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sweepstakes_participants sweepstakes_participants_sweepstake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sweepstakes_participants
    ADD CONSTRAINT sweepstakes_participants_sweepstake_id_fkey FOREIGN KEY (sweepstake_id) REFERENCES public.sweepstakes(id) ON DELETE CASCADE;


--
-- Name: sweepstakes_winners sweepstakes_winners_sweepstake_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sweepstakes_winners
    ADD CONSTRAINT sweepstakes_winners_sweepstake_id_fkey FOREIGN KEY (sweepstake_id) REFERENCES public.sweepstakes(id) ON DELETE CASCADE;


--
-- Name: user_notification_settings user_notification_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_settings
    ADD CONSTRAINT user_notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: automation_logs Allow moderator access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow moderator access" ON public.automation_logs USING (public.is_moderator(auth.uid()));


--
-- Name: automation_rules Allow moderator access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow moderator access" ON public.automation_rules USING (public.is_moderator(auth.uid()));


--
-- Name: follow_up_schedules Allow moderator access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow moderator access" ON public.follow_up_schedules USING (public.is_moderator(auth.uid()));


--
-- Name: kanban_cards Allow moderator access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow moderator access" ON public.kanban_cards USING (public.is_moderator(auth.uid()));


--
-- Name: kanban_moves Allow moderator access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow moderator access" ON public.kanban_moves USING (public.is_moderator(auth.uid()));


--
-- Name: recommended_actions Allow moderator access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow moderator access" ON public.recommended_actions USING (public.is_moderator(auth.uid()));


--
-- Name: marketing_interests Anyone inserts marketing interest; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone inserts marketing interest" ON public.marketing_interests FOR INSERT WITH CHECK ((( SELECT ( SELECT auth.role() AS role) AS role) = ANY (ARRAY['anon'::text, 'authenticated'::text])));


--
-- Name: support_requests Anyone inserts support requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone inserts support requests" ON public.support_requests FOR INSERT WITH CHECK ((( SELECT ( SELECT auth.role() AS role) AS role) = ANY (ARRAY['anon'::text, 'authenticated'::text])));


--
-- Name: saved_searches Saved searches are readable by owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Saved searches are readable by owner" ON public.saved_searches FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: saved_searches Saved searches are writable by owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Saved searches are writable by owner" ON public.saved_searches FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: saved_searches Saved searches deletable by owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Saved searches deletable by owner" ON public.saved_searches FOR DELETE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_notification_settings Users can insert own notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own notification settings" ON public.user_notification_settings FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_notification_settings Users can update own notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notification settings" ON public.user_notification_settings FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_notification_settings Users can view own notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notification settings" ON public.user_notification_settings FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: users Users read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own profile" ON public.users FOR SELECT USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: users Users update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own profile" ON public.users FOR UPDATE USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: users Users upsert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users upsert own profile" ON public.users FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_questions authenticated users can ask questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated users can ask questions" ON public.listing_questions FOR INSERT WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (( SELECT auth.uid() AS uid) IS NOT NULL)));


--
-- Name: automation_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: automation_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: bike_models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bike_models ENABLE ROW LEVEL SECURITY;

--
-- Name: bike_models bike_models_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bike_models_public_read ON public.bike_models FOR SELECT USING (true);


--
-- Name: blog_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_posts blog_posts_delete_moderators; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blog_posts_delete_moderators ON public.blog_posts FOR DELETE USING (public.is_moderator(( SELECT auth.uid() AS uid)));


--
-- Name: blog_posts blog_posts_insert_moderators; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blog_posts_insert_moderators ON public.blog_posts FOR INSERT WITH CHECK (public.is_moderator(( SELECT auth.uid() AS uid)));


--
-- Name: blog_posts blog_posts_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blog_posts_public_select ON public.blog_posts FOR SELECT USING (((status = 'published'::text) OR (( SELECT auth.uid() AS uid) = author_id) OR public.is_moderator(( SELECT auth.uid() AS uid))));


--
-- Name: blog_posts blog_posts_update_author; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blog_posts_update_author ON public.blog_posts FOR UPDATE USING (((( SELECT auth.uid() AS uid) = author_id) OR public.is_moderator(( SELECT auth.uid() AS uid)))) WITH CHECK (((( SELECT auth.uid() AS uid) = author_id) OR public.is_moderator(( SELECT auth.uid() AS uid))));


--
-- Name: contact_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_events ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_events contact_events_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_events_insert_service ON public.contact_events FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: contact_events contact_events_select_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_events_select_moderator ON public.contact_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: contact_events contact_events_select_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contact_events_select_service ON public.contact_events FOR SELECT TO service_role USING (true);


--
-- Name: app_settings delete_app_settings_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_app_settings_moderator ON public.app_settings FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.user_roles r
  WHERE ((r.user_id = ( SELECT auth.uid() AS uid)) AND (r.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: listing_likes delete_likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_likes ON public.listing_likes FOR DELETE USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_up_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_up_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: gift_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gift_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: gift_codes gift_codes_all_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gift_codes_all_service ON public.gift_codes TO service_role USING (true) WITH CHECK (true);


--
-- Name: gift_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gift_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: gift_redemptions gift_redemptions_all_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gift_redemptions_all_service ON public.gift_redemptions TO service_role USING (true) WITH CHECK (true);


--
-- Name: app_settings insert_app_settings_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_app_settings_moderator ON public.app_settings FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles r
  WHERE ((r.user_id = ( SELECT auth.uid() AS uid)) AND (r.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: listing_likes insert_likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_likes ON public.listing_likes FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: kanban_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: kanban_moves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanban_moves ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_questions listing owner answers questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "listing owner answers questions" ON public.listing_questions FOR UPDATE USING ((( SELECT auth.uid() AS uid) = ( SELECT listings.seller_id
   FROM public.listings
  WHERE (listings.id = listing_questions.listing_id)))) WITH CHECK ((( SELECT auth.uid() AS uid) = ( SELECT listings.seller_id
   FROM public.listings
  WHERE (listings.id = listing_questions.listing_id))));


--
-- Name: listing_questions listing questions are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "listing questions are public" ON public.listing_questions FOR SELECT USING (true);


--
-- Name: listing_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_plan_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_plan_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_plan_periods listing_plan_periods_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_plan_periods_insert_service ON public.listing_plan_periods FOR INSERT WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: listing_plan_periods listing_plan_periods_select_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_plan_periods_select_service ON public.listing_plan_periods FOR SELECT USING ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: listing_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_questions listing_questions_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_questions_insert_auth ON public.listing_questions FOR INSERT TO authenticated WITH CHECK (((asker_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.listings l
  WHERE (l.id = listing_questions.listing_id)))));


--
-- Name: listing_questions listing_questions_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_questions_select_auth ON public.listing_questions FOR SELECT TO authenticated USING (true);


--
-- Name: listing_questions listing_questions_update_answer_by_seller; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_questions_update_answer_by_seller ON public.listing_questions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_questions.listing_id) AND (l.seller_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_questions.listing_id) AND (l.seller_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: listing_status_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_status_events ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_status_events listing_status_events_insert_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_status_events_insert_all ON public.listing_status_events FOR INSERT TO authenticated WITH CHECK ((( SELECT ( SELECT auth.role() AS role) AS role) = 'authenticated'::text));


--
-- Name: listing_status_events listing_status_events_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_status_events_select_all ON public.listing_status_events FOR SELECT TO authenticated USING (true);


--
-- Name: listing_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_views listing_views_insert_anyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listing_views_insert_anyone ON public.listing_views FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

--
-- Name: listings listings_all_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_all_service ON public.listings TO service_role USING (true) WITH CHECK (true);


--
-- Name: listings listings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_delete ON public.listings FOR DELETE TO dashboard_user, authenticated USING (((seller_id = ( SELECT auth.uid() AS uid)) OR public.is_moderator(( SELECT auth.uid() AS uid))));


--
-- Name: listings listings_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_insert_owner ON public.listings FOR INSERT TO authenticated WITH CHECK (((seller_id = ( SELECT auth.uid() AS uid)) AND ((COALESCE(category, ''::text) <> ALL (ARRAY['Nutrición'::text, 'Nutricion'::text])) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (COALESCE(u.store_enabled, false) = true)))))));


--
-- Name: listings listings_select_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_select_moderator ON public.listings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: listings listings_select_owner_or_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_select_owner_or_moderator ON public.listings FOR SELECT USING (((seller_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.user_roles r
  WHERE ((r.user_id = ( SELECT auth.uid() AS uid)) AND (r.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))));


--
-- Name: listings listings_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_select_public ON public.listings FOR SELECT USING ((((COALESCE(status, ''::text) = ANY (ARRAY['active'::text, 'published'::text])) AND (archived_at IS NULL)) OR (seller_id = ( SELECT auth.uid() AS uid))));


--
-- Name: listings listings_update_highlight_owner_or_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_update_highlight_owner_or_moderator ON public.listings FOR UPDATE USING (((seller_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.user_roles r
  WHERE ((r.user_id = ( SELECT auth.uid() AS uid)) AND (r.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))))) WITH CHECK (((seller_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.user_roles r
  WHERE ((r.user_id = ( SELECT auth.uid() AS uid)) AND (r.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))));


--
-- Name: listings listings_update_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_update_moderator ON public.listings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: listings listings_update_moderator_core; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_update_moderator_core ON public.listings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: listings listings_update_owner_core; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_update_owner_core ON public.listings FOR UPDATE TO authenticated USING ((seller_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((seller_id = ( SELECT auth.uid() AS uid)));


--
-- Name: listings listings_update_service_premium; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY listings_update_service_premium ON public.listings FOR UPDATE USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: listing_questions lq_delete_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lq_delete_moderator ON public.listing_questions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: listing_questions lq_insert_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lq_insert_auth ON public.listing_questions FOR INSERT TO authenticated WITH CHECK (((asker_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.listings l
  WHERE (l.id = listing_questions.listing_id)))));


--
-- Name: listing_questions lq_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lq_select_auth ON public.listing_questions FOR SELECT TO authenticated USING (true);


--
-- Name: listing_questions lq_update_answer_by_seller; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lq_update_answer_by_seller ON public.listing_questions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_questions.listing_id) AND (l.seller_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_questions.listing_id) AND (l.seller_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: listing_questions lq_update_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lq_update_moderator ON public.listing_questions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: market_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: market_prices market_prices_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY market_prices_public_read ON public.market_prices FOR SELECT USING (true);


--
-- Name: marketing_automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_automations ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_automations marketing_automations_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_automations_insert_service ON public.marketing_automations FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: marketing_automations marketing_automations_select_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_automations_select_service ON public.marketing_automations FOR SELECT TO service_role USING (true);


--
-- Name: marketing_interests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_interests ENABLE ROW LEVEL SECURITY;

--
-- Name: events mods can read events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mods can read events" ON public.events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: listing_status_events mods can read listing status events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mods can read listing status events" ON public.listing_status_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: payments mods can read payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mods can read payments" ON public.payments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: seller_comm_prefs mods_manage_seller_comm_prefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mods_manage_seller_comm_prefs ON public.seller_comm_prefs TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: seller_notes mods_manage_seller_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mods_manage_seller_notes ON public.seller_notes TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: seller_outreach mods_manage_seller_outreach; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mods_manage_seller_outreach ON public.seller_outreach TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: seller_pipeline mods_manage_seller_pipeline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mods_manage_seller_pipeline ON public.seller_pipeline TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: seller_sale_confirmations mods_manage_seller_sale_confirmations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mods_manage_seller_sale_confirmations ON public.seller_sale_confirmations TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: seller_tasks mods_manage_seller_tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mods_manage_seller_tasks ON public.seller_tasks TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: notifications notif_insert_actor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_insert_actor ON public.notifications FOR INSERT TO service_role WITH CHECK ((actor_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notif_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_select ON public.notifications FOR SELECT TO service_role USING (((user_id = ( SELECT auth.uid() AS uid)) OR (actor_id = ( SELECT auth.uid() AS uid))));


--
-- Name: notifications notif_update_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notif_update_read ON public.notifications FOR UPDATE TO service_role USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO service_role USING (public.is_moderator(( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO service_role WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR public.is_moderator(( SELECT auth.uid() AS uid)) OR (user_id IS NULL)));


--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO service_role USING (((user_id IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)) OR public.is_moderator(( SELECT auth.uid() AS uid))));


--
-- Name: notifications notifications_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_auth ON public.notifications FOR SELECT TO authenticated USING (((user_id IS NULL) OR (user_id = ( SELECT auth.uid() AS uid))));


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO service_role USING ((((user_id = ( SELECT auth.uid() AS uid)) AND (( SELECT auth.uid() AS uid) IS NOT NULL)) OR public.is_moderator(( SELECT auth.uid() AS uid))));


--
-- Name: notifications notifications_update_read_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update_read_auth ON public.notifications FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: plans plans_modify_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plans_modify_service ON public.plans TO service_role USING (true) WITH CHECK (true);


--
-- Name: plans plans_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plans_select_public ON public.plans FOR SELECT TO authenticated, anon USING (true);


--
-- Name: price_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: price_alerts price_alerts_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_alerts_owner ON public.price_alerts USING ((user_id = auth.uid()));


--
-- Name: price_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_listings ENABLE ROW LEVEL SECURITY;

--
-- Name: price_listings price_listings_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_listings_public_read ON public.price_listings FOR SELECT USING (true);


--
-- Name: processed_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: publish_credits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.publish_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings read_app_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_app_settings ON public.app_settings FOR SELECT USING (true);


--
-- Name: listing_likes read_likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_likes ON public.listing_likes FOR SELECT USING (true);


--
-- Name: recommended_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recommended_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: review_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.review_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: review_reminders review_reminders_all_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY review_reminders_all_service ON public.review_reminders TO service_role USING (true) WITH CHECK (true);


--
-- Name: review_reminders review_reminders_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY review_reminders_select_self ON public.review_reminders FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = buyer_id));


--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews reviews_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reviews_insert_service ON public.reviews FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: reviews reviews_select_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reviews_select_service ON public.reviews FOR SELECT TO service_role USING (true);


--
-- Name: saved_searches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_comm_prefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_comm_prefs ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_outreach; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_outreach ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_pipeline; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_pipeline ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_sale_confirmations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_sale_confirmations ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seller_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_questions service role can manage listing questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service role can manage listing questions" ON public.listing_questions TO service_role USING ((( SELECT auth.role() AS role) = 'service_role'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'service_role'::text));


--
-- Name: share_boosts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_boosts ENABLE ROW LEVEL SECURITY;

--
-- Name: share_boosts share_boosts_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY share_boosts_insert_service ON public.share_boosts FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: share_boosts share_boosts_select_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY share_boosts_select_service ON public.share_boosts FOR SELECT TO service_role USING (true);


--
-- Name: share_boosts share_boosts_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY share_boosts_update_service ON public.share_boosts FOR UPDATE TO service_role USING (true) WITH CHECK (true);


--
-- Name: events stores can read own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "stores can read own events" ON public.events FOR SELECT USING ((store_user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: support_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: sweepstakes_participants sweep_participants_all_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sweep_participants_all_service ON public.sweepstakes_participants TO service_role USING (true) WITH CHECK (true);


--
-- Name: sweepstakes_winners sweep_winners_all_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sweep_winners_all_service ON public.sweepstakes_winners TO service_role USING (true) WITH CHECK (true);


--
-- Name: sweepstakes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sweepstakes ENABLE ROW LEVEL SECURITY;

--
-- Name: sweepstakes sweepstakes_all_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sweepstakes_all_service ON public.sweepstakes TO service_role USING (true) WITH CHECK (true);


--
-- Name: sweepstakes_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sweepstakes_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: sweepstakes sweepstakes_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sweepstakes_select_public ON public.sweepstakes FOR SELECT TO authenticated, anon USING (true);


--
-- Name: sweepstakes_winners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sweepstakes_winners ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings update_app_settings_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_app_settings_moderator ON public.app_settings FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_roles r
  WHERE ((r.user_id = ( SELECT auth.uid() AS uid)) AND (r.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles r
  WHERE ((r.user_id = ( SELECT auth.uid() AS uid)) AND (r.role = ANY (ARRAY['moderator'::public.user_role, 'admin'::public.user_role]))))));


--
-- Name: user_notification_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_delete ON public.user_roles FOR DELETE USING (public.has_moderator_role(( SELECT auth.uid() AS uid)));


--
-- Name: user_roles user_roles_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT WITH CHECK (public.has_moderator_role(( SELECT auth.uid() AS uid)));


--
-- Name: user_roles user_roles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_select ON public.user_roles FOR SELECT USING (((user_id = ( SELECT auth.uid() AS uid)) OR public.has_moderator_role(( SELECT auth.uid() AS uid))));


--
-- Name: user_roles user_roles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_update ON public.user_roles FOR UPDATE USING (public.has_moderator_role(( SELECT auth.uid() AS uid)));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: publish_credits users can read own credits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can read own credits" ON public.publish_credits FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: publish_credits users cannot modify credits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users cannot modify credits" ON public.publish_credits USING (false) WITH CHECK (false);


--
-- Name: users users_all_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_all_service ON public.users TO service_role USING (true) WITH CHECK (true);


--
-- Name: users users_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_owner_select ON public.users FOR SELECT USING ((id = auth.uid()));


--
-- Name: users users_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_owner_update ON public.users FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: users users_public_names; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_public_names ON public.users FOR SELECT TO authenticated USING (true);


--
-- Name: users users_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_own ON public.users FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: users users_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_public ON public.users FOR SELECT TO authenticated, anon USING (true);


--
-- Name: users users_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own ON public.users FOR UPDATE TO authenticated USING ((id = ( SELECT auth.uid() AS uid))) WITH CHECK ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: verification_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: verification_requests verification_requests_all_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY verification_requests_all_service ON public.verification_requests TO service_role USING (true) WITH CHECK (true);


--
-- Name: verification_requests verification_requests_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY verification_requests_select_self ON public.verification_requests FOR SELECT TO authenticated USING ((( SELECT auth.email() AS email) = email));


--
-- PostgreSQL database dump complete
--

\unrestrict 6EIbuhjUzzxbRx77x5zQp1e4apssMUi6DPNqGQ5iQoJ0RZUSKw5wQkIZrR1vb93


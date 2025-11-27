import { getSupabaseClient, supabaseEnabled } from './supabase'
import type { BlogPost, BlogPostInput, PaginatedBlogPosts } from '../types/blog'

export const BLOG_PAGE_SIZE = 6

type BlogPostRow = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  html_content: string
  author_id: string | null
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
  published_at: string | null
  views: number | null
  tags: string[] | null
  author?: {
    id: string
    full_name: string | null
    avatar_url?: string | null
  } | null
}

function mapRow(row: BlogPostRow): BlogPost {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    coverImageUrl: row.cover_image_url,
    htmlContent: row.html_content,
    authorId: row.author_id,
    author: row.author
      ? {
          id: row.author.id,
          fullName: row.author.full_name,
          avatarUrl: row.author.avatar_url,
        }
      : null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    views: row.views ?? 0,
    tags: Array.isArray(row.tags) ? row.tags : [],
  }
}

export async function fetchPublishedBlogPosts(
  page = 1,
  pageSize = BLOG_PAGE_SIZE,
): Promise<PaginatedBlogPosts> {
  if (!supabaseEnabled) {
    return {
      posts: [],
      total: 0,
      page,
      pageSize,
    }
  }
  const supabase = getSupabaseClient()
  const start = (page - 1) * pageSize
  const end = start + pageSize - 1
  const { data, error, count } = await supabase
    .from('blog_posts')
    .select(
      `
        id,
        title,
        slug,
        excerpt,
        cover_image_url,
        html_content,
        author_id,
        status,
        created_at,
        updated_at,
        published_at,
        views,
        tags,
        author:users!blog_posts_author_id_fkey(id, full_name, avatar_url)
      `,
      { count: 'exact' },
    )
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsLast: true })
    .range(start, end)

  if (error) {
    console.error('[blog] fetchPublishedBlogPosts error', error)
    throw error
  }

  return {
    posts: (data ?? []).map(mapRow),
    total: count ?? 0,
    page,
    pageSize,
  }
}

export async function fetchBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  if (!supabaseEnabled) return null
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('blog_posts')
    .select(
      `
        id,
        title,
        slug,
        excerpt,
        cover_image_url,
        html_content,
        author_id,
        status,
        created_at,
        updated_at,
        published_at,
        views,
        tags,
        author:users!blog_posts_author_id_fkey(id, full_name, avatar_url)
      `,
    )
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('[blog] fetchBlogPostBySlug error', error)
    throw error
  }

  return data ? mapRow(data) : null
}

export async function incrementBlogPostViews(slug: string): Promise<number> {
  if (!supabaseEnabled) return 0
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('increment_blog_post_views', { p_slug: slug })
  if (error) {
    console.warn('[blog] incrementBlogPostViews failed', error)
    return 0
  }
  const newViews = Array.isArray(data) && data.length > 0 ? data[0]?.views : 0
  return typeof newViews === 'number' ? newViews : 0
}

export async function fetchRelatedBlogPosts(
  tags: string[],
  excludeSlug: string,
  limit = 3,
): Promise<BlogPost[]> {
  if (!supabaseEnabled || tags.length === 0) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('blog_posts')
    .select(
      `
        id,
        title,
        slug,
        excerpt,
        cover_image_url,
        html_content,
        author_id,
        status,
        created_at,
        updated_at,
        published_at,
        views,
        tags,
        author:users!blog_posts_author_id_fkey(id, full_name, avatar_url)
      `,
    )
    .eq('status', 'published')
    .neq('slug', excludeSlug)
    .overlaps('tags', tags)
    .order('published_at', { ascending: false, nullsLast: true })
    .limit(limit)

  if (error) {
    console.error('[blog] fetchRelatedBlogPosts error', error)
    throw error
  }
  return (data ?? []).map(mapRow)
}

export async function listAllBlogPosts(): Promise<BlogPost[]> {
  if (!supabaseEnabled) return []
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('blog_posts')
    .select(
      `
        id,
        title,
        slug,
        excerpt,
        cover_image_url,
        html_content,
        author_id,
        status,
        created_at,
        updated_at,
        published_at,
        views,
        tags,
        author:users!blog_posts_author_id_fkey(id, full_name, avatar_url)
      `,
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[blog] listAllBlogPosts error', error)
    throw error
  }
  return (data ?? []).map(mapRow)
}

export async function createBlogPost(
  input: BlogPostInput & { authorId: string },
): Promise<BlogPost> {
  if (!supabaseEnabled) throw new Error('Supabase no configurado')
  const supabase = getSupabaseClient()
  const payload = {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt ?? null,
    cover_image_url: input.coverImageUrl ?? null,
    html_content: input.htmlContent,
    status: input.status,
    author_id: input.authorId,
    tags: Array.isArray(input.tags) ? input.tags : [],
  }
  const { data, error } = await supabase
    .from('blog_posts')
    .insert(payload)
    .select(
      `
        id,
        title,
        slug,
        excerpt,
        cover_image_url,
        html_content,
        author_id,
        status,
        created_at,
        updated_at,
        published_at,
        views,
        tags,
        author:users!blog_posts_author_id_fkey(id, full_name, avatar_url)
      `,
    )
    .single()
  if (error) {
    console.error('[blog] createBlogPost error', error)
    throw error
  }
  return mapRow(data)
}

export async function updateBlogPost(
  id: string,
  input: Partial<BlogPostInput>,
): Promise<BlogPost> {
  if (!supabaseEnabled) throw new Error('Supabase no configurado')
  const supabase = getSupabaseClient()
  const payload: Record<string, any> = {}
  if (typeof input.title === 'string') payload.title = input.title
  if (typeof input.slug === 'string') payload.slug = input.slug
  if ('excerpt' in input) payload.excerpt = input.excerpt ?? null
  if ('coverImageUrl' in input) payload.cover_image_url = input.coverImageUrl ?? null
  if (typeof input.htmlContent === 'string') payload.html_content = input.htmlContent
  if (typeof input.status === 'string') payload.status = input.status
  if (Array.isArray(input.tags)) payload.tags = input.tags
  const { data, error } = await supabase
    .from('blog_posts')
    .update(payload)
    .eq('id', id)
    .select(
      `
        id,
        title,
        slug,
        excerpt,
        cover_image_url,
        html_content,
        author_id,
        status,
        created_at,
        updated_at,
        published_at,
        views,
        tags,
        author:users!blog_posts_author_id_fkey(id, full_name, avatar_url)
      `,
    )
    .single()
  if (error) {
    console.error('[blog] updateBlogPost error', error)
    throw error
  }
  return mapRow(data)
}

export async function deleteBlogPost(id: string): Promise<void> {
  if (!supabaseEnabled) throw new Error('Supabase no configurado')
  const supabase = getSupabaseClient()
  const { error } = await supabase.from('blog_posts').delete().eq('id', id)
  if (error) {
    console.error('[blog] deleteBlogPost error', error)
    throw error
  }
}

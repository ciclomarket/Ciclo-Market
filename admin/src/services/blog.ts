import { getSupabaseClient, supabaseEnabled } from '@app/services/supabase'
import type { BlogPost, BlogPostInput } from '../types/blog'

const supabase = getSupabaseClient()

export async function listAllBlogPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from('blog_posts')
    .select(`
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
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[blog admin] listAllBlogPosts error', error)
    throw error
  }

  return (data || []).map(mapRow)
}

export async function createBlogPost(
  input: BlogPostInput & { authorId: string }
): Promise<BlogPost> {
  const payload: Record<string, any> = {
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
    .select(`
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
    `)
    .single()

  if (error) {
    console.error('[blog admin] createBlogPost error', error)
    throw error
  }

  return mapRow(data)
}

export async function updateBlogPost(
  id: string,
  input: Partial<BlogPostInput>
): Promise<BlogPost> {
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
    .select(`
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
    `)
    .single()

  if (error) {
    console.error('[blog admin] updateBlogPost error', error)
    throw error
  }

  return mapRow(data)
}

export async function deleteBlogPost(id: string): Promise<void> {
  const { error } = await supabase
    .from('blog_posts')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[blog admin] deleteBlogPost error', error)
    throw error
  }
}

function mapRow(row: any): BlogPost {
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

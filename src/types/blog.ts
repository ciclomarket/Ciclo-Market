export type BlogPostStatus = 'draft' | 'published'

export interface BlogAuthor {
  id: string
  fullName: string | null
  avatarUrl?: string | null
}

export interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string | null
  coverImageUrl: string | null
  htmlContent: string
  authorId: string | null
  author?: BlogAuthor | null
  status: BlogPostStatus
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  views: number
  tags: string[]
  seoTitle?: string | null
  seoDescription?: string | null
  canonicalUrl?: string | null
  ogImageUrl?: string | null
  jsonLd?: any | null
  theme?: { heroBg?: string; heroText?: string; accent?: string; surfaceBg?: string } | null
}

export interface BlogPostInput {
  title: string
  slug: string
  excerpt?: string | null
  coverImageUrl?: string | null
  htmlContent: string
  status: BlogPostStatus
  tags?: string[]
  // Opcionales si la migración existe (guardamos en columnas)
  seoTitle?: string | null
  seoDescription?: string | null
  canonicalUrl?: string | null
  ogImageUrl?: string | null
  jsonLd?: any | null
  theme?: { heroBg?: string; heroText?: string; accent?: string; surfaceBg?: string } | null
}

export interface PaginatedBlogPosts {
  posts: BlogPost[]
  total: number
  page: number
  pageSize: number
}

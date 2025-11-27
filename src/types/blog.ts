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
}

export interface BlogPostInput {
  title: string
  slug: string
  excerpt?: string | null
  coverImageUrl?: string | null
  htmlContent: string
  status: BlogPostStatus
  tags?: string[]
}

export interface PaginatedBlogPosts {
  posts: BlogPost[]
  total: number
  page: number
  pageSize: number
}

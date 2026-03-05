export interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt: string | null
  coverImageUrl: string | null
  htmlContent: string
  authorId: string | null
  author: {
    id: string
    fullName: string | null
    avatarUrl?: string | null
  } | null
  status: 'draft' | 'published'
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
  status: 'draft' | 'published'
  tags?: string[]
}

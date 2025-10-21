import { fetchStores, fetchStoreActivityCounts, type StoreSummary } from '@app/services/users'

export interface AdminStore extends StoreSummary {
  activeListings: number
}

export async function fetchAdminStores(): Promise<AdminStore[]> {
  const [stores, counts] = await Promise.all([
    fetchStores(),
    fetchStoreActivityCounts(),
  ])

  return stores.map((store) => ({
    ...store,
    activeListings: counts[store.id] ?? 0,
  }))
}

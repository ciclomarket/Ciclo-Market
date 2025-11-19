import { useSearchParams } from 'react-router-dom'
import NewListingForm from './NewListingForm'
import NutritionForm from './NutritionForm'

export default function PublishNew() {
  const [params] = useSearchParams()
  const type = (params.get('type') || '').toLowerCase()
  if (type === 'nutrition') return <NutritionForm />
  return <NewListingForm />
}


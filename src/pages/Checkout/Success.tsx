import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/Button'
import StatusLayout from './StatusLayout'

export default function CheckoutSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const plan = searchParams.get('plan') ?? 'premium'
  const listingTypeParam = searchParams.get('type')
  const listingType: 'bike' | 'accessory' | 'apparel' =
    listingTypeParam === 'accessory'
      ? 'accessory'
      : listingTypeParam === 'apparel'
        ? 'apparel'
        : 'bike'
  const productWord =
    listingType === 'bike' ? 'bicicleta' : listingType === 'accessory' ? 'accesorio' : 'indumentaria'

  const handleContinue = useCallback(() => {
    navigate(`/publicar/nueva?type=${listingType}&plan=${encodeURIComponent(plan)}`)
  }, [navigate, plan, listingType])

  return (
    <StatusLayout
      tone="success"
      title="Pago confirmado"
      description={`Tu plan ya está activo. Terminá de cargar la información de tu ${productWord} para publicarla.`}
      actionLabel="Completar publicación"
      onAction={handleContinue}
      secondary={<Button variant="ghost" onClick={() => navigate('/publicar')}>Volver a planes</Button>}
    />
  )
}

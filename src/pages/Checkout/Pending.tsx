import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/Button'
import StatusLayout from './StatusLayout'

export default function CheckoutPending() {
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

  return (
    <StatusLayout
      tone="pending"
      title="Estamos revisando tu pago"
      description="Mercado Pago está validando la operación. Te avisaremos por email cuando se confirme y vas a poder seguir con la publicación."
      actionLabel="Volver a planes"
      onAction={() => navigate(`/publicar?type=${listingType}&plan=${encodeURIComponent(plan)}`)}
      secondary={<Button variant="ghost" onClick={() => navigate('/')}>Ir al inicio</Button>}
    />
  )
}

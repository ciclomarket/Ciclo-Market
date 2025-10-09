import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/Button'
import StatusLayout from './StatusLayout'

export default function CheckoutFailure() {
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

  const handleRetry = useCallback(() => {
    navigate(`/publicar?type=${listingType}&plan=${encodeURIComponent(plan)}`)
  }, [navigate, plan, listingType])

  return (
    <StatusLayout
      tone="failure"
      title="No pudimos procesar el pago"
      description="Mercado Pago rechazó la operación. Revisá tus datos o elegí otro medio de pago para reintentar."
      actionLabel="Reintentar pago"
      onAction={handleRetry}
      secondary={
        <Button variant="ghost" onClick={() => navigate('/')}>Ir al inicio</Button>
      }
    />
  )
}

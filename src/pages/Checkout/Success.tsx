import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/Button'
import StatusLayout from './StatusLayout'

export default function CheckoutSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const plan = searchParams.get('plan') ?? 'premium'

  const handleContinue = useCallback(() => {
    navigate(`/publicar/nueva?plan=${encodeURIComponent(plan)}`)
  }, [navigate, plan])

  return (
    <StatusLayout
      tone="success"
      title="Pago confirmado"
      description="Tu plan ya está activo. Terminá de cargar la información de tu bicicleta para publicarla."
      actionLabel="Publicar aviso"
      onAction={handleContinue}
      secondary={<Button variant="ghost" onClick={() => navigate('/publicar')}>Volver a planes</Button>}
    />
  )
}

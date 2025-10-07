
import { useState } from 'react'
import Container from '../components/Container'

const QUESTIONS: Array<{ question: string; answer: string }> = [
  {
    question: '¿Es gratis publicar en Ciclo Market?',
    answer:
      'Sí. Contamos con un plan gratuito que te permite crear una publicación completa con fotos, descripción y datos de contacto. Si necesitás más visibilidad podés pasar a un plan destacado cuando quieras.'
  },
  {
    question: '¿Cobramos comisiones sobre las ventas?',
    answer:
      'No. Ciclo Market no retiene comisiones ni pagos sobre tus ventas. Sólo abonás el plan de publicación que elijas y mantenés el 100 % del monto que acordás con el comprador.'
  },
  {
    question: '¿Qué diferencia hay entre los planes?',
    answer:
      'Cada plan define la cantidad de fotos, la prioridad en el marketplace, si incluye botón de WhatsApp y beneficios como destaque en la portada o difusión en redes. Podés comparar cada plan antes de confirmar la publicación.'
  },
  {
    question: '¿Cómo me registro o ingreso?',
    answer:
      'Podés crear una cuenta con tu email y contraseña o ingresar directo con Google. Una vez autenticado, accedés al dashboard para administrar tus publicaciones, mensajes y suscripción.'
  },
  {
    question: '¿Cómo contacto al vendedor?',
    answer:
      'Dentro del detalle de la bicicleta verás los botones disponibles: chat interno, WhatsApp o correo. Elegí la opción que prefieras para enviar tu consulta al vendedor.'
  },
  {
    question: '¿Puedo editar la publicación después de crearla?',
    answer:
      'Sí. Desde el dashboard podés actualizar precio, fotos, descripción o incluso cambiar el plan activo. Los cambios se reflejan al instante en el marketplace.'
  },
  {
    question: '¿Cómo destaco mi bicicleta?',
    answer:
      'Seleccioná un plan destacado al crear el aviso o actualizalo desde el dashboard. El destaque te da prioridad de visibilidad, más fotos y comunicación directa por WhatsApp.'
  },
  {
    question: '¿Qué requisitos deben cumplir las fotos?',
    answer:
      'Recomendamos imágenes horizontales, de al menos 1200 px, con buena iluminación y fondo neutro. Mostrá la bicicleta completa y detalles de transmisión, ruedas y componentes especiales.'
  },
  {
    question: '¿Cómo gestiono mis mensajes y ofertas?',
    answer:
      'En el dashboard, dentro del tab “Chat”, encontrarás todas las conversaciones y ofertas recibidas. Podés responder, enviar fotos y hacer seguimiento sin salir de la plataforma.'
  },
  {
    question: '¿Puedo publicar accesorios o repuestos?',
    answer:
      'Sí. Elegí la categoría correspondiente (partes, ruedas, indumentaria, etc.) y completá los campos del formulario para que los compradores encuentren tu producto fácilmente.'
  },
  {
    question: '¿Qué pasa cuando vence mi publicación?',
    answer:
      'Te avisamos por email y notificaciones con tiempo. Podés renovar el plan, pasar a uno diferente o archivar la publicación desde el dashboard cuando ya no la necesites.'
  }
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <div className="bg-[#f6f8fb] py-10">
      <Container className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-3 text-center">
          <h1 className="text-3xl font-bold text-[#14212e]">Preguntas frecuentes</h1>
          <p className="text-[#14212e]/70 text-base">
            Encuentro rápido de las dudas más comunes de vendedores y compradores dentro de Ciclo Market.
          </p>
        </header>

        <div className="space-y-3">
          {QUESTIONS.map((item, index) => (
            <QA
              key={item.question}
              question={item.question}
              answer={item.answer}
              open={openIndex === index}
              onToggle={() => setOpenIndex((prev) => (prev === index ? null : index))}
            />
          ))}
        </div>
      </Container>
    </div>
  )
}

function QA({
  question,
  answer,
  open,
  onToggle
}: {
  question: string
  answer: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <article className="rounded-3xl border border-[#14212e]/15 bg-[#14212e] text-white"> 
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <h2 className="text-lg font-semibold">{question}</h2>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 text-sm">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/20 px-5 py-4 text-sm leading-relaxed text-white/80">
          {answer}
        </div>
      )}
    </article>
  )
}

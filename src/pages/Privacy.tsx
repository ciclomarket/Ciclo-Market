import type { ReactNode } from 'react'
import Container from '../components/Container'

const LAST_UPDATE = '23 de octubre de 2025'

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: '1. Información que recopilamos',
    body: [
      'Datos de cuenta: nombre, apellido, correo y contraseña; opcionalmente foto de perfil.',
      'Datos de perfil y tienda: nombre de tienda, slug, dirección, horarios y enlaces públicos cuando habilitás el perfil de tienda.',
      'Contenido generado: fotos, descripciones, precios, preguntas y respuestas, y reseñas.',
      'Datos de uso: eventos de analítica como vistas del sitio, de avisos y de tiendas, y clics en WhatsApp.',
      'Datos técnicos: IP, navegador, sistema operativo, identificadores de sesión/cookies y actividad para seguridad y métricas.',
      'Pagos y créditos: referencias del proveedor de cobro (por ejemplo, IDs de preferencia o pago); no almacenamos tu información de tarjeta.'
    ]
  },
  {
    title: '2. Para qué usamos los datos',
    body: [
      'Brindar el servicio: registro, inicio de sesión y administración del perfil.',
      'Publicaciones y planes: mostrar avisos, administrar planes y créditos de publicación.',
      'Comunicaciones operativas: avisos de preguntas, respuestas, vencimientos y recordatorios de reseñas.',
      'Moderación y seguridad: detección y bloqueo de datos de contacto en campos públicos y prevención de abuso.',
      'Métricas y mejora: generar estadísticas agregadas y paneles de tienda con vistas y CTR.',
      'Comunicaciones comerciales opcionales y newsletter cuando lo consientas.'
    ]
  },
  {
    title: '3. Bases legales',
    body: [
      'Ejecución del contrato: datos necesarios para operar el marketplace y tus publicaciones.',
      'Consentimiento: comunicaciones comerciales y uso de números de WhatsApp visibles en planes habilitados.',
      'Interés legítimo: seguridad, prevención de fraude y analítica de producto.',
      'Cumplimiento legal: atención de requerimientos válidos de autoridades.'
    ]
  },
  {
    title: '4. Compartimos datos con terceros?',
    body: [
      'Proveedores tecnológicos: infraestructura, bases de datos y envío de correos/notifications (ej., hosting y Supabase).',
      'Procesadores de pago: para créditos y cobros utilizamos un proveedor como Mercado Pago; recibimos referencias del pago, no los datos de tu tarjeta.',
      'Autoridades: podemos compartir información cuando una ley o requerimiento válido lo exija.',
      'No vendemos tus datos personales.'
    ]
  },
  {
    title: '5. Conservación y seguridad',
    body: [
      'Conservamos los datos mientras tu cuenta esté activa y por el tiempo necesario para cumplir con obligaciones legales o resolver disputas.',
      'Los avisos del plan Gratis pueden vencer a los 15 días; los créditos de publicación también pueden expirar según condiciones informadas.',
      'Aplicamos medidas razonables de seguridad (encriptación en tránsito, control de accesos y monitoreo).'
    ]
  },
  {
    title: '6. Tus derechos',
    body: [
      'Podés acceder, actualizar, corregir o eliminar tus datos personales.',
      'Podés oponerte a ciertos tratamientos o solicitar limitación y portabilidad, cuando corresponda.',
      'Podés retirar el consentimiento para comunicaciones comerciales en cualquier momento.',
      'Para ejercer tus derechos, escribinos a admin@ciclomarket.ar o gestioná preferencias desde tu cuenta.'
    ]
  },
  {
    title: '7. Cookies',
    body: [
      'Usamos cookies propias y de terceros para sesión, preferencias, seguridad y estadísticas.',
      'Podés administrar cookies desde tu navegador; deshabilitarlas puede afectar funcionalidades.'
    ]
  },
  {
    title: '8. Menores',
    body: [
      'El servicio es para mayores de 18 años. Si detectamos cuentas de menores, las daremos de baja.'
    ]
  },
  {
    title: '9. Cambios en esta política',
    body: [
      'Podemos actualizar esta política para reflejar mejoras del servicio o cambios regulatorios. Indicaremos la nueva fecha de vigencia y notificaremos cambios relevantes.'
    ]
  },
  {
    title: '10. Contacto',
    body: [
      'Por consultas o para ejercer derechos, escribinos a admin@ciclomarket.ar. Respondemos dentro de los 5 días hábiles.'
    ]
  }
]

export default function Privacy() {
  return (
    <div className="bg-[#14212e] py-10 text-white">
      <Container className="text-sm leading-relaxed">
        <div className="mx-auto max-w-3xl space-y-8">
          <header className="space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Ciclo Market</p>
            <h1 className="text-3xl font-semibold">Política de privacidad</h1>
            <p className="text-white/60">Última actualización: {LAST_UPDATE}</p>
          </header>

          {SECTIONS.map((section) => (
            <Section key={section.title} title={section.title}>
              {section.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </Section>
          ))}
        </div>
      </Container>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-white/80">{children}</div>
    </section>
  )
}

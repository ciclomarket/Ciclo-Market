import Container from '../components/Container'

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: '1. Información que recopilamos',
    body: [
      'Datos de registro: nombre, apellido, correo electrónico, contraseña y, opcionalmente, foto de perfil.',
      'Datos de contacto para publicaciones: ubicación, redes sociales y número de WhatsApp si decidís habilitarlo.',
      'Contenido generado por el usuario: fotos, descripciones y precios de bicicletas, partes o accesorios publicados.',
      'Datos técnicos: dirección IP, navegador, sistema operativo y actividad dentro del sitio para fines analíticos y de seguridad.'
    ]
  },
  {
    title: '2. Cómo usamos la información',
    body: [
      'Permitir el acceso a tu cuenta y al dashboard de vendedor.',
      'Publicar los avisos y mostrar información relevante a compradores potenciales.',
      'Enviar notificaciones sobre mensajes, ofertas, vencimientos de planes y comunicaciones de servicio.',
      'Mejorar la experiencia del sitio mediante métricas de uso y prevención de fraude.'
    ]
  },
  {
    title: '3. Bases legales para el tratamiento',
    body: [
      'Ejecución del contrato: procesamos los datos necesarios para brindar el marketplace.',
      'Consentimiento: aplicable a comunicaciones comerciales opcionales y al uso de datos de WhatsApp.',
      'Interés legítimo: resguardar la seguridad de la plataforma y prevenir abusos.'
    ]
  },
  {
    title: '4. Compartimos datos con terceros?',
    body: [
      'Proveedores tecnológicos: utilizamos servicios como Supabase y herramientas de analítica para alojar datos y medir el funcionamiento.',
      'Obligaciones legales: si una autoridad competente lo requiere, podemos facilitar información específica conforme a la legislación vigente.',
      'Nunca vendemos tus datos personales a terceros.'
    ]
  },
  {
    title: '5. Conservación y seguridad',
    body: [
      'Guardamos la información mientras tu cuenta esté activa o mientras sea necesario para cumplir obligaciones legales.',
      'Aplicamos medidas razonables de seguridad (encriptación, control de accesos, monitoreo) para evitar accesos no autorizados.'
    ]
  },
  {
    title: '6. Tus derechos',
    body: [
      'Acceder, rectificar o eliminar tus datos personales.',
      'Solicitar la portabilidad o limitar el uso de la información cuando corresponda.',
      'Retirar el consentimiento para comunicaciones comerciales en cualquier momento.',
      'Ejercer estos derechos escribiendo a privacy@ciclomarket.ar o desde la sección de perfil.'
    ]
  },
  {
    title: '7. Uso de cookies',
    body: [
      'Utilizamos cookies propias y de terceros para recordar preferencias, mantener tu sesión y medir estadísticas.',
      'Podés gestionar las cookies desde la configuración de tu navegador; desactivarlas puede afectar algunas funcionalidades.'
    ]
  },
  {
    title: '8. Datos de menores',
    body: [
      'El servicio está dirigido a mayores de 18 años. Si detectamos cuentas creadas por menores, procederemos a su eliminación.'
    ]
  },
  {
    title: '9. Cambios en esta política',
    body: [
      'Podemos actualizar esta política para reflejar mejoras del servicio o cambios regulatorios. Publicaremos la nueva versión indicando la fecha de vigencia y te notificaremos si el cambio es relevante.'
    ]
  },
  {
    title: '10. Contacto',
    body: [
      'Ante cualquier consulta podés escribirnos a privacy@ciclomarket.ar. Respondemos dentro de los 5 días hábiles.'
    ]
  }
]

export default function Privacy() {
  return (
    <div className="bg-[#f6f8fb] py-10">
      <Container className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3 text-center">
          <h1 className="text-3xl font-bold text-[#14212e]">Política de privacidad</h1>
          <p className="text-sm text-[#14212e]/70">
            En Ciclo Market protegemos tus datos personales y te contamos con transparencia cómo los usamos.
          </p>
          <p className="text-xs text-[#14212e]/50">Última actualización: abril 2025</p>
        </header>

        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <section
              key={section.title}
              className="rounded-3xl border border-[#14212e]/10 bg-white p-6 shadow-soft"
            >
              <h2 className="text-lg font-semibold text-[#14212e]">{section.title}</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#14212e]/75">
                {section.body.map((paragraph, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#14212e]/40" />
                    <span>{paragraph}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Container>
    </div>
  )
}

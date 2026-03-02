import SeoLandingTemplate from './SeoLandingTemplate'
import { Bike, Shield, MessageCircle, MapPin, TrendingUp, CheckCircle, Search, Wrench, DollarSign } from 'lucide-react'

export default function BicicletasUsadas() {
  return (
    <SeoLandingTemplate
      title="Bicicletas usadas en venta Argentina"
      description="Encontrá bicicletas usadas verificadas listas para rodar con mantenimiento declarado, talles claros y contacto directo para coordinar pruebas, envíos y asesoramiento experto."
      keywords={[
        'venta de bicicletas usadas',
        'bicicletas usadas',
        'bicicletas usadas argentina',
        'comprar bicicleta usada',
        'bicicletas segunda mano',
        'bicicletas usadas buenos aires',
        'clasificados de bicicletas',
        'bicicletas usadas baratas'
      ]}
      h1="Bicicletas usadas en venta"
      intro="Encontrá bicicletas usadas verificadas listas para rodar con mantenimiento declarado, talles claros y contacto directo para coordinar pruebas, envíos y asesoramiento experto."
      ctas={[
        { label: 'Ver bicicletas usadas', href: '/marketplace?condition=Usada' },
        { label: 'Publicar la mía', href: '/publicar' },
      ]}
      category="Bicicletas usadas"
      buyingGuide="Comprar una bicicleta usada puede ser una excelente opción para ahorrar dinero sin sacrificar calidad. En Ciclo Market verificamos que cada publicación incluya fotos reales, estado del cuadro y componentes, y datos de contacto verificados. Recomendamos siempre coordinar una prueba de manejo antes de comprar y verificar el número de serie del cuadro."
      features={[
        {
          title: 'Publicaciones verificadas',
          description: 'Cada bici incluye fotos reales y descripción detallada del estado.',
          icon: <Shield className="w-6 h-6" />,
        },
        {
          title: 'Contacto directo',
          description: 'Comunicación directa con el vendedor por WhatsApp o email.',
          icon: <MessageCircle className="w-6 h-6" />,
        },
        {
          title: 'En toda Argentina',
          description: 'Encontrá bicis cerca tuyo o coordiná envíos a todo el país.',
          icon: <MapPin className="w-6 h-6" />,
        },
        {
          title: 'Mejores precios',
          description: 'Ahorrá comparando precios entre cientos de vendedores.',
          icon: <TrendingUp className="w-6 h-6" />,
        },
      ]}
      tips={[
        {
          title: 'Verificá el estado del cuadro',
          description: 'Revisá que no tenga fisuras, abolladuras o señales de reparaciones estructurales.',
          icon: <Search className="w-5 h-5" />,
        },
        {
          title: 'Probá la transmisión',
          description: 'Asegurate de que los cambios funcionen suavemente en todos los piñones.',
          icon: <Bike className="w-5 h-5" />,
        },
        {
          title: 'Revisá los frenos',
          description: 'Comprobá que las zapatas o discos no estén desgastados y frenen bien.',
          icon: <CheckCircle className="w-5 h-5" />,
        },
        {
          title: 'Preguntá por el mantenimiento',
          description: 'Una bici con service al día vale más y te dará menos problemas.',
          icon: <Wrench className="w-5 h-5" />,
        },
        {
          title: 'Compará precios',
          description: 'Usá nuestra herramienta de tasación para saber si el precio es justo.',
          icon: <DollarSign className="w-5 h-5" />,
        },
        {
          title: 'Coordiná una prueba',
          description: 'Siempre es mejor probar la bici antes de comprar, especialmente el talle.',
          icon: <Bike className="w-5 h-5" />,
        },
      ]}
      popularBrands={[
        'Specialized',
        'Trek',
        'Giant',
        'Cannondale',
        'Scott',
        'Canyon',
        'Cervelo',
        'Bianchi',
        'Pinarello',
        'Colner',
        'Felt',
        'Orbea',
      ]}
      subcategories={[
        'Ruta',
        'MTB',
        'Gravel',
        'Urbana',
        'Fixie',
        'E-Bike',
        'Niños',
        'Pista',
        'Triatlón',
      ]}
      relatedLinks={[
        {
          label: 'Bicicletas de ruta usadas',
          href: '/bicicletas-ruta',
          description: 'Especializadas para velocidad en asfalto.',
        },
        {
          label: 'Bicicletas MTB usadas',
          href: '/bicicletas-mtb',
          description: 'Para montaña, trail y enduro.',
        },
        {
          label: 'Bicicletas Gravel usadas',
          href: '/bicicletas-gravel',
          description: 'Versátiles para caminos de tierra.',
        },
        {
          label: 'Fixie y single speed',
          href: '/fixie',
          description: 'Bicis urbanas simples y livianas.',
        },
      ]}
      faqs={[
        {
          question: '¿Es seguro comprar una bicicleta usada?',
          answer: 'Sí, siempre que tomés los recaudos necesarios. En Ciclo Market recomendamos verificar el estado del cuadro, probar la bici antes de comprar y usar el sistema de mensajes para coordinar el encuentro en un lugar público. También podés verificar la reputación del vendedor.',
        },
        {
          question: '¿Qué debo revisar al comprar una bici usada?',
          answer: 'Revisá el cuadro por fisuras o abolladuras, el funcionamiento de la transmisión (cambios), el estado de los frenos, la condición de las ruedas y cubiertas, y que el talle sea el adecuado para vos. También preguntá por el historial de mantenimiento.',
        },
        {
          question: '¿Cómo sé si el precio es justo?',
          answer: 'Podés usar nuestra herramienta de tasación en /tasacion para obtener una estimación basada en la marca, modelo, año y estado. También compará con otras publicaciones similares en el marketplace.',
        },
        {
          question: '¿Puedo pagar con tarjeta o en cuotas?',
          answer: 'En Ciclo Market la transacción es directamente con el vendedor. Algunos aceptan pagos digitales como MercadoPago o transferencias. Coordiná las formas de pago directamente con el vendedor antes de concretar la compra.',
        },
        {
          question: '¿Qué pasa si la bici tiene problemas después de comprar?',
          answer: 'Las compras entre particulares generalmente son "como están". Te recomendamos probar la bici antes de comprar y estar conforme con su estado. Si comprás a una tienda oficial, suelen ofrecer garantía.',
        },
        {
          question: '¿Cómo coordino el envío si está en otra ciudad?',
          answer: 'Podés coordinar envíos por micro, correo privado o empresas especializadas en bicicletas. Algunos vendedores ya tienen experiencia en envíos y pueden asesorarte. El costo del envío se acuerda entre las partes.',
        },
      ]}
    />
  )
}

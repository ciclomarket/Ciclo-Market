import SeoLandingTemplate from './SeoLandingTemplate'
import { Bike, Shield, MessageCircle, MapPin, Tent, Route, Leaf, Gauge, Ruler, Package } from 'lucide-react'

export default function BicicletasGravel() {
  return (
    <SeoLandingTemplate
      title="Bicicletas Gravel usadas en venta Argentina"
      description="Encontrá bicicletas gravel usadas para bikepacking y aventura. Cuadros de carbono, aluminio y acero. Specialized Diverge, Canyon Grail, Trek Checkpoint y más."
      keywords={[
        'bicicletas gravel usadas',
        'gravel bike segunda mano',
        'diverge usada',
        'canyon grail usada',
        'trek checkpoint usada',
        'bikepacking argentina',
        'bicicleta aventura usada',
        'gravel carbono usada'
      ]}
      h1="Bicicletas Gravel usadas"
      intro="Las gravel son las bicis más versátiles: rápidas en asfalto, capaces en caminos de tierra, y perfectas para bikepacking. Encontrá tu compañera de aventura con contacto directo al vendedor."
      ctas={[
        { label: 'Ver gravel en venta', href: '/marketplace?cat=Gravel' },
        { label: 'Publicar la mía', href: '/publicar' },
      ]}
      category="Bicicletas Gravel"
      buyingGuide="Las bicicletas gravel combinan la velocidad de una ruta con la versatilidad de una MTB. Busca espacio para cubiertas anchas (40-50mm), monturas para alforjas, y geometría cómoda para largas distancias. Los materiales más comunes son carbono (liviano), aluminio (económico) y acero (confort y durabilidad)."
      features={[
        {
          title: 'Versatilidad total',
          description: 'Rápidas en asfalto, capaces en tierra.',
          icon: <Route className="w-6 h-6" />,
        },
        {
          title: 'Bikepacking ready',
          description: 'Monturas para alforjas y equipaje.',
          icon: <Package className="w-6 h-6" />,
        },
        {
          title: 'Marcas top',
          description: 'Specialized, Canyon, Trek, Giant, Cervelo.',
          icon: <Bike className="w-6 h-6" />,
        },
        {
          title: 'Contacto directo',
          description: 'Charlá con el vendedor antes de comprar.',
          icon: <MessageCircle className="w-6 h-6" />,
        },
      ]}
      tips={[
        {
          title: 'Ancho de cubierta',
          description: '35-38mm para asfalto/camino. 40-45mm para tierra. 45mm+ para terrenos difíciles.',
          icon: <Ruler className="w-5 h-5" />,
        },
        {
          title: 'Material del cuadro',
          description: 'Carbono es rápido y liviano. Acero absorbe vibraciones. Aluminio económico y durable.',
          icon: <Leaf className="w-5 h-5" />,
        },
        {
          title: 'Monturas para alforjas',
          description: 'Asegurate de que tenga ojos para montar alforjas si planeás hacer bikepacking.',
          icon: <Package className="w-5 h-5" />,
        },
        {
          title: 'Transmisión monoplato',
          description: '1x11 o 1x12 simplifican el mantenimiento y son ideales para off-road.',
          icon: <Gauge className="w-5 h-5" />,
        },
        {
          title: 'Geometría cómoda',
          description: 'Las gravel tienen reach más corto y stack más alto que una ruta. Más cómodas.',
          icon: <Bike className="w-5 h-5" />,
        },
        {
          title: 'Frenos de disco',
          description: 'Todas las gravel modernas traen disco. Mejor frenado en condiciones variables.',
          icon: <Shield className="w-5 h-5" />,
        },
      ]}
      popularBrands={[
        'Specialized',
        'Canyon',
        'Trek',
        'Giant',
        'Cervelo',
        'Open',
        '3T',
        'BMC',
        'Orbea',
        'Kona',
        'Salsa',
        'Surly',
      ]}
      subcategories={[
        'Race',
        'Adventure',
        'Bikepacking',
        'Monoplato',
        'Eléctrica',
      ]}
      relatedLinks={[
        {
          label: 'Bicicletas usadas',
          href: '/bicicletas-usadas',
          description: 'Todas las bicis de segunda mano.',
        },
        {
          label: 'Bicicletas de ruta',
          href: '/bicicletas-ruta',
          description: 'Para velocidad en asfalto.',
        },
        {
          label: 'Bicicletas MTB',
          href: '/bicicletas-mtb',
          description: 'Para montaña y trail.',
        },
        {
          label: 'Accesorios para bikepacking',
          href: '/accesorios',
          description: 'Alforjas, bolsos, herramientas.',
        },
      ]}
      faqs={[
        {
          question: '¿Qué es una bicicleta gravel?',
          answer: 'Es una bici que combina la velocidad de una ruta con la versatilidad de una MTB. Permite usar cubiertas anchas, tiene geometría cómoda y monturas para equipaje.',
        },
        {
          question: '¿Sirve una gravel para la ciudad?',
          answer: '¡Excelente! Es cómoda, rápida y resiste baches mejor que una ruta. Muchas personas usan gravel como bici única para todo.',
        },
        {
          question: '¿Qué ancho de cubierta es mejor?',
          answer: '35-38mm para uso mixto asfalto/tierra. 40-45mm para caminos de tierra frecuentes. Más de 45mm para bikepacking pesado o tierra suelta.',
        },
        {
          question: '¿Carbono, aluminio o acero?',
          answer: 'Carbono: más rápida y liviana. Aluminio: mejor relación calidad/precio. Acero: más cómoda, durable y fácil de reparar.',
        },
        {
          question: '¿Monoplato o doble plato?',
          answer: 'Monoplato (1x) es más simple, liviano y suficiente para la mayoría. Doble plato (2x) ofrece más rangos para usarla también como ruta pura.',
        },
        {
          question: '¿Qué accesorios necesito para bikepacking?',
          answer: 'Alforjas de cuadro, manubrio y sillín. Bolsas de herramientas. Bidones extra. Muchas gravel vienen con monturas integradas.',
        },
      ]}
    />
  )
}

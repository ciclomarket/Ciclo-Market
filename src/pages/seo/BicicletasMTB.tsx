import SeoLandingTemplate from './SeoLandingTemplate'
import { Bike, Shield, MessageCircle, Mountain, TreePine, Gem, Gauge, Ruler, Wrench } from 'lucide-react'

export default function BicicletasMTB() {
  return (
    <SeoLandingTemplate
      title="Bicicletas MTB usadas en venta - Mountain Bike"
      description="Encontrá bicicletas MTB usadas para XC, Trail, Enduro y Downhill. Rígidas y doble suspensión con los mejores componentes. Specialized, Trek, Santa Cruz, Scott y más."
      keywords={[
        'bicicletas mtb usadas',
        'mountain bike usada',
        'bicicleta mtb segunda mano',
        'doble suspensión usada',
        'trek fuel ex usada',
        'specialized stumpjumper usada',
        'santa cruz usada',
        'xc bike usada'
      ]}
      h1="Bicicletas MTB usadas"
      intro="Descubrí mountain bikes para todo tipo de terreno: XC para competir, trail para diversión, enduro para descensos técnicos. Rígidas y dobles con los mejores grupos y suspensiones."
      ctas={[
        { label: 'Ver MTB en venta', href: '/marketplace?cat=MTB' },
        { label: 'Publicar la mía', href: '/publicar' },
      ]}
      category="Bicicletas MTB"
      buyingGuide="Las MTB se clasifican por recorrido de suspensión: XC (100-120mm) para competencias y subidas, Trail (130-150mm) para todo terreno, Enduro (160-180mm) para descensos agresivos, y DH (180mm+) para bike parks. Al comprar usada, revisá el estado de la suspensión (hidraulica), bujes de ruedas y transmisión."
      features={[
        {
          title: 'Todas las disciplinas',
          description: 'XC, Trail, Enduro, Downhill y rígidas.',
          icon: <Mountain className="w-6 h-6" />,
        },
        {
          title: 'Mejores marcas',
          description: 'Specialized, Trek, Santa Cruz, Scott, Giant, Canyon.',
          icon: <Bike className="w-6 h-6" />,
        },
        {
          title: 'Suspensiones verificadas',
          description: 'Fox, RockShox, Manitou en excelente estado.',
          icon: <Shield className="w-6 h-6" />,
        },
        {
          title: 'Contacto directo',
          description: 'Negociá con dueños y tiendas oficiales.',
          icon: <MessageCircle className="w-6 h-6" />,
        },
      ]}
      tips={[
        {
          title: 'Elegí el recorrido adecuado',
          description: '100-120mm XC, 130-150mm trail, 160-180mm enduro, 180mm+ DH.',
          icon: <Ruler className="w-5 h-5" />,
        },
        {
          title: 'Revisá la suspensión',
          description: 'Comprobá que no tenga juego, fugas de aceite y que funcione suave.',
          icon: <Wrench className="w-5 h-5" />,
        },
        {
          title: 'Rodado 29 o 27.5?',
          description: '29 rueda más rápida y estable. 27.5 más ágil y juguetona.',
          icon: <Bike className="w-5 h-5" />,
        },
        {
          title: 'Material del cuadro',
          description: 'Carbono más liviano y rígido. Aluminio más resistente a golpes.',
          icon: <Gem className="w-5 h-5" />,
        },
        {
          title: 'Grupos MTB',
          description: 'Shimano Deore, SLX, XT, XTR. SRAM NX, GX, X01, XX1.',
          icon: <Gauge className="w-5 h-5" />,
        },
        {
          title: 'Tubeless ready',
          description: 'Muchas MTB modernas vienen listas para tubeless. Menos pinchazos.',
          icon: <TreePine className="w-5 h-5" />,
        },
      ]}
      popularBrands={[
        'Specialized',
        'Trek',
        'Santa Cruz',
        'Scott',
        'Giant',
        'Canyon',
        'Orbea',
        'Pivot',
        'Transition',
        'YT',
        'Commencal',
        'Mondraker',
      ]}
      subcategories={[
        'XC',
        'Trail',
        'Enduro',
        'Downhill',
        'Rígida',
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
          description: 'Para asfalto y velocidad.',
        },
        {
          label: 'Bicicletas Gravel',
          href: '/bicicletas-gravel',
          description: 'Mixtas para todo terreno.',
        },
        {
          label: 'Accesorios MTB',
          href: '/accesorios',
          description: 'Cubiertas, pedales, componentes.',
        },
      ]}
      faqs={[
        {
          question: '¿Rígida o doble suspensión?',
          answer: 'Las rígidas son más eficientes pedaleando y baratas. Las dobles ofrecen más control en descensos técnicos. Para XC competitivo muchos prefieren rígida; para trail/enduro, doble es mejor.',
        },
        {
          question: '¿Cuánto recorrido necesito?',
          answer: '100-120mm para XC y maratones. 130-150mm para trail general. 160-180mm para enduro y descensos fuertes. 180mm+ para bike parks y DH.',
        },
        {
          question: '¿29 o 27.5 pulgadas?',
          answer: '29 ruedan mejor sobre obstáculos y mantienen velocidad. 27.5 son más ágiles y ligeras. Para tallas pequeñas (S) a veces 27.5 funciona mejor.',
        },
        {
          question: '¿Cómo revisar una suspensión usada?',
          answer: 'Comprobá que no tenga juego lateral, que comprima y extienda suavemente, y que no tenga fugas de aceite en los sellos. Una suspensión con service reciente es un plus.',
        },
        {
          question: '¿Cuánto pesa una MTB de gama media?',
          answer: 'Una hardtail (rígida) de aluminio pesa 10-12kg. Una doble de carbono de gama alta puede bajar de 12kg. Las enduro de aluminio suelen pesar 14-16kg.',
        },
        {
          question: '¿Qué grupo es suficiente para trail?',
          answer: 'Shimano Deore 12v o SRAM NX Eagle son excelentes opciones calidad/precio. SLX/XT o GX ofrecen mejor rendimiento y menor peso.',
        },
      ]}
    />
  )
}

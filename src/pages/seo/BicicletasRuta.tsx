import SeoLandingTemplate from './SeoLandingTemplate'
import { Bike, Shield, MessageCircle, MapPin, TrendingUp, Gauge, Wind, Ruler, Weight, Layers } from 'lucide-react'

export default function BicicletasRuta() {
  return (
    <SeoLandingTemplate
      title="Bicicletas de ruta usadas en venta"
      description="Encontrá bicicletas de ruta usadas de alta gama: Specialized, Trek, Cannondale, Bianchi. Modelos aero, endurance y escaladoras con grupos Shimano y SRAM."
      keywords={[
        'bicicletas de ruta usadas',
        'bici de ruta segunda mano',
        'bicicletas de carretera',
        'ruta specialized usada',
        'trek emonda usada',
        'cannondale supersix usada',
        'bicicleta aero usada',
        'grupos ultegra di2'
      ]}
      h1="Bicicletas de ruta usadas"
      intro="Descubrí bicicletas de ruta de alta gama en excelente estado. Desde modelos aero para velocidad máxima hasta endurance para largas distancias. Todas con contacto directo al vendedor."
      ctas={[
        { label: 'Ver bicis de ruta', href: '/marketplace?cat=Ruta' },
        { label: 'Publicar la mía', href: '/publicar' },
      ]}
      category="Bicicletas de ruta"
      buyingGuide="Las bicicletas de ruta se dividen principalmente en tres categorías: aero (para velocidad máxima en llano), endurance (para confort en largas distancias) y escaladoras (livianas para subidas). Al comprar usada, presta atención al grupo (Shimano 105, Ultegra, Dura-Ace o SRAM Force, Red), el material del cuadro (carbono, aluminio) y el estado de las ruedas."
      features={[
        {
          title: 'Marcas premium',
          description: 'Specialized, Trek, Cannondale, Cervelo, Bianchi y más.',
          icon: <Bike className="w-6 h-6" />,
        },
        {
          title: 'Grupos de alta gama',
          description: 'Shimano 105, Ultegra, Dura-Ace, SRAM Force y Red.',
          icon: <Gauge className="w-6 h-6" />,
        },
        {
          title: 'Verificadas',
          description: 'Fotos reales y descripción detallada del estado.',
          icon: <Shield className="w-6 h-6" />,
        },
        {
          title: 'Contacto directo',
          description: 'Negociá directamente con el vendedor.',
          icon: <MessageCircle className="w-6 h-6" />,
        },
      ]}
      tips={[
        {
          title: 'Elegí el tipo de geometría',
          description: 'Aero para velocidad, endurance para confort, o escaladora para subidas.',
          icon: <Bike className="w-5 h-5" />,
        },
        {
          title: 'Verificá el talle',
          description: 'El talle correcto es fundamental. Consultá las tablas de cada marca.',
          icon: <Ruler className="w-5 h-5" />,
        },
        {
          title: 'Revisá el grupo',
          description: 'Shimano 105 es excelente, Ultegra y Dura-Ace son gama alta. SRAM rival.',
          icon: <Layers className="w-5 h-5" />,
        },
        {
          title: 'Peso del cuadro',
          description: 'Los cuadros de carbono premium pesan menos de 900g. Aluminio alrededor de 1200g.',
          icon: <Weight className="w-5 h-5" />,
        },
        {
          title: 'Aerodinámica',
          description: 'Las aero tienen tubos perfilados y cables integrados. Más rápidas en llano.',
          icon: <Wind className="w-5 h-5" />,
        },
        {
          title: 'Ruedas incluidas',
          description: 'Muchas usadas incluyen ruedas de carbono o aluminio de alta gama. Valoralo.',
          icon: <Bike className="w-5 h-5" />,
        },
      ]}
      popularBrands={[
        'Specialized',
        'Trek',
        'Cannondale',
        'Cervelo',
        'Bianchi',
        'Pinarello',
        'Canyon',
        'Giant',
        'Scott',
        'Colnago',
        'Wilier',
        'Argon 18',
      ]}
      subcategories={[
        'Aero',
        'Endurance',
        'Escaladora',
        'Monoplato',
        'Eléctrica',
      ]}
      relatedLinks={[
        {
          label: 'Bicicletas usadas',
          href: '/bicicletas-usadas',
          description: 'Todas las bicicletas de segunda mano.',
        },
        {
          label: 'Bicicletas MTB',
          href: '/bicicletas-mtb',
          description: 'Para trail, XC y enduro.',
        },
        {
          label: 'Bicicletas Gravel',
          href: '/bicicletas-gravel',
          description: 'Versátiles para caminos de tierra.',
        },
        {
          label: 'Accesorios de ruta',
          href: '/accesorios',
          description: 'Ruedas, componentes y más.',
        },
      ]}
      faqs={[
        {
          question: '¿Qué diferencia hay entre una bici aero y una endurance?',
          answer: 'Las aero priorizan la velocidad en llano con tubos perfilados y geometría agresiva. Las endurance son más cómodas para largas distancias con geometría relajada y amortiguación.',
        },
        {
          question: '¿Qué grupo me conviene: 105, Ultegra o Dura-Ace?',
          answer: 'El 105 es excelente relación calidad/precio. Ultegra es más liviano y suave. Dura-Ace es lo mejor de Shimano, más caro. Para la mayoría, 105 o Ultegra son suficientes.',
        },
        {
          question: '¿Cuánto debería pesar una bici de ruta?',
          answer: 'Una bici de ruta de gama media-alumino pesa 9-10kg. Con carbono premium puede bajar a 6.5-7.5kg. El peso importa más en subidas que en llano.',
        },
        {
          question: '¿Conviene comprar ruta usada o nueva?',
          answer: 'Las usadas de alta gama ofrecen mejor relación calidad/precio. Podés conseguir una bici con grupo Ultegra por el precio de una nueva con Claris.',
        },
        {
          question: '¿Qué talle necesito?',
          answer: 'Depende de tu altura y largo de piernas. Generalmente: S (1.60-1.70m), M (1.70-1.80m), L (1.80-1.90m). Siempre consultá las tablas específicas de cada marca.',
        },
        {
          question: '¿Las bici de ruta sirven para la ciudad?',
          answer: 'Sí, aunque las cubiertas finas pueden ser más propensas a pinchazos en calles en mal estado. Algunas traen espacio para cubiertas más anchas.',
        },
      ]}
    />
  )
}

import SeoHybridLandingUsed from './SeoHybridLandingUsed'

export default function BicicletasUsadas() {
  return (
    <SeoHybridLandingUsed
      title="Bicicletas usadas en venta Argentina | Ciclo Market"
      description="Comprá bicicletas usadas verificadas. Ruta, MTB, Gravel y más. Fotos reales, contacto directo con vendedores."
      keywords={[
        'venta de bicicletas usadas',
        'bicicletas usadas',
        'bicicletas usadas argentina',
        'comprar bicicleta usada'
      ]}
      h1="Bicicletas usadas en venta"
      intro="Bicicletas usadas verificadas listas para rodar. Cada publicación incluye fotos reales, estado del cuadro y componentes, y contacto directo con el vendedor. Coordiná prueba de manejo antes de comprar."
      ctas={[
        { label: 'Ver bicicletas usadas', href: '/marketplace?condition=Usada' },
        { label: 'Publicar la mía', href: '/publicar' },
      ]}
      category="Bicicletas usadas"
      buyingGuide="Comprar usada es una excelente opción para acceder a mejor equipamiento por menos dinero. Revisá siempre el estado del cuadro (fisuras, abolladuras), el funcionamiento de la transmisión, los frenos y el estado de las ruedas. Coordiná una prueba de manejo antes de comprar."
      popularBrands={[
        'Specialized', 'Trek', 'Giant', 'Cannondale', 'Scott', 
        'Canyon', 'Cervelo', 'Bianchi', 'Orbea'
      ]}
      subcategories={['Ruta', 'MTB', 'Gravel', 'Urbana', 'Fixie']}
      faqs={[
        {
          question: '¿Es seguro comprar una bicicleta usada?',
          answer: 'Sí, tomando recaudos. Verificá el estado del cuadro, probá la bici antes de comprar y coordiná el encuentro en un lugar público.',
        },
        {
          question: '¿Qué debo revisar?',
          answer: 'Cuadro por fisuras, funcionamiento de la transmisión, estado de frenos y ruedas, y que el talle sea el adecuado. Preguntá por el historial de mantenimiento.',
        },
        {
          question: '¿Cómo sé si el precio es justo?',
          answer: 'Usá nuestra herramienta de tasación en /tasacion. Compará con publicaciones similares del mismo modelo y año.',
        },
        {
          question: '¿Qué pasa si tiene problemas después?',
          answer: 'Las compras entre particulares son "como están". Por eso es importante probar la bici antes de comprar y estar conforme con su estado.',
        },
      ]}
    />
  )
}

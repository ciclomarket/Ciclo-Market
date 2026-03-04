import SeoHybridLanding from './SeoHybridLanding'

export default function BicicletasGravel() {
  return (
    <SeoHybridLanding
      categoryFilter="Gravel"
      title="Bicicletas Gravel usadas en venta | Ciclo Market"
      description="Bicicletas gravel usadas para bikepacking y aventura. Cuadros de carbono, aluminio y acero. Specialized Diverge, Canyon Grail, Trek Checkpoint."
      keywords={[
        'bicicletas gravel usadas',
        'gravel bike segunda mano',
        'diverge usada',
        'bikepacking argentina'
      ]}
      h1="Bicicletas Gravel usadas"
      intro="Las gravel son las bicis más versátiles: rápidas en asfalto, capaces en caminos de tierra, perfectas para bikepacking. Encontrá tu compañera de aventura."
      ctas={[
        { label: 'Ver gravel en venta', href: '/marketplace?cat=Gravel' },
        { label: 'Publicar la mía', href: '/publicar' },
      ]}
      category="Bicicletas Gravel"
      buyingGuide="Las gravel combinan velocidad de ruta con versatilidad de MTB. Buscá espacio para cubiertas anchas (40-50mm), monturas para alforjas y geometría cómoda. Carbono es liviano, aluminio económico, acero cómodo y durable."
      popularBrands={[
        'Specialized', 'Canyon', 'Trek', 'Giant', 'Cervelo', 
        'Open', 'BMC', 'Orbea', 'Kona'
      ]}
      subcategories={['Race', 'Adventure', 'Bikepacking']}
      faqs={[
        {
          question: '¿Qué es una bicicleta gravel?',
          answer: 'Combina velocidad de ruta con versatilidad de MTB. Permite usar cubiertas anchas, tiene geometría cómoda y monturas para equipaje.',
        },
        {
          question: '¿Sirve para la ciudad?',
          answer: 'Sí. Es cómoda, rápida y resiste baches mejor que una ruta. Muchos la usan como bici única.',
        },
        {
          question: '¿Qué ancho de cubierta es mejor?',
          answer: '35-38mm para mixto asfalto/tierra. 40-45mm para tierra frecuente. Más de 45mm para bikepacking pesado.',
        },
        {
          question: '¿Monoplato o doble?',
          answer: 'Monoplato (1x) es más simple y suficiente para la mayoría. Doble (2x) ofrece más rangos para usarla también como ruta pura.',
        },
      ]}
    />
  )
}

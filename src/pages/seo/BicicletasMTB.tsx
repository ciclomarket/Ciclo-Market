import SeoHybridLanding from './SeoHybridLanding'

export default function BicicletasMTB() {
  return (
    <SeoHybridLanding
      categoryFilter="MTB"
      title="Bicicletas MTB usadas en venta | Ciclo Market"
      description="Mountain bikes usadas para XC, Trail y Enduro. Rígidas y doble suspensión. Specialized, Trek, Santa Cruz, Scott y más."
      keywords={[
        'bicicletas mtb usadas',
        'mountain bike usada',
        'bicicleta mtb segunda mano',
        'doble suspension usada'
      ]}
      h1="Bicicletas MTB usadas"
      intro="Mountain bikes para todo tipo de terreno: XC para competir, trail para diversión, enduro para descensos técnicos. Rígidas y dobles con los mejores grupos y suspensiones."
      ctas={[
        { label: 'Ver MTB en venta', href: '/marketplace?cat=MTB' },
        { label: 'Publicar la mía', href: '/publicar' },
      ]}
      category="Bicicletas MTB"
      buyingGuide="Las MTB se clasifican por recorrido: XC (100-120mm) para competencias, Trail (130-150mm) para todo terreno, Enduro (160-180mm) para descensos. Al comprar usada, revisá el estado de la suspensión (que no tenga juego ni fugas), bujes de ruedas y transmisión."
      popularBrands={[
        'Specialized', 'Trek', 'Santa Cruz', 'Scott', 'Giant', 
        'Canyon', 'Orbea', 'YT', 'Commencal'
      ]}
      subcategories={['XC', 'Trail', 'Enduro', 'Rígida']}
      faqs={[
        {
          question: '¿Rígida o doble suspensión?',
          answer: 'Rígidas: más eficientes pedaleando y baratas. Dobles: más control en descensos. Para XC muchos prefieren rígida; para trail/enduro, doble es mejor.',
        },
        {
          question: '¿Cuánto recorrido necesito?',
          answer: '100-120mm XC. 130-150mm trail. 160-180mm enduro. 180mm+ para bike parks.',
        },
        {
          question: '¿29 o 27.5 pulgadas?',
          answer: '29: mejor sobre obstáculos, más estable. 27.5: más ágil y ligera. Para tallas pequeñas (S) a veces 27.5 funciona mejor.',
        },
        {
          question: '¿Cómo revisar una suspensión usada?',
          answer: 'Comprobá que no tenga juego lateral, que comprima y extienda suavemente, y que no tenga fugas de aceite. Una suspensión con service reciente es un plus.',
        },
      ]}
    />
  )
}

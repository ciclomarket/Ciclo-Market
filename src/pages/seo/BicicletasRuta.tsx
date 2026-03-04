import SeoHybridLanding from './SeoHybridLanding'

/**
 * Bicicletas de ruta - Landing page limpia y funcional.
 * 
 * Diseño minimalista sin ruido visual. El contenido es útil para el usuario,
 * no keyword stuffing. Inspirado en The Pro's Closet.
 */
export default function BicicletasRuta() {
  return (
    <SeoHybridLanding
      categoryFilter="Ruta"
      title="Bicicletas de ruta usadas en venta | Ciclo Market"
      description="Encontrá bicicletas de ruta usadas: Specialized, Trek, Cannondale, Bianchi. Modelos aero, endurance y escaladoras. Contacto directo con vendedores."
      keywords={[
        'bicicletas de ruta usadas',
        'bici de ruta segunda mano',
        'bicicletas de carretera',
        'ruta specialized usada',
        'trek emonda usada'
      ]}
      h1="Bicicletas de ruta usadas"
      intro="Las mejores bicicletas de ruta del mercado usado. Desde modelos aero para velocidad hasta endurance para largas distancias. Todas las publicaciones incluyen fotos reales y contacto directo al vendedor."
      ctas={[
        { label: 'Ver bicis de ruta', href: '/marketplace?cat=Ruta' },
        { label: 'Publicar la mía', href: '/publicar' },
      ]}
      category="Bicicletas de ruta"
      buyingGuide="Las bicicletas de ruta se dividen en tres categorías principales: aero (velocidad máxima en llano), endurance (confort para largas distancias) y escaladoras (livianas para subidas). Al comprar usada, revisá el estado del grupo (Shimano 105, Ultegra, Dura-Ace o SRAM), el material del cuadro y las ruedas."
      popularBrands={[
        'Specialized', 'Trek', 'Cannondale', 'Cervelo', 'Bianchi', 
        'Pinarello', 'Canyon', 'Giant', 'Scott'
      ]}
      subcategories={['Aero', 'Endurance', 'Escaladora']}
      faqs={[
        {
          question: '¿Qué diferencia hay entre una bici aero y una endurance?',
          answer: 'Las aero priorizan velocidad con tubos perfilados y geometría agresiva. Las endurance son más cómodas con geometría relajada y espacio para cubiertas más anchas.',
        },
        {
          question: '¿Qué grupo me conviene?',
          answer: 'Shimano 105 es excelente relación calidad/precio. Ultegra es más liviano. Dura-Ace es gama alta. SRAM Force y Red son equivalentes.',
        },
        {
          question: '¿Cuánto debería pesar una bici de ruta?',
          answer: 'Con carbono premium: 6.5-7.5kg. Con aluminio de gama media: 9-10kg. El peso importa más en subidas.',
        },
        {
          question: '¿Conviene comprar usada?',
          answer: 'Sí. Podés conseguir una bici con grupo Ultegra por el precio de una nueva con Claris. Revisá el estado del cuadro y componentes.',
        },
      ]}
    />
  )
}

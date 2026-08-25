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
    />
  )
}

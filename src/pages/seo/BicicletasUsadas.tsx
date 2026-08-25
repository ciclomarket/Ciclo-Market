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
    />
  )
}

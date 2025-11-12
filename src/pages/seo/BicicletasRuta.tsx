import Marketplace from '../Marketplace'

export default function BicicletasRuta() {
  return (
    <Marketplace
      forcedCat="Ruta"
      headingTitle="Bicicletas de ruta"
      breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Bicicletas de ruta' }]}
      seoOverrides={{
        title: 'Bicicletas de ruta usadas',
        description: 'Bicicletas de ruta endurance, aero y escaladoras con talles claros, upgrades destacados y soporte para coordinar pruebas o envíos desde la tienda oficial.',
        keywords: ['bicicletas de ruta', 'ruta usadas', 'comprar bicicleta de ruta'],
        canonicalPath: '/bicicletas-ruta',
      }}
    />
  )
}

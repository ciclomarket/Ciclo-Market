import SEO from '../../components/SEO'
import Marketplace from '../Marketplace'
import type { Cat } from '../Marketplace'

export default function BicicletasUsadas() {
  return (
    <>
      <SEO
        title="Bicicletas en venta"
        description="Encontrá bicicletas usadas verificadas: ruta, MTB, gravel y más. Contacto directo con el vendedor."
        keywords={['venta de bicicletas usadas','bicicletas usadas','clasificados de bicicletas']}
      />
      <Marketplace
        allowedCats={[
          'Ruta','MTB','Gravel','Urbana','Fixie','E-Bike','Niños','Pista','Triatlón'
        ] as Cat[]}
        headingTitle="Bicicletas usadas"
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Bicicletas usadas' }]}
      />
    </>
  )
}

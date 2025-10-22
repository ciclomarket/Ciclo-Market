import SEO from '../../components/SEO'
import Marketplace from '../Marketplace'

export default function BicicletasRuta() {
  return (
    <>
      <SEO
        title="Bicicletas de ruta usadas"
        description="Bicicletas de ruta: endurance, aero y escaladoras. Elegí por talle, material y grupo."
        keywords={['bicicletas de ruta','ruta usadas','comprar bicicleta de ruta']}
      />
      <Marketplace forcedCat="Ruta" headingTitle="Bicicletas de ruta" breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Bicicletas de ruta' }]} />
    </>
  )
}

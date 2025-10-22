import SEO from '../../components/SEO'
import Marketplace from '../Marketplace'

export default function OfertasDestacadas() {
  return (
    <>
      <SEO
        title="Ofertas destacadas"
        description="Bicicletas y accesorios con precio rebajado. Encontrá oportunidades en ruta, MTB y gravel."
        keywords={['ofertas bicicletas','rebajas bicicletas','descuentos bicicletas']}
      />
      <Marketplace forcedDeal headingTitle="Ofertas destacadas" breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Ofertas destacadas' }]} />
    </>
  )
}

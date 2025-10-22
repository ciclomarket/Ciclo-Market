import SEO from '../../components/SEO'
import Marketplace from '../Marketplace'

export default function BicicletasTriatlon() {
  return (
    <>
      <SEO
        title="Bicicletas de triatlón (TT)"
        description="Bicicletas de triatlón y contrarreloj: cuadros aero y grupos electrónicos. Elegí por talle y presupuesto."
        keywords={['bicicletas de triatlón','bicicletas tt','triathlon bikes','contrarreloj']}
      />
      <Marketplace forcedCat="Triatlón" headingTitle="Bicicletas de triatlón" breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Bicicletas de triatlón' }]} />
    </>
  )
}

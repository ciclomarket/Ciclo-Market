import SEO from '../../components/SEO'
import Marketplace from '../Marketplace'

export default function BicicletasGravel() {
  return (
    <>
      <SEO
        title="Bicicletas de gravel usadas"
        description="Gravel para aventura y ciudad con espacio para bikepacking. Elegí por talle y material."
        keywords={['bicicletas de gravel','gravel bike','gravel usadas']}
      />
      <Marketplace forcedCat="Gravel" headingTitle="Bicicletas de gravel" breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Bicicletas de gravel' }]} />
    </>
  )
}

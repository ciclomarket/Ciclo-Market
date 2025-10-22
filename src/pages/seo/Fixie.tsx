import SEO from '../../components/SEO'
import Marketplace from '../Marketplace'

export default function Fixie() {
  return (
    <>
      <SEO
        title="Fixie y single speed usadas"
        description="Fixies urbanas y single speed con cuadros de acero o aluminio, listas para rodar."
        keywords={['fixie','single speed','bicicletas urbanas']}
      />
      <Marketplace forcedCat="Fixie" headingTitle="Fixie y single speed" breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Fixie y single speed' }]} />
    </>
  )
}

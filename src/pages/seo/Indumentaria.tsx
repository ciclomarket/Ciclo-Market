import SEO from '../../components/SEO'
import Marketplace from '../Marketplace'

export default function Indumentaria() {
  return (
    <>
      <SEO
        title="Indumentaria de ciclismo"
        description="Maillots, culottes, cascos y zapatillas para ciclismo. Elegí por talle y disciplina."
        keywords={['indumentaria ciclismo','maillot','culotte','cascos ciclismo','zapatillas ciclismo']}
      />
      <Marketplace forcedCat="Indumentaria" headingTitle="Indumentaria de ciclismo" breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Indumentaria de ciclismo' }]} />
    </>
  )
}

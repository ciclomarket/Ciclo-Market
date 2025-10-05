
import Container from '../components/Container'
export default function FAQ(){
  return (
    <Container>
      <h1 className="text-2xl font-bold mb-4">Preguntas frecuentes</h1>
      <div className="space-y-4">
        <QA q="¿Cobra comisiones?" a="No. Sólo planes por publicación." />
        <QA q="¿Cómo contacto al vendedor?" a="Desde el botón del detalle verás opciones (WhatsApp/email)." />
        <QA q="¿Puedo destacar mi publicación?" a="Sí, con el plan Pro." />
      </div>
    </Container>
  )
}
function QA({q,a}:{q:string,a:string}){
  return (<div className="card p-5"><h3 className="font-semibold">{q}</h3><p className="text-white/70 text-sm">{a}</p></div>)
}

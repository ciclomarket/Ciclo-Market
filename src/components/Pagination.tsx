
export default function Pagination({ page, total, onPage }:{ page:number, total:number, onPage:(p:number)=>void }){
  const prev = () => onPage(Math.max(1, page-1))
  const next = () => onPage(Math.min(total, page+1))
  if (total <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button className="btn btn-ghost" onClick={prev} disabled={page===1}>Anterior</button>
      <span className="text-sm">Página {page} de {total}</span>
      <button className="btn btn-ghost" onClick={next} disabled={page===total}>Siguiente</button>
    </div>
  )
}

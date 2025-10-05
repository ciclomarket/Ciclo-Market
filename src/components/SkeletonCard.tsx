
export default function SkeletonCard(){
  return (
    <div className="card-flat overflow-hidden animate-pulse">
      <div className="aspect-video bg-black/5" />
      <div className="p-4 space-y-2">
        <div className="h-4 w-2/3 bg-black/10 rounded" />
        <div className="h-3 w-1/2 bg-black/10 rounded" />
      </div>
    </div>
  )
}

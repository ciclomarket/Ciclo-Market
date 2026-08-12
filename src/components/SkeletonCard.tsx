
export default function SkeletonCard(){
  return (
    <div className="card-flat overflow-hidden animate-pulse">
      <div className="aspect-[5/4] sm:aspect-video bg-black/5" />
      <div className="px-4 py-3 sm:px-5 sm:py-4 space-y-2 min-h-[110px] sm:min-h-[120px]">
        <div className="h-4 w-2/3 bg-black/10 rounded" />
        <div className="h-3 w-1/2 bg-black/10 rounded" />
        <div className="h-3 w-1/3 bg-black/10 rounded" />
      </div>
    </div>
  )
}

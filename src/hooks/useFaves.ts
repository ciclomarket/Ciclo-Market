
import { useEffect, useState } from 'react'
export default function useFaves(){
  const [ids, setIds] = useState<string[]>(()=> JSON.parse(localStorage.getItem('mb_faves')||'[]'))
  useEffect(()=>{ localStorage.setItem('mb_faves', JSON.stringify(ids)) }, [ids])
  const toggle = (id:string)=> setIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev,id])
  const has = (id:string)=> ids.includes(id)
  return { ids, toggle, has }
}

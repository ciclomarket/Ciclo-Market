import { useEffect, useRef, useState } from 'react'
import { X, Send } from 'lucide-react'
import { getOrCreateThread, fetchMessages, sendMessage, type ProtectedChatMessage } from '@/services/protectedChat'

type Props = {
  listingId: string
  sellerId: string
  buyerId: string
  role: 'buyer' | 'seller'
  onClose: () => void
}

const POLL_MS = 4000

export default function ProtectedChatModal({ listingId, sellerId, buyerId, role, onClose }: Props) {
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ProtectedChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const meId = role === 'buyer' ? buyerId : sellerId

  useEffect(() => {
    let active = true
    let interval: ReturnType<typeof setInterval> | null = null
    ;(async () => {
      const id = await getOrCreateThread(listingId, sellerId, buyerId)
      if (!active) return
      setThreadId(id)
      if (id) {
        const msgs = await fetchMessages(id)
        if (active) setMessages(msgs)
      }
      setLoading(false)
      if (id) {
        interval = setInterval(async () => {
          const msgs = await fetchMessages(id)
          if (active) setMessages(msgs)
        }, POLL_MS)
      }
    })()
    return () => {
      active = false
      if (interval) clearInterval(interval)
    }
  }, [listingId, sellerId, buyerId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    if (!threadId || !draft.trim() || sending) return
    setSending(true)
    try {
      const msg = await sendMessage(threadId, meId, role, draft.trim())
      if (msg) setMessages((prev) => [...prev, msg])
      setDraft('')
    } catch {
      alert('No pudimos enviar el mensaje. Intentá nuevamente.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="font-semibold text-slate-900">Preguntar antes de comprar</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">Cargando…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              Todavía no hay mensajes. Preguntá lo que necesites saber antes de comprar con Pago Protegido.
            </p>
          ) : (
            messages.map((m) => {
              const isMe = m.senderId === meId
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      isMe ? 'bg-sky-600 text-white' : m.senderRole === 'admin' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {m.senderRole === 'admin' && !isMe ? <p className="text-xs font-semibold mb-0.5">Ciclo Market</p> : null}
                    {m.body}
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Escribí tu mensaje…"
            className="flex-1 text-sm border border-slate-200 rounded-full px-4 py-2"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-sky-600 text-white disabled:opacity-50"
            aria-label="Enviar"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchUserProfile, type UserProfileRecord, upsertUserProfile } from '../services/users'
import { getSupabaseClient } from '../services/supabase'
import type { Listing } from '../types'
import SeoHead from '../components/SeoHead'
import { buildPublicUrlSafe } from '../lib/supabaseImages'
import { useToast } from '../context/ToastContext'
import { PROVINCES } from '../constants/locations'
import useFaves from '../hooks/useFaves'
import { useLikedIds } from '../hooks/useServerLikes'
import { fetchListingQuestions, answerListingQuestion } from '../services/listingQuestions'
import type { ListingQuestion } from '../types'
import {
  LayoutDashboard,
  Package,
  Heart,
  Bell,
  Search,
  Settings,
  Store,
  BarChart3,
  MessageCircle,
  Plus,
  ChevronRight,
  TrendingUp,
  Eye,
  DollarSign,
  Sparkles,
  LogOut,
  User,
  ChevronLeft,
  MapPin,
  Phone,
  Instagram,
  Globe,
  Activity,
  ExternalLink,
  Target,
  Award,
  X,
  Check,
  Edit2,
  Trash2,
  Camera,
  Upload,
  Save,
  RefreshCw,
  Send,
  Bot,
  MessageSquare,
  Lightbulb,
  Zap,
  CheckCircle,
  MoreVertical,
  Star
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// ============================================
// TIPOS
// ============================================
interface DashboardMetrics {
  totalViews: number
  totalContacts: number
  activeListings: number
  featuredListings: number
  viewsTrend: number
  avgPrice: number
  topCategory: string
}

interface DailyView {
  date: string
  views: number
}

interface SavedSearch {
  id: number
  name: string
  filters: any
  created_at: string
}

// Tipos para Planes y Verificación
interface UserPlan {
  id: string
  user_id: string
  plan_code: string
  status: 'active' | 'expired' | 'cancelled' | 'pending_payment'
  expires_at: string
  features: Record<string, any>
}

interface AccountVerification {
  id: string
  user_id: string
  status: 'pending' | 'under_review' | 'approved' | 'rejected'
  dni_front_url: string
  dni_back_url: string
  reviewed_at?: string
  rejection_reason?: string
  ciclotrust_score: number
}

// ============================================
// COMPONENTE: STATUS BADGE
// ============================================
function StatusBadge({ status }: { status?: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    active: { 
      label: 'Activa', 
      className: 'bg-emerald-100 text-emerald-700' 
    },
    published: { 
      label: 'Activa', 
      className: 'bg-emerald-100 text-emerald-700' 
    },
    sold: { 
      label: 'Vendida', 
      className: 'bg-gray-100 text-gray-600' 
    },
    archived: { 
      label: 'Archivada', 
      className: 'bg-orange-100 text-orange-700' 
    },
    draft: { 
      label: 'Borrador', 
      className: 'bg-amber-50 text-amber-700 border border-amber-200' 
    },
    pending_payment: { 
      label: 'Pendiente de pago', 
      className: 'bg-blue-50 text-blue-700 border border-blue-200' 
    },
    expired: { 
      label: 'Expirada', 
      className: 'bg-red-50 text-red-700 border border-red-200' 
    },
    deleted: { 
      label: 'Eliminada', 
      className: 'bg-gray-100 text-gray-400' 
    },
  }

  const config = statusConfig[status?.toLowerCase() || ''] || { 
    label: status || 'Desconocido', 
    className: 'bg-gray-100 text-gray-600' 
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${config.className}`}>
      {config.label}
    </span>
  )
}

// ============================================
// COMPONENTE: BADGE DE PLAN (solo visual, sin upgrade)
// ============================================
function PlanBadge({ planCode }: { planCode?: string }) {
  const code = planCode?.toLowerCase() || 'free'
  
  if (code === 'free') return null

  const styles: Record<string, string> = {
    pro: 'bg-blue-100 text-blue-700 border-blue-200',
    premium: 'bg-amber-100 text-amber-700 border-amber-200',
    store: 'bg-purple-100 text-purple-700 border-purple-200',
  }

  const labels: Record<string, string> = {
    pro: 'PRO',
    premium: 'PREMIUM',
    store: 'TIENDA',
  }

  const style = styles[code] || 'bg-gray-100 text-gray-700 border-gray-200'
  const label = labels[code] || code.toUpperCase()

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border ${style}`}>
      {code === 'premium' && <Sparkles className="w-3 h-3" />}
      {label}
    </span>
  )
}

// ============================================
// COMPONENTE: UPGRADE PARA LISTING (Compacto - 2 botones directos)
// ============================================
function ListingUpgradeSection({ listing, userId, onUpgrade }: { listing: Listing; userId: string; onUpgrade?: () => void }) {
  const [upgrading, setUpgrading] = useState(false)
  
  const planCode = (listing.sellerPlan || listing.plan || 'free').toLowerCase()
  
  // Solo mostrar si es plan free
  if (planCode !== 'free') return null

  const startUpgrade = async (planCode: 'PREMIUM' | 'PRO') => {
    setUpgrading(true)
    try {
      const amount = planCode === 'PRO' ? 13000 : 9000
      const supabase = getSupabaseClient()
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      
      if (!token) {
        alert('Iniciá sesión para continuar')
        return
      }

      const redirectBase = window.location.origin
      const back = {
        success: `${redirectBase}/dashboard?tab=publicaciones&payment=success`,
        failure: `${redirectBase}/dashboard?tab=publicaciones&payment=failure`,
        pending: `${redirectBase}/dashboard?tab=publicaciones&payment=pending`,
      }

      const payload = {
        listingId: listing.id,
        plan: planCode,
        amount,
        currency: 'ARS',
        back
      }

      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      const text = await res.text()
      let json: any = {}
      try { json = JSON.parse(text) } catch { }
      
      if (res.ok && json?.url) {
        window.location.assign(json.url)
        return
      }
      
      console.warn('[upgrade] unexpected response', { status: res.status, text })
      alert('No pudimos iniciar el checkout. Intentá nuevamente.')
    } catch (e) {
      console.warn('[upgrade] failed', e)
      alert('No pudimos iniciar el checkout. Intentá nuevamente.')
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        disabled={upgrading}
        onClick={() => startUpgrade('PREMIUM')}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors disabled:opacity-50"
      >
        <Sparkles className="w-3.5 h-3.5" />
        PREMIUM $9.000
      </button>
      <button
        type="button"
        disabled={upgrading}
        onClick={() => startUpgrade('PRO')}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-semibold hover:from-cyan-600 hover:to-blue-700 transition-colors disabled:opacity-50"
      >
        <Zap className="w-3.5 h-3.5" />
        PRO $13.000
      </button>
    </div>
  )
}

// ============================================
// COMPONENTE: BADGE DE USUARIO VERIFICADO
// ============================================
function UserVerifiedBadge({ isVerified }: { isVerified: boolean }) {
  if (isVerified) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-200">
        <Check className="w-3.5 h-3.5" />
        Verificado
      </div>
    )
  }

  return (
    <Link
      to="/dashboard?tab=configuracion"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 text-gray-400 rounded-full text-xs hover:bg-gray-100 transition-colors"
    >
      <Award className="w-3.5 h-3.5" />
      Sin verificar
    </Link>
  )
}

// ============================================
// COMPONENTE: CICLOTRUST BADGE (para verificación DNI - opcional)
// ============================================
function CicloTrustBadge({ score, status }: { score: number; status: string }) {
  if (status !== 'approved') return null

  const getColor = () => {
    if (score >= 80) return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (score >= 60) return 'bg-blue-100 text-blue-700 border-blue-200'
    if (score >= 40) return 'bg-amber-100 text-amber-700 border-amber-200'
    return 'bg-gray-100 text-gray-600 border-gray-200'
  }

  const getLabel = () => {
    if (score >= 90) return '⭐⭐⭐'
    if (score >= 70) return '⭐⭐'
    if (score >= 50) return '⭐'
    return 'Verificado'
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getColor()}`}>
      <Award className="w-3.5 h-3.5" />
      <span title={`CicloTrust Score: ${score}/100`}>
        {getLabel()}
      </span>
    </div>
  )
}

// ============================================
// COMPONENTE: VERIFICACIÓN DE CUENTA
// ============================================
function AccountVerificationSection({ 
  verification, 
  onUpdate,
  isUserVerified = false
}: { 
  verification: AccountVerification | null
  onUpdate: () => void
  isUserVerified?: boolean
}) {
  const { show: showToast } = useToast()
  const { user } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ front: false, back: false })

  // Si el usuario ya está verificado (profile.verified), mostrar mensaje de éxito
  if (isUserVerified || verification?.status === 'approved') {
    return (
      <div className="space-y-6">
        {/* Mensaje de cuenta verificada */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-10 h-10 text-emerald-600" />
          </div>
          <h3 className="text-2xl font-bold text-emerald-900 mb-2">
            ¡Tu cuenta está verificada!
          </h3>
          <p className="text-emerald-700 mb-4">
            Tu identidad ha sido confirmada exitosamente. Los compradores ven tu perfil como confiable.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-emerald-200">
            <Award className="w-5 h-5 text-emerald-600" />
            <span className="font-medium text-emerald-800">
              CicloTrust Score: {verification?.ciclotrust_score || 100}/100
            </span>
          </div>
        </div>

        {/* Documentos subidos (solo lectura) */}
        {(verification?.dni_front_url || verification?.dni_back_url) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-medium text-gray-900 mb-4">Documentos verificados</h4>
            <div className="grid grid-cols-2 gap-4">
              {verification.dni_front_url && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Frente del DNI</p>
                  <div className="aspect-[3/2] bg-gray-100 rounded-xl overflow-hidden">
                    <img 
                      src={verification.dni_front_url} 
                      alt="Frente del DNI"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
              {verification.dni_back_url && (
                <div>
                  <p className="text-sm text-gray-500 mb-2">Dorso del DNI</p>
                  <div className="aspect-[3/2] bg-gray-100 rounded-xl overflow-hidden">
                    <img 
                      src={verification.dni_back_url} 
                      alt="Dorso del DNI"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  const handleUpload = async (side: 'front' | 'back', file: File) => {
    if (!user?.id) return
    
    setUploadProgress(p => ({ ...p, [side]: true }))
    
    try {
      const supabase = getSupabaseClient()
      const fileExt = file.name.split('.').pop()
      const fileName = `dni_${side}_${user.id}_${Date.now()}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('verifications')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('verifications').getPublicUrl(fileName)
      
      // Crear o actualizar verificación
      const { error: dbError } = await supabase
        .from('account_verifications')
        .upsert({
          user_id: user.id,
          [`dni_${side}_url`]: publicUrl,
          status: 'pending',
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })

      if (dbError) throw dbError

      showToast(`DNI ${side === 'front' ? 'frente' : 'dorso'} subido correctamente`, { variant: 'success' })
      onUpdate()
    } catch (error) {
      console.error('Error uploading:', error)
      showToast('Error al subir el documento', { variant: 'error' })
    } finally {
      setUploadProgress(p => ({ ...p, [side]: false }))
    }
  }

  const getStatusBadge = () => {
    const styles = {
      pending: 'bg-amber-100 text-amber-700 border-amber-200',
      under_review: 'bg-blue-100 text-blue-700 border-blue-200',
      approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      rejected: 'bg-red-100 text-red-700 border-red-200',
    }

    const labels = {
      pending: 'Pendiente',
      under_review: 'En revisión',
      approved: 'Aprobado',
      rejected: 'Rechazado',
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${styles[verification?.status || 'pending']}`}>
        {verification?.status === 'approved' && <Check className="w-4 h-4" />}
        {verification?.status === 'rejected' && <X className="w-4 h-4" />}
        {labels[verification?.status || 'pending']}
      </span>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-purple-100 rounded-xl">
          <Award className="w-6 h-6 text-purple-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">Verificación de identidad</h3>
          <p className="text-sm text-gray-500 mt-1">
            Verificá tu identidad para obtener el badge CicloTrust y aumentar la confianza de los compradores.
          </p>
        </div>
        {getStatusBadge()}
      </div>

      {verification?.status === 'rejected' && verification.rejection_reason && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-700">
            <strong>Motivo del rechazo:</strong> {verification.rejection_reason}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Frente del DNI */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Frente del DNI
          </label>
          {verification?.dni_front_url ? (
            <div className="relative aspect-[3/2] bg-gray-100 rounded-xl overflow-hidden">
              <img 
                src={verification.dni_front_url} 
                alt="Frente del DNI"
                className="w-full h-full object-cover"
              />
              {verification.status !== 'approved' && (
                <label className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer hover:bg-black/60 transition-colors">
                  <Camera className="w-8 h-8 text-white" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload('front', e.target.files[0])}
                  />
                </label>
              )}
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center aspect-[3/2] border-2 border-dashed border-gray-300 rounded-xl hover:border-gray-400 hover:bg-gray-50 cursor-pointer transition-colors">
              {uploadProgress.front ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600" />
              ) : (
                <>
                  <Camera className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">Subir foto</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload('front', e.target.files[0])}
              />
            </label>
          )}
        </div>

        {/* Dorso del DNI */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Dorso del DNI
          </label>
          {verification?.dni_back_url ? (
            <div className="relative aspect-[3/2] bg-gray-100 rounded-xl overflow-hidden">
              <img 
                src={verification.dni_back_url} 
                alt="Dorso del DNI"
                className="w-full h-full object-cover"
              />
              {verification.status !== 'approved' && (
                <label className="absolute inset-0 bg-black/50 flex items-center justify-center cursor-pointer hover:bg-black/60 transition-colors">
                  <Camera className="w-8 h-8 text-white" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleUpload('back', e.target.files[0])}
                  />
                </label>
              )}
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center aspect-[3/2] border-2 border-dashed border-gray-300 rounded-xl hover:border-gray-400 hover:bg-gray-50 cursor-pointer transition-colors">
              {uploadProgress.back ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600" />
              ) : (
                <>
                  <Camera className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">Subir foto</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload('back', e.target.files[0])}
              />
            </label>
          )}
        </div>
      </div>

      {verification?.status === 'approved' && (
        <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-800">¡Cuenta verificada!</p>
              <p className="text-sm text-emerald-600">
                Tu CicloTrust Score: <strong>{verification.ciclotrust_score}/100</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {(!verification || verification.status === 'pending') && (
        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-amber-700">
            <strong>Importante:</strong> Subí ambas caras del DNI para completar la verificación. 
            El proceso puede tomar hasta 24 horas hábiles.
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================
// COMPONENTE: KPI CARD
// ============================================
function KPICard({ 
  title, 
  value, 
  trend, 
  icon: Icon, 
  color = 'blue' 
}: { 
  title: string
  value: string | number
  trend?: number
  icon: React.ElementType
  color?: 'blue' | 'green' | 'orange' | 'purple'
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    green: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  }

  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {trend !== undefined && trend !== 0 && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              <TrendingUp className={`w-4 h-4 ${trend < 0 ? 'rotate-180' : ''}`} />
              <span>{Math.abs(trend)}% vs mes pasado</span>
            </div>
          )}
        </div>
        <div className={`p-2.5 rounded-xl border ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

// ============================================
// COMPONENTE: SETUP PROGRESS (Onboarding)
// ============================================
function SetupProgress({ profile, onCompleteStep }: { profile: any, onCompleteStep: (step: string) => void }) {
  const steps = [
    { id: 'avatar', label: 'Foto de perfil', done: !!profile?.avatar_url, icon: User },
    { id: 'phone', label: 'Teléfono', done: !!(profile?.whatsapp_number || profile?.store_phone), icon: Phone },
    { id: 'location', label: 'Ubicación', done: !!(profile?.city || profile?.store_city), icon: MapPin },
    ...(profile?.store_enabled ? [
      { id: 'banner', label: 'Banner de tienda', done: !!profile?.store_banner_url, icon: Store },
      { id: 'bio', label: 'Descripción', done: !!(profile?.bio && profile.bio.length > 50), icon: MessageCircle },
    ] : []),
  ]

  const completed = steps.filter(s => s.done).length
  const progress = Math.round((completed / steps.length) * 100)

  if (progress === 100) return null

  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white mb-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-white/20 rounded-xl">
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Completá tu perfil</h2>
          <p className="text-blue-100 text-sm mt-1">
            Un perfil completo genera hasta 3x más contactos
          </p>
          
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span>{completed} de {steps.length} pasos</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {steps.filter(s => !s.done).map(step => (
              <button
                key={step.id}
                onClick={() => onCompleteStep(step.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-sm transition-colors"
              >
                <step.icon className="w-3.5 h-3.5" />
                {step.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// COMPONENTE: EDICIÓN RÁPIDA TIPO WOOCOMMERCE
// ============================================
function QuickEditModal({ 
  listing, 
  isOpen, 
  onClose, 
  onSave 
}: { 
  listing: Listing | null
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}) {
  const { show: showToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    price: '',
    status: 'active',
  })

  useEffect(() => {
    if (listing) {
      setFormData({
        title: listing.title || '',
        price: listing.price?.toString() || '',
        status: listing.status || 'active',
      })
    }
  }, [listing])

  if (!isOpen || !listing) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('listings')
        .update({
          title: formData.title,
          price: parseInt(formData.price) || 0,
          status: formData.status,
          
          updated_at: new Date().toISOString(),
        })
        .eq('id', listing.id)

      if (error) throw error

      showToast('Publicación actualizada correctamente', { variant: 'success' })
      onSave()
      onClose()
    } catch (error) {
      console.error('Error updating listing:', error)
      showToast('Error al actualizar', { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const applyDiscount = (percentage: number) => {
    const currentPrice = parseInt(formData.price) || 0
    const newPrice = Math.round(currentPrice * (1 - percentage / 100))
    setFormData({ ...formData, price: newPrice.toString() })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Editar rápido</h2>
            <p className="text-sm text-gray-500">Modificá los datos principales</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Título */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre del producto</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>

          {/* Precio y Descuentos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Precio</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>
            
            {/* Descuentos rápidos */}
            <div className="flex gap-2 mt-2">
              <button 
                onClick={() => applyDiscount(10)}
                className="px-3 py-1 text-xs font-medium bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors"
              >
                -10%
              </button>
              <button 
                onClick={() => applyDiscount(20)}
                className="px-3 py-1 text-xs font-medium bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors"
              >
                -20%
              </button>
              <button 
                onClick={() => applyDiscount(30)}
                className="px-3 py-1 text-xs font-medium bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors"
              >
                -30%
              </button>
            </div>
          </div>

          {/* Estado (Stock/Vendido) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Estado</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'active', label: 'Activa', color: 'emerald' },
                { value: 'sold', label: 'Vendida', color: 'gray' },
                { value: 'archived', label: 'Archivada', color: 'orange' },
              ].map((status) => (
                <button
                  key={status.value}
                  onClick={() => setFormData({ ...formData, status: status.value })}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    formData.status === status.value
                      ? `bg-${status.color}-50 border-${status.color}-200 text-${status.color}-700`
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {formData.status === status.value && <Check className="w-4 h-4 inline mr-1.5" />}
                  {status.label}
                </button>
              ))}
            </div>
          </div>


        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-gray-700 hover:bg-gray-200 rounded-xl font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// COMPONENTE: ACTIVIDAD RECIENTE
// ============================================
interface ActivityItem {
  id: string
  type: 'listing' | 'like' | 'search'
  title: string
  subtitle?: string
  date: string
  image?: string
  link?: string
}

function RecentActivitySection({ userId }: { userId: string }) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadActivity = async () => {
      setLoading(true)
      try {
        const supabase = getSupabaseClient()
        const now = new Date()
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

        // Cargar publicaciones recientes
        const { data: recentListings } = await supabase
          .from('listings')
          .select('id, title, images, created_at, slug')
          .eq('seller_id', userId)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(5)

        // Cargar likes recientes
        const { data: recentLikes } = await supabase
          .from('listing_likes')
          .select('id, created_at, listings:listings!inner(id, title, images, slug, price)')
          .eq('user_id', userId)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(5)

        // Cargar búsquedas guardadas recientes
        const { data: recentSearches } = await supabase
          .from('saved_searches')
          .select('id, name, created_at')
          .eq('user_id', userId)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(3)

        const items: ActivityItem[] = []

        // Agregar publicaciones
        recentListings?.forEach((l: any) => {
          items.push({
            id: `listing-${l.id}`,
            type: 'listing',
            title: 'Publicaste ' + l.title,
            date: l.created_at,
            image: l.images?.[0] ? (typeof l.images[0] === 'string' ? l.images[0] : l.images[0].url) : undefined,
            link: `/listing/${l.slug || l.id}`
          })
        })

        // Agregar likes
        recentLikes?.forEach((like: any) => {
          const listing = like.listings
          if (listing) {
            items.push({
              id: `like-${like.id}`,
              type: 'like',
              title: 'Guardaste en favoritos',
              subtitle: listing.title,
              date: like.created_at,
              image: listing.images?.[0] ? (typeof listing.images[0] === 'string' ? listing.images[0] : listing.images[0].url) : undefined,
              link: `/listing/${listing.slug || listing.id}`
            })
          }
        })

        // Agregar búsquedas
        recentSearches?.forEach((s: any) => {
          items.push({
            id: `search-${s.id}`,
            type: 'search',
            title: 'Creaste una alerta',
            subtitle: s.name || 'Búsqueda guardada',
            date: s.created_at,
          })
        })

        // Ordenar por fecha y tomar los 10 más recientes
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setActivities(items.slice(0, 10))
      } catch (error) {
        console.error('Error loading activity:', error)
      } finally {
        setLoading(false)
      }
    }

    loadActivity()
  }, [userId])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actividad reciente</h2>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="w-12 h-12 rounded-lg bg-gray-200" />
              <div className="flex-1">
                <div className="h-4 w-48 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-200 rounded mt-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actividad reciente</h2>
        <div className="text-center py-8 text-gray-400">
          <BarChart3 className="w-12 h-12 mx-auto mb-3" />
          <p>Tu actividad aparecerá aquí</p>
          <p className="text-sm mt-1">Publicá, guardá favoritos o creá alertas</p>
        </div>
      </div>
    )
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'listing': return <Package className="w-5 h-5 text-blue-600" />
      case 'like': return <Heart className="w-5 h-5 text-red-500" />
      case 'search': return <Search className="w-5 h-5 text-purple-600" />
      default: return <Activity className="w-5 h-5 text-gray-500" />
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Actividad reciente</h2>
      <div className="space-y-3">
        {activities.map((activity) => (
          <a
            key={activity.id}
            href={activity.link || '#'}
            className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
          >
            {activity.image ? (
              <img 
                src={activity.image} 
                alt="" 
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                {getIcon(activity.type)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{activity.title}</p>
              {activity.subtitle && (
                <p className="text-sm text-gray-500 truncate">{activity.subtitle}</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(activity.date).toLocaleDateString('es-AR', { 
                  day: 'numeric', 
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500" />
          </a>
        ))}
      </div>
    </div>
  )
}

// ============================================
// COMPONENTE: MINI KPIs PARA INICIO
// ============================================
function MiniKPIs({ listings, userId }: { listings: Listing[], userId: string }) {
  const [stats, setStats] = useState({
    totalViews: 0,
    totalFavorites: 0,
    unansweredQuestions: 0,
    avgRating: 0,
    totalReviews: 0,
  })

  useEffect(() => {
    const loadStats = async () => {
      try {
        const supabase = getSupabaseClient()
        const listingIds = listings.map(l => l.id)
        
        // Contar vistas totales desde events (últimos 30 días)
        // Nota: La RLS de events requiere filtrar por store_user_id
        let totalViews = 0
        if (userId) {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          const { count, error: viewsError } = await supabase
            .from('events')
            .select('*', { count: 'exact', head: true })
            .eq('store_user_id', userId)
            .eq('type', 'listing_view')
            .gte('created_at', thirtyDaysAgo)
          
          if (viewsError) {
            console.error('Error fetching views:', viewsError)
          }
          totalViews = count || 0
        }
        
        // Contar favoritos de mis publicaciones
        let totalFavorites = 0
        if (listingIds.length > 0) {
          const { count } = await supabase
            .from('listing_likes')
            .select('*', { count: 'exact', head: true })
            .in('listing_id', listingIds)
          totalFavorites = count || 0
        }
        
        // Contar preguntas sin responder
        let unansweredQuestions = 0
        if (listingIds.length > 0) {
          const { count } = await supabase
            .from('listing_questions')
            .select('*', { count: 'exact', head: true })
            .in('listing_id', listingIds)
            .is('answer_body', null)
          unansweredQuestions = count || 0
        }

        // Calcular rating promedio y total de reseñas
        let avgRating = 0
        let totalReviews = 0
        if (listingIds.length > 0) {
          const { data: reviews } = await supabase
            .from('reviews')
            .select('rating')
            .in('listing_id', listingIds)
            .eq('status', 'approved')
          
          if (reviews && reviews.length > 0) {
            totalReviews = reviews.length
            const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0)
            avgRating = Math.round((sum / reviews.length) * 10) / 10
          }
        }
        
        setStats({ totalViews, totalFavorites, unansweredQuestions, avgRating, totalReviews })
      } catch (error) {
        console.error('Error loading mini stats:', error)
      }
    }
    
    if (userId && listings.length > 0) {
      loadStats()
    }
  }, [listings, userId])

  const items = [
    { label: 'Vistas (30d)', value: stats.totalViews.toLocaleString('es-AR'), icon: Eye, color: 'blue' },
    { label: 'Favoritos recibidos', value: stats.totalFavorites.toLocaleString('es-AR'), icon: Heart, color: 'red', subtitle: 'Likes en tus publicaciones' },
    {
      label: 'Valoración',
      value: stats.avgRating > 0 ? `⭐ ${stats.avgRating}` : '—',
      icon: Star,
      color: 'yellow' as const,
      subtitle: stats.totalReviews > 0 ? `${stats.totalReviews} reseñas` : 'Sin reseñas aún'
    },
    ...(stats.unansweredQuestions > 0 ? [{
      label: 'Preguntas sin responder',
      value: stats.unansweredQuestions.toString(),
      icon: MessageCircle,
      color: 'orange' as const,
      alert: true
    }] : []),
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item) => (
        <div 
          key={item.label}
          className={`bg-white rounded-xl p-4 border ${item.alert ? 'border-orange-200 bg-orange-50' : 'border-gray-100'} shadow-sm`}
        >
          <div className="flex items-center gap-2 mb-1">
            <item.icon className={`w-4 h-4 ${item.alert ? 'text-orange-600' : `text-${item.color}-600`}`} />
            <span className={`text-xs font-medium ${item.alert ? 'text-orange-700' : 'text-gray-500'}`}>{item.label}</span>
          </div>
          <p className={`text-xl font-bold ${item.alert ? 'text-orange-800' : 'text-gray-900'}`}>{item.value}</p>
          {'subtitle' in item && item.subtitle && (
            <p className="text-xs text-gray-400 mt-1">{item.subtitle}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================
// COMPONENTE: SUGERENCIAS DE PRECIO (AI) - V4
// ============================================
// Features:
// - Depreciación BIDIRECCIONAL (aprecia si año menor)
// - Filtrado de outliers con IQR
// - Mínimo 2 comparables para recomendar
// - Semáforo visual de precio
// - Sugerencias: P10 (competitivo), Mediana (justo), P90 (máximo)
// ============================================

interface PricingComparable {
  listingId: string
  brand: string
  model: string
  year: number
  priceUsd: number
  condition: string
  yearDiff: number
  adjustmentPercent: number
  adjustedPriceUsd: number
  isExactMatch: boolean
}

interface PricingResult {
  canRecommend: boolean
  reason: 'sufficient_data' | 'insufficient_data' | 'no_comparables'
  input: {
    brand: string
    model: string
    year: number
    priceUsd: number
  }
  comparables: PricingComparable[]
  stats: {
    count: number
    avg: number
    median: number
    min: number
    max: number
    p10: number
    p90: number
  }
  currentPriceAnalysis: {
    percentile: number
    status: 'competitive' | 'fair' | 'high' | 'very_high'
    diffFromMedian: number
    diffPercent: number
  }
  suggestions: {
    competitive: number
    fair: number
    maximum: number
  }
}

// Normaliza nombre de modelo
function normalizeModelName(brand: string, model: string): string {
  const combined = `${brand} ${model}`.toLowerCase()
  return combined
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
}

// Ajuste de precio por año BIDIRECCIONAL
// Año mayor -> menor: deprecia (-)
// Año menor -> mayor: aprecia (+)
function adjustPriceByYear(
  price: number, 
  sourceYear: number, 
  targetYear: number,
  rate: number
): { adjustedPrice: number; adjustmentPercent: number } {
  const yearDiff = targetYear - sourceYear
  
  if (yearDiff === 0) {
    return { adjustedPrice: price, adjustmentPercent: 0 }
  }
  
  // Limitar a máximo 10 años de diferencia (50%)
  const cappedDiff = Math.max(-10, Math.min(10, yearDiff))
  const adjustmentPercent = cappedDiff * rate
  const adjustmentFactor = 1 + (cappedDiff * rate / 100)
  
  return {
    adjustedPrice: Math.round(price * adjustmentFactor),
    adjustmentPercent: Math.round(adjustmentPercent)
  }
}

// Filtrar outliers usando IQR
function filterOutliers(prices: number[]): number[] {
  if (prices.length < 4) return prices
  
  const sorted = [...prices].sort((a, b) => a - b)
  const q1Index = Math.floor(sorted.length * 0.25)
  const q3Index = Math.floor(sorted.length * 0.75)
  
  const q1 = sorted[q1Index]
  const q3 = sorted[q3Index]
  const iqr = q3 - q1
  
  const lowerBound = q1 - (1.5 * iqr)
  const upperBound = q3 + (1.5 * iqr)
  
  return sorted.filter(p => p >= lowerBound && p <= upperBound)
}

// Calcular percentil
function getPercentile(value: number, sortedArray: number[]): number {
  if (sortedArray.length === 0) return 0
  if (sortedArray.length === 1) return value <= sortedArray[0] ? 0 : 100
  
  const position = sortedArray.findIndex(v => v >= value)
  if (position === -1) return 100
  
  return Math.round((position / sortedArray.length) * 100)
}

function PriceSuggestionModal({ 
  listing, 
  isOpen, 
  onClose,
  onApplyPrice
}: { 
  listing: Listing | null
  isOpen: boolean
  onClose: () => void
  onApplyPrice: (price: number) => void
}) {
  const [result, setResult] = useState<PricingResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (isOpen && listing) {
      analyzePrice()
    }
  }, [isOpen, listing])

  const analyzePrice = async () => {
    if (!listing) return
    
    setLoading(true)
    
    try {
      const supabase = getSupabaseClient()
      const targetYear = listing.year || new Date().getFullYear()
      
      // Obtener configuración
      const { data: settings } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['usd_ars_fx', 'PRICE_DEPRECIATION_PER_YEAR'])
      
      const usdRate = parseInt(settings?.find(s => s.key === 'usd_ars_fx')?.value || '1430')
      const depreciationRate = parseInt(settings?.find(s => s.key === 'PRICE_DEPRECIATION_PER_YEAR')?.value || '5')
      
      // Precio actual en USD
      const currentPriceUsd = listing.priceCurrency === 'ARS' 
        ? listing.price / usdRate 
        : listing.price

      // Buscar MISMO MODELO (cualquier año)
      const { data: sameModelListings } = await supabase
        .from('listings')
        .select('id, price, year, brand, model, price_currency, status')
        .ilike('brand', listing.brand || '')
        .eq('status', 'active')
        .gt('price', 0)
        .neq('id', listing.id)

      if (!sameModelListings || sameModelListings.length === 0) {
        setResult({
          canRecommend: false,
          reason: 'no_comparables',
          input: { 
            brand: listing.brand || '', 
            model: listing.model || '', 
            year: targetYear, 
            priceUsd: currentPriceUsd 
          },
          comparables: [],
          stats: { count: 0, avg: 0, median: 0, min: 0, max: 0, p10: 0, p90: 0 },
          currentPriceAnalysis: {
            percentile: 0,
            status: 'fair',
            diffFromMedian: 0,
            diffPercent: 0
          },
          suggestions: { competitive: 0, fair: 0, maximum: 0 }
        })
        setLoading(false)
        return
      }

      // Procesar comparables
      const comparables: PricingComparable[] = []
      
      for (const l of sameModelListings) {
        // Convertir a USD
        let priceInUsd = l.price
        if (l.price_currency === 'ARS') {
          priceInUsd = l.price / usdRate
        }
        
        // Ajustar por año
        const adjustment = adjustPriceByYear(priceInUsd, l.year || targetYear, targetYear, depreciationRate)
        
        // Verificar si es exacto (mismo modelo normalizado)
        const isExact = normalizeModelName(l.brand, l.model) === 
                       normalizeModelName(listing.brand || '', listing.model || '')
        
        comparables.push({
          listingId: l.id,
          brand: l.brand,
          model: l.model,
          year: l.year || targetYear,
          priceUsd: priceInUsd,
          condition: l.condition || 'used',
          yearDiff: targetYear - (l.year || targetYear),
          adjustmentPercent: adjustment.adjustmentPercent,
          adjustedPriceUsd: adjustment.adjustedPrice,
          isExactMatch: isExact
        })
      }

      // Filtrar solo comparables del MISMO modelo
      const sameModelComparables = comparables.filter(c => c.isExactMatch)
      
      // Verificar mínimo de datos
      if (sameModelComparables.length < 2) {
        setResult({
          canRecommend: false,
          reason: 'insufficient_data',
          input: { 
            brand: listing.brand || '', 
            model: listing.model || '', 
            year: targetYear, 
            priceUsd: currentPriceUsd 
          },
          comparables: sameModelComparables,
          stats: { count: 0, avg: 0, median: 0, min: 0, max: 0, p10: 0, p90: 0 },
          currentPriceAnalysis: {
            percentile: 0,
            status: 'fair',
            diffFromMedian: 0,
            diffPercent: 0
          },
          suggestions: { competitive: 0, fair: 0, maximum: 0 }
        })
        setLoading(false)
        return
      }

      // Calcular estadísticas (filtrando outliers)
      const adjustedPrices = sameModelComparables.map(c => c.adjustedPriceUsd)
      const filteredPrices = filterOutliers(adjustedPrices)
      const sortedPrices = [...filteredPrices].sort((a, b) => a - b)
      
      const stats = {
        count: sortedPrices.length,
        avg: Math.round(sortedPrices.reduce((a, b) => a + b, 0) / sortedPrices.length),
        median: sortedPrices[Math.floor(sortedPrices.length / 2)],
        min: sortedPrices[0],
        max: sortedPrices[sortedPrices.length - 1],
        p10: sortedPrices[Math.floor(sortedPrices.length * 0.1)] || sortedPrices[0],
        p90: sortedPrices[Math.floor(sortedPrices.length * 0.9)] || sortedPrices[sortedPrices.length - 1]
      }

      // Analizar precio actual
      const percentile = getPercentile(currentPriceUsd, sortedPrices)
      
      let status: PricingResult['currentPriceAnalysis']['status']
      if (percentile <= 20) status = 'competitive'
      else if (percentile <= 50) status = 'fair'
      else if (percentile <= 80) status = 'high'
      else status = 'very_high'
      
      const diffFromMedian = currentPriceUsd - stats.median
      const diffPercent = Math.round((diffFromMedian / stats.median) * 100)

      setResult({
        canRecommend: true,
        reason: 'sufficient_data',
        input: { 
          brand: listing.brand || '', 
          model: listing.model || '', 
          year: targetYear, 
          priceUsd: currentPriceUsd 
        },
        comparables: sameModelComparables.slice(0, 10),
        stats,
        currentPriceAnalysis: {
          percentile,
          status,
          diffFromMedian,
          diffPercent
        },
        suggestions: {
          competitive: stats.p10,
          fair: stats.median,
          maximum: stats.p90
        }
      })
    } catch (err) {
      console.error('Error analyzing price:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !listing) return null

  const formatPrice = (usd: number) => {
    if (listing.priceCurrency === 'ARS') {
      return `$${Math.round(usd * 1430).toLocaleString('es-AR')}`
    }
    return `US$${Math.round(usd).toLocaleString('es-AR')}`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'competitive': return 'bg-emerald-50 border-emerald-500 text-emerald-700'
      case 'fair': return 'bg-blue-50 border-blue-500 text-blue-700'
      case 'high': return 'bg-amber-50 border-amber-500 text-amber-700'
      case 'very_high': return 'bg-red-50 border-red-500 text-red-700'
      default: return 'bg-gray-50 border-gray-500 text-gray-700'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-xl">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Análisis de precio</h2>
              <p className="text-sm text-gray-500">
                {listing.brand} {listing.model} ({listing.year})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          
          {/* Loading */}
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4" />
              <p className="text-gray-600">Analizando el mercado...</p>
              <p className="text-sm text-gray-400">Buscando {listing.brand} {listing.model}</p>
            </div>
          )}

          {/* Sin datos suficientes */}
          {!loading && result && !result.canRecommend && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No hay suficientes datos
              </h3>
              <p className="text-gray-600 max-w-md mx-auto mb-4">
                No encontramos suficientes publicaciones de <strong>{listing.brand} {listing.model}</strong> 
                {' '}en el marketplace para hacer una recomendación confiable.
              </p>
              {result.comparables.length > 0 && (
                <p className="text-sm text-gray-500 mb-4">
                  Solo encontramos {result.comparables.length} {result.comparables.length === 1 ? 'publicación' : 'publicaciones'} (mínimo 2 requeridas).
                </p>
              )}
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 max-w-md mx-auto text-left">
                <p className="font-medium mb-2">💡 Recomendación:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Investiga en MercadoLibre o Facebook Marketplace</li>
                  <li>Consulta el precio de lista de la bicicleta nueva</li>
                  <li>Considera el estado y los componentes</li>
                </ul>
              </div>
              <button
                onClick={onClose}
                className="mt-6 px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Entendido
              </button>
            </div>
          )}

          {/* Resultado con datos */}
          {!loading && result && result.canRecommend && (
            <>
              {/* Semáforo de precio */}
              <div className={`rounded-xl p-4 border-l-4 ${getStatusColor(result.currentPriceAnalysis.status)}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    result.currentPriceAnalysis.status === 'competitive' ? 'bg-emerald-500' :
                    result.currentPriceAnalysis.status === 'fair' ? 'bg-blue-500' :
                    result.currentPriceAnalysis.status === 'high' ? 'bg-amber-500' : 'bg-red-500'
                  }`}>
                    {result.currentPriceAnalysis.status === 'competitive' && <Check className="w-6 h-6 text-white" />}
                    {result.currentPriceAnalysis.status === 'fair' && <Check className="w-6 h-6 text-white" />}
                    {result.currentPriceAnalysis.status === 'high' && <AlertTriangle className="w-6 h-6 text-white" />}
                    {result.currentPriceAnalysis.status === 'very_high' && <AlertTriangle className="w-6 h-6 text-white" />}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900">
                      {result.currentPriceAnalysis.status === 'competitive' && '💰 Precio competitivo'}
                      {result.currentPriceAnalysis.status === 'fair' && '✓ Precio justo'}
                      {result.currentPriceAnalysis.status === 'high' && '⚠ Precio por encima del mercado'}
                      {result.currentPriceAnalysis.status === 'very_high' && '🔴 Precio muy alto'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Tu precio está en el <strong>{result.currentPriceAnalysis.percentile}º percentil</strong>
                      {' '}(más barato que el {100 - result.currentPriceAnalysis.percentile}% del mercado)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">
                      {formatPrice(listing.price)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Datos utilizados */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Datos utilizados
                  </h4>
                  <button 
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-sm text-purple-600 hover:text-purple-700"
                  >
                    {showDetails ? 'Ocultar' : 'Ver detalles'}
                  </button>
                </div>
                
                <p className="text-sm text-gray-600 mb-2">
                  Basado en <strong>{result.stats.count} publicaciones activas</strong> de {listing.brand} {listing.model}
                </p>

                {showDetails && (
                  <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                    {result.comparables.map((comp) => (
                      <div key={comp.listingId} className="p-2 rounded bg-white text-sm">
                        <div className="flex justify-between">
                          <span>{comp.brand} {comp.model}</span>
                          <span className="font-medium">US${Math.round(comp.priceUsd).toLocaleString()}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Año {comp.year} 
                          {comp.adjustmentPercent !== 0 && (
                            <span className={comp.adjustmentPercent > 0 ? 'text-emerald-600' : 'text-amber-600'}>
                              {' '}→ ajustado {comp.adjustmentPercent > 0 ? '+' : ''}{comp.adjustmentPercent}% = US${comp.adjustedPriceUsd.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Rango de precios */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Rango de precios del mercado</h4>
                <div className="relative pt-6 pb-2">
                  <div className="h-4 bg-gradient-to-r from-emerald-400 via-blue-400 to-amber-400 rounded-full relative">
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-gray-900 rounded border-2 border-white shadow-lg"
                      style={{ 
                        left: `${Math.min(100, Math.max(0, result.currentPriceAnalysis.percentile))}%`,
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap">
                        Tu precio
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>Mín: {formatPrice(result.stats.min)}</span>
                    <span>Mediana: {formatPrice(result.stats.median)}</span>
                    <span>Máx: {formatPrice(result.stats.max)}</span>
                  </div>
                </div>
              </div>

              {/* Sugerencias de precio */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Sugerencias de precio</h4>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => {
                      onApplyPrice(listing.priceCurrency === 'ARS' 
                        ? Math.round(result.suggestions.competitive * 1430)
                        : result.suggestions.competitive
                      )
                      onClose()
                    }}
                    className="p-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors text-center"
                  >
                    <p className="text-xs text-emerald-600 font-medium mb-1">VENDER RÁPIDO</p>
                    <p className="text-lg font-bold text-emerald-700">
                      {formatPrice(result.suggestions.competitive)}
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">P10 - Precio competitivo</p>
                  </button>

                  <button
                    onClick={() => {
                      onApplyPrice(listing.priceCurrency === 'ARS' 
                        ? Math.round(result.suggestions.fair * 1430)
                        : result.suggestions.fair
                      )
                      onClose()
                    }}
                    className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl hover:bg-blue-100 transition-colors text-center"
                  >
                    <p className="text-xs text-blue-600 font-medium mb-1">PRECIO JUSTO</p>
                    <p className="text-lg font-bold text-blue-700">
                      {formatPrice(result.suggestions.fair)}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">Mediana del mercado</p>
                  </button>

                  <button
                    onClick={() => {
                      onApplyPrice(listing.priceCurrency === 'ARS' 
                        ? Math.round(result.suggestions.maximum * 1430)
                        : result.suggestions.maximum
                      )
                      onClose()
                    }}
                    className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl hover:bg-amber-100 transition-colors text-center"
                  >
                    <p className="text-xs text-amber-600 font-medium mb-1">MÁXIMO</p>
                    <p className="text-lg font-bold text-amber-700">
                      {formatPrice(result.suggestions.maximum)}
                    </p>
                    <p className="text-xs text-amber-600 mt-1">P90 - Precio alto</p>
                  </button>
                </div>
              </div>

              {/* Mantener precio */}
              <button
                onClick={onClose}
                className="w-full py-3 text-gray-500 hover:text-gray-700 text-sm"
              >
                Mantener mi precio actual ({formatPrice(listing.price)})
              </button>

              {/* Footer */}
              <p className="text-xs text-center text-gray-400">
                Análisis basado en {result.stats.count} publicaciones activas • 
                Tipo de cambio: $1 = $1,430 ARS
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// COMPONENTE: CHAT INTEGRADO (Preguntas)
// ============================================
function ChatSection({ userId, onUpdate }: { userId: string, onUpdate: () => void }) {
  const { show: showToast } = useToast()
  const [questions, setQuestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedQuestion, setSelectedQuestion] = useState<any | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const loadQuestions = useCallback(async () => {
    if (!userId) return
    
    setLoading(true)
    try {
      const supabase = getSupabaseClient()
      
      // Obtener publicaciones del usuario
      const { data: userListings } = await supabase
        .from('listings')
        .select('id, title')
        .eq('seller_id', userId)

      if (!userListings || userListings.length === 0) {
        setQuestions([])
        setLoading(false)
        return
      }

      // Obtener preguntas de esas publicaciones
      const listingIds = userListings.map((l: any) => l.id)
      const { data: questionsData } = await supabase
        .from('listing_questions')
        .select('*')
        .in('listing_id', listingIds)
        .order('created_at', { ascending: false })

      // Mapear con títulos y normalizar datos
      const questionsWithTitles = (questionsData || []).map((q: any) => ({
        id: q.id,
        listingId: q.listing_id,
        questionBody: q.question_body,
        answerBody: q.answer_body,
        createdAt: q.created_at,
        answeredAt: q.answered_at,
        sellerReadAt: q.seller_read_at,
        askerName: q.asker_name || q.asker_full_name || 'Comprador',
        listingTitle: userListings.find((l: any) => l.id === q.listing_id)?.title || 'Publicación'
      }))

      setQuestions(questionsWithTitles)
    } catch (error) {
      console.error('Error loading questions:', error)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadQuestions()
  }, [loadQuestions])

  // Marcar como leído cuando se selecciona
  const handleSelectQuestion = async (q: any) => {
    setSelectedQuestion(q)
    
    if (!q.sellerReadAt && !q.answerBody) {
      try {
        const supabase = getSupabaseClient()
        await supabase
          .from('listing_questions')
          .update({ seller_read_at: new Date().toISOString() })
          .eq('id', q.id)
        
        // Actualizar localmente
        setQuestions(prev => prev.map(pq => 
          pq.id === q.id ? { ...pq, sellerReadAt: new Date().toISOString() } : pq
        ))
      } catch (error) {
        console.error('Error marking as read:', error)
      }
    }
  }

  const handleReply = async () => {
    if (!selectedQuestion || !replyText.trim()) return
    
    setSending(true)
    try {
      await answerListingQuestion(selectedQuestion.id, replyText.trim())
      showToast('Respuesta enviada', { variant: 'success' })
      setReplyText('')
      setSelectedQuestion(null)
      loadQuestions()
      onUpdate()
    } catch (error) {
      console.error('Error sending reply:', error)
      showToast('Error al enviar respuesta', { variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  // Ordenar: primero sin responder (no leídos primero), luego respondidos
  const sortedQuestions = [...questions].sort((a, b) => {
    // Sin responder primero
    if (!a.answerBody && b.answerBody) return -1
    if (a.answerBody && !b.answerBody) return 1
    // Dentro de sin responder: no leídos primero
    if (!a.answerBody && !b.answerBody) {
      if (!a.sellerReadAt && b.sellerReadAt) return -1
      if (a.sellerReadAt && !b.sellerReadAt) return 1
    }
    // Por fecha (más reciente primero)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const unanswered = questions.filter(q => !q.answerBody)
  const unreadCount = unanswered.filter(q => !q.sellerReadAt).length

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          Mensajes
        </h2>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-gray-200" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-full bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Función para formatear fecha
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ''
      return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  // Función para formatear fecha relativa
  const formatRelativeDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ''
      
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)
      
      if (diffMins < 1) return 'Ahora'
      if (diffMins < 60) return `Hace ${diffMins} min`
      if (diffHours < 24) return `Hace ${diffHours} h`
      if (diffDays === 1) return 'Ayer'
      if (diffDays < 7) return `Hace ${diffDays} días`
      return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
    } catch {
      return ''
    }
  }

  return (
    <div className="space-y-6">
      {/* Lista de preguntas */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          Mensajes
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount} nuevo{unreadCount > 1 ? 's' : ''}
            </span>
          )}
        </h2>

        {questions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <MessageCircle className="w-12 h-12 mx-auto mb-3" />
            <p>No tenés mensajes aún</p>
            <p className="text-sm mt-1">Los compradores te contactarán por tus publicaciones</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {sortedQuestions.map((q) => {
              const isUnread = !q.answerBody && !q.sellerReadAt
              const isUnanswered = !q.answerBody && q.sellerReadAt
              const isAnswered = !!q.answerBody
              
              return (
                <div
                  key={q.id}
                  onClick={() => handleSelectQuestion(q)}
                  className={`p-4 rounded-xl cursor-pointer transition-all ${
                    selectedQuestion?.id === q.id 
                      ? 'bg-blue-50 border-2 border-blue-200' 
                      : 'border-2 border-transparent hover:bg-gray-50'
                  } ${isUnread ? 'bg-blue-50/50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Indicador de estado */}
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      isUnread ? 'bg-red-500 animate-pulse' :
                      isUnanswered ? 'bg-amber-400' :
                      'bg-emerald-400'
                    }`} />
                    
                    <div className="flex-1 min-w-0">
                      {/* Header: título + badge + fecha */}
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs text-gray-500 truncate flex-1">{q.listingTitle}</p>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {formatRelativeDate(q.createdAt)}
                        </span>
                      </div>
                      
                      {/* Pregunta */}
                      <p className={`text-sm line-clamp-2 ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {q.questionBody}
                      </p>
                      
                      {/* Respuesta si existe */}
                      {isAnswered && (
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2 bg-emerald-50/50 p-2 rounded-lg">
                          <span className="text-emerald-600 font-medium">Vos:</span> {q.answerBody}
                        </p>
                      )}
                      
                      {/* Badge de estado */}
                      <div className="mt-2 flex items-center gap-2">
                        {isUnread && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                            Nuevo
                          </span>
                        )}
                        {isUnanswered && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            Sin responder
                          </span>
                        )}
                        {isAnswered && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            Respondido
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de respuesta */}
      {selectedQuestion && !selectedQuestion.answerBody && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900">Responder</h3>
            <span className="text-xs text-gray-500">
              {formatDate(selectedQuestion.createdAt)}
            </span>
          </div>
          
          {/* Info del comprador y publicación */}
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-700">{selectedQuestion.askerName}</span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-600 truncate">{selectedQuestion.listingTitle}</span>
          </div>
          
          {/* Pregunta */}
          <div className="mb-4 p-4 bg-gray-50 rounded-xl border-l-4 border-blue-400">
            <p className="text-sm text-gray-700">{selectedQuestion.questionBody}</p>
          </div>
          
          {/* Input de respuesta */}
          <div className="flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Escribí tu respuesta..."
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              onKeyDown={(e) => e.key === 'Enter' && handleReply()}
              autoFocus
            />
            <button
              onClick={handleReply}
              disabled={!replyText.trim() || sending}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 font-medium"
            >
              {sending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar
            </button>
          </div>
          <button
            onClick={() => setSelectedQuestion(null)}
            className="mt-3 text-sm text-gray-500 hover:text-gray-700 px-1"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================
// COMPONENTE: LISTADO DE PUBLICACIONES CON EDICIÓN RÁPIDA
// ============================================
function ListingsSection({ listings, onRefresh, userId }: { listings: Listing[], onRefresh: () => void, userId: string }) {
  const navigate = useNavigate()
  const { show: showToast } = useToast()
  const [quickEditListing, setQuickEditListing] = useState<Listing | null>(null)
  const [priceSuggestionListing, setPriceSuggestionListing] = useState<Listing | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [markingSoldId, setMarkingSoldId] = useState<string | null>(null)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)

  const applySuggestedPrice = async (price: number) => {
    if (!priceSuggestionListing) return
    
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('listings')
        .update({ price, updated_at: new Date().toISOString() })
        .eq('id', priceSuggestionListing.id)

      if (error) throw error

      showToast(`Precio actualizado a $${price.toLocaleString('es-AR')}`, { variant: 'success' })
      onRefresh()
    } catch (error) {
      console.error('Error updating price:', error)
      showToast('Error al actualizar el precio', { variant: 'error' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que querés eliminar esta publicación?')) return
    
    setDeletingId(id)
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('listings')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error

      showToast('Publicación eliminada', { variant: 'success' })
      onRefresh()
    } catch (error) {
      console.error('Error deleting listing:', error)
      showToast('Error al eliminar', { variant: 'error' })
    } finally {
      setDeletingId(null)
    }
  }

  const handleMarkAsSold = async (id: string) => {
    if (!confirm('¿Marcar esta publicación como vendida?')) return
    
    setMarkingSoldId(id)
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('listings')
        .update({ status: 'sold', updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error

      showToast('¡Felicitaciones! Publicación marcada como vendida', { variant: 'success' })
      onRefresh()
    } catch (error) {
      console.error('Error marking as sold:', error)
      showToast('Error al marcar como vendida', { variant: 'error' })
    } finally {
      setMarkingSoldId(null)
      setOpenDropdownId(null)
    }
  }

  const activeListings = listings.filter(l => l.status === 'active').length
  const hasPaidPlan = listings.some(l => 
    l.sellerPlan && ['pro', 'premium', 'destacado'].includes(l.sellerPlan.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Tus publicaciones ({listings.length})</h2>
        <div className="flex items-center gap-2">

          <Link 
            to="/publicar"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nueva publicación
          </Link>
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tenés publicaciones aún</h3>
          <p className="text-gray-500 mb-4">Empezá a vender tus bicicletas o accesorios</p>
          <Link 
            to="/publicar"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Crear primera publicación
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {listings.map((listing) => (
            <div 
              key={listing.id}
              className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4"
            >
              {listing.images?.[0] ? (
                <img 
                  src={typeof listing.images[0] === 'string' ? listing.images[0] : (listing.images[0] as any)?.url}
                  alt=""
                  className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <Package className="w-8 h-8 text-gray-400" />
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-gray-900 truncate">{listing.title}</h3>
                    <p className="text-sm text-gray-500">{listing.category}</p>
                  </div>
                  {listing.viewCount ? (
                    <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                      <Eye className="w-3.5 h-3.5" />
                      {listing.viewCount.toLocaleString('es-AR')}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="font-semibold text-gray-900">${listing.price?.toLocaleString('es-AR')}</span>
                  <StatusBadge status={listing.status} />
                  {/* Badge de Plan (PRO/PREMIUM) */}
                  <PlanBadge planCode={listing.sellerPlan || listing.plan} />
                </div>
                {/* Sección de upgrade si es FREE */}
                <ListingUpgradeSection 
                  listing={listing} 
                  userId={userId} 
                  onUpgrade={onRefresh}
                />
              </div>

              {/* Desktop: iconos individuales */}
              <div className="hidden md:flex items-center gap-1">
                {/* Sugerencia de precio AI */}
                <button 
                  onClick={() => setPriceSuggestionListing(listing)}
                  className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                  title="Sugerencia de precio IA"
                >
                  <Bot className="w-4 h-4" />
                </button>

                {/* Edición rápida */}
                <button 
                  onClick={() => setQuickEditListing(listing)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Editar rápido"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                
                <button 
                  onClick={() => navigate(`/publicar/nueva?id=${encodeURIComponent(listing.id)}`)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Editar completo"
                >
                  <Settings className="w-4 h-4" />
                </button>
                
                <a 
                  href={`/listing/${listing.slug || listing.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Ver público"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>

                {/* Marcar como vendida */}
                <button 
                  onClick={() => handleMarkAsSold(listing.id)}
                  disabled={markingSoldId === listing.id}
                  className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Marcar como vendida"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>

                <button 
                  onClick={() => handleDelete(listing.id)}
                  disabled={deletingId === listing.id}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Mobile: dropdown menu */}
              <div className="md:hidden relative">
                <button
                  onClick={() => setOpenDropdownId(openDropdownId === listing.id ? null : listing.id)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Más opciones"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
                
                {openDropdownId === listing.id && (
                  <>
                    {/* Backdrop para cerrar al tocar fuera */}
                    <div 
                      className="fixed inset-0 z-40"
                      onClick={() => setOpenDropdownId(null)}
                    />
                    {/* Dropdown menu */}
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                      <button
                        onClick={() => {
                          setPriceSuggestionListing(listing)
                          setOpenDropdownId(null)
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Bot className="w-4 h-4 text-purple-600" />
                        Sugerencia de precio IA
                      </button>
                      <button
                        onClick={() => {
                          setQuickEditListing(listing)
                          setOpenDropdownId(null)
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Edit2 className="w-4 h-4 text-blue-600" />
                        Editar rápido
                      </button>
                      <button
                        onClick={() => {
                          navigate(`/publicar/nueva?id=${encodeURIComponent(listing.id)}`)
                          setOpenDropdownId(null)
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Settings className="w-4 h-4 text-gray-500" />
                        Editar completo
                      </button>
                      <a
                        href={`/listing/${listing.slug || listing.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setOpenDropdownId(null)}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4 text-gray-500" />
                        Ver público
                      </a>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => handleMarkAsSold(listing.id)}
                        disabled={markingSoldId === listing.id}
                        className="w-full px-4 py-2.5 text-left text-sm text-green-700 hover:bg-green-50 flex items-center gap-2 disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Marcar como vendida
                      </button>
                      <button
                        onClick={() => {
                          handleDelete(listing.id)
                          setOpenDropdownId(null)
                        }}
                        disabled={deletingId === listing.id}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de edición rápida */}
      <QuickEditModal 
        listing={quickEditListing}
        isOpen={!!quickEditListing}
        onClose={() => setQuickEditListing(null)}
        onSave={onRefresh}
      />

      {/* Modal de sugerencia de precio */}
      <PriceSuggestionModal
        listing={priceSuggestionListing}
        isOpen={!!priceSuggestionListing}
        onClose={() => setPriceSuggestionListing(null)}
        onApplyPrice={applySuggestedPrice}
      />
    </div>
  )
}

// ============================================
// COMPONENTE: FAVORITOS (LIKES)
// ============================================
function FavoritesSection() {
  const { show: showToast } = useToast()
  const [favorites, setFavorites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const loadFavorites = useCallback(async () => {
    if (!user?.id) return
    
    setLoading(true)
    try {
      const supabase = getSupabaseClient()
      
      // Primero obtener los IDs de los likes del usuario
      const { data: likesData, error: likesError } = await supabase
        .from('listing_likes')
        .select('id, listing_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (likesError) throw likesError
      
      if (!likesData || likesData.length === 0) {
        setFavorites([])
        setLoading(false)
        return
      }
      
      // Luego obtener los datos de las publicaciones
      const listingIds = likesData.map(l => l.listing_id)
      const { data: listingsData, error: listingsError } = await supabase
        .from('listings')
        .select('*')
        .in('id', listingIds)
        .neq('status', 'deleted')

      if (listingsError) throw listingsError
      
      // Combinar los datos
      const combined = likesData.map(like => ({
        id: like.id,
        listing_id: like.listing_id,
        created_at: like.created_at,
        listings: listingsData?.find(l => l.id === like.listing_id)
      })).filter(item => item.listings) // Filtrar las que no existen
      
      setFavorites(combined)
    } catch (error) {
      console.error('Error loading favorites:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const removeFavorite = async (likeId: string) => {
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('listing_likes')
        .delete()
        .eq('id', likeId)

      if (error) throw error

      showToast('Eliminado de favoritos', { variant: 'success' })
      loadFavorites()
    } catch (error) {
      console.error('Error removing favorite:', error)
      showToast('Error al eliminar', { variant: 'error' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Tus favoritos ({favorites.length})</h2>
      
      {favorites.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <Heart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tenés favoritos aún</h3>
          <p className="text-gray-500 mb-4">Guardá las bicicletas que te interesen tocando el corazón</p>
          <Link 
            to="/marketplace"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Search className="w-4 h-4" />
            Explorar marketplace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {favorites.map((fav) => {
            const listing = fav.listings
            if (!listing) return null
            return (
              <div 
                key={fav.id}
                className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex gap-4"
              >
                {listing.images?.[0] ? (
                  <img 
                    src={typeof listing.images[0] === 'string' ? listing.images[0] : (listing.images[0] as any)?.url}
                    alt=""
                    className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <Package className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">{listing.title}</h3>
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    ${listing.price?.toLocaleString('es-AR')}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <a 
                      href={`/listing/${listing.slug || listing.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Ver publicación
                    </a>
                    <button 
                      onClick={() => removeFavorite(fav.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================
// COMPONENTE: ALERTAS REALES
// ============================================
function AlertsSection() {
  const { show: showToast } = useToast()
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const loadSearches = useCallback(async () => {
    if (!user?.id) return
    
    setLoading(true)
    try {
      const supabase = getSupabaseClient()
      
      const { data, error } = await supabase
        .from('saved_searches')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setSearches(data || [])
    } catch (error) {
      console.error('Error loading saved searches:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadSearches()
  }, [loadSearches])

  const deleteSearch = async (id: number) => {
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('saved_searches')
        .delete()
        .eq('id', id)

      if (error) throw error

      showToast('Alerta eliminada', { variant: 'success' })
      loadSearches()
    } catch (error) {
      console.error('Error deleting search:', error)
      showToast('Error al eliminar', { variant: 'error' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Tus alertas ({searches.length})</h2>
      <p className="text-gray-500 text-sm">Te notificaremos cuando haya nuevas publicaciones que coincidan con tu búsqueda</p>
      
      {searches.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tenés alertas configuradas</h3>
          <p className="text-gray-500 mb-4">Buscá algo en el marketplace y guardá la búsqueda para recibir alertas</p>
          <Link 
            to="/marketplace"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Search className="w-4 h-4" />
            Crear alerta
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {searches.map((search) => (
            <div 
              key={search.id}
              className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center justify-between"
            >
              <div>
                <h3 className="font-medium text-gray-900">{search.name || 'Búsqueda guardada'}</h3>
                <p className="text-sm text-gray-500">
                  Creada el {new Date(search.created_at).toLocaleDateString('es-AR')}
                </p>
              </div>
              <button 
                onClick={() => deleteSearch(search.id)}
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// COMPONENTE: CONFIGURACIÓN COMPLETA
// ============================================
function SettingsSection({ profile, onProfileUpdate, accountVerification, onVerificationUpdate }: { profile: any, onProfileUpdate: () => void, accountVerification: AccountVerification | null, onVerificationUpdate: () => void }) {
  const { show: showToast } = useToast()
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'profile' | 'store' | 'verification' | 'password'>('profile')
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    whatsapp_number: '',
    city: '',
    province: '',
    bio: '',
    // Social media fields
    instagram_handle: '',
    facebook_handle: '',
    website_url: '',
    // Store fields
    store_name: '',
    store_phone: '',
    store_whatsapp: '',
    store_address: '',
    store_city: '',
    store_province: '',
    store_website: '',
    store_instagram: '',
    business_hours: '',
  })

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        email: profile.email || '',
        whatsapp_number: profile.whatsapp_number || '',
        city: profile.city || '',
        province: profile.province || '',
        bio: profile.bio || '',
        instagram_handle: profile.instagram_handle || '',
        facebook_handle: profile.facebook_handle || '',
        website_url: profile.website_url || '',
        store_name: profile.store_name || '',
        store_phone: profile.store_phone || '',
        store_whatsapp: profile.store_whatsapp || '',
        store_address: profile.store_address || '',
        store_city: profile.store_city || '',
        store_province: profile.store_province || '',
        store_website: profile.store_website || '',
        store_instagram: profile.store_instagram || '',
        business_hours: profile.business_hours || '',
      })
    }
  }, [profile])

  const handleSave = async () => {
    if (!user?.id) return
    
    setSaving(true)
    try {
      const supabase = getSupabaseClient()
      
      const updateData: any = {
        full_name: formData.full_name,
        whatsapp_number: formData.whatsapp_number,
        city: formData.city,
        province: formData.province,
        bio: formData.bio,
        instagram_handle: formData.instagram_handle,
        facebook_handle: formData.facebook_handle,
        website_url: formData.website_url,
        updated_at: new Date().toISOString(),
      }

      // Solo actualizar campos de tienda si es tienda
      if (profile?.store_enabled) {
        updateData.store_name = formData.store_name
        updateData.store_phone = formData.store_phone
        updateData.store_whatsapp = formData.store_whatsapp
        updateData.store_address = formData.store_address
        updateData.store_city = formData.store_city
        updateData.store_province = formData.store_province
        updateData.store_website = formData.store_website
        updateData.store_instagram = formData.store_instagram
        updateData.business_hours = formData.business_hours
      }

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id)

      if (error) throw error

      showToast('Perfil actualizado correctamente', { variant: 'success' })
      onProfileUpdate()
    } catch (error) {
      console.error('Error updating profile:', error)
      showToast('Error al guardar los cambios', { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return

    try {
      const supabase = getSupabaseClient()
      const fileExt = file.name.split('.').pop()
      const fileName = `avatar_${user.id}_${Date.now()}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      if (updateError) throw updateError

      showToast('Foto de perfil actualizada', { variant: 'success' })
      onProfileUpdate()
    } catch (error) {
      console.error('Error uploading avatar:', error)
      showToast('Error al subir la imagen', { variant: 'error' })
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">Configuración</h2>
      
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'profile'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Perfil
        </button>
        {profile?.store_enabled && (
          <button
            onClick={() => setActiveTab('store')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'store'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Tienda
          </button>
        )}
        <button
          onClick={() => setActiveTab('verification')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'verification'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Verificación
        </button>
      </div>

      {/* Avatar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-medium text-gray-900 mb-4">Foto de perfil</h3>
        <div className="flex items-center gap-4">
          <img 
            src={buildPublicUrlSafe(profile?.avatar_url) || '/avatar-placeholder.png'}
            alt=""
            className="w-20 h-20 rounded-full object-cover bg-gray-200"
          />
          <div>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
              <Upload className="w-4 h-4" />
              Cambiar foto
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleAvatarUpload}
              />
            </label>
            <p className="text-xs text-gray-500 mt-2">JPG, PNG. Máx 2MB</p>
          </div>
        </div>
      </div>

      {/* Formulario de Perfil */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="font-medium text-gray-900 mb-4">Datos personales</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre completo</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">WhatsApp</label>
              <input
                type="tel"
                value={formData.whatsapp_number}
                onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="5491123456789"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Ciudad</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Provincia</label>
              <select
                value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all bg-white"
              >
                <option value="">Seleccionar...</option>
                {PROVINCES.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Redes sociales */}
          <div className="border-t border-gray-100 pt-4 mt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Redes sociales</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Instagram</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">@</span>
                  <input
                    type="text"
                    value={formData.instagram_handle}
                    onChange={(e) => setFormData({ ...formData, instagram_handle: e.target.value })}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    placeholder="usuario"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Facebook</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">facebook.com/</span>
                  <input
                    type="text"
                    value={formData.facebook_handle}
                    onChange={(e) => setFormData({ ...formData, facebook_handle: e.target.value })}
                    className="w-full pl-28 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    placeholder="usuario"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sitio web</label>
                <input
                  type="url"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  placeholder="https://www.misitio.com"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Sobre vos</label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all resize-none"
              placeholder="Contá un poco sobre vos..."
            />
          </div>
        </div>
      )}

      {/* Formulario de Tienda */}
      {activeTab === 'store' && profile?.store_enabled && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h3 className="font-medium text-gray-900 mb-4">Datos de la tienda</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre de la tienda</label>
              <input
                type="text"
                value={formData.store_name}
                onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Teléfono de la tienda</label>
              <input
                type="tel"
                value={formData.store_phone}
                onChange={(e) => setFormData({ ...formData, store_phone: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">WhatsApp</label>
              <input
                type="tel"
                value={formData.store_whatsapp}
                onChange={(e) => setFormData({ ...formData, store_whatsapp: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="5491123456789"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Dirección</label>
              <input
                type="text"
                value={formData.store_address}
                onChange={(e) => setFormData({ ...formData, store_address: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Ciudad</label>
              <input
                type="text"
                value={formData.store_city}
                onChange={(e) => setFormData({ ...formData, store_city: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Provincia</label>
              <select
                value={formData.store_province}
                onChange={(e) => setFormData({ ...formData, store_province: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all bg-white"
              >
                <option value="">Seleccionar...</option>
                {PROVINCES.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Sitio web</label>
              <input
                type="url"
                value={formData.store_website}
                onChange={(e) => setFormData({ ...formData, store_website: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="https://mitienda.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Instagram</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">@</span>
                <input
                  type="text"
                  value={formData.store_instagram}
                  onChange={(e) => setFormData({ ...formData, store_instagram: e.target.value })}
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  placeholder="mitienda"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Horarios de atención</label>
              <input
                type="text"
                value={formData.business_hours}
                onChange={(e) => setFormData({ ...formData, business_hours: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="Lun-Vie 9-18hs, Sáb 9-13hs"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'verification' && (
        <AccountVerificationSection 
          verification={accountVerification} 
          onUpdate={onVerificationUpdate}
          isUserVerified={profile?.verified || false}
        />
      )}

      {activeTab !== 'verification' && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================
// COMPONENTE: STORE DASHBOARD SECTION
// ============================================
function StoreDashboardSection({ userId }: { userId: string }) {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalViews: 0,
    totalContacts: 0,
    activeListings: 0,
    featuredListings: 0,
    viewsTrend: 0,
    avgPrice: 0,
    topCategory: ''
  })
  const [dailyViews, setDailyViews] = useState<DailyView[]>([])
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d')
  const [loading, setLoading] = useState(true)
  const [conversionRate, setConversionRate] = useState(0)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const supabase = getSupabaseClient()
        const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90
        const fromDate = new Date()
        fromDate.setDate(fromDate.getDate() - days)
        const toDate = new Date()
        
        // Período anterior para calcular tendencia
        const prevFromDate = new Date(fromDate)
        prevFromDate.setDate(prevFromDate.getDate() - days)

        // 1. Datos de listings (precio promedio, activas, destacadas)
        const { data: listings } = await supabase
          .from('listings')
          .select('*')
          .eq('seller_id', userId)
          .neq('status', 'deleted')

        // 2. Vistas REALES del período actual (events table)
        const { data: currentViews } = await supabase
          .from('events')
          .select('*')
          .eq('store_user_id', userId)
          .eq('type', 'listing_view')
          .gte('created_at', fromDate.toISOString())
          .lt('created_at', toDate.toISOString())

        // 3. Vistas del período anterior (para tendencia)
        const { data: prevViews } = await supabase
          .from('events')
          .select('*')
          .eq('store_user_id', userId)
          .eq('type', 'listing_view')
          .gte('created_at', prevFromDate.toISOString())
          .lt('created_at', fromDate.toISOString())

        // 4. Contactos REALES (WhatsApp + Email) del período actual
        const { data: currentContacts } = await supabase
          .from('contact_events')
          .select('*')
          .eq('seller_id', userId)
          .gte('created_at', fromDate.toISOString())
          .lt('created_at', toDate.toISOString())

        // 5. Datos diarios para el gráfico (últimos X días)
        const { data: dailyEvents } = await supabase
          .from('events')
          .select('created_at')
          .eq('store_user_id', userId)
          .eq('type', 'listing_view')
          .gte('created_at', fromDate.toISOString())
          .order('created_at', { ascending: true })

        if (listings) {
          const activeListings = listings.filter(l => l.status === 'active').length
          const featuredListings = listings.filter(l => l.priorityActive).length
          const prices = listings.filter(l => l.price > 0).map(l => l.price)
          const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0
          
          const categoryCounts: Record<string, number> = {}
          listings.forEach(l => {
            if (l.category) categoryCounts[l.category] = (categoryCounts[l.category] || 0) + (l.view_count || 0)
          })
          const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

          // Métricas reales
          const totalViews = currentViews?.length || 0
          const totalContacts = currentContacts?.length || 0
          const prevViewsCount = prevViews?.length || 0
          
          // Tendencia real (% de cambio)
          let viewsTrend = 0
          if (prevViewsCount > 0) {
            viewsTrend = Math.round(((totalViews - prevViewsCount) / prevViewsCount) * 100)
          } else if (totalViews > 0) {
            viewsTrend = 100 // Si no había views antes y ahora sí, es 100% crecimiento
          }

          // Tasa de conversión real
          const convRate = totalViews > 0 ? Math.round((totalContacts / totalViews) * 100) : 0
          setConversionRate(convRate)

          setMetrics({
            totalViews,
            totalContacts,
            activeListings,
            featuredListings,
            viewsTrend,
            avgPrice,
            topCategory
          })

          // Construir datos diarios reales para el gráfico
          const dailyMap = new Map<string, number>()
          const daysCount = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90
          
          // Inicializar todos los días con 0
          for (let i = 0; i < daysCount; i++) {
            const d = new Date()
            d.setDate(d.getDate() - (daysCount - 1 - i))
            const key = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
            dailyMap.set(key, 0)
          }

          // Sumar vistas reales por día
          dailyEvents?.forEach(event => {
            const date = new Date(event.created_at)
            const key = date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
            dailyMap.set(key, (dailyMap.get(key) || 0) + 1)
          })

          const dailyData: DailyView[] = Array.from(dailyMap.entries()).map(([date, views]) => ({
            date,
            views
          }))

          setDailyViews(dailyData)
        }
      } catch (error) {
        console.error('Error loading store metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [userId, timeRange])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          title="Vistas" 
          value={metrics.totalViews.toLocaleString('es-AR')} 
          trend={metrics.viewsTrend} 
          icon={Eye} 
          color="blue" 
        />
        <KPICard 
          title="Contactos" 
          value={metrics.totalContacts.toLocaleString('es-AR')} 
          icon={MessageCircle} 
          color="green" 
        />
        <KPICard 
          title="Publicaciones" 
          value={metrics.activeListings} 
          icon={Package} 
          color="orange" 
        />
        <KPICard 
          title="Destacadas" 
          value={metrics.featuredListings} 
          icon={Sparkles} 
          color="purple" 
        />
      </div>

      {/* Tasa de conversión destacada */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-6 border border-emerald-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-emerald-900">Tasa de conversión</h3>
            <p className="text-sm text-emerald-700 mt-1">
              Contactos recibidos / Vistas totales
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold text-emerald-700">{conversionRate}%</p>
            <p className="text-sm text-emerald-600 mt-1">
              {metrics.totalContacts} contactos de {metrics.totalViews} vistas
            </p>
          </div>
        </div>
        {/* Barra de progreso visual */}
        <div className="mt-4 h-2 bg-emerald-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(conversionRate * 2, 100)}%` }}
          />
        </div>
        <p className="text-xs text-emerald-600 mt-2">
          El promedio del mercado es 2-5%. ¡Una tasa mayor significa que tus publicaciones convencen!
        </p>
      </div>

      {/* Gráfico de rendimiento */}
      <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Rendimiento</h3>
            <p className="text-sm text-gray-500">Vistas reales de tus publicaciones</p>
          </div>
          <div className="flex gap-2">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  timeRange === range 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {range === '7d' ? '7 días' : range === '30d' ? '30 días' : '90 días'}
              </button>
            ))}
          </div>
        </div>
        
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyViews}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} />
              <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="views" 
                stroke="#2563eb" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stats adicionales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-purple-50 rounded-xl p-5 border border-purple-100">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">Mejor categoría</span>
          </div>
          <p className="text-xl font-bold text-purple-700">{metrics.topCategory || 'N/A'}</p>
        </div>
        
        <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">Precio promedio</span>
          </div>
          <p className="text-xl font-bold text-blue-700">${metrics.avgPrice.toLocaleString('es-AR')}</p>
        </div>
        
        <div className="bg-orange-50 rounded-xl p-5 border border-orange-100">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-orange-600" />
            <span className="text-sm font-medium text-gray-700">Conversión</span>
          </div>
          <p className="text-xl font-bold text-orange-700">
            {metrics.totalViews > 0 ? Math.round((metrics.totalContacts / metrics.totalViews) * 100) : 0}%
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================
// COMPONENTE PRINCIPAL: DASHBOARD UNIFICADO
// ============================================
export default function DashboardUnified() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [profile, setProfile] = useState<UserProfileRecord | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null)
  const [accountVerification, setAccountVerification] = useState<AccountVerification | null>(null)
  const [mobileView, setMobileView] = useState<'menu' | 'content'>('menu')

  const activeTab = searchParams.get('tab') || 'inicio'

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const supabase = getSupabaseClient()
      
      // Cargar datos principales (siempre necesarios)
      const [profileData, listingsData] = await Promise.all([
        fetchUserProfile(user.id),
        supabase
          .from('listings')
          .select('*')
          .eq('seller_id', user.id)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false })
      ])

      setProfile(profileData)
      setListings(listingsData.data || [])
      
      // Cargar datos opcionales (pueden fallar si las tablas no existen aún)
      try {
        const { data: planData } = await supabase
          .from('user_plan_subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        setUserPlan(planData || null)
      } catch (e) {
        // Tabla no existe o no hay suscripción - ignorar
        setUserPlan(null)
      }
      
      try {
        const { data: verificationData } = await supabase
          .from('account_verifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        setAccountVerification(verificationData || null)
      } catch (e) {
        // Tabla no existe o no hay verificación - ignorar
        setAccountVerification(null)
      }
      
      // Contar mensajes no leídos (sin responder y no leídos por el seller)
      const listingIds = (listingsData.data || []).map((l: Listing) => l.id)
      if (listingIds.length > 0) {
        const { count } = await supabase
          .from('listing_questions')
          .select('*', { count: 'exact', head: true })
          .in('listing_id', listingIds)
          .is('answer_body', null)
          .is('seller_read_at', null)
        setNotificationCount(count || 0)
      }
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const navigateToTab = (tab: string) => {
    setSearchParams({ tab })
    setIsMobileMenuOpen(false)
    setMobileView('content')
    window.scrollTo(0, 0)
  }

  const backToMenu = () => {
    setMobileView('menu')
    window.scrollTo(0, 0)
  }

  const getMenuItems = () => {
    const baseItems = [
      { id: 'inicio', label: 'Inicio', icon: LayoutDashboard },
      { id: 'publicaciones', label: 'Publicaciones', icon: Package },
      { id: 'mensajes', label: 'Mensajes', icon: MessageSquare },
      { id: 'favoritos', label: 'Favoritos', icon: Heart },
      { id: 'alertas', label: 'Alertas', icon: Bell },
    ]

    if (profile?.store_enabled) {
      baseItems.splice(1, 0, { 
        id: 'tienda', 
        label: 'Dashboard de tienda', 
        icon: Store 
      })
    }

    return baseItems
  }

  const menuItems = getMenuItems()

  const renderContent = () => {
    switch (activeTab) {
      case 'inicio':
        return (
          <div className="space-y-6">
            <SetupProgress profile={profile} onCompleteStep={(step) => navigateToTab('configuracion')} />
            
            <MiniKPIs listings={listings} userId={user!.id} />

            <RecentActivitySection userId={user!.id} />
          </div>
        )

      case 'tienda':
        if (!profile?.store_enabled) return null
        return <StoreDashboardSection userId={user!.id} />

      case 'publicaciones':
        return <ListingsSection listings={listings} onRefresh={loadData} userId={user!.id} />

      case 'favoritos':
        return <FavoritesSection />

      case 'alertas':
        return <AlertsSection />

      case 'mensajes':
        return <ChatSection userId={user!.id} onUpdate={loadData} />

      case 'configuracion':
        return <SettingsSection 
          profile={profile} 
          onProfileUpdate={loadData} 
          accountVerification={accountVerification}
          onVerificationUpdate={loadData}
        />

      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  const displayName = profile?.store_name || profile?.full_name || user?.email?.split('@')[0] || 'Usuario'

  // Mobile Menu Items con descripciones
  const mobileMenuItems = [
    { id: 'inicio', label: 'Inicio', description: 'Resumen de tu cuenta', icon: LayoutDashboard },
    ...(profile?.store_enabled ? [{ id: 'tienda', label: 'Dashboard de tienda', description: 'Métricas y análisis', icon: Store }] : []),
    { id: 'publicaciones', label: 'Publicaciones', description: `${listings.length} publicaciones activas`, icon: Package },
    { id: 'mensajes', label: 'Mensajes', description: 'Consultas de compradores', icon: MessageSquare, badge: notificationCount },
    { id: 'favoritos', label: 'Favoritos', description: 'Tus bicis guardadas', icon: Heart },
    { id: 'alertas', label: 'Alertas', description: 'Notificaciones importantes', icon: Bell },
    { id: 'configuracion', label: 'Configuración', description: 'Editar perfil y datos', icon: Settings },
  ]

  return (
    <>
      <SeoHead title="Mi cuenta | Ciclo Market" />
      
      <div className="min-h-screen bg-gray-50">
        {/* ============================================
            MOBILE LAYOUT (Mercado Libre style)
            ============================================ */}
        <div className="lg:hidden">
          {/* Mobile Menu View */}
          {mobileView === 'menu' && (
            <div className="min-h-screen bg-gray-50">
              {/* Header con avatar */}
              <div className="bg-white px-4 py-6 border-b border-gray-200">
                <div className="flex items-center gap-4">
                  <img 
                    src={buildPublicUrlSafe(profile?.avatar_url) || '/avatar-placeholder.png'}
                    alt=""
                    className="w-16 h-16 rounded-full object-cover bg-gray-200"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-lg text-gray-900">{displayName}</p>
                    <div className="mt-1">
                      <UserVerifiedBadge isVerified={profile?.verified || false} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <nav className="bg-white mt-2">
                {mobileMenuItems.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => navigateToTab(item.id)}
                    className={`w-full flex items-center gap-4 px-4 py-4 text-left transition-colors
                      ${index !== mobileMenuItems.length - 1 ? 'border-b border-gray-100' : ''}
                      active:bg-gray-50
                    `}
                  >
                    <div className="relative">
                      <item.icon className="w-6 h-6 text-gray-600" />
                      {item.badge && item.badge > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500">{item.description}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>
                ))}
              </nav>

              {/* Logout */}
              <div className="mt-4 px-4">
                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-red-600 font-medium bg-white rounded-lg border border-gray-200"
                >
                  <LogOut className="w-5 h-5" />
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}

          {/* Mobile Content View */}
          {mobileView === 'content' && (
            <div className="min-h-screen bg-gray-50">
              {/* Header con flecha para volver */}
              <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
                <button 
                  onClick={backToMenu}
                  className="flex items-center gap-3"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-600" />
                  <span className="font-semibold text-gray-900">
                    {mobileMenuItems.find(i => i.id === activeTab)?.label || 'Mi cuenta'}
                  </span>
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                {renderContent()}
              </div>
            </div>
          )}
        </div>

        {/* ============================================
            DESKTOP LAYOUT (Sidebar tradicional)
            ============================================ */}
        <div className="hidden lg:flex max-w-7xl mx-auto">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r border-gray-200 min-h-screen">
            <div className="h-full flex flex-col">
              {/* Logo & User */}
              <div className="p-6 border-b border-gray-100">
                <Link to="/" className="flex items-center gap-2 mb-6">
                  <span className="font-bold text-xl text-gray-900">Ciclo Market</span>
                </Link>

                <div className="flex items-center gap-3">
                  <img 
                    src={buildPublicUrlSafe(profile?.avatar_url) || '/avatar-placeholder.png'}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover bg-gray-200"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{displayName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <UserVerifiedBadge isVerified={profile?.verified || false} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigateToTab(item.id)}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${activeTab === item.id 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    <div className="relative">
                      <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-blue-600' : 'text-gray-500'}`} />
                      {item.id === 'alertas' && notificationCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                          {notificationCount > 9 ? '9+' : notificationCount}
                        </span>
                      )}
                    </div>
                    {item.label}
                    {activeTab === item.id && <ChevronRight className="w-4 h-4 ml-auto" />}
                  </button>
                ))}

                <div className="pt-4 mt-4 border-t border-gray-100">
                  <button
                    onClick={() => navigateToTab('configuracion')}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                      ${activeTab === 'configuracion' 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    <Settings className={`w-5 h-5 ${activeTab === 'configuracion' ? 'text-blue-600' : 'text-gray-500'}`} />
                    Configuración
                  </button>

                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors mt-1"
                  >
                    <LogOut className="w-5 h-5" />
                    Cerrar sesión
                  </button>
                </div>
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 p-8 min-w-0">
            <div className="max-w-4xl">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">
                  {menuItems.find(i => i.id === activeTab)?.label || 'Mi cuenta'}
                </h1>
                <p className="text-gray-500 mt-1">
                  {activeTab === 'inicio' && `Bienvenido de vuelta, ${displayName}`}
                  {activeTab === 'tienda' && 'Métricas y análisis de tu tienda'}
                  {activeTab === 'publicaciones' && `Tenés ${listings.length} publicaciones`}
                  {activeTab === 'mensajes' && 'Respondé las consultas de los compradores'}
                </p>
              </div>

              {/* Content */}
              {renderContent()}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

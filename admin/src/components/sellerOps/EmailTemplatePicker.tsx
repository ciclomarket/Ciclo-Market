import { useState } from 'react'

export type EmailTemplateKey = 
  | 'seller_followup_sold'
  | 'trust_level_low'
  | 'renewal_reminder'
  | 'expired_notice'
  | 'extend_90d'
  | 'whatsapp_upsell'
  | 'custom'

export interface EmailTemplate {
  key: EmailTemplateKey
  label: string
  description: string
  category: 'followup' | 'retention' | 'monetization' | 'system'
  subject: string
  requiresListing: boolean
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    key: 'seller_followup_sold',
    label: '¿Vendiste?',
    description: 'Pregunta si vendió la bici después de recibir consultas',
    category: 'followup',
    subject: '¿Vendiste tu bici? Contanos en 10 segundos',
    requiresListing: false,
  },
  {
    key: 'trust_level_low',
    label: 'Nivel de Confianza',
    description: 'Alerta sobre bajo nivel de confianza y cómo mejorarlo',
    category: 'retention',
    subject: '⚠️ Tu publicación está perdiendo visitas',
    requiresListing: true,
  },
  {
    key: 'renewal_reminder',
    label: 'Recordatorio Vencimiento',
    description: 'Aviso de que la publicación está por vencer',
    category: 'retention',
    subject: 'Tu publicación está por vencer',
    requiresListing: true,
  },
  {
    key: 'expired_notice',
    label: 'Publicación Vencida',
    description: 'Notificación de vencimiento con opción a renovar',
    category: 'retention',
    subject: 'Tu publicación venció – renovala en 1 clic',
    requiresListing: true,
  },
  {
    key: 'extend_90d',
    label: 'Extensión 90 días',
    description: 'Notificación de extensión automática gratuita',
    category: 'system',
    subject: '¡Extendimos tus publicaciones 90 días más!',
    requiresListing: false,
  },
  {
    key: 'whatsapp_upsell',
    label: 'Activar WhatsApp',
    description: 'Propone activar WhatsApp para más ventas',
    category: 'monetization',
    subject: 'Recibiste consultas · Activá WhatsApp para vender más',
    requiresListing: true,
  },
  {
    key: 'custom',
    label: 'Mensaje Personalizado',
    description: 'Escribí un mensaje personalizado',
    category: 'followup',
    subject: '',
    requiresListing: false,
  },
]

const categoryLabels: Record<string, string> = {
  followup: 'Seguimiento',
  retention: 'Retención',
  monetization: 'Monetización',
  system: 'Sistema',
}

const categoryColors: Record<string, { bg: string; text: string }> = {
  followup: { bg: '#dbeafe', text: '#1e40af' },
  retention: { bg: '#fef3c7', text: '#92400e' },
  monetization: { bg: '#d1fae5', text: '#065f46' },
  system: { bg: '#e5e7eb', text: '#374151' },
}

interface EmailTemplatePickerProps {
  selected: EmailTemplateKey | null
  onSelect: (template: EmailTemplate) => void
  disabled?: boolean
}

export function EmailTemplatePicker({ selected, onSelect, disabled }: EmailTemplatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  const selectedTemplate = EMAIL_TEMPLATES.find(t => t.key === selected)

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--admin-surface)',
          border: '1px solid var(--admin-border)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          {selectedTemplate ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: categoryColors[selectedTemplate.category].bg,
                    color: categoryColors[selectedTemplate.category].text,
                  }}
                >
                  {categoryLabels[selectedTemplate.category]}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--admin-text)' }}>
                  {selectedTemplate.label}
                </span>
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--admin-text-muted)' }}>
                {selectedTemplate.subject || 'Sin asunto'}
              </div>
            </div>
          ) : (
            <span style={{ color: 'var(--admin-text-muted)' }}>Seleccionar template...</span>
          )}
        </div>
        <span style={{ color: 'var(--admin-text-muted)', fontSize: '0.75rem' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 'var(--space-2)',
              background: 'var(--admin-surface)',
              border: '1px solid var(--admin-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 50,
              maxHeight: '320px',
              overflow: 'auto',
            }}
          >
            {(['followup', 'retention', 'monetization', 'system'] as const).map((category) => {
              const templates = EMAIL_TEMPLATES.filter(t => t.category === category)
              if (templates.length === 0) return null
              
              return (
                <div key={category}>
                  <div
                    style={{
                      padding: 'var(--space-2) var(--space-4)',
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--admin-text-muted)',
                      background: 'var(--admin-gray-50)',
                    }}
                  >
                    {categoryLabels[category]}
                  </div>
                  {templates.map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      onClick={() => {
                        onSelect(template)
                        setIsOpen(false)
                      }}
                      style={{
                        width: '100%',
                        padding: 'var(--space-3) var(--space-4)',
                        background: selected === template.key ? '#eff6ff' : 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--admin-border-light)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-1)',
                      }}
                      onMouseEnter={(e) => {
                        if (selected !== template.key) {
                          e.currentTarget.style.background = 'var(--admin-gray-50)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selected !== template.key) {
                          e.currentTarget.style.background = 'transparent'
                        }
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--admin-text)', fontSize: '0.875rem' }}>
                        {template.label}
                        {template.requiresListing && (
                          <span
                            style={{
                              marginLeft: 'var(--space-2)',
                              fontSize: '0.625rem',
                              color: 'var(--admin-text-muted)',
                              fontWeight: 500,
                            }}
                          >
                            (requiere publicación)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                        {template.description}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-light)', marginTop: '2px' }}>
                        Asunto: {template.subject || 'Personalizado'}
                      </div>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const steps = [
  { id: 1, name: 'Básicos', description: 'Tipo y estado' },
  { id: 2, name: 'Especificaciones', description: 'Detalles técnicos' },
  { id: 3, name: 'Fotos', description: 'Imágenes del producto' },
  { id: 4, name: 'Precio', description: 'Precio y ubicación' },
];

export default function WizardSteps({ currentStep }) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="grid grid-cols-4 gap-2 sm:gap-4 w-full">
        {steps.map((step, index) => {
          const isDone = step.id < currentStep
          const isCurrent = step.id === currentStep
          const isUpcoming = step.id > currentStep

          return (
            <li
              key={step.id}
              className={cn(
                "relative flex flex-col items-center text-center",
                index < steps.length - 1 &&
                  "after:content-[''] after:absolute after:top-4 md:after:top-5 after:left-1/2 after:w-full after:h-0.5 after:bg-slate-200 after:transition-colors after:duration-500",
                index < steps.length - 1 && isDone && "after:bg-emerald-500"
              )}
            >
              <div className="relative z-10 flex items-center justify-center">
                {isDone ? (
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-emerald-500 flex items-center justify-center transition-colors">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                ) : isCurrent ? (
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-900 flex items-center justify-center ring-4 ring-slate-100 transition-all">
                    <span className="text-white font-semibold">{step.id}</span>
                  </div>
                ) : (
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-slate-200 flex items-center justify-center bg-white">
                    <span className="text-slate-400 font-medium">{step.id}</span>
                  </div>
                )}
              </div>

              <div className="mt-2 hidden md:block">
                <p className={cn("text-sm font-medium", isUpcoming ? "text-slate-400" : "text-slate-900")}>
                  {step.name}
                </p>
                <p className="text-xs text-slate-500">{step.description}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </nav>
  );
}

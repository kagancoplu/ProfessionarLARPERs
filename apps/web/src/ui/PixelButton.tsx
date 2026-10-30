import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'
import { Sprite } from './Sprite'

const button = cva(
  'inline-flex items-center justify-center gap-2 font-display text-[16px] leading-6 border-2 px-4 py-1.5 select-none ' +
  'transition-[transform,box-shadow] duration-[80ms] ' +
  'enabled:hover:brightness-105 enabled:active:translate-x-px enabled:active:translate-y-px enabled:active:shadow-none ' +
  'disabled:bg-surface-3 disabled:text-ink-muted disabled:border-ink-muted disabled:shadow-none disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-gold text-ink border-ink shadow-hard-sm',
        secondary: 'bg-surface-2 text-ink border-ink shadow-hard-sm',
        danger: 'bg-danger text-surface-2 border-danger-dark shadow-hard-sm',
        ghost: 'bg-transparent text-ink border-transparent shadow-none enabled:hover:bg-surface-3'
      },
      size: { sm: 'text-[14px] leading-5 px-3 py-1', md: '', lg: 'text-[20px] leading-7 px-6 py-2' }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
)

export interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  loading?: boolean
  icon?: ReactNode
}

export function PixelButton ({ variant, size, loading = false, icon, className, children, disabled, ...rest }: PixelButtonProps) {
  return (
    <button type="button" className={cn(button({ variant, size }), className)} disabled={disabled === true || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Sprite name="hourglass" zoom={2} className="animate-[steps-in_600ms_steps(2)_infinite_alternate]" /> : icon}
      {children}
    </button>
  )
}

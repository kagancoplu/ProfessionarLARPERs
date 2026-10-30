import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'
import { PxIcon } from './PxIcon'

const button = cva(
  'inline-flex items-center justify-center gap-2 font-display text-[16px] leading-6 px-4 py-1 select-none ' +
  'transition-[transform,box-shadow] duration-[80ms] ' +
  'enabled:hover:brightness-105 enabled:active:translate-x-px enabled:active:translate-y-px enabled:active:shadow-none ' +
  'disabled:text-ink-muted disabled:shadow-none disabled:cursor-not-allowed disabled:grayscale',
  {
    variants: {
      variant: {
        primary: 'btn9 btn9-gold text-ink shadow-hard-sm',
        secondary: 'btn9 btn9-parchment text-ink shadow-hard-sm',
        danger: 'btn9 btn9-danger text-surface-2 shadow-hard-sm',
        ghost: 'border-2 border-transparent bg-transparent text-ink shadow-none enabled:hover:bg-surface-3'
      },
      size: { sm: 'text-[14px] leading-5 px-3 py-0.5', md: '', lg: 'text-[20px] leading-7 px-6 py-1.5' }
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
      {loading ? <PxIcon name="hourglass" zoom={1} className="blink-steps" /> : icon}
      {children}
    </button>
  )
}

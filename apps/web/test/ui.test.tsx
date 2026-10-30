import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Counter, EmptyState, ErrorState, PixelButton, Tag, TxLink, formatInt } from '../src/ui'

describe('ui', () => {
  it('PixelButton: disabled and loading states block clicks and keep the label', () => {
    render(<><PixelButton disabled>Join</PixelButton><PixelButton loading>Approve</PixelButton></>)
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled()
    const loading = screen.getByRole('button', { name: /approve/i })
    expect(loading).toBeDisabled()
    expect(loading).toHaveAttribute('aria-busy', 'true')
  })
  it('TxLink: real txids link to WhatsOnChain, mock ids get a MOCK tag and no link', () => {
    render(<><TxLink txid={'ab'.repeat(32)} /><TxLink txid="mock_settle_001" /></>)
    expect(screen.getByRole('link')).toHaveAttribute('href', `https://whatsonchain.com/tx/${'ab'.repeat(32)}`)
    expect(screen.getByText('MOCK')).toBeInTheDocument()
    expect(screen.getByText('mock_settle_001')).toBeInTheDocument()
  })
  it('states carry concrete copy and a retry action', () => {
    let retried = 0
    render(<><EmptyState title="No pools on the board yet." /><ErrorState title="The coordinator is not answering." onRetry={() => { retried++ }} /></>)
    expect(screen.getByRole('status')).toHaveTextContent('No pools on the board yet.')
    screen.getByRole('button', { name: 'Retry' }).click()
    expect(retried).toBe(1)
  })
  it('Counter formats with thin spaces; Tag renders uppercase label', () => {
    expect(formatInt(25000)).toBe('25 000')
    const { container } = render(<><Counter value={1234567n} unit="sat" /><Tag tone="warn">demo pricing</Tag></>)
    expect(container.textContent).toContain('1 234 567')
    expect(screen.getByText('demo pricing')).toBeInTheDocument()
  })
})

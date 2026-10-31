import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router'
import { ErrorState, PixelButton } from '../ui'

/** The in-app error page (instead of React Router's bare one): what broke, back to the Town, or reload. */
export function RouteError () {
  const error = useRouteError()
  const navigate = useNavigate()
  const text = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : String(error)
  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4 p-6" data-testid="route-error">
      <ErrorState title="This street is closed for repairs." body={<>Something on this page broke: <span className="mono">{text}</span></>} />
      <div className="flex gap-3">
        <PixelButton onClick={() => { void navigate('/') }}>Back to the town</PixelButton>
        <PixelButton variant="secondary" onClick={() => { location.reload() }}>Reload</PixelButton>
      </div>
    </div>
  )
}

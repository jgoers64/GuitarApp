function formatBuildLabel(iso: string): string {
  return iso.slice(5, 16).replace('T', ' ')
}

export function AppVersion() {
  const label = `v${__APP_VERSION__} · ${formatBuildLabel(__BUILD_TIME__)}`

  return (
    <p className="app-version" aria-label={`App version ${label}`}>
      {label}
    </p>
  )
}

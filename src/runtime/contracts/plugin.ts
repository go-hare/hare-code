export type RuntimePluginStatus = 'enabled' | 'disabled'

export interface RuntimePluginComponents {
  commands: boolean
  agents: boolean
  skills: boolean
  hooks: boolean
  mcp: boolean
  lsp: boolean
  outputStyles: boolean
  settings: boolean
}

export interface RuntimePluginDescriptor {
  name: string
  source: string
  path: string
  repository: string
  status: RuntimePluginStatus
  enabled: boolean
  builtin?: boolean
  version?: string
  sha?: string
  description?: string
  components: RuntimePluginComponents
}

export interface RuntimePluginErrorDescriptor {
  type: string
  source: string
  plugin?: string
  message?: string
}

export interface RuntimePluginCatalogSnapshot {
  plugins: readonly RuntimePluginDescriptor[]
  errors: readonly RuntimePluginErrorDescriptor[]
}

export type RuntimePluginScope = 'user' | 'project' | 'local'

export type RuntimePluginSetEnabledRequest = {
  name: string
  enabled: boolean
  scope?: RuntimePluginScope
  metadata?: Record<string, unknown>
}

export type RuntimePluginInstallRequest = {
  name: string
  scope?: RuntimePluginScope
  metadata?: Record<string, unknown>
}

export type RuntimePluginUninstallRequest = {
  name: string
  scope?: RuntimePluginScope
  keepData?: boolean
  metadata?: Record<string, unknown>
}

export type RuntimePluginUpdateRequest = {
  name: string
  scope?: RuntimePluginScope
  metadata?: Record<string, unknown>
}

export type RuntimePluginMutationResult = {
  name: string
  action?: 'set_enabled' | 'install' | 'uninstall' | 'update'
  success?: boolean
  enabled: boolean
  status: RuntimePluginStatus
  plugin?: RuntimePluginDescriptor
  snapshot?: Partial<RuntimePluginCatalogSnapshot>
  message?: string
  oldVersion?: string
  newVersion?: string
  alreadyUpToDate?: boolean
  metadata?: Record<string, unknown>
}

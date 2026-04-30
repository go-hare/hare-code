import type {
  KernelCapabilityDescriptor,
  KernelCapabilityName,
  KernelCapabilityReloadScope,
} from '../runtime/contracts/capability.js'
import type {
  KernelRuntime,
  KernelRuntimeCapabilities,
} from './runtime.js'
import {
  filterKernelCapabilities,
  groupKernelCapabilities,
  toKernelCapabilityView,
  toKernelCapabilityViews,
  type KernelCapabilityFamily,
  type KernelCapabilityFilter,
  type KernelCapabilityView,
} from './capabilities.js'

type KernelRuntimeCapabilitySource = {
  listCapabilities(): readonly KernelCapabilityDescriptor[]
  getCapability(
    name: KernelCapabilityName,
  ): KernelCapabilityDescriptor | undefined
  reloadCapabilities(
    scope?: KernelCapabilityReloadScope,
  ): Promise<readonly KernelCapabilityDescriptor[]>
}

export function createKernelRuntimeCapabilitiesFacade(
  runtime: KernelRuntimeCapabilitySource,
): KernelRuntimeCapabilities {
  return {
    list: () => runtime.listCapabilities(),
    views: () => toKernelCapabilityViews(runtime.listCapabilities()),
    get: name => runtime.getCapability(name),
    getView: name => {
      const descriptor = runtime.getCapability(name)
      return descriptor ? toKernelCapabilityView(descriptor) : undefined
    },
    filter: (filter: KernelCapabilityFilter = {}) =>
      filterKernelCapabilities(runtime.listCapabilities(), filter),
    groupByFamily: () => groupKernelCapabilities(runtime.listCapabilities()),
    listByFamily: (family: KernelCapabilityFamily) =>
      filterKernelCapabilities(runtime.listCapabilities(), { family }),
    reload: scope => runtime.reloadCapabilities(scope),
  }
}

export function resolveKernelRuntimeCapabilities(
  source:
    | KernelRuntime
    | KernelRuntimeCapabilities
    | readonly KernelCapabilityDescriptor[],
): readonly KernelCapabilityView[] {
  if (isKernelCapabilityDescriptorList(source)) {
    return toKernelCapabilityViews(source)
  }
  return getKernelRuntimeCapabilities(source).views()
}

export async function reloadKernelRuntimeCapabilities(
  source: KernelRuntime | KernelRuntimeCapabilities,
  scope?: KernelCapabilityReloadScope,
): Promise<readonly KernelCapabilityView[]> {
  const descriptors = await getKernelRuntimeCapabilities(source).reload(scope)
  return toKernelCapabilityViews(descriptors)
}

function getKernelRuntimeCapabilities(
  source: KernelRuntime | KernelRuntimeCapabilities,
): KernelRuntimeCapabilities {
  return hasKernelRuntime(source) ? source.capabilities : source
}

function hasKernelRuntime(
  source: KernelRuntime | KernelRuntimeCapabilities,
): source is KernelRuntime {
  return 'capabilities' in source
}

function isKernelCapabilityDescriptorList(
  source:
    | KernelRuntime
    | KernelRuntimeCapabilities
    | readonly KernelCapabilityDescriptor[],
): source is readonly KernelCapabilityDescriptor[] {
  return Array.isArray(source)
}

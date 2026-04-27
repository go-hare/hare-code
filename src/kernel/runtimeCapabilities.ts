import type {
  KernelCapabilityDescriptor,
  KernelCapabilityName,
  KernelCapabilityReloadScope,
} from '../runtime/contracts/capability.js'
import type { KernelRuntimeCapabilities } from './runtime.js'
import {
  filterKernelCapabilities,
  groupKernelCapabilities,
  toKernelCapabilityView,
  toKernelCapabilityViews,
  type KernelCapabilityFamily,
  type KernelCapabilityFilter,
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

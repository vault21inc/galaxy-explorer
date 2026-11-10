import { configResources, type ConfigResource } from '@ge/domain';

/** How a settings row is named in batch descriptions and labels: its name, label or key. */
export function recordTitle(resource: ConfigResource, item: Record<string, unknown>): string {
  for (const field of ['name', 'label', 'key']) {
    const value = item[field];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return `New ${configResources[resource].label.one.toLowerCase()}`;
}

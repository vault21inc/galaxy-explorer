import openapiDocument from '@ge/api-client/openapi.json' with { type: 'json' };
import {
  CONFIG_RESOURCES,
  ENTITY_INCLUDES,
  ENTITY_KINDS,
  entityKinds,
  VIEW_LEVELS,
} from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '../src/api/keys.ts';
import {
  configItemRequest,
  configListRequest,
  entityCreateRequest,
  entityListRequest,
  entityUpdateRequest,
  entityRequest,
  viewRequest,
  type RequestSpec,
} from '../src/api/requests.ts';

/**
 * The hooks build their paths from the registries at run time, outside openapi-fetch's type
 * checks (fetch-data.ts). This checks every one against the API's OpenAPI document instead.
 */

interface Parameter {
  in: 'path' | 'query';
  name: string;
}
const openapi = openapiDocument as unknown as {
  paths: Record<string, { get?: { parameters?: Parameter[] } }>;
};

function expectDocumented(spec: RequestSpec): void {
  const operation = openapi.paths[spec.template]?.get;
  expect(operation, `GET ${spec.template} is in openapi.json`).toBeDefined();
  const parameters = operation?.parameters ?? [];
  const names = (where: Parameter['in']) =>
    parameters.filter((parameter) => parameter.in === where).map((parameter) => parameter.name);
  expect(Object.keys(spec.path).sort()).toEqual(names('path').sort());
  for (const name of Object.keys(spec.query)) expect(names('query')).toContain(name);
}

const ID = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b';

/** A write operation documented at the template, with exactly these path parameters. */
function expectDocumentedWrite(spec: RequestSpec, method: 'post' | 'patch' | 'delete'): void {
  const operation = (
    openapi.paths[spec.template] as Record<string, { parameters?: Parameter[] }> | undefined
  )?.[method];
  expect(operation, `${method.toUpperCase()} ${spec.template} is in openapi.json`).toBeDefined();
  const pathNames = (operation?.parameters ?? [])
    .filter((parameter) => parameter.in === 'path')
    .map((parameter) => parameter.name);
  expect(Object.keys(spec.path).sort()).toEqual(pathNames.sort());
}

describe('registry-derived requests', () => {
  it.each(ENTITY_KINDS)('%s: create and update are documented routes', (kind) => {
    const scope = entityKinds[kind].scope === 'map' ? { mapId: ID } : { universeId: ID };
    expectDocumentedWrite(entityCreateRequest(kind, scope as never), 'post');
    expectDocumentedWrite(entityUpdateRequest(kind, ID), 'patch');
  });

  it.each(ENTITY_KINDS)('%s: the detail request is a documented route', (kind) => {
    expectDocumented(
      entityRequest(kind, ID, {
        include: ENTITY_INCLUDES,
        spoilers: 'exclude',
        includeDrafts: true,
      }),
    );
  });

  it.each(ENTITY_KINDS)('%s: the list request is a documented route', (kind) => {
    const scope = entityKinds[kind].scope === 'map' ? { mapId: ID } : { universeId: ID };
    expectDocumented(
      entityListRequest(kind, scope as never, { q: 'hive', limit: 10, spoilers: 'exclude' }),
    );
  });

  it.each(CONFIG_RESOURCES)('%s: the config list request is a documented route', (resource) => {
    expectDocumented(configListRequest(resource, ID));
    expectDocumentedWrite(configListRequest(resource, ID), 'post');
    expectDocumentedWrite(configItemRequest(resource, ID), 'patch');
    expectDocumentedWrite(configItemRequest(resource, ID), 'delete');
  });

  it.each(VIEW_LEVELS)('%s: the view request is a documented route', (level) => {
    expectDocumented(viewRequest(level, ID, { spoilers: 'exclude', includeDrafts: true }));
  });

  it('sends includes sorted and comma-separated, and leaves out unset options', () => {
    const spec = entityRequest('celestial_object', ID, { include: ['links', 'facts'] });
    expect(spec).toEqual({
      template: '/api/v1/objects/{id}',
      path: { id: ID },
      query: { include: 'facts,links' },
    });
  });

  it('sends a null filter as "null", the API\'s "has no value"', () => {
    const spec = entityListRequest('celestial_object', { mapId: ID }, { parentId: null });
    expect(spec.query).toEqual({ parentId: 'null' });
  });

  it('asks the map for the galaxy view and the object for the others', () => {
    expect(viewRequest('galaxy', ID).template).toBe('/api/v1/maps/{mapId}/views/galaxy');
    expect(viewRequest('orbit', ID).template).toBe('/api/v1/objects/{id}/views/orbit');
  });
});

describe('query keys', () => {
  it('start with the kind, or "view", so one prefix invalidates a whole family', () => {
    expect(queryKeys.entity('character', ID)[0]).toBe('character');
    expect(queryKeys.entityList('group', { mapId: ID })[0]).toBe('group');
    expect(queryKeys.view('system', ID)[0]).toBe('view');
  });
});

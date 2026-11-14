import openapiDocument from '@ge/api-client/openapi.json' with { type: 'json' };

/**
 * The API's OpenAPI document (M1-T10), read for the MCP tools (M7-T7): each tool's input is its
 * operation's path and query parameters plus the fields of its request body, and its
 * description is the operation's. The bodies there are generated from the Zod schemas in
 * @ge/domain, so the tools take exactly what the routes validate.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type JsonSchema = Record<string, unknown>;

interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
}

export interface Operation {
  operationId: string;
  method: HttpMethod;
  /** The path as the client takes it: `/api/v1/objects/{id}`. */
  path: string;
  summary: string;
  description: string;
  parameters: Parameter[];
  /** The JSON body's schema, if the operation takes one. */
  body: JsonSchema | null;
}

interface Document {
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

const doc = openapiDocument as unknown as Document;
const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Every operation, by its `operationId` (`objects.create`). */
export const OPERATIONS: ReadonlyMap<string, Operation> = new Map(
  Object.entries(doc.paths).flatMap(([path, item]) =>
    METHODS.flatMap((method) => {
      const raw = item[method.toLowerCase()] as
        | {
            operationId?: string;
            summary?: string;
            description?: string;
            parameters?: Parameter[];
            requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
          }
        | undefined;
      if (!raw?.operationId) return [];
      const operation: Operation = {
        operationId: raw.operationId,
        method,
        path,
        summary: raw.summary ?? '',
        description: raw.description ?? '',
        parameters: raw.parameters ?? [],
        body: raw.requestBody?.content?.['application/json']?.schema ?? null,
      };
      return [[raw.operationId, operation] as const];
    }),
  ),
);

/** Where each input field goes in the request. */
export interface InputLayout {
  path: string[];
  query: string[];
  /** Body fields spread into the input, or `body` for a body that isn't one object. */
  body: string[] | 'whole';
}

const COMPONENT = '#/components/schemas/';

/** A schema with `$ref`s to components followed once, for reading a body's own fields. */
function resolved(schema: JsonSchema): JsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== 'string' || !ref.startsWith(COMPONENT)) return schema;
  return doc.components?.schemas?.[ref.slice(COMPONENT.length)] ?? schema;
}

/**
 * A tool's input schema: one object holding the path and query parameters and the body's
 * fields, with the components they refer to copied into `$defs`, so the schema stands alone.
 * A body field named like a parameter (an upsert's `externalKey`) gives way to the parameter.
 */
export function inputOf(operation: Operation): { schema: JsonSchema; layout: InputLayout } {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  const layout: InputLayout = { path: [], query: [], body: [] };
  for (const parameter of operation.parameters) {
    if (parameter.in !== 'path' && parameter.in !== 'query') continue;
    properties[parameter.name] = {
      ...(parameter.schema ?? {}),
      ...(parameter.description ? { description: parameter.description } : {}),
    };
    if (parameter.required) required.push(parameter.name);
    layout[parameter.in].push(parameter.name);
  }
  if (operation.body) {
    const body = resolved(operation.body);
    const fields = body.properties as Record<string, JsonSchema> | undefined;
    if (body.type === 'object' && fields) {
      const fieldList: string[] = [];
      for (const [name, field] of Object.entries(fields)) {
        if (name in properties) continue;
        properties[name] = field;
        fieldList.push(name);
      }
      layout.body = fieldList;
      for (const name of (body.required as string[] | undefined) ?? []) {
        if (fieldList.includes(name)) required.push(name);
      }
    } else {
      properties.body = operation.body;
      required.push('body');
      layout.body = 'whole';
    }
  }
  const schema: JsonSchema = { type: 'object', properties, required, additionalProperties: false };
  return { schema: withDefinitions(schema), layout };
}

/** Rewrites component references to `#/$defs/…` and adds every component reached. */
function withDefinitions(schema: JsonSchema): JsonSchema {
  const components = doc.components?.schemas ?? {};
  const defs: Record<string, unknown> = {};
  const pending = [...referencesIn(schema)];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (name in defs) continue;
    const component = components[name];
    if (!component) continue;
    defs[name] = rewritten(component);
    pending.push(...referencesIn(component));
  }
  const result = rewritten(schema) as JsonSchema;
  return Object.keys(defs).length > 0 ? { ...result, $defs: defs } : result;
}

function referencesIn(value: unknown): string[] {
  const text = JSON.stringify(value);
  return [...text.matchAll(/"#\/components\/schemas\/([^"]+)"/g)].map((match) => match[1] ?? '');
}

function rewritten(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).replaceAll(`"${COMPONENT}`, '"#/$defs/'));
}

import type { z } from 'zod';
import { ImportReport } from '../export/report.ts';
import { SearchResult } from '../search/schemas.ts';
import { configResources } from '../registry/config-resources.ts';
import { configSchemasFor, schemasFor } from '../registry/derive-schemas.ts';
import { entityKinds, type EntityKind } from '../registry/entity-kinds.ts';
import type { ConfigResource } from '../registry/config-resources.ts';
import { RichText } from '../richtext/schema.ts';
import { Appearance, PlanetAppearance } from './appearance.ts';
import * as accounts from './accounts.ts';
import * as aspects from './aspects.ts';
import { BatchOperation, BatchRequest } from './batch.ts';
import * as containers from './containers.ts';
import { FieldValue } from './field-value.ts';
import { GalaxySettings, Underlay } from './map-settings.ts';
import { GroupStyle, RouteStyle } from './styles.ts';
import { UniverseSettings } from './universe-settings.ts';
import * as views from './views.ts';

/**
 * The shapes the OpenAPI document names, by name. The API registers them so the document says
 * "a RichText" once and refers to it, instead of repeating the full shape in every route; the
 * generated client (M1-T10) gets one type per shape as a result. Pure data: nothing is
 * registered until the API asks.
 */
export function openApiComponents(): Record<string, z.ZodType> {
  const pascal = (name: string) =>
    name.replace(/(^|_)([a-z])/g, (_match, _sep, letter: string) => letter.toUpperCase());
  const components: Record<string, z.ZodType> = {
    RichText,
    Appearance,
    PlanetAppearance,
    GalaxySettings,
    Underlay,
    GroupStyle,
    RouteStyle,
    UniverseSettings,
    FieldValue,
    AssetVariants: aspects.AssetVariants,
    AssetMetadata: aspects.AssetMetadata,
    AssetRead: aspects.AssetRead,
    ImageAsset: aspects.ImageAsset,
    ImageRead: aspects.ImageRead,
    ImageWrite: aspects.ImageWrite,
    LinkRead: aspects.LinkRead,
    LinkWrite: aspects.LinkWrite,
    CitationRead: aspects.CitationRead,
    Counterpart: aspects.Counterpart,
    ImportReport,
    SearchResult,
    CitationWrite: aspects.CitationWrite,
    FactRead: aspects.FactRead,
    FactWrite: aspects.FactWrite,
    RelationRead: aspects.RelationRead,
    RelationWrite: aspects.RelationWrite,
    LocationRead: aspects.LocationRead,
    LocationWrite: aspects.LocationWrite,
    MemberRead: aspects.MemberRead,
    MemberWrite: aspects.MemberWrite,
    WaypointRead: aspects.WaypointRead,
    WaypointsWrite: aspects.WaypointsWrite,
    UniverseCreate: containers.UniverseCreate,
    UniverseUpdate: containers.UniverseUpdate,
    UniverseRead: containers.UniverseRead,
    MapCreate: containers.MapCreate,
    MapUpdate: containers.MapUpdate,
    MapRead: containers.MapRead,
    BatchOperation,
    BatchRequest,
    AccountRead: accounts.AccountRead,
    SessionRead: accounts.SessionRead,
    AccountLinkRead: accounts.AccountLinkRead,
    AccountLinkSetup: accounts.AccountLinkSetup,
    StorageRead: accounts.StorageRead,
    AdminUserRead: accounts.AdminUserRead,
    AdminUniverseRead: accounts.AdminUniverseRead,
    AdminLinkRead: accounts.AdminLinkRead,
    AccessEventRead: accounts.AccessEventRead,
    UniverseMemberRead: accounts.UniverseMemberRead,
    UniverseMemberWrite: accounts.UniverseMemberWrite,
    ViewObject: views.ViewObject,
    ViewGroup: views.ViewGroup,
    ViewGroupType: views.ViewGroupType,
    ViewPin: views.ViewPin,
    ViewMarker: views.ViewMarker,
    EventList: views.EventList,
    GalaxyView: views.GalaxyView,
    GalaxyObject: views.GalaxyObject,
    SystemStar: views.SystemStar,
    SystemView: views.SystemView,
    OrbitView: views.OrbitView,
  };
  for (const kind of Object.keys(entityKinds) as EntityKind[]) {
    const schemas = schemasFor(kind);
    components[`${pascal(kind)}Create`] = schemas.create;
    components[`${pascal(kind)}Update`] = schemas.update;
    components[`${pascal(kind)}Read`] = schemas.read;
  }
  for (const resource of Object.keys(configResources) as ConfigResource[]) {
    const schemas = configSchemasFor(resource);
    // group_types → GroupType
    const name = pascal(resource).replace(/ies$/, 'y').replace(/s$/, '');
    components[`${name}Create`] = schemas.create;
    components[`${name}Update`] = schemas.update;
    components[`${name}Read`] = schemas.read;
  }
  return components;
}

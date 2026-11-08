import { Navigate, useParams, useSearchParams } from 'react-router';

/**
 * `/u/:universeSlug/:mapSlug/view/:objectId`: the system or orbit view of an object. Those views
 * arrive in M5; until then the link opens the galaxy view with the object selected.
 */
export function ObjectViewPage() {
  const { universeSlug = '', mapSlug = '', objectId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set('select', objectId);
  return <Navigate replace to={`/u/${universeSlug}/${mapSlug}?${next.toString()}`} />;
}

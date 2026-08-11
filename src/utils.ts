import { ConnectionProps } from './types';

/**
 * Builds a MongoDB connection string from granular connection properties.
 *
 * Username and password are percent-encoded, since raw special characters
 * (`@`, `:`, `/`, `%`) would otherwise silently corrupt the URI.
 *
 * @param props - Full connection properties used to compose the URI.
 * @returns The formatted MongoDB URI.
 * @example
 * const uri = buildConnectionString({
 *   prefix: 'mongodb://',
 *   username: 'user',
 *   password: 'pass',
 *   host: 'localhost',
 *   port: 27017,
 *   defaultauthdb: 'admin',
 * });
 */
export function buildConnectionString({
  prefix,
  username,
  password,
  host,
  port,
  defaultauthdb,
  authSource,
  options,
}: ConnectionProps): string {
  const auth = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
  const portPart = port ? `:${port}` : '';
  const url = new URL(`${prefix}${auth}@${host}${portPart}/${defaultauthdb ?? ''}`);

  if (authSource) {
    url.searchParams.set('authSource', authSource);
  }
  if (options) {
    for (const [key, value] of options) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

/**
 * Extracts the database name from a MongoDB URI's path segment, if present.
 *
 * Deliberately avoids `new URL()` here: MongoDB connection strings allow
 * comma-separated multi-host authorities (`mongodb://a,b,c/db`), which the
 * WHATWG URL parser rejects outright as an invalid URL.
 *
 * @param uri - A `mongodb://` or `mongodb+srv://` connection string.
 * @returns The database name, or `undefined` if the URI has no path.
 */
export function extractDatabaseFromUri(uri: string): string | undefined {
  const withoutQuery = uri.split('?')[0];
  const afterScheme = withoutQuery.replace(/^mongodb(\+srv)?:\/\//, '');
  const pathStart = afterScheme.indexOf('/');
  if (pathStart === -1) {
    return undefined;
  }
  return afterScheme.slice(pathStart + 1) || undefined;
}

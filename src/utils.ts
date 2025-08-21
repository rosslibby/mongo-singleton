import { ConnectionProps } from './types';

/**
 * Builds a MongoDB connection string from granular connection properties.
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
  let uri = `${prefix}${username}:${password}@${host}`;
  if (port) {
    uri += `:${port}`;
  }
  uri += `/${defaultauthdb}`;
  if (authSource) {
    uri += `?authSource=${authSource}`;
  }
  if (options) {
    uri += `&${options.toString()}`;
  }
  return uri;
}

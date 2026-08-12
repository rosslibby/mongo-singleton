import { describe, expect, it } from 'vitest';
import { buildConnectionString, extractDatabaseFromUri } from '../src/utils';

describe('buildConnectionString', () => {
  it('builds a basic URI', () => {
    expect(
      buildConnectionString({
        prefix: 'mongodb://',
        username: 'user',
        password: 'pass',
        host: 'localhost',
        port: 27017,
        defaultauthdb: 'admin',
      }),
    ).toBe('mongodb://user:pass@localhost:27017/admin');
  });

  it('percent-encodes special characters in username/password instead of corrupting the URI', () => {
    const uri = buildConnectionString({
      prefix: 'mongodb://',
      username: 'us@er',
      password: 'p@ss:w/rd%25',
      host: 'localhost',
      port: 27017,
      defaultauthdb: 'admin',
    });

    // Round-trip through a real URL parser to prove it's valid and decodes
    // back to the original credentials, rather than just eyeballing escapes.
    const parsed = new URL(uri);
    expect(decodeURIComponent(parsed.username)).toBe('us@er');
    expect(decodeURIComponent(parsed.password)).toBe('p@ss:w/rd%25');
  });

  it('appends authSource and options as query params', () => {
    const uri = buildConnectionString({
      prefix: 'mongodb://',
      username: 'user',
      password: 'pass',
      host: 'localhost',
      defaultauthdb: 'admin',
      authSource: 'admin',
      options: new URLSearchParams({ retryWrites: 'true' }),
    });

    const parsed = new URL(uri);
    expect(parsed.searchParams.get('authSource')).toBe('admin');
    expect(parsed.searchParams.get('retryWrites')).toBe('true');
  });

  it('omits the port when not provided', () => {
    const uri = buildConnectionString({
      prefix: 'mongodb+srv://',
      username: 'user',
      password: 'pass',
      host: 'cluster0.mongodb.net',
      defaultauthdb: 'admin',
    });
    expect(uri).toBe('mongodb+srv://user:pass@cluster0.mongodb.net/admin');
  });
});

describe('extractDatabaseFromUri', () => {
  it('extracts a database name from a simple URI', () => {
    expect(extractDatabaseFromUri('mongodb://localhost:27017/myApp')).toBe('myApp');
  });

  it('strips query params', () => {
    expect(extractDatabaseFromUri('mongodb://localhost:27017/myApp?retryWrites=true')).toBe('myApp');
  });

  it('returns undefined when there is no path', () => {
    expect(extractDatabaseFromUri('mongodb://localhost:27017')).toBeUndefined();
  });

  it('returns undefined for a bare trailing slash', () => {
    expect(extractDatabaseFromUri('mongodb://localhost:27017/')).toBeUndefined();
  });

  it('handles comma-separated multi-host replica set URIs (rejected by the WHATWG URL parser)', () => {
    expect(extractDatabaseFromUri('mongodb://a:27017,b:27017,c:27017/myApp?replicaSet=rs0')).toBe('myApp');
  });

  it('handles mongodb+srv URIs', () => {
    expect(extractDatabaseFromUri('mongodb+srv://user:pass@cluster0.mongodb.net/myApp?retryWrites=true')).toBe(
      'myApp',
    );
  });

  it('handles percent-encoded credentials without misreading them as a path separator', () => {
    expect(extractDatabaseFromUri('mongodb://us%2Fer:p%40ss@localhost:27017/admin')).toBe('admin');
  });
});

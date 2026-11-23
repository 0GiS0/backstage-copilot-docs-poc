import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import { createLicenseCheck, entityPath } from './license';

describe('createLicenseCheck', () => {
  const originalFetch = global.fetch;

  function setup(userEntityRef: string, response: Partial<Response>) {
    const fetchMock = jest.fn(async () => response as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    const check = createLicenseCheck({
      auth: mockServices.auth(),
      httpAuth: mockServices.httpAuth(),
      userInfo: mockServices.userInfo(),
      discovery: mockServices.discovery(),
    });
    const req = {
      headers: { authorization: mockCredentials.user.header(userEntityRef) },
    } as express.Request;
    return { check: () => check(req), fetchMock };
  }

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('accepts users whose entity has a GitHub login', async () => {
    const { check, fetchMock } = setup('user:default/jon_example', {
      ok: true,
      json: async () => ({
        metadata: { annotations: { 'github.com/user-login': 'jon_example' } },
      }),
    });

    await expect(check()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/entities/by-name/user/default/jon_example'),
      expect.objectContaining({
        headers: { Authorization: expect.stringMatching(/^Bearer /) },
      }),
    );
  });

  it('rejects users without the annotation or without an entity', async () => {
    const withoutAnnotation = setup('user:default/a', {
      ok: true,
      json: async () => ({ metadata: { annotations: {} } }),
    });
    const missing = setup('user:default/b', { ok: false });

    await expect(withoutAnnotation.check()).resolves.toBe(false);
    await expect(missing.check()).resolves.toBe(false);
  });
});

describe('entityPath', () => {
  it('encodes and rejects malformed refs', () => {
    expect(entityPath('user:default/a b')).toBe('user/default/a%20b');
    expect(entityPath('nonsense')).toBeUndefined();
  });
});

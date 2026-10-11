import assert from 'node:assert/strict';
import test from 'node:test';
import { GET } from '@/app/api/admin/health/route';
import { NextRequest } from 'next/server';
import { pool } from '@/lib/prisma';

test('admin health endpoint rejects unauthorized requests', async () => {
  const req = new NextRequest('http://localhost:3000/api/admin/health');
  const res = await GET(req);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.success, false);
});

test('admin health endpoint returns service status when authorized', async () => {
  const secretKey = process.env.ADMIN_SECRET_KEY || 'test-key';
  const req = new NextRequest('http://localhost:3000/api/admin/health', {
    headers: {
      'x-admin-key': secretKey,
    },
  });
  const res = await GET(req);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(json.data.status);
  assert.ok(json.data.services);
  assert.ok(json.data.services.database);
  assert.ok(json.data.services.vietocr);
  assert.ok(json.data.services.gemini);
  await pool.end();
});

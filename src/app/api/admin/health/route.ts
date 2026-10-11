import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorizationService } from '@/modules/forms';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authorization = req.headers.get('authorization');
  const adminKey = req.headers.get('x-admin-key');
  const authStatus = adminAuthorizationService.authorize(authorization, adminKey);
  if (authStatus !== 200) {
    return NextResponse.json(
      { success: false, error: { code: authStatus === 503 ? 'ADMIN_KEY_UNCONFIGURED' : 'UNAUTHORIZED' } },
      { status: authStatus }
    );
  }

  const timestamp = new Date().toISOString();
  const results: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      vietocr: { status: 'online' | 'offline'; latencyMs?: number; message?: string };
      database: { status: 'connected' | 'error'; latencyMs?: number; message?: string };
      gemini: { status: 'configured' | 'missing_key' };
    };
    timestamp: string;
  } = {
    status: 'healthy',
    services: {
      vietocr: { status: 'offline' },
      database: { status: 'error' },
      gemini: { status: process.env.GEMINI_API_KEY ? 'configured' : 'missing_key' },
    },
    timestamp,
  };

  // 1. Kiểm tra VietOCR service
  const ocrStart = Date.now();
  try {
    const ocrUrl = process.env.VIETOCR_URL || 'http://127.0.0.1:8000';
    const res = await fetch(`${ocrUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      results.services.vietocr = {
        status: 'online',
        latencyMs: Date.now() - ocrStart,
      };
    } else {
      results.services.vietocr = {
        status: 'offline',
        latencyMs: Date.now() - ocrStart,
        message: `HTTP ${res.status}`,
      };
    }
  } catch (err) {
    results.services.vietocr = {
      status: 'offline',
      latencyMs: Date.now() - ocrStart,
      message: err instanceof Error ? err.message : 'Connection failed',
    };
  }

  // 2. Kiểm tra Database PostgreSQL
  const dbStart = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    results.services.database = {
      status: 'connected',
      latencyMs: Date.now() - dbStart,
    };
  } catch (err) {
    results.services.database = {
      status: 'error',
      latencyMs: Date.now() - dbStart,
      message: err instanceof Error ? err.message : 'Query failed',
    };
  }

  if (results.services.vietocr.status !== 'online' || results.services.database.status !== 'connected') {
    results.status = results.services.database.status !== 'connected' ? 'unhealthy' : 'degraded';
  }

  return NextResponse.json({ success: true, data: results }, { headers: { 'Cache-Control': 'no-store' } });
}

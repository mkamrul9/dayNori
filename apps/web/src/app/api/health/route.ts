import { NextResponse } from 'next/server';
import { HealthResponseSchema } from '@daynori/contracts';

export async function GET() {
  const payload = HealthResponseSchema.parse({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    environment: process.env['NODE_ENV'] ?? 'development',
  });
  return NextResponse.json(payload);
}

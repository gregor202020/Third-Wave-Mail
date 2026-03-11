import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = `/api/${path.join('/')}`;
  const url = new URL(targetPath, API_URL);

  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const cookieStore = await cookies();
  const token = cookieStore.get('twmail_token')?.value;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    headers['Content-Type'] = 'application/json';
  }

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (contentType.includes('multipart/form-data')) {
      body = await req.blob();
    } else {
      body = await req.text();
    }
  }

  const res = await fetch(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  const responseData = res.status === 204 ? null : await res.text();

  if (targetPath === '/api/auth/login' && res.ok && responseData) {
    const json = JSON.parse(responseData);
    const response = NextResponse.json(json);
    response.cookies.set('twmail_token', json.data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    if (json.data.refresh_token) {
      response.cookies.set('twmail_refresh', json.data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    return response;
  }

  if (targetPath === '/api/auth/logout') {
    const response = res.status === 204
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(responseData ? JSON.parse(responseData) : {});
    response.cookies.delete('twmail_token');
    response.cookies.delete('twmail_refresh');
    return response;
  }

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(responseData, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PATCH = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;

import { NextResponse } from 'next/server';

// Old OAuth/email links cannot establish a local session.
export async function GET(request: Request) {
  const destination = new URL('/portal-paciente', request.url);
  destination.searchParams.set('erro', 'local');
  return NextResponse.redirect(destination);
}
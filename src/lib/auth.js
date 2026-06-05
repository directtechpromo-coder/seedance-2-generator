import { NextResponse } from "next/server";

export async function GET(req) {
  return NextResponse.redirect(new URL("/", req.url));
}

export async function POST(req) {
  return NextResponse.json({ user: null });
}

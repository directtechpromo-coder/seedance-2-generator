import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.redirect("/");
}

export async function POST() {
  return NextResponse.json({ user: { id: "guest-user-123", name: "Guest", credits: 150 } });
}

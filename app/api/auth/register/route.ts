import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();
  if (!name || !email || !password) return NextResponse.json({ error: "All fields required" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  const existing = await queryOne("SELECT id FROM users WHERE email = $1", [email]);
  if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  const hash = await bcrypt.hash(password, 12);
  const user = await queryOne<{ id: string }>(
    "INSERT INTO users (name, email, password_hash, email_verified) VALUES ($1, $2, $3, NOW()) RETURNING id",
    [name, email, hash]
  );
  if (!user) return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  // Claim orphaned data (existing items with no user_id) for first real user
  await query("UPDATE guitar_items SET user_id = $1 WHERE user_id IS NULL", [user.id]);
  await query("UPDATE watch_items SET user_id = $1 WHERE user_id IS NULL", [user.id]);
  await query("UPDATE automobiles SET user_id = $1 WHERE user_id IS NULL", [user.id]);
  await query("UPDATE items_of_distinction SET user_id = $1 WHERE user_id IS NULL", [user.id]);
  return NextResponse.json({ success: true });
}

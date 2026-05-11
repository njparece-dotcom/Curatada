import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import AppleProvider from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { query, queryOne } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await queryOne<{ id: string; email: string; name: string | null; image: string | null; password_hash: string | null }>(
          "SELECT id, email, name, image, password_hash FROM users WHERE email = $1",
          [credentials.email]
        );
        if (!user || !user.password_hash) return null;
        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;
        await updateLastLogin(user.id);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    // Only include OAuth providers if env vars are set
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
    ...(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET
      ? [AzureADProvider({ clientId: process.env.AZURE_AD_CLIENT_ID, clientSecret: process.env.AZURE_AD_CLIENT_SECRET, tenantId: process.env.AZURE_AD_TENANT_ID })]
      : []),
    ...(process.env.APPLE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_PRIVATE_KEY && process.env.APPLE_KEY_ID
      ? [AppleProvider({ clientId: process.env.APPLE_ID, clientSecret: { appleId: process.env.APPLE_ID, teamId: process.env.APPLE_TEAM_ID, privateKey: process.env.APPLE_PRIVATE_KEY, keyId: process.env.APPLE_KEY_ID } as unknown as string })]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      // For OAuth providers, upsert user into DB
      if (account && account.provider !== "credentials") {
        if (!user.email) return false;
        const existing = await queryOne<{ id: string }>("SELECT id FROM users WHERE email = $1", [user.email]);
        let userId: string;
        if (existing) {
          userId = existing.id;
          await query("UPDATE users SET name = COALESCE($1, name), image = COALESCE($2, image), updated_at = NOW() WHERE id = $3", [user.name, user.image, userId]);
        } else {
          const created = await queryOne<{ id: string }>(
            "INSERT INTO users (email, name, image, email_verified) VALUES ($1, $2, $3, NOW()) RETURNING id",
            [user.email, user.name || null, user.image || null]
          );
          if (!created) return false;
          userId = created.id;
          // Claim orphaned data (existing items with no user_id) for the first OAuth user
          await claimOrphanedData(userId);
        }
        user.id = userId;
        // Upsert account link
        await query(
          "INSERT INTO accounts (user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (provider, provider_account_id) DO UPDATE SET access_token = EXCLUDED.access_token, expires_at = EXCLUDED.expires_at",
          [userId, account.type, account.provider, account.providerAccountId, account.refresh_token || null, account.access_token || null, account.expires_at || null, account.token_type || null, account.scope || null, account.id_token || null, account.session_state || null]
        );
        await updateLastLogin(userId);
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
};

async function claimOrphanedData(userId: string) {
  await query("UPDATE guitar_items SET user_id = $1 WHERE user_id IS NULL", [userId]);
  await query("UPDATE watch_items SET user_id = $1 WHERE user_id IS NULL", [userId]);
  await query("UPDATE automobiles SET user_id = $1 WHERE user_id IS NULL", [userId]);
  await query("UPDATE items_of_distinction SET user_id = $1 WHERE user_id IS NULL", [userId]);
}

// Best-effort: stamp the user's last successful auth. Swallows errors so a
// transient DB hiccup can't block sign-in. Read by the mgmt API to derive
// "active in last N days".
async function updateLastLogin(userId: string): Promise<void> {
  try {
    await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [userId]);
  } catch (err) {
    console.warn("[auth] updateLastLogin failed:", err);
  }
}

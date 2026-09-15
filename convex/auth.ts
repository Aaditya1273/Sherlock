import { mutation, query, internalMutation } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import { v } from 'convex/values';

/**
 * Sherlock access control.
 *
 * Sherlock holds a person's forwarded email, order numbers and outbound
 * claims, so every function that touches case data authenticates on the
 * SERVER. `requireOwner` below is the only door in; a UI guard is not a
 * security boundary and is not treated as one.
 *
 * Model: one owner passphrase (SHERLOCK_PASSCODE_HASH), exchanged for a
 * random bearer token stored as a hash. Deliberately small — a personal
 * inbox agent has exactly one operator. Investigations carry an `ownerKey`
 * so adding real multi-tenant auth later is a data migration, not a rewrite.
 *
 * If SHERLOCK_PASSCODE_HASH is unset the deployment runs in OPEN mode for
 * local development. That is surfaced in the UI and refused for outbound
 * email, so an unconfigured deployment can never mail a stranger.
 */

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SINGLE_OWNER_KEY = 'owner';

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Salted so the stored hash is not a plain rainbow-table lookup. */
async function hashPasscode(passcode: string): Promise<string> {
  const salt = process.env.SHERLOCK_PASSCODE_SALT ?? 'sherlock-static-salt-v1';
  return sha256Hex(`${salt}:${passcode}`);
}

/** Length-independent comparison, to avoid leaking a prefix match by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isOpenMode(): boolean {
  const hash = process.env.SHERLOCK_PASSCODE_HASH;
  return !hash || hash.length === 0;
}

/**
 * The single authorization gate. Every case-data query and mutation calls it.
 * Returns the owner key that scopes the caller's data.
 */
export async function requireOwner(
  ctx: QueryCtx | MutationCtx,
  token: string | undefined
): Promise<string> {
  if (isOpenMode()) return SINGLE_OWNER_KEY;

  if (!token) throw new Error('Not signed in.');

  const tokenHash = await sha256Hex(token);
  const session = await ctx.db
    .query('sessions')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
    .first();

  if (!session) throw new Error('Not signed in.');
  if (session.expiresAt < Date.now()) throw new Error('Session expired. Sign in again.');

  return session.ownerKey;
}

/**
 * Guard for actions that reach the outside world (sending mail).
 * An unconfigured deployment must not be able to email real people.
 */
export function requireConfiguredForOutbound(): void {
  if (isOpenMode()) {
    throw new Error(
      'Sherlock is running without a passcode (open mode). Set SHERLOCK_PASSCODE_HASH before sending email.'
    );
  }
}

// --------------------------------------------------------------- public API

export const status = query({
  args: {},
  returns: v.object({ openMode: v.boolean() }),
  handler: async () => ({ openMode: isOpenMode() }),
});

export const verify = query({
  args: { token: v.optional(v.string()) },
  returns: v.object({ valid: v.boolean(), openMode: v.boolean() }),
  handler: async (ctx, args) => {
    if (isOpenMode()) return { valid: true, openMode: true };
    try {
      await requireOwner(ctx, args.token);
      return { valid: true, openMode: false };
    } catch {
      return { valid: false, openMode: false };
    }
  },
});

export const signIn = mutation({
  args: { passcode: v.string() },
  returns: v.object({
    success: v.boolean(),
    token: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const stored = process.env.SHERLOCK_PASSCODE_HASH;
    if (!stored) {
      return { success: false, error: 'Sherlock is in open mode; no passcode is set.' };
    }

    const provided = await hashPasscode(args.passcode);
    if (!timingSafeEqual(provided, stored)) {
      await ctx.db.insert('events', {
        type: 'AUTH_FAILED',
        summary: 'Failed sign-in attempt',
        createdAt: Date.now(),
      });
      return { success: false, error: 'Incorrect passcode.' };
    }

    const token = randomToken();
    const now = Date.now();
    await ctx.db.insert('sessions', {
      tokenHash: await sha256Hex(token),
      ownerKey: SINGLE_OWNER_KEY,
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
      lastActiveAt: now,
    });

    return { success: true, token, expiresAt: now + SESSION_TTL_MS };
  },
});

export const signOut = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.token);
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .first();
    if (session) await ctx.db.delete(session._id);
    return null;
  },
});

/**
 * Helper for the operator: turns a passphrase into the value to set as
 * SHERLOCK_PASSCODE_HASH. Available only while no passcode exists, so it
 * cannot be used to probe or reset a configured deployment.
 */
export const generatePasscodeHash = mutation({
  args: { passcode: v.string() },
  returns: v.object({ hash: v.string(), instructions: v.string() }),
  handler: async (_ctx, args) => {
    if (!isOpenMode()) {
      throw new Error('A passcode is already configured. Change it in the Convex dashboard.');
    }
    if (args.passcode.length < 10) {
      throw new Error('Use at least 10 characters.');
    }
    const hash = await hashPasscode(args.passcode);
    return {
      hash,
      instructions:
        'Convex Dashboard > Settings > Environment Variables:\n' +
        `SHERLOCK_PASSCODE_HASH=${hash}\n` +
        '(Optionally also set SHERLOCK_PASSCODE_SALT to a random string before generating.)',
    };
  },
});

/** Expired-session sweep, run from crons. */
export const purgeExpiredSessions = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query('sessions')
      .withIndex('by_expiresAt', (q) => q.lt('expiresAt', Date.now()))
      .take(200);
    for (const session of expired) await ctx.db.delete(session._id);
    return expired.length;
  },
});

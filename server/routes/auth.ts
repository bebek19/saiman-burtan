import { Router, Request, Response } from 'express';
import { db } from '../lib/db.js';
import {
  encryptToken,
  hashPassword,
  verifyPassword,
  hashIp,
  generateRandomString,
  generatePkceChallenge,
  signJwt,
  verifyJwt,
} from '../lib/crypto.js';

export const authRouter = Router();

// In-memory store for pending PKCE/state verification
const oauthStateMap = new Map<string, { codeVerifier: string; returnTo: string; createdAt: number }>();

// Clean old states periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthStateMap.entries()) {
    if (now - val.createdAt > 10 * 60 * 1000) {
      oauthStateMap.delete(key);
    }
  }
}, 60 * 1000);

// Helper to extract client IP
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

// -----------------------------------------------------------------------------
// USER GOOGLE / YOUTUBE OAUTH
// -----------------------------------------------------------------------------

/**
 * GET /api/auth/google/url
 * Initiates Google OAuth with PKCE & YouTube read-only scopes
 */
authRouter.get('/google/url', async (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const returnTo = (req.query.returnTo as string) || '/';

  // If Google OAuth credentials are not yet configured in env, indicate test sandbox availability
  if (!clientId || clientId.includes('your-google-oauth-client-id')) {
    return res.json({
      configured: false,
      message: 'Google OAuth Client ID is not configured in .env. You can use the Sandbox / Demo Sign-In mode for instant testing.',
      sandboxAvailable: true,
    });
  }

  const state = generateRandomString(16);
  const codeVerifier = generateRandomString(32);
  const codeChallenge = generatePkceChallenge(codeVerifier);

  oauthStateMap.set(state, {
    codeVerifier,
    returnTo,
    createdAt: Date.now(),
  });

  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/google/callback`;
  const scopes = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/youtube.readonly',
  ].join(' ');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return res.json({
    configured: true,
    url: authUrl.toString(),
  });
});

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth redirect, token exchange, and YouTube channel lookup
 */
authRouter.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/?auth_error=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
    return res.redirect('/?auth_error=missing_code_or_state');
  }

  const stateData = oauthStateMap.get(state);
  if (!stateData) {
    return res.redirect('/?auth_error=invalid_or_expired_state');
  }
  oauthStateMap.delete(state);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/google/callback`;

  try {
    // 1. Exchange authorization code with Google OAuth endpoint
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId || '',
        client_secret: clientSecret || '',
        code,
        code_verifier: stateData.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Google token exchange error:', tokenData);
      return res.redirect('/?auth_error=token_exchange_failed');
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // 2. Fetch User Profile from Google UserInfo
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await userinfoRes.json();

    if (!profile.id || !profile.email) {
      return res.redirect('/?auth_error=failed_to_fetch_profile');
    }

    // 3. Fetch User's YouTube Channel
    let youtubeChannelId: string | null = null;
    let youtubeChannelTitle: string | null = null;
    let youtubeAvatar: string | null = profile.picture || null;

    try {
      const ytRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const ytData = await ytRes.json();

      if (ytData.items && ytData.items.length > 0) {
        const channel = ytData.items[0];
        youtubeChannelId = channel.id;
        youtubeChannelTitle = channel.snippet?.title || null;
        if (channel.snippet?.thumbnails?.default?.url) {
          youtubeAvatar = channel.snippet.thumbnails.default.url;
        }
      }
    } catch (ytErr) {
      console.warn('Could not fetch YouTube channel details:', ytErr);
    }

    // Encrypt refresh token with AES-256-GCM before database storage
    const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

    // 4. Create or update user in database
    const user = await db.createOrUpdateGoogleUser({
      googleId: profile.id,
      email: profile.email,
      youtubeChannelId,
      youtubeChannelTitle,
      youtubeAvatar,
      refreshTokenEncrypted: encryptedRefreshToken,
    });

    // Check if user is blocked
    if (user.isBlocked) {
      return res.redirect('/?auth_error=account_blocked');
    }

    // 5. Issue session cookie
    const sessionToken = signJwt(
      {
        userId: user.id,
        googleId: user.googleId,
        email: user.email,
      },
      7 * 24 * 3600 // 7 days
    );

    res.cookie('sb_user_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000,
      path: '/',
    });

    return res.redirect(stateData.returnTo || '/');
  } catch (err: any) {
    console.error('Google callback error:', err);
    return res.redirect(`/?auth_error=${encodeURIComponent(err.message || 'unknown_error')}`);
  }
});

/**
 * POST /api/auth/sandbox-login
 * Development & testing sandbox login to simulate verified Google / YouTube user accounts
 */
authRouter.post('/sandbox-login', async (req: Request, res: Response) => {
  const { email, channelTitle, channelId } = req.body;

  const userEmail = email ? String(email).trim() : 'creator.tester@example.com';
  const yChannelTitle = channelTitle ? String(channelTitle).trim() : 'Creator Tester 2026';
  const yChannelId = channelId ? String(channelId).trim() : 'UC_demo_creator_' + generateRandomString(4);
  const pseudoGoogleId = 'sandbox_google_' + crypto.randomUUID().slice(0, 8);

  const user = await db.createOrUpdateGoogleUser({
    googleId: pseudoGoogleId,
    email: userEmail,
    youtubeChannelId: yChannelId,
    youtubeChannelTitle: yChannelTitle,
    youtubeAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(userEmail)}`,
  });

  const sessionToken = signJwt(
    {
      userId: user.id,
      googleId: user.googleId,
      email: user.email,
    },
    7 * 24 * 3600
  );

  res.cookie('sb_user_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });

  return res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      youtubeChannelId: user.youtubeChannelId,
      youtubeChannelTitle: user.youtubeChannelTitle,
      youtubeAvatar: user.youtubeAvatar,
      discordUserId: user.discordUserId,
      discordUsername: user.discordUsername,
    },
  });
});

// -----------------------------------------------------------------------------
// DISCORD OAUTH2 (CONNECT DISCORD ACCOUNT)
// -----------------------------------------------------------------------------

/**
 * GET /api/auth/discord/url
 * Initiates Discord OAuth2 (scope: identify) bound to the current logged-in user
 */
authRouter.get('/discord/url', async (req: Request, res: Response) => {
  const sessionToken = req.cookies?.sb_user_session;
  const decoded = sessionToken ? verifyJwt<{ userId: string }>(sessionToken) : null;

  if (!decoded || !decoded.userId) {
    return res.status(401).json({ error: 'You must sign in with Google first before linking Discord.' });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const returnTo = (req.query.returnTo as string) || '/';

  if (!clientId || clientId === '123456789012345678') {
    return res.json({
      configured: false,
      message: 'Discord OAuth client is not configured in .env. You can use the Sandbox Discord linker.',
      sandboxAvailable: true,
    });
  }

  const state = `disc_${decoded.userId}_${generateRandomString(12)}`;
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/discord/callback`;

  oauthStateMap.set(state, {
    codeVerifier: decoded.userId,
    returnTo,
    createdAt: Date.now(),
  });

  const discordUrl = new URL('https://discord.com/api/oauth2/authorize');
  discordUrl.searchParams.set('client_id', clientId);
  discordUrl.searchParams.set('redirect_uri', redirectUri);
  discordUrl.searchParams.set('response_type', 'code');
  discordUrl.searchParams.set('scope', 'identify');
  discordUrl.searchParams.set('state', state);

  return res.json({
    configured: true,
    url: discordUrl.toString(),
  });
});

/**
 * GET /api/auth/discord/callback
 * Handles Discord OAuth callback and binds discordUserId to current user
 */
authRouter.get('/discord/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/?discord_error=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
    return res.redirect('/?discord_error=missing_parameters');
  }

  const stateData = oauthStateMap.get(state);
  if (!stateData) {
    return res.redirect('/?discord_error=expired_state');
  }
  oauthStateMap.delete(state);

  const userId = stateData.codeVerifier;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/discord/callback`;

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId || '',
        client_secret: clientSecret || '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Discord token exchange error:', tokenData);
      return res.redirect('/?discord_error=token_failed');
    }

    // Fetch user details from Discord API
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();

    if (!discordUser.id) {
      return res.redirect('/?discord_error=user_fetch_failed');
    }

    const discordUsername = discordUser.global_name || discordUser.username;

    // Link discord account with 1:1 unique constraint
    const linkResult = await db.linkDiscordToUser(userId, discordUser.id, discordUsername);
    if (!linkResult.success) {
      return res.redirect(`/?discord_error=${encodeURIComponent(linkResult.error || 'link_conflict')}`);
    }

    return res.redirect(`${stateData.returnTo}?discord_connected=true`);
  } catch (err: any) {
    console.error('Discord OAuth error:', err);
    return res.redirect(`/?discord_error=${encodeURIComponent(err.message || 'unknown_error')}`);
  }
});

/**
 * POST /api/auth/sandbox-link-discord
 * Testing mode Discord linker
 */
authRouter.post('/sandbox-link-discord', async (req: Request, res: Response) => {
  const sessionToken = req.cookies?.sb_user_session;
  const decoded = sessionToken ? verifyJwt<{ userId: string }>(sessionToken) : null;

  if (!decoded || !decoded.userId) {
    return res.status(401).json({ error: 'You must sign in with Google first.' });
  }

  const { discordUsername, discordId } = req.body;
  const pseudoDiscordId = discordId || `disc_user_${generateRandomString(4)}`;
  const username = discordUsername || 'GamerDev#1337';

  const linkResult = await db.linkDiscordToUser(decoded.userId, pseudoDiscordId, username);
  if (!linkResult.success) {
    return res.status(400).json({ error: linkResult.error });
  }

  const updatedUser = await db.findUserById(decoded.userId);
  return res.json({
    success: true,
    user: updatedUser,
  });
});

// -----------------------------------------------------------------------------
// USER SESSION STATUS & LOGOUT
// -----------------------------------------------------------------------------

/**
 * GET /api/auth/me
 * Returns current authenticated user profile
 */
authRouter.get('/me', async (req: Request, res: Response) => {
  const sessionToken = req.cookies?.sb_user_session;
  if (!sessionToken) {
    return res.json({ user: null });
  }

  const decoded = verifyJwt<{ userId: string }>(sessionToken);
  if (!decoded || !decoded.userId) {
    res.clearCookie('sb_user_session');
    return res.json({ user: null });
  }

  const user = await db.findUserById(decoded.userId);
  if (!user || user.isBlocked) {
    res.clearCookie('sb_user_session');
    return res.json({ user: null, blocked: !!user?.isBlocked });
  }

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      youtubeChannelId: user.youtubeChannelId,
      youtubeChannelTitle: user.youtubeChannelTitle,
      youtubeAvatar: user.youtubeAvatar,
      discordUserId: user.discordUserId,
      discordUsername: user.discordUsername,
      needsReauth: user.needsReauth,
    },
  });
});

/**
 * POST /api/auth/logout
 * Clears user session cookie
 */
authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('sb_user_session', { path: '/' });
  return res.json({ success: true });
});

// -----------------------------------------------------------------------------
// ADMIN AUTHENTICATION
// -----------------------------------------------------------------------------

/**
 * POST /api/admin/auth/login
 * Separate admin credential authentication with rate limiting & audit log
 */
authRouter.post('/admin/login', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  // Rate limit admin logins: max 5 attempts per 15 minutes per IP
  const rateLimit = await db.checkRateLimit(`admin_login:${ipHash}`, 5, 15 * 60);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: `Too many login attempts. Please wait ${rateLimit.resetInSeconds} seconds before trying again.`,
    });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const admin = await db.findAdminByEmail(String(email));
  if (!admin) {
    await db.logAudit(null, 'ADMIN_LOGIN_FAILED', 'AdminUser', null, { email, reason: 'Invalid email' }, ipHash);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const valid = await verifyPassword(String(password), admin.passwordHash);
  if (!valid) {
    await db.logAudit(admin.id, 'ADMIN_LOGIN_FAILED', 'AdminUser', admin.id, { email, reason: 'Incorrect password' }, ipHash);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  await db.updateAdminLastLogin(admin.id);
  await db.logAudit(admin.id, 'ADMIN_LOGIN_SUCCESS', 'AdminUser', admin.id, {}, ipHash);

  // Issue isolated admin session JWT (8 hours)
  const adminToken = signJwt(
    {
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
      type: 'admin',
    },
    8 * 3600
  );

  res.cookie('sb_admin_session', adminToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 3600 * 1000,
    path: '/',
  });

  return res.json({
    success: true,
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    },
  });
});

/**
 * GET /api/admin/auth/me
 * Verifies current admin session
 */
authRouter.get('/admin/me', async (req: Request, res: Response) => {
  const token = req.cookies?.sb_admin_session;
  if (!token) {
    return res.json({ admin: null });
  }

  const decoded = verifyJwt<{ adminId: string; role: string; type: string }>(token);
  if (!decoded || decoded.type !== 'admin' || !decoded.adminId) {
    res.clearCookie('sb_admin_session');
    return res.json({ admin: null });
  }

  const admin = await db.findAdminById(decoded.adminId);
  if (!admin) {
    res.clearCookie('sb_admin_session');
    return res.json({ admin: null });
  }

  return res.json({
    admin: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      lastLoginAt: admin.lastLoginAt,
    },
  });
});

/**
 * POST /api/admin/auth/logout
 * Clears admin session
 */
authRouter.post('/admin/logout', (req: Request, res: Response) => {
  res.clearCookie('sb_admin_session', { path: '/' });
  return res.json({ success: true });
});

import crypto from 'node:crypto';
import { hashPassword } from './crypto.js';

// Types corresponding to Prisma schema
export interface DbUser {
  id: string;
  googleId: string;
  email: string;
  youtubeChannelId: string | null;
  youtubeChannelTitle: string | null;
  youtubeAvatar: string | null;
  refreshTokenEncrypted: string | null;
  discordUserId: string | null;
  discordUsername: string | null;
  needsReauth: boolean;
  isBlocked: boolean;
  firstSeenAt: string;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbAdminUser {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  twoFactorSecret: string | null;
  isTwoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbRequirement {
  id: string;
  linkId: string;
  type: 'SUBSCRIBE' | 'LIKE' | 'COMMENT' | 'DISCORD_JOIN' | 'MANUAL';
  sortOrder: number;
  title: string;
  config: {
    channelId?: string;
    channelName?: string;
    videoId?: string;
    videoTitle?: string;
    minCommentLength?: number;
    commentKeywords?: string[];
    guildId?: string;
    guildName?: string;
    inviteUrl?: string;
    discordMode?: 'CURRENT_MEMBER' | 'NEW_MEMBER';
    requiredRoleId?: string;
    requiredRoleName?: string;
    url?: string;
    label?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DbRewardItem {
  id: string;
  linkId: string;
  type: 'REDIRECT_URL' | 'TEXT_NOTE' | 'VOUCHER_POOL' | 'FILE_DOWNLOAD';
  title: string;
  payload: string; // URL, text note, or storage path
  fileStoragePath?: string | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface DbLink {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  mode: 'REQUIRE_ALL' | 'REQUIRE_N';
  minRequirementsRequired: number;
  unlockQuota: number; // 0 = unlimited
  unlockCount: number;
  viewCount: number;
  isActive: boolean;
  isExpired: boolean;
  expiresAt: string | null;
  passwordHash: string | null;
  recheckIntervalMinutes: number;
  cheatThresholdPercent: number;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
  requirements?: DbRequirement[];
  rewards?: DbRewardItem[];
}

export interface DbVoucher {
  id: string;
  linkId: string;
  code: string;
  isAssigned: boolean;
  assignedToUserId: string | null;
  assignedAt: string | null;
  createdAt: string;
}

export interface DbUnlock {
  id: string;
  linkId: string;
  userId: string;
  unlockedAt: string;
  ipHash: string;
  userAgentHash: string;
  expiresAt: string | null;
}

export interface DbUnlockNonce {
  id: string;
  nonce: string;
  linkId: string;
  userId: string;
  tokenHash: string;
  used: boolean;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface DbVerificationLog {
  id: string;
  linkId: string;
  userId: string;
  userEmail?: string;
  requirementType: string;
  status: 'verified' | 'pending' | 'failed' | 'error';
  reason: string;
  ipHash: string;
  checkedAt: string;
}

export interface DbVerificationCache {
  id: string;
  cacheKey: string;
  linkId: string;
  userId: string;
  requirementType: string;
  status: string;
  reason: string;
  expiresAt: string;
  checkedAt: string;
}

export interface DbRateLimit {
  id: string;
  key: string;
  requestCount: number;
  windowStart: string;
  expiresAt: string;
}

export interface DbQuotaUsage {
  id: string;
  date: string;
  youtubeUnitsEstimated: number;
  discordRequests: number;
  updatedAt: string;
}

export interface DbStatsSnapshot {
  id: string;
  linkId: string;
  videoViews: number;
  videoLikes: number;
  videoComments: number;
  channelSubs: number;
  unlockCount: number;
  recordedAt: string;
}

export interface DbBlockItem {
  id: string;
  type: 'USER_ID' | 'IP_HASH' | 'DISCORD_ID' | 'CHANNEL_ID';
  value: string;
  reason: string;
  blockedAt: string;
}

export interface DbAuditLog {
  id: string;
  adminId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: any;
  ipHash: string | null;
  createdAt: string;
}

// In-Memory Database store with atomic methods and initial seed data
class DatabaseStore {
  private users = new Map<string, DbUser>();
  private adminUsers = new Map<string, DbAdminUser>();
  private links = new Map<string, DbLink>();
  private requirements = new Map<string, DbRequirement>();
  private rewards = new Map<string, DbRewardItem>();
  private vouchers = new Map<string, DbVoucher>();
  private unlocks = new Map<string, DbUnlock>();
  private nonces = new Map<string, DbUnlockNonce>();
  private verifLogs: DbVerificationLog[] = [];
  private verifCache = new Map<string, DbVerificationCache>();
  private rateLimits = new Map<string, DbRateLimit>();
  private quotaUsages = new Map<string, DbQuotaUsage>();
  private statsSnapshots: DbStatsSnapshot[] = [];
  private blockList: DbBlockItem[] = [];
  private auditLogs: DbAuditLog[] = [];
  private settings = new Map<string, any>();

  constructor() {
    this.seedInitialData();
  }

  private async seedInitialData() {
    // 1. Seed initial admin account
    const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@saiman-burtan.local';
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'ChangeMeImmediately123!';
    const passwordHash = await hashPassword(defaultPassword);

    const adminId = 'admin-001-master';
    this.adminUsers.set(adminId, {
      id: adminId,
      email: defaultEmail.toLowerCase(),
      passwordHash,
      role: 'superadmin',
      twoFactorSecret: null,
      isTwoFactorEnabled: false,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Seed initial demo locker link
    const demoLinkId = 'link-saiman-vip-demo';
    const now = new Date().toISOString();

    this.links.set(demoLinkId, {
      id: demoLinkId,
      slug: 'vip-creator-pack',
      title: 'Exclusive Creator Preset Pack 2026',
      description: 'Subscribe to our official YouTube channel, drop a supportive comment, and join our Discord community to unlock 45+ premium LUTs and audio sound effects.',
      thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
      mode: 'REQUIRE_ALL',
      minRequirementsRequired: 3,
      unlockQuota: 500,
      unlockCount: 14,
      viewCount: 68,
      isActive: true,
      isExpired: false,
      expiresAt: null,
      passwordHash: null,
      recheckIntervalMinutes: 60,
      cheatThresholdPercent: 40,
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    });

    // Seed requirements for demo link
    const req1Id = 'req-sub-001';
    this.requirements.set(req1Id, {
      id: req1Id,
      linkId: demoLinkId,
      type: 'SUBSCRIBE',
      sortOrder: 1,
      title: 'Subscribe to Saiman Burtan Official Channel',
      config: {
        channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
        channelName: 'Saiman Burtan Official',
        url: 'https://www.youtube.com/@GoogleDevelopers',
      },
      createdAt: now,
      updatedAt: now,
    });

    const req2Id = 'req-like-001';
    this.requirements.set(req2Id, {
      id: req2Id,
      linkId: demoLinkId,
      type: 'LIKE',
      sortOrder: 2,
      title: 'Like "Creator Suite 2026 Launch Showcase"',
      config: {
        videoId: 'dQw4w9WgXcQ',
        videoTitle: 'Creator Suite 2026 Launch Showcase',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      createdAt: now,
      updatedAt: now,
    });

    const req3Id = 'req-comment-001';
    this.requirements.set(req3Id, {
      id: req3Id,
      linkId: demoLinkId,
      type: 'COMMENT',
      sortOrder: 3,
      title: 'Leave a comment with keyword "Saiman2026"',
      config: {
        videoId: 'dQw4w9WgXcQ',
        videoTitle: 'Creator Suite 2026 Launch Showcase',
        minCommentLength: 5,
        commentKeywords: ['saiman2026', 'awesome', 'preset'],
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      createdAt: now,
      updatedAt: now,
    });

    const req4Id = 'req-discord-001';
    this.requirements.set(req4Id, {
      id: req4Id,
      linkId: demoLinkId,
      type: 'DISCORD_JOIN',
      sortOrder: 4,
      title: 'Join Saiman-Burtan VIP Community on Discord',
      config: {
        guildId: '109876543210987654',
        guildName: 'Saiman-Burtan VIP Discord',
        inviteUrl: 'https://discord.gg/example',
        discordMode: 'CURRENT_MEMBER',
      },
      createdAt: now,
      updatedAt: now,
    });

    // Seed rewards for demo link
    this.rewards.set('rew-001', {
      id: 'rew-001',
      linkId: demoLinkId,
      type: 'REDIRECT_URL',
      title: 'Direct High-Speed Drive Download Link',
      payload: 'https://storage.googleapis.com/saiman-burtan-vault/Creator-LUT-Pack-2026-v2.zip',
      sortOrder: 1,
      createdAt: now,
    });

    this.rewards.set('rew-002', {
      id: 'rew-002',
      linkId: demoLinkId,
      type: 'TEXT_NOTE',
      title: 'Exclusive License Key & Unpack Password',
      payload: 'License: SAIMAN-BURTAN-PRO-2026-99X\nArchive Password: UnlockWithSaiman2026!',
      sortOrder: 2,
      createdAt: now,
    });

    // Seed some voucher pool codes
    for (let i = 1; i <= 25; i++) {
      const vId = `vouch-${i}`;
      this.vouchers.set(vId, {
        id: vId,
        linkId: demoLinkId,
        code: `SAIMAN-VIP-${1000 + i}`,
        isAssigned: false,
        assignedToUserId: null,
        assignedAt: null,
        createdAt: now,
      });
    }

    // Default settings
    this.settings.set('youtubeApiKey', process.env.YOUTUBE_API_KEY || '');
    this.settings.set('discordBotToken', process.env.DISCORD_BOT_TOKEN ? 'configured' : '');
    this.settings.set('youtubeDailyQuotaLimit', 10000);
    this.settings.set('youtubeQuotaSoftLimitPercent', 90);
    this.settings.set('maxStorageBytes', 1073741824); // 1 GB free-tier limit
    this.settings.set('currentStorageBytesUsed', 24117248); // ~23 MB
    this.settings.set('language', 'English');
  }

  // --- USER METHODS ---
  async findUserById(id: string): Promise<DbUser | null> {
    return this.users.get(id) || null;
  }

  async findUserByGoogleId(googleId: string): Promise<DbUser | null> {
    for (const user of this.users.values()) {
      if (user.googleId === googleId) return user;
    }
    return null;
  }

  async findUserByDiscordId(discordUserId: string): Promise<DbUser | null> {
    for (const user of this.users.values()) {
      if (user.discordUserId === discordUserId) return user;
    }
    return null;
  }

  async createOrUpdateGoogleUser(userData: {
    googleId: string;
    email: string;
    youtubeChannelId?: string | null;
    youtubeChannelTitle?: string | null;
    youtubeAvatar?: string | null;
    refreshTokenEncrypted?: string | null;
  }): Promise<DbUser> {
    const existing = await this.findUserByGoogleId(userData.googleId);
    const now = new Date().toISOString();

    if (existing) {
      existing.email = userData.email;
      if (userData.youtubeChannelId) existing.youtubeChannelId = userData.youtubeChannelId;
      if (userData.youtubeChannelTitle) existing.youtubeChannelTitle = userData.youtubeChannelTitle;
      if (userData.youtubeAvatar) existing.youtubeAvatar = userData.youtubeAvatar;
      if (userData.refreshTokenEncrypted) existing.refreshTokenEncrypted = userData.refreshTokenEncrypted;
      existing.needsReauth = false;
      existing.lastLoginAt = now;
      existing.updatedAt = now;
      this.users.set(existing.id, existing);
      return existing;
    }

    const newUser: DbUser = {
      id: crypto.randomUUID(),
      googleId: userData.googleId,
      email: userData.email,
      youtubeChannelId: userData.youtubeChannelId || null,
      youtubeChannelTitle: userData.youtubeChannelTitle || null,
      youtubeAvatar: userData.youtubeAvatar || null,
      refreshTokenEncrypted: userData.refreshTokenEncrypted || null,
      discordUserId: null,
      discordUsername: null,
      needsReauth: false,
      isBlocked: false,
      firstSeenAt: now,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(newUser.id, newUser);
    return newUser;
  }

  async linkDiscordToUser(userId: string, discordUserId: string, discordUsername: string): Promise<{ success: boolean; error?: string }> {
    // Enforce 1:1 unique constraint: check if discordUserId already bound to another user
    const existing = await this.findUserByDiscordId(discordUserId);
    if (existing && existing.id !== userId) {
      return { success: false, error: 'This Discord account is already linked to another Saiman-Burtan profile.' };
    }

    const user = await this.findUserById(userId);
    if (!user) return { success: false, error: 'User not found.' };

    user.discordUserId = discordUserId;
    user.discordUsername = discordUsername;
    user.updatedAt = new Date().toISOString();
    this.users.set(user.id, user);
    return { success: true };
  }

  async listUsers(): Promise<DbUser[]> {
    return Array.from(this.users.values());
  }

  async setBlockedStatus(userId: string, isBlocked: boolean): Promise<boolean> {
    const user = await this.findUserById(userId);
    if (!user) return false;
    user.isBlocked = isBlocked;
    user.updatedAt = new Date().toISOString();
    return true;
  }

  async setNeedsReauth(userId: string, needsReauth: boolean): Promise<void> {
    const user = await this.findUserById(userId);
    if (user) {
      user.needsReauth = needsReauth;
      user.updatedAt = new Date().toISOString();
    }
  }

  // --- ADMIN USER METHODS ---
  async findAdminByEmail(email: string): Promise<DbAdminUser | null> {
    const normalized = email.toLowerCase().trim();
    for (const admin of this.adminUsers.values()) {
      if (admin.email.toLowerCase() === normalized) return admin;
    }
    return null;
  }

  async findAdminById(id: string): Promise<DbAdminUser | null> {
    return this.adminUsers.get(id) || null;
  }

  async updateAdminLastLogin(adminId: string): Promise<void> {
    const admin = this.adminUsers.get(adminId);
    if (admin) {
      admin.lastLoginAt = new Date().toISOString();
    }
  }

  // --- LINK METHODS ---
  async getLinkBySlug(slug: string): Promise<DbLink | null> {
    for (const link of this.links.values()) {
      if (link.slug.toLowerCase() === slug.toLowerCase()) {
        return this.hydrateLink(link);
      }
    }
    return null;
  }

  async getLinkById(id: string): Promise<DbLink | null> {
    const link = this.links.get(id);
    return link ? this.hydrateLink(link) : null;
  }

  private hydrateLink(link: DbLink): DbLink {
    const reqs: DbRequirement[] = [];
    for (const r of this.requirements.values()) {
      if (r.linkId === link.id) reqs.push(r);
    }
    reqs.sort((a, b) => a.sortOrder - b.sortOrder);

    const rews: DbRewardItem[] = [];
    for (const rw of this.rewards.values()) {
      if (rw.linkId === link.id) rews.push(rw);
    }
    rews.sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      ...link,
      requirements: reqs,
      rewards: rews,
    };
  }

  async listLinks(): Promise<DbLink[]> {
    return Array.from(this.links.values()).map((l) => this.hydrateLink(l));
  }

  async saveLink(linkData: Partial<DbLink> & { slug: string; title: string }): Promise<DbLink> {
    const now = new Date().toISOString();
    const id = linkData.id || crypto.randomUUID();

    const existing = this.links.get(id);
    const link: DbLink = {
      id,
      slug: linkData.slug,
      title: linkData.title,
      description: linkData.description || '',
      thumbnailUrl: linkData.thumbnailUrl || null,
      mode: linkData.mode || 'REQUIRE_ALL',
      minRequirementsRequired: linkData.minRequirementsRequired || 0,
      unlockQuota: linkData.unlockQuota || 0,
      unlockCount: existing ? existing.unlockCount : 0,
      viewCount: existing ? existing.viewCount : 0,
      isActive: linkData.isActive !== undefined ? linkData.isActive : true,
      isExpired: linkData.isExpired !== undefined ? linkData.isExpired : false,
      expiresAt: linkData.expiresAt || null,
      passwordHash: linkData.passwordHash || null,
      recheckIntervalMinutes: linkData.recheckIntervalMinutes || 60,
      cheatThresholdPercent: linkData.cheatThresholdPercent || 50,
      needsReview: linkData.needsReview || false,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    this.links.set(id, link);
    return this.hydrateLink(link);
  }

  async deleteLink(id: string): Promise<boolean> {
    if (!this.links.has(id)) return false;
    this.links.delete(id);
    for (const [k, r] of this.requirements.entries()) {
      if (r.linkId === id) this.requirements.delete(k);
    }
    for (const [k, rw] of this.rewards.entries()) {
      if (rw.linkId === id) this.rewards.delete(k);
    }
    return true;
  }

  async incrementLinkViews(id: string): Promise<void> {
    const link = this.links.get(id);
    if (link) link.viewCount += 1;
  }

  async incrementLinkUnlocks(id: string): Promise<void> {
    const link = this.links.get(id);
    if (link) {
      link.unlockCount += 1;
      if (link.unlockQuota > 0 && link.unlockCount >= link.unlockQuota) {
        link.isExpired = true;
      }
    }
  }

  // --- REQUIREMENTS & REWARDS ---
  async setLinkRequirements(linkId: string, requirements: Array<Omit<DbRequirement, 'id' | 'linkId' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    // Remove old
    for (const [k, r] of this.requirements.entries()) {
      if (r.linkId === linkId) this.requirements.delete(k);
    }
    const now = new Date().toISOString();
    for (let i = 0; i < requirements.length; i++) {
      const item = requirements[i];
      const id = crypto.randomUUID();
      this.requirements.set(id, {
        id,
        linkId,
        type: item.type,
        sortOrder: item.sortOrder ?? i + 1,
        title: item.title,
        config: item.config,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async setLinkRewards(linkId: string, rewards: Array<Omit<DbRewardItem, 'id' | 'linkId' | 'createdAt'>>): Promise<void> {
    for (const [k, rw] of this.rewards.entries()) {
      if (rw.linkId === linkId) this.rewards.delete(k);
    }
    const now = new Date().toISOString();
    for (let i = 0; i < rewards.length; i++) {
      const item = rewards[i];
      const id = crypto.randomUUID();
      this.rewards.set(id, {
        id,
        linkId,
        type: item.type,
        title: item.title,
        payload: item.payload,
        fileStoragePath: item.fileStoragePath || null,
        fileSizeBytes: item.fileSizeBytes || null,
        mimeType: item.mimeType || null,
        sortOrder: item.sortOrder ?? i + 1,
        createdAt: now,
      });
    }
  }

  // --- VOUCHER POOL (ATOMIC ASSIGNMENT) ---
  async assignNextVoucher(linkId: string, userId: string): Promise<string | null> {
    // Check if user already assigned a voucher for this link
    for (const voucher of this.vouchers.values()) {
      if (voucher.linkId === linkId && voucher.assignedToUserId === userId) {
        return voucher.code;
      }
    }
    // Atomically find first unassigned voucher
    for (const voucher of this.vouchers.values()) {
      if (voucher.linkId === linkId && !voucher.isAssigned) {
        voucher.isAssigned = true;
        voucher.assignedToUserId = userId;
        voucher.assignedAt = new Date().toISOString();
        return voucher.code;
      }
    }
    return null;
  }

  async addVouchers(linkId: string, codes: string[]): Promise<number> {
    const now = new Date().toISOString();
    let count = 0;
    for (const code of codes) {
      const clean = code.trim();
      if (!clean) continue;
      const id = crypto.randomUUID();
      this.vouchers.set(id, {
        id,
        linkId,
        code: clean,
        isAssigned: false,
        assignedToUserId: null,
        assignedAt: null,
        createdAt: now,
      });
      count++;
    }
    return count;
  }

  async getVouchersForLink(linkId: string): Promise<DbVoucher[]> {
    const result: DbVoucher[] = [];
    for (const v of this.vouchers.values()) {
      if (v.linkId === linkId) result.push(v);
    }
    return result;
  }

  // --- UNLOCKS & NONCES ---
  async getUnlock(linkId: string, userId: string): Promise<DbUnlock | null> {
    const key = `${linkId}:${userId}`;
    return this.unlocks.get(key) || null;
  }

  async recordUnlock(data: Omit<DbUnlock, 'id'>): Promise<DbUnlock> {
    const key = `${data.linkId}:${data.userId}`;
    const unlock: DbUnlock = {
      id: crypto.randomUUID(),
      ...data,
    };
    this.unlocks.set(key, unlock);
    await this.incrementLinkUnlocks(data.linkId);
    return unlock;
  }

  async createUnlockNonce(nonce: string, linkId: string, userId: string, tokenHash: string, ttlSeconds = 300): Promise<DbUnlockNonce> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const record: DbUnlockNonce = {
      id: crypto.randomUUID(),
      nonce,
      linkId,
      userId,
      tokenHash,
      used: false,
      usedAt: null,
      expiresAt,
      createdAt: now.toISOString(),
    };
    this.nonces.set(nonce, record);
    return record;
  }

  /**
   * ATOMIC NONCE CONSUMPTION (Prevents Replay Attacks)
   * Consumes nonce in a single atomic operation: UPDATE ... WHERE nonce = ? AND used = false AND expiresAt > now()
   */
  async consumeNonce(nonce: string, tokenHash: string): Promise<{ success: boolean; reason?: string; linkId?: string; userId?: string }> {
    const record = this.nonces.get(nonce);
    if (!record) {
      return { success: false, reason: 'Invalid or missing unlock token nonce.' };
    }
    if (record.used) {
      return { success: false, reason: 'Unlock token has already been consumed (replay attempt detected).' };
    }
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return { success: false, reason: 'Unlock token has expired. Please verify again.' };
    }
    if (record.tokenHash !== tokenHash) {
      return { success: false, reason: 'Token integrity violation.' };
    }

    // Atomically mark used
    record.used = true;
    record.usedAt = new Date().toISOString();
    return { success: true, linkId: record.linkId, userId: record.userId };
  }

  // --- VERIFICATION CACHE & LOGS ---
  async getVerificationCache(cacheKey: string): Promise<DbVerificationCache | null> {
    const cached = this.verifCache.get(cacheKey);
    if (!cached) return null;
    if (new Date(cached.expiresAt).getTime() < Date.now()) {
      this.verifCache.delete(cacheKey);
      return null;
    }
    return cached;
  }

  async setVerificationCache(cacheKey: string, linkId: string, userId: string, requirementType: string, status: string, reason: string, ttlSeconds = 45): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    this.verifCache.set(cacheKey, {
      id: crypto.randomUUID(),
      cacheKey,
      linkId,
      userId,
      requirementType,
      status,
      reason,
      expiresAt,
      checkedAt: now.toISOString(),
    });
  }

  async logVerification(entry: Omit<DbVerificationLog, 'id' | 'checkedAt'>): Promise<void> {
    this.verifLogs.unshift({
      id: crypto.randomUUID(),
      ...entry,
      checkedAt: new Date().toISOString(),
    });
    // Keep reasonable log size in memory
    if (this.verifLogs.length > 1000) {
      this.verifLogs.length = 1000;
    }
  }

  async listVerificationLogs(limit = 100): Promise<DbVerificationLog[]> {
    return this.verifLogs.slice(0, limit);
  }

  // --- RATE LIMITING (ATOMIC POSTGRES / MEMORY PATTERN) ---
  /**
   * Enforces maxRequests per windowSeconds atomically
   */
  async checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
    const now = Date.now();
    const existing = this.rateLimits.get(key);

    if (!existing || new Date(existing.expiresAt).getTime() <= now) {
      const expiresAt = new Date(now + windowSeconds * 1000).toISOString();
      this.rateLimits.set(key, {
        id: crypto.randomUUID(),
        key,
        requestCount: 1,
        windowStart: new Date(now).toISOString(),
        expiresAt,
      });
      return { allowed: true, remaining: maxRequests - 1, resetInSeconds: windowSeconds };
    }

    const resetInSeconds = Math.max(1, Math.round((new Date(existing.expiresAt).getTime() - now) / 1000));

    if (existing.requestCount >= maxRequests) {
      return { allowed: false, remaining: 0, resetInSeconds };
    }

    existing.requestCount += 1;
    return { allowed: true, remaining: maxRequests - existing.requestCount, resetInSeconds };
  }

  // --- DAILY QUOTA USAGE (PACIFIC TIME) ---
  private getTodayDateKey(): string {
    // Pacific Time date string YYYY-MM-DD
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  }

  async getTodayQuota(): Promise<DbQuotaUsage> {
    const date = this.getTodayDateKey();
    let usage = this.quotaUsages.get(date);
    if (!usage) {
      usage = {
        id: crypto.randomUUID(),
        date,
        youtubeUnitsEstimated: 0,
        discordRequests: 0,
        updatedAt: new Date().toISOString(),
      };
      this.quotaUsages.set(date, usage);
    }
    return usage;
  }

  async incrementQuotaUsage(youtubeUnits = 0, discordRequests = 0): Promise<DbQuotaUsage> {
    const quota = await this.getTodayQuota();
    quota.youtubeUnitsEstimated += youtubeUnits;
    quota.discordRequests += discordRequests;
    quota.updatedAt = new Date().toISOString();
    return quota;
  }

  // --- STATS SNAPSHOTS (FOR CHEAT DETECTION) ---
  async addStatsSnapshot(data: Omit<DbStatsSnapshot, 'id' | 'recordedAt'>): Promise<void> {
    this.statsSnapshots.push({
      id: crypto.randomUUID(),
      ...data,
      recordedAt: new Date().toISOString(),
    });
  }

  async getStatsSnapshots(linkId: string): Promise<DbStatsSnapshot[]> {
    return this.statsSnapshots.filter((s) => s.linkId === linkId);
  }

  // --- BLOCK LIST ---
  async isBlocked(type: DbBlockItem['type'], value: string): Promise<boolean> {
    return this.blockList.some((b) => b.type === type && b.value.toLowerCase() === value.toLowerCase());
  }

  async addToBlockList(type: DbBlockItem['type'], value: string, reason: string): Promise<void> {
    if (await this.isBlocked(type, value)) return;
    this.blockList.push({
      id: crypto.randomUUID(),
      type,
      value,
      reason,
      blockedAt: new Date().toISOString(),
    });
  }

  async getBlockList(): Promise<DbBlockItem[]> {
    return [...this.blockList];
  }

  async removeFromBlockList(id: string): Promise<void> {
    this.blockList = this.blockList.filter((b) => b.id !== id);
  }

  // --- AUDIT LOGS ---
  async logAudit(adminId: string | null, action: string, targetType: string | null, targetId: string | null, metadata: any, ipHash: string | null): Promise<void> {
    this.auditLogs.unshift({
      id: crypto.randomUUID(),
      adminId,
      action,
      targetType,
      targetId,
      metadata,
      ipHash,
      createdAt: new Date().toISOString(),
    });
    if (this.auditLogs.length > 500) {
      this.auditLogs.length = 500;
    }
  }

  async getAuditLogs(limit = 100): Promise<DbAuditLog[]> {
    return this.auditLogs.slice(0, limit);
  }

  // --- ADMIN SETTINGS ---
  getSetting(key: string, defaultValue: any = null): any {
    return this.settings.has(key) ? this.settings.get(key) : defaultValue;
  }

  setSetting(key: string, value: any): void {
    this.settings.set(key, value);
  }

  getAllSettings(): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [k, v] of this.settings.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  // --- SYSTEM CLEANUP (CRON ROUTINE) ---
  async runDailyMaintenanceCleanup(): Promise<{ noncesCleaned: number; cacheCleaned: number; rateLimitsCleaned: number }> {
    const now = Date.now();
    let noncesCleaned = 0;
    let cacheCleaned = 0;
    let rateLimitsCleaned = 0;

    for (const [k, v] of this.nonces.entries()) {
      if (new Date(v.expiresAt).getTime() < now) {
        this.nonces.delete(k);
        noncesCleaned++;
      }
    }

    for (const [k, v] of this.verifCache.entries()) {
      if (new Date(v.expiresAt).getTime() < now) {
        this.verifCache.delete(k);
        cacheCleaned++;
      }
    }

    for (const [k, v] of this.rateLimits.entries()) {
      if (new Date(v.expiresAt).getTime() < now) {
        this.rateLimits.delete(k);
        rateLimitsCleaned++;
      }
    }

    return { noncesCleaned, cacheCleaned, rateLimitsCleaned };
  }
}

// Global singleton instance
export const db = new DatabaseStore();

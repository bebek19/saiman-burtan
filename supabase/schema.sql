-- ==============================================================================
-- Saiman-Burtan Supabase PostgreSQL DDL & Row Level Security (RLS) Policy Script
-- ==============================================================================
-- Run this in the Supabase SQL Editor to initialize or verify tables & security.

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Core Tables
CREATE TABLE IF NOT EXISTS public."User" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "googleId" TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    "youtubeChannelId" TEXT,
    "youtubeChannelTitle" TEXT,
    "youtubeAvatar" TEXT,
    "refreshTokenEncrypted" TEXT,
    "discordUserId" TEXT UNIQUE,
    "discordUsername" TEXT,
    "needsReauth" BOOLEAN DEFAULT false NOT NULL,
    "isBlocked" BOOLEAN DEFAULT false NOT NULL,
    "firstSeenAt" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "lastLoginAt" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."AdminUser" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    role TEXT DEFAULT 'admin' NOT NULL,
    "twoFactorSecret" TEXT,
    "isTwoFactorEnabled" BOOLEAN DEFAULT false NOT NULL,
    "lastLoginAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."Link" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    mode TEXT DEFAULT 'REQUIRE_ALL' NOT NULL,
    "minRequirementsRequired" INTEGER DEFAULT 0 NOT NULL,
    "unlockQuota" INTEGER DEFAULT 0 NOT NULL,
    "unlockCount" INTEGER DEFAULT 0 NOT NULL,
    "viewCount" INTEGER DEFAULT 0 NOT NULL,
    "isActive" BOOLEAN DEFAULT true NOT NULL,
    "isExpired" BOOLEAN DEFAULT false NOT NULL,
    "expiresAt" TIMESTAMPTZ,
    "passwordHash" TEXT,
    "recheckIntervalMinutes" INTEGER DEFAULT 60 NOT NULL,
    "cheatThresholdPercent" INTEGER DEFAULT 50 NOT NULL,
    "needsReview" BOOLEAN DEFAULT false NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."Requirement" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "linkId" UUID REFERENCES public."Link"(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL,
    "sortOrder" INTEGER DEFAULT 0 NOT NULL,
    title TEXT NOT NULL,
    config TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."RewardItem" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "linkId" UUID REFERENCES public."Link"(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    payload TEXT NOT NULL,
    "fileStoragePath" TEXT,
    "fileSizeBytes" INTEGER,
    "mimeType" TEXT,
    "sortOrder" INTEGER DEFAULT 0 NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."VoucherPool" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "linkId" UUID REFERENCES public."Link"(id) ON DELETE CASCADE NOT NULL,
    code TEXT NOT NULL,
    "isAssigned" BOOLEAN DEFAULT false NOT NULL,
    "assignedToUserId" UUID REFERENCES public."User"(id) ON DELETE SET NULL,
    "assignedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT "unique_link_voucher_code" UNIQUE ("linkId", code)
);

CREATE TABLE IF NOT EXISTS public."Unlock" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "linkId" UUID REFERENCES public."Link"(id) ON DELETE CASCADE NOT NULL,
    "userId" UUID REFERENCES public."User"(id) ON DELETE CASCADE NOT NULL,
    "unlockedAt" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "ipHash" TEXT NOT NULL,
    "userAgentHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ,
    CONSTRAINT "unique_user_link_unlock" UNIQUE ("linkId", "userId")
);

CREATE TABLE IF NOT EXISTS public."UnlockNonce" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nonce TEXT UNIQUE NOT NULL,
    "linkId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    used BOOLEAN DEFAULT false NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."VerificationLog" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "linkId" UUID REFERENCES public."Link"(id) ON DELETE CASCADE NOT NULL,
    "userId" UUID REFERENCES public."User"(id) ON DELETE CASCADE NOT NULL,
    "requirementType" TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "checkedAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."VerificationCache" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "cacheKey" TEXT UNIQUE NOT NULL,
    "linkId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "requirementType" TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "checkedAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."RateLimit" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    "requestCount" INTEGER DEFAULT 1 NOT NULL,
    "windowStart" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public."QuotaUsage" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date TEXT UNIQUE NOT NULL,
    "youtubeUnitsEstimated" INTEGER DEFAULT 0 NOT NULL,
    "discordRequests" INTEGER DEFAULT 0 NOT NULL,
    "updatedAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."StatsSnapshot" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "linkId" UUID REFERENCES public."Link"(id) ON DELETE CASCADE NOT NULL,
    "videoViews" INTEGER DEFAULT 0 NOT NULL,
    "videoLikes" INTEGER DEFAULT 0 NOT NULL,
    "videoComments" INTEGER DEFAULT 0 NOT NULL,
    "channelSubs" INTEGER DEFAULT 0 NOT NULL,
    "unlockCount" INTEGER DEFAULT 0 NOT NULL,
    "recordedAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."DiscordEvent" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."BlockList" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    reason TEXT NOT NULL,
    "blockedAt" TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT "unique_block_type_val" UNIQUE (type, value)
);

CREATE TABLE IF NOT EXISTS public."AuditLog" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "adminId" UUID REFERENCES public."AdminUser"(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    metadata TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public."AdminSetting" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_link_slug ON public."Link"(slug);
CREATE INDEX IF NOT EXISTS idx_user_google ON public."User"("googleId");
CREATE INDEX IF NOT EXISTS idx_nonce_val ON public."UnlockNonce"(nonce);
CREATE INDEX IF NOT EXISTS idx_cache_key ON public."VerificationCache"("cacheKey");
CREATE INDEX IF NOT EXISTS idx_ratelimit_key ON public."RateLimit"(key);
CREATE INDEX IF NOT EXISTS idx_ratelimit_exp ON public."RateLimit"("expiresAt");
CREATE INDEX IF NOT EXISTS idx_verif_logs_link ON public."VerificationLog"("linkId", "checkedAt");

-- 3. Row Level Security (RLS) Configuration
-- Non-negotiable principle: all verification and unlocks are server-only.
-- Direct client access from Supabase client (anon or authenticated role) is STRICTLY DENIED.
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdminUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Link" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Requirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RewardItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VoucherPool" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Unlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UnlockNonce" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VerificationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."VerificationCache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RateLimit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."QuotaUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."StatsSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DiscordEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BlockList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AdminSetting" ENABLE ROW LEVEL SECURITY;

-- Revoke all direct privileges from public web clients
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Allow full access to service_role (the Node/Express server backend)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 4. Supabase Storage Setup (Private Bucket)
-- Creates private bucket 'saiman-burtan-files' with public access set to false
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'saiman-burtan-files',
    'saiman-burtan-files',
    false,
    52428800, -- 50 MB max file size limit
    ARRAY['application/zip', 'application/x-zip-compressed', 'application/pdf', 'application/octet-stream', 'text/plain', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Ensure storage policies prevent unauthorized direct downloads
DROP POLICY IF EXISTS "Deny anon storage access" ON storage.objects;
CREATE POLICY "Deny anon storage access" ON storage.objects
    FOR ALL TO anon USING (false);

-- 5. Atomic Daily Cleanup Stored Procedure
CREATE OR REPLACE FUNCTION public.clean_expired_data()
RETURNS void AS $$
BEGIN
    -- Delete expired nonces
    DELETE FROM public."UnlockNonce" WHERE "expiresAt" < now();
    -- Delete expired short-lived verification cache
    DELETE FROM public."VerificationCache" WHERE "expiresAt" < now();
    -- Delete expired rate limit buckets
    DELETE FROM public."RateLimit" WHERE "expiresAt" < now();
END;
$$ LANGUAGE plpgsql;

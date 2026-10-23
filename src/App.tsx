import React, { useEffect, useState } from 'react';
import {
  Lock,
  Unlock,
  Youtube,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  LogIn,
  LogOut,
  UserCheck,
  Moon,
  Sun,
  LayoutDashboard,
  Layers,
  Sparkles,
} from 'lucide-react';

interface AuthUser {
  id: string;
  email: string;
  youtubeChannelId: string | null;
  youtubeChannelTitle: string | null;
  youtubeAvatar: string | null;
  discordUserId: string | null;
  discordUsername: string | null;
  needsReauth: boolean;
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [sandboxEmail, setSandboxEmail] = useState('creator.tester@example.com');
  const [sandboxChannel, setSandboxChannel] = useState('Creative Studio 2026');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    fetchUser();
    // Sync theme class to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      setUser(data.user || null);
    } catch (err) {
      console.error('Error fetching user status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSandboxLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/sandbox-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: sandboxEmail,
          channelTitle: sandboxChannel,
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        setShowLoginModal(false);
      }
    } catch (err) {
      console.error('Sandbox login error:', err);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-200 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Top Bar Contract: Zone 1 Wordmark, Zone 2 Links, Zone 3 Primary Action */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md ${theme === 'dark' ? 'border-slate-800 bg-slate-950/80' : 'border-slate-200 bg-white/80'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single Wordmark */}
          <a href="/" className="flex items-center gap-2.5 font-bold tracking-tight text-lg whitespace-nowrap shrink-0 group">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
              <Lock className="w-4 h-4" />
            </div>
            <span>Saiman-Burtan</span>
          </a>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-500 dark:text-slate-400">
            <a href="#how-it-works" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Architecture
            </a>
            <a href="#demo-links" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Demo Lockers
            </a>
            <a href="/admin" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5">
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Admin Panel</span>
            </a>
          </nav>

          {/* Zone 3: Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
              className={`p-2 rounded-lg border text-xs transition-colors ${theme === 'dark' ? 'border-slate-800 text-slate-300 hover:bg-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 text-xs">
                  {user.youtubeAvatar && (
                    <img src={user.youtubeAvatar} alt={user.youtubeChannelTitle || 'Avatar'} className="w-6 h-6 rounded-full" />
                  )}
                  <span className="font-medium max-w-[120px] truncate">{user.youtubeChannelTitle || user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    theme === 'dark' ? 'border-slate-800 hover:bg-slate-900 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all whitespace-nowrap flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In / Demo</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Phase 1 Initialized · Server-Side Verification Engine</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            Unlock to Subscribe, <br />
            <span className="text-indigo-500">Verified on the Server.</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
            Saiman-Burtan eliminates client-side bypasses. YouTube subscriptions, likes, comments, and Discord guild joins are strictly authenticated through official server-authoritative APIs with single-use atomic nonces.
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#demo-links"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-sm flex items-center gap-2"
            >
              <Unlock className="w-4 h-4" />
              <span>Explore Demo Locker</span>
            </a>
            <a
              href="/admin"
              className={`px-5 py-2.5 rounded-xl border text-sm font-medium transition-all flex items-center gap-2 ${
                theme === 'dark' ? 'border-slate-800 hover:bg-slate-900 text-slate-200' : 'border-slate-300 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Admin Dashboard</span>
            </a>
          </div>
        </div>

        {/* Phase 1 Verification Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6" id="how-it-works">
          <div className={`p-6 rounded-2xl border transition-all ${theme === 'dark' ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
              <Youtube className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">1. Mandatory Registration</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Users authenticate with Google OAuth to retrieve read-only YouTube subscriptions, ratings, and author channel IDs. Refresh tokens are secured with AES-256-GCM.
            </p>
          </div>

          <div className={`p-6 rounded-2xl border transition-all ${theme === 'dark' ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">2. Supabase PostgreSQL & RLS</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Row Level Security is enabled on every table. Client-side direct reads are blocked; all token state, nonces, and quotas are managed strictly on the server.
            </p>
          </div>

          <div className={`p-6 rounded-2xl border transition-all ${theme === 'dark' ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">3. Zero-Storage Vouchers & Safe URLs</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Delivery supports external redirect links, atomic single-use vouchers, text credentials, and private bucket signed URLs issued only after full verification.
            </p>
          </div>
        </div>

        {/* Demo Lockers Section */}
        <section className="mt-20" id="demo-links">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Active Content Lockers</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Pre-configured demo links ready for verification flow.</p>
            </div>
            <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
              1 Active Demo Link
            </span>
          </div>

          <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'border-slate-800 bg-slate-900/30' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base text-slate-900 dark:text-white">Exclusive Creator Preset Pack 2026</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">Public Demo</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Slug: <code className="font-mono text-indigo-400">/l/vip-creator-pack</code> · Mode: Require All (YouTube Subscribe, Like, Comment, Discord)
                </p>
              </div>

              <a
                href="/l/vip-creator-pack"
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <span>View Locker Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Transparent Sign-In Modal (Google OAuth & Testing Sandbox) */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-2xl p-6 border shadow-2xl relative ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Youtube className="w-4 h-4 text-red-500" />
                <span>Sign in with Google / YouTube</span>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs text-slate-400 leading-relaxed">
              <p className="font-medium text-slate-200">Permissions requested and why:</p>
              <ul className="space-y-2 list-disc pl-4">
                <li><span className="text-slate-200 font-semibold">View YouTube account activity:</span> Read-only access to verify channel subscriptions and video likes on your behalf.</li>
                <li><span className="text-slate-200 font-semibold">Identify channel:</span> Matches your public channel ID against comment threads to verify discussion participation.</li>
              </ul>
              <p className="text-slate-500 italic">Access tokens are never persisted to the client and refresh tokens are encrypted at rest with AES-256-GCM.</p>
            </div>

            {/* Sandbox Testing Mode Switcher */}
            <form onSubmit={handleSandboxLogin} className="mt-2 pt-4 border-t border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-slate-300">Quick Sandbox Sign-In (Local & Evaluation)</div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Email</label>
                <input
                  type="email"
                  value={sandboxEmail}
                  onChange={(e) => setSandboxEmail(e.target.value)}
                  className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500' : 'bg-slate-50 border-slate-200 focus:border-indigo-500'
                  }`}
                  required
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">YouTube Channel Title</label>
                <input
                  type="text"
                  value={sandboxChannel}
                  onChange={(e) => setSandboxChannel(e.target.value)}
                  className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${
                    theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500' : 'bg-slate-50 border-slate-200 focus:border-indigo-500'
                  }`}
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="flex-1 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {loginLoading ? 'Signing in...' : 'Sign In as Creator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

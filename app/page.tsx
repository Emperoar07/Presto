'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';

export default function Home() {
  const { isDark, toggleTheme } = useTheme();
  const repoUrl = 'https://github.com/Emperoar07/tempo-mini-dapp';
  const docsUrl = '/docs';
  const xUrl = 'https://x.com/emperoar007';

  return (
    <div className={`min-h-screen selection:bg-brand selection:text-white ${isDark ? 'bg-brand-dark text-white' : 'bg-white text-slate-900'}`}>
      <nav className={`sticky top-0 z-50 w-full border-b backdrop-blur-md ${isDark ? 'border-white/10 bg-brand-dark/80' : 'border-slate-200 bg-white/80'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-3xl text-primary">toll</span>
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">PrestoDEX</span>
            </div>
            <div className={`hidden md:flex items-center space-x-6 text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              <Link href="/swap" className="hover:text-brand transition-colors">Swap</Link>
              <Link href="/liquidity" className="hover:text-brand transition-colors">Liquidity</Link>
              <Link href="/analytics" className="hover:text-brand transition-colors">Analytics</Link>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-twelve border transition-colors ${isDark ? 'text-slate-300 hover:text-brand border-white/10 hover:bg-white/5' : 'text-slate-500 hover:text-brand border-slate-200 hover:bg-slate-50'}`}
                title="Toggle Theme"
              >
                {isDark ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              <Link
                href="/swap"
                className={`bg-brand hover:bg-opacity-90 text-white px-4 py-1.5 rounded-twelve font-bold transition-all transform hover:scale-105 text-base ${isDark ? 'neon-glow-dark' : 'neon-glow-light'}`}
              >
                Launch App
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main>
        <section className="relative pt-14 pb-20 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 pointer-events-none">
            <div className={`absolute top-[-10%] left-[-10%] w-[350px] h-[350px] rounded-full blur-[84px] ${isDark ? 'bg-brand/10' : 'bg-brand/5'}`} />
            <div className={`absolute bottom-[10%] right-[-5%] w-[280px] h-[280px] rounded-full blur-[70px] ${isDark ? 'bg-brand/5' : 'bg-brand/10'}`} />
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="text-center lg:text-left">
                <h1 className="text-3xl lg:text-5xl font-extrabold leading-tight mb-4">
                  The Future of <br />
                  <span className={`text-transparent bg-clip-text bg-gradient-to-r ${isDark ? 'from-brand to-cyan-200' : 'from-brand to-cyan-500'}`}>Decentralized</span> Trading
                </h1>
                <p className={`text-base mb-7 max-w-xl mx-auto lg:mx-0 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Trade tokens instantly, provide liquidity, and earn rewards on the most secure and lightning-fast decentralized exchange in the ecosystem.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-2">
                  <Link
                    href="/swap"
                    className={`w-full sm:w-auto px-5 py-2 bg-brand text-white font-bold rounded-twelve hover:bg-opacity-90 transition-all text-base ${isDark ? 'neon-glow-dark' : 'neon-glow-light'}`}
                  >
                    Launch App
                  </Link>
                  <Link
                    href={docsUrl}
                    className={`w-full sm:w-auto px-5 py-2 border font-bold rounded-twelve transition-all text-base text-center ${isDark ? 'border-white/20 hover:bg-white/5 text-white' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                  >
                    Read Docs
                  </Link>
                </div>
              </div>
              <div className="relative flex justify-center items-center">
                <div className="relative w-full aspect-square max-w-[350px] animate-float">
                  <div className={`absolute inset-0 rounded-full blur-[42px] ${isDark ? 'bg-brand/20' : 'bg-brand/10'}`} />
                  <div className={`relative w-full h-full rounded-[28px] flex items-center justify-center overflow-hidden backdrop-blur-[7px] ${isDark ? 'bg-white/[0.03] border border-white/10' : 'bg-white/40 border border-slate-200'}`}>
                    <svg className={`w-32 h-32 ${isDark ? 'text-brand opacity-80' : 'text-brand/80'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" />
                    </svg>
                    <div className={`absolute top-7 left-7 w-14 h-14 rounded-full animate-pulse ${isDark ? 'border border-brand/30' : 'border border-brand/20'}`} />
                    <div className="absolute bottom-7 right-7 w-20 h-20 border border-brand/10 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold mb-2">Why choose PrestoDEX?</h2>
              <p className={`max-w-2xl mx-auto text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Built for traders who demand the best in efficiency, depth, and security.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              <div className={`p-5 rounded-twelve transition-all group backdrop-blur-[7px] ${isDark ? 'bg-white/[0.03] border border-white/10 hover:border-brand/50' : 'bg-white border border-black/5 shadow-sm hover:shadow-md hover:border-brand'}`}>
                <div className={`w-10 h-10 bg-brand/10 rounded-twelve flex items-center justify-center mb-4 text-brand transition-all ${isDark ? 'group-hover:bg-brand group-hover:text-brand-dark' : 'group-hover:bg-brand group-hover:text-white'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Lightning Fast Swaps</h3>
                <p className={`leading-relaxed text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Execute trades with near-zero latency using our optimized aggregation engine and high-throughput network.</p>
              </div>
              <div className={`p-5 rounded-twelve transition-all group backdrop-blur-[7px] ${isDark ? 'bg-white/[0.03] border border-white/10 hover:border-brand/50' : 'bg-white border border-black/5 shadow-sm hover:shadow-md hover:border-brand'}`}>
                <div className={`w-10 h-10 bg-brand/10 rounded-twelve flex items-center justify-center mb-4 text-brand transition-all ${isDark ? 'group-hover:bg-brand group-hover:text-brand-dark' : 'group-hover:bg-brand group-hover:text-white'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Deep Liquidity</h3>
                <p className={`leading-relaxed text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Access massive liquidity pools with minimal slippage, even for large orders, thanks to our multi-source routing.</p>
              </div>
              <div className={`p-5 rounded-twelve transition-all group backdrop-blur-[7px] ${isDark ? 'bg-white/[0.03] border border-white/10 hover:border-brand/50' : 'bg-white border border-black/5 shadow-sm hover:shadow-md hover:border-brand'}`}>
                <div className={`w-10 h-10 bg-brand/10 rounded-twelve flex items-center justify-center mb-4 text-brand transition-all ${isDark ? 'group-hover:bg-brand group-hover:text-brand-dark' : 'group-hover:bg-brand group-hover:text-white'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold mb-2">Non-Custodial Security</h3>
                <p className={`leading-relaxed text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Your keys, your crypto. PrestoDEX never holds your assets, ensuring you have full control over your funds at all times.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className={`relative p-8 rounded-[22px] overflow-hidden text-center backdrop-blur-[7px] ${isDark ? 'bg-white/[0.03] border border-brand/20' : 'bg-brand/5 border border-brand/20 shadow-inner'}`}>
              <div className={`absolute -top-24 -left-24 w-64 h-64 rounded-full blur-[80px] ${isDark ? 'bg-brand/20' : 'bg-brand/10'}`} />
              <div className={`absolute -bottom-24 -right-24 w-64 h-64 rounded-full blur-[80px] ${isDark ? 'bg-brand/20' : 'bg-brand/10'}`} />
              <div className="relative z-10">
                <h2 className={`text-2xl md:text-3xl font-extrabold mb-4 ${isDark ? '' : 'text-slate-900'}`}>Ready to enter the future?</h2>
                <p className={`text-base mb-7 max-w-xl mx-auto ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Join thousands of traders and liquidity providers on the most advanced decentralized exchange platform.</p>
                <Link
                  href="/swap"
                  className={`inline-block px-7 py-3 bg-brand text-white font-bold rounded-twelve hover:bg-opacity-90 transition-all text-lg ${isDark ? 'neon-glow-dark' : 'neon-glow-light'}`}
                >
                  Start Trading Today
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={`pt-10 pb-5 border-t ${isDark ? 'bg-black/40 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-16">
            <div className="col-span-2 lg:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-5 h-5 bg-brand rounded-lg flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                  </svg>
                </div>
                <span className={`text-base font-bold ${isDark ? '' : 'text-slate-900'}`}>PrestoDEX</span>
              </div>
              <p className={`max-w-sm mb-4 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Building the core financial infrastructure for a decentralized web. Secure, efficient, and community-driven.
              </p>
              <div className="flex gap-2">
                <a
                  href={xUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${isDark ? 'bg-white/5 hover:bg-brand hover:text-brand-dark' : 'bg-slate-200 text-slate-600 hover:bg-brand hover:text-white'}`}
                >
                  <span className="sr-only">Twitter</span>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" />
                  </svg>
                </a>
              </div>
            </div>
            <div>
              <h4 className={`font-bold mb-4 text-sm ${isDark ? '' : 'text-slate-900'}`}>Products</h4>
              <ul className={`space-y-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <li><Link href="/swap" className="hover:text-brand transition-colors">Exchange</Link></li>
                <li><Link href="/liquidity" className="hover:text-brand transition-colors">Liquidity</Link></li>
                <li><Link href="/analytics" className="hover:text-brand transition-colors">Analytics</Link></li>
              </ul>
            </div>
            <div>
              <h4 className={`font-bold mb-4 text-sm ${isDark ? '' : 'text-slate-900'}`}>Resources</h4>
              <ul className={`space-y-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <li><Link href={docsUrl} className="hover:text-brand transition-colors">Documentation</Link></li>
                <li><a href={repoUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand transition-colors">GitHub</a></li>
              </ul>
            </div>
            <div>
              <h4 className={`font-bold mb-4 text-sm ${isDark ? '' : 'text-slate-900'}`}>Legal</h4>
              <ul className={`space-y-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <li><a href={repoUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand transition-colors">Privacy Policy</a></li>
                <li><a href={repoUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand transition-colors">Terms of Use</a></li>
                <li><a href={repoUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand transition-colors">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className={`pt-5 border-t flex flex-col md:flex-row justify-between items-center gap-2 text-xs ${isDark ? 'border-white/10 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
            <p>&copy; 2026 PrestoDEX. All rights reserved.</p>
            <p>
              <a href={xUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand">
                Built with love by 0xb for the decentralized world.
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

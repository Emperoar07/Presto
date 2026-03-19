import Link from 'next/link';

const quickLinks = [
  { href: '#getting-started', label: 'Getting Started' },
  { href: '#networks', label: 'Networks' },
  { href: '#swap', label: 'Swap Flow' },
  { href: '#liquidity', label: 'Liquidity' },
  { href: '#analytics', label: 'Analytics & Activity' },
  { href: '#developers', label: 'Developers' },
];

const liveArcAssets = [
  {
    symbol: 'USDC',
    address: '0x3600000000000000000000000000000000000000',
    note: 'Arc hub asset and gas-denominated stablecoin.',
  },
  {
    symbol: 'EURC',
    address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    note: 'Live against the deployed normalized Arc hub AMM.',
  },
  {
    symbol: 'WUSDC',
    address: '0x911b4000D3422F482F4062a913885f7b035382Df',
    note: 'Live on the normalized Arc deployment as a mixed-decimal wrapped stable asset.',
  },
  {
    symbol: 'USDT',
    address: '0x175CdB1D338945f0D851A741ccF787D343E57952',
    note: 'Live on Arc through the normalized USDC hub, with sourced liquidity now seeded in Presto.',
  },
];

const publicArcAssets = [
  {
    symbol: 'SYN',
    address: '0xC5124C846c6e6307986988dFb7e743327aA05F19',
    note: 'Visible in public Arc tokenlists, but would need both product decisions and sourced liquidity first.',
  },
];

const developerLinks = [
  {
    href: 'https://github.com/Emperoar07/tempo-mini-dapp',
    label: 'Presto App Repository',
    description: 'Frontend, contracts, scripts, and local deployment flow.',
  },
  {
    href: 'https://github.com/Synthra-swap/tokenlists/blob/main/generated/synthra.tokenlist.json',
    label: 'Reference Arc Tokenlist',
    description: 'Useful for researching Arc-compatible assets before enabling them in Presto.',
  },
  {
    href: 'https://docs.arc.network/arc/concepts/welcome-to-arc',
    label: 'Arc Network Docs',
    description: 'Arc network concepts, gas model, and contract references.',
  },
  {
    href: 'https://docs.tempo.xyz/',
    label: 'Tempo Docs',
    description: 'Tempo-native fee routing and stablecoin execution references.',
  },
];

function Section({
  id,
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:p-8">
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
      </div>
      <div className="space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <main className="px-4 py-8 md:px-6 md:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Presto Docs</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Getting started with PrestoDEX</h1>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                PrestoDEX is a testnet-first exchange surface for Tempo and Arc. The docs stay focused on how the app
                works today, what is live on each network, and what still needs deployment or liquidity before it can
                be enabled.
              </p>

              <div className="mt-6 space-y-2">
                {quickLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded-2xl border border-slate-200/80 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-primary/30 hover:text-primary dark:border-white/10 dark:text-slate-200"
                  >
                    <span>{link.label}</span>
                    <span className="material-symbols-outlined text-base">arrow_outward</span>
                  </a>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-slate-700 dark:text-slate-200">
                <p className="font-semibold text-slate-900 dark:text-white">Live now on Arc</p>
                <p className="mt-2 text-slate-600 dark:text-slate-300">
                  The deployed Arc normalized hub AMM is live for stable routing around USDC, with seeded EURC, WUSDC,
                  and USDT pools already available.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/swap"
                    className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
                  >
                    Open Swap
                  </Link>
                  <Link
                    href="/liquidity"
                    className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-primary/30 hover:text-primary dark:border-white/15 dark:text-slate-200"
                  >
                    Manage Liquidity
                  </Link>
                </div>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <Section id="getting-started" eyebrow="Getting Started" title="How to use PrestoDEX">
              <p>
                Connect a wallet, pick a supported network, and start from the surface that matches your goal. Use
                <Link href="/swap" className="mx-1 font-medium text-primary hover:underline">Swap</Link>
                for execution, <Link href="/liquidity" className="mx-1 font-medium text-primary hover:underline">Pools</Link>
                for liquidity management, <Link href="/analytics" className="mx-1 font-medium text-primary hover:underline">Analytics</Link>
                for market summaries, and <Link href="/transactions" className="mx-1 font-medium text-primary hover:underline">Activity</Link>
                to inspect recent actions.
              </p>
              <p>
                Presto is still testnet-first. Some surfaces are network-specific by design, so Arc and Tempo do not
                expose the same controls or assumptions.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  'Connect your wallet and switch to Arc Testnet or Tempo Testnet.',
                  'Use the faucet flow from the header when you need testnet assets.',
                  'Start with small swaps and verify balances before adding liquidity.',
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Section>

            <Section id="networks" eyebrow="Networks" title="Tempo and Arc behave differently">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-950/40">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Tempo Testnet</p>
                  <p className="mt-3">
                    Tempo-native execution is centered on fee routing and pathUSD-style stablecoin behavior. Tempo
                    pages can expose fee-side or orderbook-oriented controls that do not belong on Arc.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-950/40">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Arc Testnet</p>
                  <p className="mt-3">
                    Arc uses USDC-shaped gas and a simpler stable hub flow. Presto now uses a normalized Arc AMM so
                    mixed-decimal assets such as WUSDC can share the same hub safely.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 dark:border-white/10 dark:bg-slate-950/40">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Arc asset status</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Live now vs. compatible later</h3>
                  </div>
                  <a
                    href="https://github.com/Synthra-swap/tokenlists/blob/main/generated/synthra.tokenlist.json"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Reference tokenlist <span className="material-symbols-outlined text-base">open_in_new</span>
                  </a>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <div>
                    <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Enabled in Presto</p>
                    <div className="space-y-3">
                      {liveArcAssets.map((asset) => (
                        <div key={asset.address} className="rounded-2xl border border-slate-200/80 p-4 dark:border-white/10">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-base font-semibold text-slate-900 dark:text-white">{asset.symbol}</span>
                            <code className="text-[11px] text-slate-500 dark:text-slate-400">{asset.address}</code>
                          </div>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{asset.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Publicly listed but not live yet</p>
                    <div className="space-y-3">
                      {publicArcAssets.map((asset) => (
                        <div key={asset.address} className="rounded-2xl border border-dashed border-slate-200/80 p-4 dark:border-white/10">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-base font-semibold text-slate-900 dark:text-white">{asset.symbol}</span>
                            <code className="text-[11px] text-slate-500 dark:text-slate-400">{asset.address}</code>
                          </div>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{asset.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/60 p-4 dark:border-white/10 dark:bg-slate-950/30">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">What changed on Arc</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Presto now runs a normalized Arc hub AMM deployment at
                    <code className="mx-1 text-[11px] text-slate-500 dark:text-slate-400">0x5794a8284A29493871Fbfa3c4f343D42001424D6</code>
                    so mixed-decimal assets can share the same USDC hub. EURC, WUSDC, and USDT are all seeded there
                    now, which means Arc stable routing is live across all three non-hub assets currently exposed in
                    Presto.
                  </p>
                </div>
              </div>
            </Section>

            <Section id="swap" eyebrow="Swap Flow" title="How swap is configured in Presto">
              <p>
                Arc swap is intentionally simple: choose the stable asset you want to sell from the USDC hub path,
                choose the asset you want to receive, review the quote, and confirm. Tempo keeps its own fee-oriented
                routing behaviors where they matter.
              </p>
              <p>
                The chart-style icon beside settings is only a light analytics entry point. Presto does not fake a
                heavyweight embedded trading chart when there is not enough live market data to justify it.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  'Arc uses modal token picking and a simpler stablecoin-first card.',
                  'Tempo can keep fee-route context where protocol behavior requires it.',
                  'Both flows share the same wallet, balances, settings, and confirmations.',
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Section>

            <Section id="liquidity" eyebrow="Liquidity" title="Liquidity management">
              <p>
                On Arc, Presto uses a stable hub AMM workflow centered on USDC and seeded pairs. On Tempo, the
                liquidity surface can include fee-side maintenance that is not shown on Arc.
              </p>
              <p>
                Additional Arc assets should only be enabled after two things are true: the token address is verified
                and the pool is seeded with enough liquidity to avoid a broken or empty experience.
              </p>
            </Section>

            <Section id="analytics" eyebrow="Analytics & Activity" title="What the data pages show">
              <p>
                Analytics stays lightweight on Arc and more protocol-native on Tempo. Activity on Arc now reads hub AMM
                swap and liquidity events directly from the deployed contract instead of relying on brittle block
                scraping.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40">
                  <p className="font-semibold text-slate-900 dark:text-white">Use Analytics for</p>
                  <p className="mt-2">Market summaries, lightweight pool insight, and chain-aware context.</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40">
                  <p className="font-semibold text-slate-900 dark:text-white">Use Activity for</p>
                  <p className="mt-2">Recent swaps, liquidity adds, and liquidity removals tied to the connected wallet.</p>
                </div>
              </div>
            </Section>

            <Section id="developers" eyebrow="Developers" title="Repos and references">
              <p>
                Presto does not need a tokenomics section right now, so the docs stay practical: network behavior,
                current assets, and implementation references.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {developerLinks.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 transition-colors hover:border-primary/30 dark:border-white/10 dark:bg-slate-950/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-900 dark:text-white">{item.label}</span>
                      <span className="material-symbols-outlined text-base text-slate-400">open_in_new</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.description}</p>
                  </a>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}

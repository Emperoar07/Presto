'use client';

import Link from 'next/link';

const liveArcAssets = [
  {
    symbol: 'USDC',
    address: '0x3600000000000000000000000000000000000000',
    note: 'Arc hub asset and gas denominated stablecoin.',
  },
  {
    symbol: 'EURC',
    address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    note: 'Live against the deployed normalized Arc hub AMM.',
  },
  {
    symbol: 'USDT',
    address: '0x175CdB1D338945f0D851A741ccF787D343E57952',
    note: 'Live on Arc through the normalized USDC hub with seeded liquidity.',
  },
  {
    symbol: 'WUSDC',
    address: '0x911b4000D3422F482F4062a913885f7b035382Df',
    note: 'Wrapped USDC on the normalized Arc deployment as a mixed decimal stable asset.',
  },
  {
    symbol: 'USYC',
    address: '0x825Ae482558415310C71B7E03d2BbBe409345903',
    note: 'US Yield Coin. Deployed as a test token with seeded USYC/USDC liquidity on Arc.',
  },
];

const publicArcAssets = [
  {
    symbol: 'SYN',
    address: '0xC5124C846c6e6307986988dFb7e743327aA05F19',
    note: 'Visible in public Arc tokenlists, but still needs product review and sourced liquidity.',
  },
];

const developerLinks = [
  {
    href: 'https://github.com/Emperoar07/Presto',
    label: 'Presto App Repository',
    description: 'Frontend, contracts, scripts, and local deployment flow.',
  },
  {
    href: 'https://github.com/Synthra-swap/tokenlists/blob/main/generated/synthra.tokenlist.json',
    label: 'Reference Arc Tokenlist',
    description: 'Useful when researching Arc compatible assets before enabling them in Presto.',
  },
  {
    href: 'https://docs.arc.network/arc/concepts/welcome-to-arc',
    label: 'Arc Network Docs',
    description: 'Arc network concepts, gas model, and contract references.',
  },
];

const toc = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'networks', label: 'Arc Testnet' },
  { id: 'swap', label: 'Swap Flow' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'analytics', label: 'Analytics and Activity' },
  { id: 'developers', label: 'Developers' },
  { id: 'privacy-policy', label: 'Privacy Policy' },
  { id: 'terms-of-use', label: 'Terms of Use' },
  { id: 'cookie-policy', label: 'Cookie Policy' },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-white/[0.07] pb-10 pt-10 first:pt-0 last:border-b-0 last:pb-0">
      <h2 className="text-[22px] font-extrabold tracking-tight text-slate-100">{title}</h2>
      <div className="mt-5 space-y-5 text-[14px] leading-7 text-slate-300">{children}</div>
    </section>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-[14px] border border-white/[0.07] bg-[#1b2434]">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="border-b border-white/[0.07] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-white/[0.05] last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 align-top text-[13px] text-slate-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="w-full px-4 py-5 md:px-7 md:py-7">
      <div className="mx-auto grid max-w-[1140px] gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-[88px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">On this page</p>
            <nav className="mt-4 space-y-1">
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block rounded-[10px] px-3 py-2 text-[13px] text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-100"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="border-b border-white/[0.07] pb-8">
            <div className="flex items-center justify-between gap-4">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-100"
              >
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                Back home
              </Link>
              <Link
                href="/swap"
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-bold text-[#0f172a]"
              >
                Launch App
              </Link>
            </div>

            <div className="mt-8 max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Presto Docs</p>
              <h1 className="mt-3 text-[34px] font-extrabold tracking-tight text-slate-100">Getting started</h1>
              <p className="mt-4 text-[15px] leading-7 text-slate-300">
                Presto is a testnet focused DEX surface for Arc. These docs cover the current product, supported assets,
                live network behavior, developer references, and the legal policies linked across the landing page and app shell.
              </p>
            </div>
          </div>

          <article className="max-w-4xl">
            <Section id="getting-started" title="Getting Started">
              <p>
                Connect a wallet, switch to Arc Testnet, and start from the part of the app that matches your goal. Use{' '}
                <Link href="/swap" className="font-medium text-primary hover:underline">
                  Swap
                </Link>{' '}
                for execution,{' '}
                <Link href="/liquidity" className="font-medium text-primary hover:underline">
                  Pools
                </Link>{' '}
                for liquidity management,{' '}
                <Link href="/analytics" className="font-medium text-primary hover:underline">
                  Analytics
                </Link>{' '}
                for market summaries, and{' '}
                <Link href="/transactions" className="font-medium text-primary hover:underline">
                  Activity
                </Link>{' '}
                for recent wallet actions across swaps, liquidity, and bridge flows.
              </p>

              <ol className="list-decimal space-y-2 pl-5">
                <li>Connect your wallet and switch to Arc Testnet.</li>
                <li>Use the faucet in the top bar to get testnet assets.</li>
                <li>Start with small swaps and verify balances before adding liquidity.</li>
              </ol>
            </Section>

            <Section id="networks" title="Arc Testnet">
              <p>
                Arc uses a USDC centered stable hub flow. Presto runs a normalized Arc AMM so mixed decimal assets such as WUSDC can
                share the same hub safely without forcing raw unit parity.
              </p>

              <DataTable
                headers={['Enabled in Presto', 'Address', 'Status']}
                rows={liveArcAssets.map((asset) => [
                  <span key={`${asset.symbol}-symbol`} className="font-semibold text-slate-100">
                    {asset.symbol}
                  </span>,
                  <code key={`${asset.symbol}-address`} className="text-[11px] text-slate-400">
                    {asset.address}
                  </code>,
                  asset.note,
                ])}
              />

              <div className="mt-6">
                <DataTable
                  headers={['Publicly listed but not live yet', 'Address', 'Status']}
                  rows={publicArcAssets.map((asset) => [
                    <span key={`${asset.symbol}-symbol`} className="font-semibold text-slate-100">
                      {asset.symbol}
                    </span>,
                    <code key={`${asset.symbol}-address`} className="text-[11px] text-slate-400">
                      {asset.address}
                    </code>,
                    asset.note,
                  ])}
                />
              </div>

              <div className="rounded-[14px] border border-white/[0.07] bg-[#1b2434] px-4 py-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">Current Arc deployment</p>
                <p className="mt-3 text-[14px] leading-7 text-slate-300">
                  Presto currently uses the normalized Arc hub AMM at{' '}
                  <code className="text-[12px] text-slate-200">0x5794a8284A29493871Fbfa3c4f343D42001424D6</code> so EURC, WUSDC,
                  and USDT can share the same USDC hub cleanly.
                </p>
              </div>
            </Section>

            <Section id="swap" title="Swap Flow">
              <p>
                Arc swap is intentionally simple. Choose the asset to sell from the USDC hub path, choose the asset to receive,
                review the quote, and confirm. Presto does not fake a heavyweight terminal layout where the onchain testnet data
                does not justify it.
              </p>

              <ul className="list-disc space-y-2 pl-5">
                <li>Arc uses modal token picking and a stablecoin first swap card.</li>
                <li>Both token inputs share the same wallet, balances, and execution settings.</li>
                <li>Swap quotes are read from the live onchain AMM rather than from a mock price source.</li>
              </ul>
            </Section>

            <Section id="liquidity" title="Liquidity">
              <p>
                On Arc, Presto uses a stable hub AMM workflow centered on USDC and seeded pairs. Assets should only be enabled after
                the token address is verified and the pool is seeded with enough liquidity to avoid a broken or empty experience.
              </p>

              <p>
                In practice, that means token listing, approvals, seed liquidity, and UI exposure all need to happen together. A token
                appearing in a public tokenlist is not enough by itself.
              </p>
            </Section>

            <Section id="analytics" title="Analytics and Activity">
              <p>
                The Analytics page tracks all-time protocol volume, including swap volume, liquidity additions, and bridge
                inflows. Stats are read directly from on-chain Swap and LiquidityAdded events emitted by the Hub AMM contract,
                scanning from block 0 with parallel chunk fetching for fast cold starts.
              </p>

              <ul className="list-disc space-y-2 pl-5">
                <li><strong>All-time Volume</strong> combines the USDC side of every swap and every liquidity deposit since launch.</li>
                <li><strong>All-time Trades</strong> counts every Swap event across all pools.</li>
                <li><strong>Unique Traders</strong> tracks distinct wallet addresses from both swaps and liquidity adds.</li>
              </ul>

              <p>
                Activity reads the same hub AMM events tied to the connected wallet, showing recent swaps, liquidity adds
                and removals, and bridge actions in a single timeline.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[14px] border border-white/[0.07] bg-[#1b2434] px-4 py-4">
                  <p className="text-[13px] font-semibold text-slate-100">Use Analytics for</p>
                  <p className="mt-2 text-[13px] leading-6 text-slate-300">
                    Market summaries, lightweight pool context, and network aware stats.
                  </p>
                </div>
                <div className="rounded-[14px] border border-white/[0.07] bg-[#1b2434] px-4 py-4">
                  <p className="text-[13px] font-semibold text-slate-100">Use Activity for</p>
                  <p className="mt-2 text-[13px] leading-6 text-slate-300">
                    Recent swaps, liquidity adds, removals, and bridge actions tied to the connected wallet.
                  </p>
                </div>
              </div>
            </Section>

            <Section id="developers" title="Developers">
              <p>
                Presto docs stay practical. They focus on live network behavior, current assets, and implementation references
                instead of generic marketing language.
              </p>

              <div className="space-y-3">
                {developerLinks.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-[14px] border border-white/[0.07] bg-[#1b2434] px-4 py-4 transition-colors hover:border-primary/25"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-semibold text-slate-100">{item.label}</span>
                      <span className="material-symbols-outlined text-[15px] text-slate-500">open_in_new</span>
                    </div>
                    <p className="mt-2 text-[13px] leading-6 text-slate-300">{item.description}</p>
                  </a>
                ))}
              </div>
            </Section>

            <Section id="privacy-policy" title="Privacy Policy">
              <p>
                Presto is built to minimize data collection. The app reads wallet addresses, balances, swaps, liquidity actions,
                and bridge history only to render the product and respond to user actions.
              </p>

              <p>
                Presto does not ask for personal identity data inside the app. Wallet addresses, chain activity, and public contract
                events may still be visible on public block explorers because they are part of the underlying networks.
              </p>

              <p>
                If you connect a wallet, the app may store lightweight local preferences such as theme, slippage settings, or bridge
                history in your browser so the experience remains consistent between sessions.
              </p>

              <p>
                External services such as wallet providers, block explorers, RPC providers, and bridge infrastructure may apply their
                own privacy practices. You should review their policies before relying on those services.
              </p>
            </Section>

            <Section id="terms-of-use" title="Terms of Use">
              <p>
                Presto is provided for testnet use. Nothing on this site is financial, legal, or tax advice, and nothing here should
                be treated as a promise of production readiness.
              </p>

              <p>
                You are responsible for reviewing every transaction before signing it. Blockchain actions are generally irreversible,
                and incorrect addresses, unsupported wallets, or low liquidity conditions can result in failed or poor outcomes.
              </p>

              <p>
                The app may expose experimental features, including bridge flows and new liquidity paths. These features can fail,
                change, or be removed without notice while the product is still evolving.
              </p>

              <p>
                By using the app, you accept that testnet assets have no guaranteed value and that the app is offered as is without
                warranties of uninterrupted availability or fitness for a specific purpose.
              </p>
            </Section>

            <Section id="cookie-policy" title="Cookie Policy">
              <p>
                Presto does not rely on a heavy cookie system. Most state that persists in the product is stored in browser storage
                rather than traditional marketing cookies.
              </p>

              <p>
                The app may use local storage or similar browser features to remember interface settings, wallet preferences,
                and bridge or transaction context that helps restore the current session.
              </p>

              <p>
                If an external provider or embedded service sets its own cookies, those cookies belong to that provider and are
                governed by that provider&apos;s own policy.
              </p>
            </Section>

            <div className="border-t border-white/[0.07] py-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Legal</p>
              <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
                <a href="#privacy-policy" className="text-slate-300 transition-colors hover:text-primary">
                  Privacy Policy
                </a>
                <a href="#terms-of-use" className="text-slate-300 transition-colors hover:text-primary">
                  Terms of Use
                </a>
                <a href="#cookie-policy" className="text-slate-300 transition-colors hover:text-primary">
                  Cookie Policy
                </a>
              </div>
            </div>
          </article>
        </main>
      </div>
    </div>
  );
}

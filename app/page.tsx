export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[80vh] gap-8 px-6">
      <div className="grid w-full max-w-5xl text-center lg:grid-cols-3 lg:text-left gap-6">
        <a
          href="/swap"
          className="group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md px-5 py-6 transition-all hover:border-[#00F3FF]/50 hover:bg-black/60 hover:shadow-[0_0_20px_rgba(0,243,255,0.1)]"
        >
          <h2 className="mb-3 text-2xl font-bold text-white">
            Swap{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none text-[#00F3FF]">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm text-zinc-400">
            Swap stablecoins instantly on Tempo.
          </p>
        </a>

        <a
          href="/liquidity"
          className="group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md px-5 py-6 transition-all hover:border-[#BC13FE]/50 hover:bg-black/60 hover:shadow-[0_0_20px_rgba(188,19,254,0.1)]"
        >
          <h2 className="mb-3 text-2xl font-bold text-white">
            Liquidity{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none text-[#BC13FE]">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm text-zinc-400">
            Provide liquidity and earn fees.
          </p>
        </a>

        <a
          href="/analytics"
          className="group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md px-5 py-6 transition-all hover:border-white/30 hover:bg-black/60 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        >
          <h2 className="mb-3 text-2xl font-bold text-white">
            Analytics{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none text-white">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm text-zinc-400">
            View market data and orderbooks.
          </p>
        </a>
      </div>
    </main>
  );
}

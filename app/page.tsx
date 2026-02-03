import Dashboard from "@/components/Dashboard";

export default function Page() {
  return (
    <main className="page">
      <header className="masthead">
        <div className="masthead__rule" />
        <div className="masthead__kicker">Perpetual Exchange Comparative Valuation</div>
        <h1 className="masthead__title">What Drift Could Be</h1>
        <p className="masthead__deck">
          A WSJ-style snapshot comparing Drift Protocol to peer perpetual exchanges using DefiLlama
          fees/volume and CoinGecko market data.
        </p>
        <div className="masthead__rule masthead__rule--light" />
      </header>

      <Dashboard />

      <footer className="footer">
        <div>Sources: DefiLlama (fees + derivatives volume), CoinGecko (market caps).</div>
        <div>Ratios computed as market cap divided by trailing fees or volume for the selected window.</div>
      </footer>
    </main>
  );
}

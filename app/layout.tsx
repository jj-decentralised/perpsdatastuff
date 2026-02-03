import "./globals.css";

export const metadata = {
  title: "Perps Pulse: Exchange Correlations",
  description: "Real-time perpetual exchange dashboard tracking volume, fees, open interest, and market cap correlations."
};

export const viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "Drift Protocol: Perps Peer Scenarios",
  description: "Compare Drift Protocol implied market caps using peer P/F and P/V ratios."
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

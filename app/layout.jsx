import "./globals.css";

const faviconSvg =
  "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><circle cx=%2232%22 cy=%2232%22 r=%2232%22 fill=%22%230a1628%22/><path d=%22M18 43V30h7v13m7 0V18h7v25m7 0V25h7v18%22 stroke=%22%2300d4aa%22 stroke-width=%225%22/></svg>";

export const metadata = {
  title: "İstanbul City Intelligence",
  description:
    "Privacy-safe city intelligence dashboard for municipal operations.",
  icons: {
    icon: faviconSvg,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

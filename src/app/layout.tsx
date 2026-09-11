import "./globals.css";

export const metadata = {
  title: "Apex",
  description: "Grant Management OS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}

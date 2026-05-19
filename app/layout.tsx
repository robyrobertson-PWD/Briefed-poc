import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Briefed — Know your real borrowing power",
  description: "Pre-launch POC. Demo only.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

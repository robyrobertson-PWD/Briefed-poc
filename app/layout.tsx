import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
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
    <ClerkProvider>
      <html lang="en">
        <body>
          <div
            role="status"
            style={{
              background: "#7f1d1d",
              color: "#fff",
              textAlign: "center",
              padding: "6px 12px",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            DEMO — NOT FOR PRODUCTION USE · Sandbox vendors, synthetic data only
          </div>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FraudNet-AI — Real-Time Fraud Detection",
  description: "AI-powered transaction graph analysis with IBM watsonx.ai",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

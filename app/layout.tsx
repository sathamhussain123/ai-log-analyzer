import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Jenkins Log Analyzer | Intelligent Build Failure Diagnostics",
  description:
    "Paste your Jenkins build log URL or raw console output and get AI-powered root cause analysis, fix suggestions, severity ratings, and confidence scores instantly.",
  keywords: ["Jenkins", "Log Analyzer", "AI", "OpenAI", "DevOps", "CI/CD", "Build Failures"],
  authors: [{ name: "AI Jenkins Log Analyzer" }],
  openGraph: {
    title: "AI Jenkins Log Analyzer",
    description: "AI-powered Jenkins build failure diagnostics",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}

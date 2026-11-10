import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SOET Connect - Alumni Portal",
  description: "Connecting SOET students and alumni through opportunities, events, and career updates.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Nonce-based CSP requires request-time rendering. Restrict this to protected
  // Vercel previews so production pages retain their existing static behavior.
  if (process.env.VERCEL_ENV === "preview") {
    await headers();
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

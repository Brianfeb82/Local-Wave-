import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegistration from "./service-worker-registration";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "LocalWave",
  description: "Offline music library for local audio files, playlists, and metadata.",
  applicationName: "LocalWave",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LocalWave"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: `${basePath}/icons/icon.svg`, type: "image/svg+xml" },
      { url: `${basePath}/favicon.ico.png` }
    ],
    apple: [{ url: `${basePath}/icons/icon.svg`, type: "image/svg+xml" }]
  }
};

export const viewport = {
  themeColor: "#23211d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

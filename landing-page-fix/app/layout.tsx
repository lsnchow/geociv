import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Instrument_Serif } from "next/font/google"
import "./globals.css"

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-instrument-serif",
})

export const metadata: Metadata = {
  title: "GeoCiv",
  description: "geociv",
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <style>{`
html {
  font-family: ${GeistSans.style.fontFamily};
  --font-sans: ${GeistSans.variable};
  --font-mono: ${GeistMono.variable};
  --font-instrument-serif: ${instrumentSerif.variable};
}
        `}</style>
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}>{children}</body>
    </html>
  )
}

import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Domainkeep", template: "%s · Domainkeep" },
  description: "Prove you control a domain by adding one DNS record.",
};

// The page background, so a phone's browser chrome matches the page instead of
// framing it in white. Written as sRGB rather than the `--background` token:
// the token is oklch, which not every browser parses here.
export const viewport: Viewport = { themeColor: "#090b0f" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider
      // Clerk draws its cards from the same tokens as the rest of the app. This
      // is Clerk's own shadcn theme, inlined: the package that ships it pulls
      // in a few hundred Web3 dependencies for these dozen lines.
      appearance={{
        variables: {
          colorBackground: "var(--card)",
          colorForeground: "var(--card-foreground)",
          colorPrimary: "var(--primary)",
          colorPrimaryForeground: "var(--primary-foreground)",
          colorNeutral: "var(--foreground)",
          colorMuted: "var(--muted)",
          colorMutedForeground: "var(--muted-foreground)",
          colorInput: "var(--input)",
          colorInputForeground: "var(--card-foreground)",
          colorDanger: "var(--destructive)",
          colorRing: "color-mix(in srgb, var(--ring), transparent 50%)",
          colorModalBackdrop: "color-mix(in srgb, black, transparent 50%)",
        },
      }}
    >
      <html
        lang="en"
        className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="bg-background text-foreground flex min-h-full flex-col">
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { MobileHeader } from "@/components/sidebar/MobileHeader";
import { LoadingCard } from "@/components/cards/LoadingCard";
import { VersionMismatchBanner } from "@/components/page/VersionMismatchBanner";
import { PreferencesProvider } from "@/contexts/preferences-context";
import Providers from "@/app/providers";

export const metadata: Metadata = {
  title: "CellarBoss",
  description: "Your open source wine cellar inventory manager.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const isLoggedIn = !!cookieStore.get("better-auth.session_token")?.value;
  // Party guest pages and the host's present screen are full-screen, without
  // the sidebar, even for a logged-in host (see proxy.ts for x-pathname).
  const pathname = (await headers()).get("x-pathname") ?? "";
  const bare =
    pathname.startsWith("/party/") ||
    pathname.startsWith("/share/") ||
    /^\/parties\/\d+\/present/.test(pathname);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <Providers sidebarDefaultOpen={sidebarOpen}>
          {bare ? (
            <main className="min-h-screen w-full bg-muted">
              <Suspense fallback={<LoadingCard />}>{children}</Suspense>
            </main>
          ) : isLoggedIn ? (
            <div className="flex min-h-screen w-full">
              <AppSidebar />
              <main className="flex-1 p-4 md:p-10 bg-muted">
                <MobileHeader />
                <VersionMismatchBanner />
                <div className="w-full bg-card shadow-sm rounded-lg p-4 md:p-10">
                  <Suspense fallback={<LoadingCard />}>
                    <PreferencesProvider>{children}</PreferencesProvider>
                  </Suspense>
                </div>
              </main>
            </div>
          ) : (
            <div className="flex min-h-screen w-full items-center justify-center bg-muted">
              <Suspense fallback={<LoadingCard />}>{children}</Suspense>
            </div>
          )}
        </Providers>
      </body>
    </html>
  );
}

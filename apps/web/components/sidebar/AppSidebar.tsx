"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useApiQuery } from "@/hooks/use-api-query";
import { getBottles } from "@/lib/api/bottles";
import { PENDING_STATUSES } from "@/lib/constants/pending";
import {
  BottleWine,
  ClipboardList,
  Truck,
  PartyPopper,
  Settings,
  Grape,
  User,
  Refrigerator,
  MapPin,
  Earth,
  Flag,
  Barrel,
  UserCircle,
  LogOut,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronsUpDown,
  ChevronRight,
  GlassWater,
  Library,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

// The everyday pages, always visible.
const wineItems = [
  { title: "Bottles", url: "/bottles", icon: BottleWine },
  { title: "Pending", url: "/pending", icon: Truck },
  { title: "Consumed", url: "/consumed", icon: GlassWater },
  { title: "Tasting Notes", url: "/tasting-notes", icon: ClipboardList },
];

// The catalogue behind them, folded under "Catalog".
const catalogItems = [
  { title: "Wines", url: "/wines", icon: Barrel },
  { title: "Grapes", url: "/grapes", icon: Grape },
  { title: "Winemakers", url: "/winemakers", icon: User },
];

const CATALOG_OPEN_KEY = "cellarboss.sidebar.catalogOpen";

/** A remembered on/off flag in localStorage; off on the server. */
function useStoredFlag(key: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => {
      try {
        return localStorage.getItem(key) === "true";
      } catch {
        return false;
      }
    },
    () => false,
  );
}

/** The current page or one under it ("/wines/12" is under "/wines"). */
function isCurrent(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`);
}

const storageItems = [
  { title: "Storages", url: "/storages", icon: Refrigerator },
  { title: "Locations", url: "/locations", icon: MapPin },
];

const geographyItems = [
  { title: "Regions", url: "/regions", icon: Flag },
  { title: "Countries", url: "/countries", icon: Earth },
];

const toolItems = [
  { title: "Tasting Parties", url: "/parties", icon: PartyPopper },
];

const settingsItems = [
  { title: "Profile", url: "/profile", icon: UserCircle },
  { title: "Application Settings", url: "/settings", icon: Settings },
];

const adminItems = [{ title: "Users", url: "/users", icon: Users }];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppSidebar() {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const session = authClient.useSession();
  const user = session.data?.user;
  const isAdmin = user?.role === "admin";

  const handleLogout = async () => {
    await fetch("/logout", { method: "POST" });
    // Full page load (not router.push) so no client-side state from the
    // signed-out session survives; replace() keeps it out of history.
    window.location.replace("/login");
  };

  // Count of bottles on their way, shown next to "Pending".
  const bottlesQuery = useApiQuery({
    queryKey: ["bottles"],
    queryFn: getBottles,
  });
  const pendingCount = (bottlesQuery.data ?? []).filter((b) =>
    PENDING_STATUSES.includes(b.status),
  ).length;
  const badges: Record<string, number> = { "/pending": pendingCount };

  const pathname = usePathname() ?? "";
  const onCatalogPage = catalogItems.some((i) => isCurrent(pathname, i.url));
  // Open on a catalog page, otherwise as the viewer last left it; a click
  // overrides both until the page changes.
  const storedOpen = useStoredFlag(CATALOG_OPEN_KEY);
  const [override, setOverride] = useState<boolean | null>(null);
  const catalogOpen = override ?? (onCatalogPage || storedOpen);
  const toggleCatalog = () => {
    const next = !catalogOpen;
    setOverride(next);
    try {
      localStorage.setItem(CATALOG_OPEN_KEY, String(next));
    } catch {
      // storage unavailable: the choice just isn't remembered
    }
  };
  // With the sidebar shrunk to icons there's no room for a submenu, so
  // the Catalog icon goes straight to Wines.
  const iconOnly = state === "collapsed" && !isMobile;

  const sections = [
    { label: "Wines", items: wineItems },
    { label: "Storage", items: storageItems },
    { label: "Geography", items: geographyItems },
    { label: "Tools", items: toolItems },
    {
      label: "Settings",
      items: isAdmin ? [...settingsItems, ...adminItems] : settingsItems,
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/"
              className="flex items-center justify-center gap-2 px-2 py-3 font-semibold text-xl tracking-tight hover:opacity-80 transition-opacity"
            >
              <BottleWine className="h-5 w-5 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">
                CellarBoss
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={state !== "collapsed"}>
            Dashboard
          </TooltipContent>
        </Tooltip>
      </SidebarHeader>
      <SidebarContent>
        {sections.map(({ label, items }) => (
          <SidebarGroup key={label}>
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isCurrent(pathname, item.url)}
                    >
                      <a href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                    {badges[item.url] ? (
                      <SidebarMenuBadge
                        aria-label={`${badges[item.url]} pending`}
                      >
                        {badges[item.url]}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                ))}
                {label === "Wines" && (
                  <SidebarMenuItem>
                    {iconOnly ? (
                      <SidebarMenuButton
                        asChild
                        tooltip="Catalog: wines, grapes, winemakers"
                        isActive={onCatalogPage}
                      >
                        <Link href="/wines">
                          <Library />
                          <span>Catalog</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        onClick={toggleCatalog}
                        aria-expanded={catalogOpen}
                        tooltip="Catalog"
                      >
                        <Library />
                        <span>Catalog</span>
                        <ChevronRight
                          className={`ml-auto transition-transform ${catalogOpen ? "rotate-90" : ""}`}
                        />
                      </SidebarMenuButton>
                    )}
                    {catalogOpen && !iconOnly && (
                      <SidebarMenuSub>
                        {catalogItems.map((item) => (
                          <SidebarMenuSubItem key={item.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isCurrent(pathname, item.url)}
                            >
                              <a href={item.url}>
                                <item.icon />
                                <span>{item.title}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  aria-label="User menu"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {getInitials(user?.name || user?.email || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user?.name}</span>
                    <span className="truncate text-xs">{user?.email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">
                        {getInitials(user?.name || user?.email || "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user?.name}</span>
                      <span className="truncate text-xs">{user?.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                  >
                    {theme === "dark" ? (
                      <Sun className="size-4" />
                    ) : (
                      <Moon className="size-4" />
                    )}
                    Toggle theme
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleSidebar()}>
                    {state === "expanded" ? (
                      <>
                        <PanelLeftClose className="size-4" />
                        Collapse sidebar
                      </>
                    ) : (
                      <>
                        <PanelLeftOpen className="size-4" />
                        Expand sidebar
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <a href="/profile">
                      <UserCircle className="size-4" />
                      Profile
                    </a>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <a href="/settings">
                        <Settings className="size-4" />
                        Settings
                      </a>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="size-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

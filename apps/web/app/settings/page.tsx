"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page/PageHeader";
import { useSettings, useUpdateSetting } from "@/hooks/use-settings";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";

/** Friendlier labels for settings that have one. */
const SETTING_INFO: Record<string, { label: string; description: string }> = {
  hideConsumed: {
    label: "Hide consumed bottles",
    description:
      "Leave drunk, sold and gifted bottles out of everyday views. Lists still offer a way to show them.",
  },
};
import { authClient } from "@/lib/auth-client";
import { LoadingCard } from "@/components/cards/LoadingCard";
import { ErrorCard } from "@/components/cards/ErrorCard";
import { EditButton } from "@/components/buttons/EditButton";
import { type ParsedSettingsMap } from "@/lib/constants/settings";

export default function SettingsAdminPage() {
  const router = useRouter();
  const session = authClient.useSession();
  const settingsQuery = useSettings();
  const updateSetting = useUpdateSetting();
  const queryClient = useQueryClient();

  const isAdmin = session.data?.user?.role === "admin";

  if (settingsQuery.isLoading) {
    return <LoadingCard />;
  }

  if (settingsQuery.isError) {
    return (
      <ErrorCard
        message={settingsQuery.error?.message || "Failed to load settings"}
      />
    );
  }

  if (!isAdmin) {
    return (
      <section>
        <PageHeader title="System Settings" />
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          You do not have permission to access this page. Admin rights are
          required.
        </div>
      </section>
    );
  }

  const settings = settingsQuery.data as ParsedSettingsMap;

  return (
    <section>
      <PageHeader title="System Settings" />

      {settings.size === 0 ? (
        <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground">
          No settings configured yet.
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(settings.entries()).map(([key, value]) => (
            <div
              key={key}
              className="bg-card border border-border rounded-lg p-4 flex items-center justify-between hover:bg-accent"
            >
              <div>
                <div className="font-medium text-foreground">
                  {SETTING_INFO[key]?.label ?? key}
                </div>
                <div className="text-sm text-muted-foreground">
                  {SETTING_INFO[key] ? (
                    SETTING_INFO[key].description
                  ) : typeof value === "boolean" ? (
                    value ? (
                      "On"
                    ) : (
                      "Off"
                    )
                  ) : value === null ? (
                    <span className="italic text-muted-foreground/60">
                      null
                    </span>
                  ) : (
                    String(value)
                  )}
                </div>
              </div>
              {typeof value === "boolean" ? (
                <Switch
                  checked={value}
                  aria-label={SETTING_INFO[key]?.label ?? key}
                  disabled={updateSetting.isPending}
                  onCheckedChange={async (checked) => {
                    await updateSetting.mutateAsync({
                      key,
                      value: String(checked),
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ["settings"],
                    });
                  }}
                />
              ) : (
                <EditButton
                  onEdit={async () =>
                    router.push(`/settings/${encodeURIComponent(key)}/edit`)
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

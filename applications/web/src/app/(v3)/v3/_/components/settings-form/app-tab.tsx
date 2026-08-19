"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@v3/_/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@v3/_/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@v3/_/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@v3/_/components/ui/radio-group"
import { useTranslation } from "@v3/_/hooks/use-translation"

import { SettingsSection } from "./shared"

const CHANNELS = ["stable", "beta", "edge"] as const
type Channel = (typeof CHANNELS)[number]

function isChannel(value: unknown): value is Channel {
  return CHANNELS.includes(value as Channel)
}

export function AppTab() {
  const t = useTranslation("SettingsPage.tabs.app.sections.updates")
  const [channel, setChannel] = useState<Channel | null>(null)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [{ invoke }, { getVersion }] = await Promise.all([
        import("@tauri-apps/api/core"),
        import("@tauri-apps/api/app"),
      ])
      const [config, appVersion] = await Promise.all([
        invoke<Record<string, unknown>>("get_tauri_config"),
        getVersion(),
      ])
      const configured = config["updateChannel"]
      setChannel(isChannel(configured) ? configured : "stable")
      setVersion(appVersion)
    })()
  }, [])

  const changeChannel = async (next: Channel) => {
    const previous = channel
    setChannel(next)
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("set_update_channel", { channel: next })
    } catch (error) {
      console.error("set_update_channel failed", error)
      setChannel(previous)
      toast.error(t("channelSaveFailed"))
    }
  }

  const checkForUpdates = async () => {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("check_for_updates_now")
  }

  const channelOptions: {
    value: Channel
    label: string
    description: string
  }[] = [
    {
      value: "stable",
      label: t("channelStable"),
      description: t("channelStableDescription"),
    },
    {
      value: "beta",
      label: t("channelBeta"),
      description: t("channelBetaDescription"),
    },
    {
      value: "edge",
      label: t("channelEdge"),
      description: t("channelEdgeDescription"),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection tab="app" section="updates">
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            {version && (
              <CardDescription>{t("description", { version })}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RadioGroup
              value={channel ?? "stable"}
              onValueChange={(value) => {
                if (isChannel(value)) void changeChannel(value)
              }}
              className="max-w-sm"
            >
              {channelOptions.map((option) => (
                <FieldLabel
                  key={option.value}
                  htmlFor={`channel-${option.value}`}
                  className="has-data-checked:border-primary"
                >
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{option.label}</FieldTitle>
                      <FieldDescription>{option.description}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem
                      value={option.value}
                      id={`channel-${option.value}`}
                    />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>

            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void checkForUpdates()}
              >
                {t("checkNow")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  )
}

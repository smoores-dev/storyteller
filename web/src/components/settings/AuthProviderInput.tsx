import { UUID } from "@/uuid"
import { Combobox, Group, Text, useCombobox, TextInput } from "@mantine/core"
import { useMemo, useState } from "react"

const Providers = [
  { value: "42-school", label: "42School" },
  { value: "apple", label: "Apple" },
  { value: "asgardeo", label: "Asgardeo" },
  { value: "atlassian", label: "Atlassian" },
  { value: "auth0", label: "Auth0" },
  { value: "authentik", label: "Authentik" },
  { value: "azure-ad-b2c", label: "Azure AD B2C" },
  { value: "azure-ad", label: "Azure AD" },
  { value: "azure-devops", label: "Azure Devops" },
  { value: "bankid-no", label: "BankID Norway" },
  { value: "battlenet", label: "Battle.net" },
  { value: "beyondidentity", label: "Beyond Identity" },
  { value: "bitbucket", label: "Bitbucket" },
  { value: "box", label: "Box" },
  { value: "boxyhq-saml", label: "BoxyHQ Saml" },
  { value: "bungie", label: "Bungie" },
  { value: "click-up", label: "ClickUp" },
  { value: "cognito", label: "Cognito" },
  { value: "coinbase", label: "Coinbase" },
  { value: "concept2", label: "Concept2" },
  { value: "descope", label: "Descope" },
  { value: "discord", label: "Discord" },
  { value: "dribbble", label: "Dribbble" },
  { value: "dropbox", label: "Dropbox" },
  { value: "duende-identity-server6", label: "DuendeIdentityServer6" },
  { value: "eventbrite", label: "Eventbrite" },
  { value: "eveonline", label: "EVEOnline" },
  { value: "facebook", label: "Facebook" },
  { value: "faceit", label: "FACEIT" },
  { value: "figma", label: "Figma" },
  { value: "foursquare", label: "FourSquare" },
  { value: "freshbooks", label: "FreshBooks" },
  { value: "frontegg", label: "Frontegg" },
  { value: "fusionauth", label: "FusionAuth" },
  { value: "github", label: "GitHub" },
  { value: "gitlab", label: "GitLab" },
  { value: "google", label: "Google" },
  { value: "hubspot", label: "HubSpot" },
  { value: "huggingface", label: "Hugging Face" },
  { value: "identity-server4", label: "IdentityServer4" },
  { value: "instagram", label: "Instagram" },
  { value: "kakao", label: "Kakao" },
  { value: "keycloak", label: "Keycloak" },
  { value: "kinde", label: "Kinde" },
  { value: "line", label: "LINE" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "logto", label: "Logto" },
  { value: "loops", label: "Loops" },
  { value: "mailchimp", label: "Mailchimp" },
  { value: "mailru", label: "Mailru" },
  { value: "mastodon", label: "Mastodon" },
  { value: "mattermost", label: "Mattermost" },
  { value: "medium", label: "Medium" },
  { value: "microsoft-entra-id", label: "Microsoft Entra ID" },
  { value: "naver", label: "Naver" },
  { value: "netlify", label: "Netlify" },
  { value: "netsuite", label: "NetSuite" },
  { value: "nextcloud", label: "Nextcloud" },
  { value: "notion", label: "Notion" },
  { value: "okta", label: "Okta" },
  { value: "onelogin", label: "OneLogin" },
  { value: "ory-hydra", label: "Ory Hydra" },
  { value: "osso", label: "Osso" },
  { value: "osu", label: "osu!" },
  { value: "passage", label: "Passage by 1Password" },
  { value: "patreon", label: "Patreon" },
  { value: "ping-id", label: "PingID" },
  { value: "pinterest", label: "Pinterest" },
  { value: "pipedrive", label: "Pipedrive" },
  { value: "reddit", label: "Reddit" },
  { value: "roblox", label: "Roblox" },
  { value: "salesforce", label: "Salesforce" },
  { value: "simplelogin", label: "SimpleLogin" },
  { value: "slack", label: "Slack" },
  { value: "spotify", label: "Spotify" },
  { value: "strava", label: "Strava" },
  { value: "threads", label: "Threads" },
  { value: "tiktok", label: "TikTok" },
  { value: "todoist", label: "Todoist" },
  { value: "trakt", label: "Trakt" },
  { value: "twitch", label: "Twitch" },
  { value: "twitter", label: "Twitter" },
  { value: "united-effects", label: "United Effects" },
  { value: "vipps", label: "Vipps" },
  { value: "vk", label: "VK" },
  { value: "webex", label: "Webex" },
  { value: "wechat", label: "WeChat" },
  { value: "wikimedia", label: "Wikimedia" },
  { value: "wordpress", label: "WordPress" },
  { value: "workos", label: "WorkOS" },
  { value: "yandex", label: "Yandex" },
  { value: "zitadel", label: "Zitadel" },
  { value: "zoho", label: "ZOHO" },
  { value: "zoom", label: "Zoom" },
]

interface Props {
  value: string
  onChange: (uuid: string) => void
}

export function AuthProviderInput({ value, onChange }: Props) {
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
    },
  })

  const [textValue, setTextValue] = useState(
    Providers.find((p) => p.value === value)?.label ?? "",
  )

  const filtered = useMemo(
    () =>
      Providers.filter((p) =>
        p.label.toLowerCase().startsWith(textValue.toLowerCase()),
      ),
    [textValue],
  )

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(value) => {
        onChange(value as UUID)
        setTextValue(Providers.find((p) => p.value === value)?.label ?? "")
        combobox.closeDropdown()
      }}
    >
      <Combobox.Target>
        <TextInput
          required
          withAsterisk
          label="Provider"
          rightSection={<Combobox.Chevron />}
          onClick={() => {
            combobox.toggleDropdown()
          }}
          rightSectionPointerEvents="none"
          value={textValue}
          onChange={(e) => {
            setTextValue(e.currentTarget.value)
          }}
        ></TextInput>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {filtered.map((p) => (
            <Combobox.Option value={p.value} key={p.value}>
              <Group justify="space-between" wrap="nowrap">
                <Text>{p.label}</Text>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}

import FortyTwoSchool from "next-auth/providers/42-school"
import Apple from "next-auth/providers/apple"
import Asgardeo from "next-auth/providers/asgardeo"
import Atlassian from "next-auth/providers/atlassian"
import Auth0 from "next-auth/providers/auth0"
import Authentik from "next-auth/providers/authentik"
import AzureADB2C from "next-auth/providers/azure-ad-b2c"
import AzureAD from "next-auth/providers/azure-ad"
import AzureDevops from "next-auth/providers/azure-devops"
import BankIDNorway from "next-auth/providers/bankid-no"
import Battlenet from "next-auth/providers/battlenet"
import BeyondIdentity from "next-auth/providers/beyondidentity"
import Bitbucket from "next-auth/providers/bitbucket"
import Box from "next-auth/providers/box"
import BoxyHQSaml from "next-auth/providers/boxyhq-saml"
import Bungie from "next-auth/providers/bungie"
import ClickUp from "next-auth/providers/click-up"
import Cognito from "next-auth/providers/cognito"
import Coinbase from "next-auth/providers/coinbase"
import Concept2 from "next-auth/providers/concept2"
import Descope from "next-auth/providers/descope"
import Discord from "next-auth/providers/discord"
import Dribbble from "next-auth/providers/dribbble"
import Dropbox from "next-auth/providers/dropbox"
import DuendeIdentityServer6 from "next-auth/providers/duende-identity-server6"
import Eventbrite from "next-auth/providers/eventbrite"
import EVEOnline from "next-auth/providers/eveonline"
import Facebook from "next-auth/providers/facebook"
import Faceit from "next-auth/providers/faceit"
import Figma from "next-auth/providers/figma"
import FourSquare from "next-auth/providers/foursquare"
import FreshBooks from "next-auth/providers/freshbooks"
import Frontegg from "next-auth/providers/frontegg"
import FusionAuth from "next-auth/providers/fusionauth"
import GitHub from "next-auth/providers/github"
import GitLab from "next-auth/providers/gitlab"
import Google from "next-auth/providers/google"
import HubSpot from "next-auth/providers/hubspot"
import HuggingFace from "next-auth/providers/huggingface"
import IdentityServer4 from "next-auth/providers/identity-server4"
import Instagram from "next-auth/providers/instagram"
import Kakao from "next-auth/providers/kakao"
import Keycloak from "next-auth/providers/keycloak"
import Kinde from "next-auth/providers/kinde"
import Line from "next-auth/providers/line"
import LinkedIn from "next-auth/providers/linkedin"
import Logto from "next-auth/providers/logto"
import Loops from "next-auth/providers/loops"
import Mailchimp from "next-auth/providers/mailchimp"
import Mailru from "next-auth/providers/mailru"
import Mastodon from "next-auth/providers/mastodon"
import Mattermost from "next-auth/providers/mattermost"
import Medium from "next-auth/providers/medium"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"
import Naver from "next-auth/providers/naver"
import Netlify from "next-auth/providers/netlify"
import NetSuite from "next-auth/providers/netsuite"
import Nextcloud from "next-auth/providers/nextcloud"
import Notion from "next-auth/providers/notion"
import Okta from "next-auth/providers/okta"
import OneLogin from "next-auth/providers/onelogin"
import OryHydra from "next-auth/providers/ory-hydra"
import Osso from "next-auth/providers/osso"
import Osu from "next-auth/providers/osu"
import Passage from "next-auth/providers/passage"
import Patreon from "next-auth/providers/patreon"
import PingID from "next-auth/providers/ping-id"
import Pinterest from "next-auth/providers/pinterest"
import Pipedrive from "next-auth/providers/pipedrive"
import Reddit from "next-auth/providers/reddit"
import Roblox from "next-auth/providers/roblox"
import Salesforce from "next-auth/providers/salesforce"
import SimpleLogin from "next-auth/providers/simplelogin"
import Slack from "next-auth/providers/slack"
import Spotify from "next-auth/providers/spotify"
import Strava from "next-auth/providers/strava"
import Threads from "next-auth/providers/threads"
import TikTok from "next-auth/providers/tiktok"
import Todoist from "next-auth/providers/todoist"
import Trakt from "next-auth/providers/trakt"
import Twitch from "next-auth/providers/twitch"
import Twitter from "next-auth/providers/twitter"
import UnitedEffects from "next-auth/providers/united-effects"
import Vipps from "next-auth/providers/vipps"
import Vk from "next-auth/providers/vk"
import Webex from "next-auth/providers/webex"
import WeChat from "next-auth/providers/wechat"
import Wikimedia from "next-auth/providers/wikimedia"
import WordPress from "next-auth/providers/wordpress"
import WorkOS from "next-auth/providers/workos"
import Yandex from "next-auth/providers/yandex"
import Zitadel from "next-auth/providers/zitadel"
import Zoho from "next-auth/providers/zoho"
import Zoom from "next-auth/providers/zoom"

export const Providers = {
  "42-school": FortyTwoSchool,
  apple: Apple,
  asgardeo: Asgardeo,
  atlassian: Atlassian,
  auth0: Auth0,
  authentik: Authentik,
  "azure-ad-b2c": AzureADB2C,
  "azure-ad": AzureAD,
  "azure-devops": AzureDevops,
  "bankid-no": BankIDNorway,
  battlenet: Battlenet,
  beyondidentity: BeyondIdentity,
  bitbucket: Bitbucket,
  box: Box,
  "boxyhq-saml": BoxyHQSaml,
  bungie: Bungie,
  "click-up": ClickUp,
  cognito: Cognito,
  coinbase: Coinbase,
  concept2: Concept2,
  descope: Descope,
  discord: Discord,
  dribbble: Dribbble,
  dropbox: Dropbox,
  "duende-identity-server6": DuendeIdentityServer6,
  eventbrite: Eventbrite,
  eveonline: EVEOnline,
  facebook: Facebook,
  faceit: Faceit,
  figma: Figma,
  foursquare: FourSquare,
  freshbooks: FreshBooks,
  frontegg: Frontegg,
  fusionauth: FusionAuth,
  github: GitHub,
  gitlab: GitLab,
  google: Google,
  hubspot: HubSpot,
  huggingface: HuggingFace,
  "identity-server4": IdentityServer4,
  instagram: Instagram,
  kakao: Kakao,
  keycloak: Keycloak,
  kinde: Kinde,
  line: Line,
  linkedin: LinkedIn,
  logto: Logto,
  loops: Loops,
  mailchimp: Mailchimp,
  mailru: Mailru,
  mastodon: Mastodon,
  mattermost: Mattermost,
  medium: Medium,
  "microsoft-entra-id": MicrosoftEntraID,
  naver: Naver,
  netlify: Netlify,
  netsuite: NetSuite,
  nextcloud: Nextcloud,
  notion: Notion,
  okta: Okta,
  onelogin: OneLogin,
  "ory-hydra": OryHydra,
  osso: Osso,
  osu: Osu,
  passage: Passage,
  patreon: Patreon,
  "ping-id": PingID,
  pinterest: Pinterest,
  pipedrive: Pipedrive,
  reddit: Reddit,
  roblox: Roblox,
  salesforce: Salesforce,
  simplelogin: SimpleLogin,
  slack: Slack,
  spotify: Spotify,
  strava: Strava,
  threads: Threads,
  tiktok: TikTok,
  todoist: Todoist,
  trakt: Trakt,
  twitch: Twitch,
  twitter: Twitter,
  "united-effects": UnitedEffects,
  vipps: Vipps,
  vk: Vk,
  webex: Webex,
  wechat: WeChat,
  wikimedia: Wikimedia,
  wordpress: WordPress,
  workos: WorkOS,
  yandex: Yandex,
  zitadel: Zitadel,
  zoho: Zoho,
  zoom: Zoom,
}

export type SdkMode = "publisher" | "advertiser";

export const SDK_CONFIG = {
  advertiser: {
    example: "https://docs.specify.sh/advertising/analytics-sdk-setup.md",
    guide: "https://docs.specify.sh/advertising/analytics-sdk-setup",
    keysUrl: "https://app.specify.sh/advertise/advertiser-keys",
    placeholderKey: "sak_your_key_here",
    section: "advertising",
  },
  publisher: {
    example: "https://docs.specify.sh/publishing/nextjs.md",
    guide: "https://docs.specify.sh/publishing/get-started",
    keysUrl: "https://app.specify.sh/publish/publisher-keys",
    placeholderKey: "spk_your_key_here",
    section: "publishing",
  },
} as const;

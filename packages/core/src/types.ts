export type Address = `0x${string}`;

export const ImageFormat = {
  LANDSCAPE: "LANDSCAPE",
  LONG_BANNER: "LONG_BANNER",
  NO_IMAGE: "NO_IMAGE",
  SHORT_BANNER: "SHORT_BANNER",
} as const;

export type ImageFormat = (typeof ImageFormat)[keyof typeof ImageFormat];

export interface SpecifyAd {
  adId: string;
  adUnitId?: string;
  campaignId: string;
  communityLogo: string;
  communityName: string;
  content: string;
  ctaLabel: string;
  ctaUrl: string;
  headline: string;
  imageFormat: ImageFormat;
  imageUrl: string | null;
}

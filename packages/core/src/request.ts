import type { Address, ImageFormat, SpecifyAd } from "./types";

const SERVE_URL = "https://spfsrv.com/v1/ads";

export interface AdRequest {
  adUnitId?: string;
  cookieConsent?: boolean;
  credentials?: RequestCredentials;
  imageFormat: ImageFormat;
  publisherKey: string;
  walletAddresses: Address[];
}

export async function requestAd(request: AdRequest): Promise<SpecifyAd | null> {
  try {
    const response = await fetch(SERVE_URL, {
      body: JSON.stringify({
        adUnitId: request.adUnitId,
        cookieConsent: request.cookieConsent,
        imageFormat: request.imageFormat,
        walletAddresses: request.walletAddresses,
      }),
      credentials: request.credentials,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": request.publisherKey,
      },
      method: "POST",
    });

    if (response.status !== 200) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

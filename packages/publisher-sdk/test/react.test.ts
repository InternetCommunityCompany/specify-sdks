import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import Specify, { type Address, ImageFormat, type SpecifyAd } from "../src";
import { useSpecifyAd } from "../src/react";
import { VALID_MOCK_PUBLISHER_KEY, VALID_MOCK_WALLET_ADDRESS } from "./consts";

const OTHER_MOCK_WALLET_ADDRESS = `0x${"ab".repeat(20)}` as Address;

const mockAd = {
  adId: "A",
  campaignId: "abcd1234567",
  communityLogo: "https://example.com/community.jpg",
  communityName: "Outposts",
  content: "Join the club with the hottest NFTs in the metaverse.",
  ctaLabel: "Mint Now",
  ctaUrl: "https://example.com/click",
  headline: "Bored Ape Yacht Club Collection",
  imageFormat: ImageFormat.LANDSCAPE,
  imageUrl: "https://example.com/image.jpg",
} satisfies SpecifyAd;

const secondMockAd = { ...mockAd, adId: "B" } satisfies SpecifyAd;

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createSpecify(): Specify {
  return new Specify({ publisherKey: VALID_MOCK_PUBLISHER_KEY });
}

function requestBody(request: RequestInit): unknown {
  return JSON.parse(String(request.body));
}

function adResponse(ad: SpecifyAd): Response {
  return new Response(JSON.stringify(ad), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function noFillResponse(): Response {
  return new Response(null, { status: 204 });
}

// Each fetch answers with the next queued response; past the queue it no-fills.
function setupServeQueue(responses: Response[]) {
  const requests: RequestInit[] = [];
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(init ?? {});
    return Promise.resolve(responses.shift() ?? noFillResponse());
  });
  globalThis.fetch = fetchMock;
  return { fetch: fetchMock, requests };
}

// Each fetch hands back a promise the test resolves by hand, in any order.
function setupDeferredServes() {
  const resolvers: Array<(response: Response) => void> = [];
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        resolvers.push(resolve);
      })
  );
  globalThis.fetch = fetchMock;
  return { fetch: fetchMock, resolvers };
}

// A macrotask outlives every pending microtask and resolved fetch chain.
async function flushServes() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

describe.runIf(typeof window !== "undefined")("useSpecifyAd", () => {
  afterEach(() => {
    cleanup();
  });

  it("serves on mount with the given wallets", async () => {
    const specify = createSpecify();
    const { requests } = setupServeQueue([adResponse(mockAd)]);

    const { result } = renderHook(() =>
      useSpecifyAd([VALID_MOCK_WALLET_ADDRESS], {
        adUnitId: "sidebar",
        imageFormat: ImageFormat.LANDSCAPE,
        specify,
      })
    );

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(mockAd));
    expect(requestBody(requests[0] ?? {})).toMatchObject({
      adUnitId: "sidebar",
      imageFormat: ImageFormat.LANDSCAPE,
      walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
    });
  });

  it("serves on mount with the options overload", async () => {
    const specify = createSpecify();
    const { fetch, requests } = setupServeQueue([adResponse(mockAd)]);
    specify.setCookieConsent(true);

    const { result } = renderHook(() =>
      useSpecifyAd({ imageFormat: ImageFormat.LONG_BANNER, specify })
    );

    await waitFor(() => expect(result.current).toEqual(mockAd));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requestBody(requests[0] ?? {})).toMatchObject({
      imageFormat: ImageFormat.LONG_BANNER,
      walletAddresses: [],
    });
  });

  it("re-serves when the identity improves", async () => {
    const specify = createSpecify();
    const { fetch, requests } = setupServeQueue([adResponse(mockAd)]);

    const { result } = renderHook(() =>
      useSpecifyAd({ imageFormat: ImageFormat.LANDSCAPE, specify })
    );

    await flushServes();
    expect(result.current).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      specify.identify(VALID_MOCK_WALLET_ADDRESS);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current).toEqual(mockAd));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requestBody(requests[0] ?? {})).toMatchObject({
      walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
    });
  });

  it("keeps the first ad when the identity improves again", async () => {
    const specify = createSpecify();
    const { fetch } = setupServeQueue([
      adResponse(mockAd),
      adResponse(secondMockAd),
    ]);

    const { result } = renderHook(() =>
      useSpecifyAd([VALID_MOCK_WALLET_ADDRESS], {
        imageFormat: ImageFormat.LANDSCAPE,
        specify,
      })
    );

    await waitFor(() => expect(result.current).toEqual(mockAd));

    await act(async () => {
      specify.identify(OTHER_MOCK_WALLET_ADDRESS);
      await Promise.resolve();
    });
    await flushServes();

    expect(result.current).toEqual(mockAd);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not blank a filled slot when a slower retry comes back empty", async () => {
    const specify = createSpecify();
    const { fetch, resolvers } = setupDeferredServes();

    const { result } = renderHook(() =>
      useSpecifyAd([VALID_MOCK_WALLET_ADDRESS], {
        imageFormat: ImageFormat.LANDSCAPE,
        specify,
      })
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => {
      specify.identify(OTHER_MOCK_WALLET_ADDRESS);
      await Promise.resolve();
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    resolvers[0]?.(adResponse(mockAd));
    await waitFor(() => expect(result.current).toEqual(mockAd));

    resolvers[1]?.(noFillResponse());
    await flushServes();
    expect(result.current).toEqual(mockAd);
  });

  it("stays empty through an empty retry and fills on a later one", async () => {
    const specify = createSpecify();
    const { fetch } = setupServeQueue([
      noFillResponse(),
      noFillResponse(),
      adResponse(mockAd),
    ]);
    specify.setCookieConsent(true);

    const { result } = renderHook(() =>
      useSpecifyAd({ imageFormat: ImageFormat.LANDSCAPE, specify })
    );

    await flushServes();
    expect(result.current).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      specify.identify(VALID_MOCK_WALLET_ADDRESS);
      await Promise.resolve();
    });
    await flushServes();
    expect(result.current).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      specify.identify(OTHER_MOCK_WALLET_ADDRESS);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current).toEqual(mockAd));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("ignores an ad requested before the image format changed", async () => {
    const specify = createSpecify();
    const { fetch, resolvers } = setupDeferredServes();

    const { result, rerender } = renderHook<
      SpecifyAd | null,
      { imageFormat: ImageFormat }
    >(
      ({ imageFormat }) =>
        useSpecifyAd([VALID_MOCK_WALLET_ADDRESS], { imageFormat, specify }),
      { initialProps: { imageFormat: ImageFormat.LANDSCAPE } }
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rerender({ imageFormat: ImageFormat.SHORT_BANNER });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    resolvers[0]?.(adResponse(mockAd));
    await flushServes();

    expect(result.current).toBeNull();
  });

  it("keeps the first of two ads that arrive in the same tick", async () => {
    const specify = createSpecify();
    const { fetch, resolvers } = setupDeferredServes();

    const { result } = renderHook(() =>
      useSpecifyAd([VALID_MOCK_WALLET_ADDRESS], {
        imageFormat: ImageFormat.LANDSCAPE,
        specify,
      })
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => {
      specify.identify(OTHER_MOCK_WALLET_ADDRESS);
      await Promise.resolve();
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    resolvers[0]?.(adResponse(mockAd));
    resolvers[1]?.(adResponse(secondMockAd));
    await flushServes();

    expect(result.current).toEqual(mockAd);
  });

  it("ignores a result that arrives after unmount", async () => {
    const specify = createSpecify();
    const { fetch, resolvers } = setupDeferredServes();

    const { result, unmount } = renderHook(() =>
      useSpecifyAd([VALID_MOCK_WALLET_ADDRESS], {
        imageFormat: ImageFormat.LANDSCAPE,
        specify,
      })
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    unmount();

    resolvers[0]?.(adResponse(mockAd));
    await flushServes();

    expect(result.current).toBeNull();
  });

  it("does not serve again for a fresh array with the same addresses", async () => {
    const specify = createSpecify();
    const { fetch } = setupServeQueue([noFillResponse(), noFillResponse()]);

    const { rerender } = renderHook(
      ({ wallets }: { wallets: Address[] }) =>
        useSpecifyAd(wallets, { imageFormat: ImageFormat.LANDSCAPE, specify }),
      { initialProps: { wallets: [VALID_MOCK_WALLET_ADDRESS] } }
    );

    await flushServes();
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender({ wallets: [VALID_MOCK_WALLET_ADDRESS] });
    await flushServes();
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender({ wallets: [OTHER_MOCK_WALLET_ADDRESS] });
    await flushServes();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not serve again for a fresh options object with the same values", async () => {
    const specify = createSpecify();
    const { fetch } = setupServeQueue([noFillResponse()]);

    const { rerender } = renderHook(
      ({ adUnitId }: { adUnitId: string }) =>
        useSpecifyAd([VALID_MOCK_WALLET_ADDRESS], {
          adUnitId,
          imageFormat: ImageFormat.LANDSCAPE,
          specify,
        }),
      { initialProps: { adUnitId: "sidebar" } }
    );

    await flushServes();
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender({ adUnitId: "sidebar" });
    await flushServes();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops reading the wallets once the slot is filled", async () => {
    const specify = createSpecify();
    const { fetch, requests } = setupServeQueue([
      adResponse(mockAd),
      adResponse(secondMockAd),
    ]);

    const { result, rerender } = renderHook(
      ({ wallets }: { wallets: Address[] }) =>
        useSpecifyAd(wallets, { imageFormat: ImageFormat.LANDSCAPE, specify }),
      { initialProps: { wallets: [VALID_MOCK_WALLET_ADDRESS] } }
    );

    await waitFor(() => expect(result.current).toEqual(mockAd));

    rerender({ wallets: [OTHER_MOCK_WALLET_ADDRESS] });
    await flushServes();

    expect(result.current).toEqual(mockAd);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requestBody(requests[0] ?? {})).toMatchObject({
      walletAddresses: [VALID_MOCK_WALLET_ADDRESS],
    });
  });

  it("leaves the slot empty when an address is malformed instead of throwing", async () => {
    const specify = createSpecify();
    specify.setCookieConsent(true);
    const { fetch } = setupServeQueue([adResponse(mockAd)]);
    const unhandledRejection = vi.fn();
    process.on("unhandledRejection", unhandledRejection);
    onTestFinished(() => {
      process.off("unhandledRejection", unhandledRejection);
    });

    const { result } = renderHook(() =>
      useSpecifyAd("0xinvalid" as Address, {
        imageFormat: ImageFormat.LANDSCAPE,
        specify,
      })
    );

    await flushServes();
    expect(result.current).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(unhandledRejection).not.toHaveBeenCalled();
  });

  it("drops a value without the 0x prefix and serves without it", async () => {
    const specify = createSpecify();
    specify.setCookieConsent(true);
    const { fetch, requests } = setupServeQueue([adResponse(mockAd)]);

    const { result } = renderHook(() =>
      useSpecifyAd("not-an-address" as Address, {
        imageFormat: ImageFormat.LANDSCAPE,
        specify,
      })
    );

    await waitFor(() => expect(result.current).toEqual(mockAd));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requestBody(requests[0] ?? {})).toMatchObject({
      walletAddresses: [],
    });
  });

  it("does not serve without a Specify client", async () => {
    const { fetch } = setupServeQueue([adResponse(mockAd)]);

    const { result } = renderHook(() =>
      useSpecifyAd(
        [VALID_MOCK_WALLET_ADDRESS],
        // @ts-expect-error JavaScript callers can leave out the client
        { imageFormat: ImageFormat.LANDSCAPE }
      )
    );

    await flushServes();
    expect(result.current).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not serve without an image format", async () => {
    const specify = createSpecify();
    const { fetch } = setupServeQueue([adResponse(mockAd)]);

    const { result } = renderHook(() =>
      useSpecifyAd(
        [VALID_MOCK_WALLET_ADDRESS],
        // @ts-expect-error JavaScript callers can leave out the image format
        { specify }
      )
    );

    await flushServes();
    expect(result.current).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not serve when the options are left out", async () => {
    const { fetch } = setupServeQueue([adResponse(mockAd)]);

    const { result } = renderHook(() =>
      // @ts-expect-error JavaScript callers can leave out the options
      useSpecifyAd([VALID_MOCK_WALLET_ADDRESS])
    );

    await flushServes();
    expect(result.current).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("useSpecifyAd during a server render", () => {
  it("renders the empty slot without requesting an ad", () => {
    const specify = createSpecify();
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    function AdSlot() {
      const ad = useSpecifyAd([VALID_MOCK_WALLET_ADDRESS], {
        imageFormat: ImageFormat.LANDSCAPE,
        specify,
      });
      return createElement("p", null, ad ? ad.headline : "empty");
    }

    expect(renderToString(createElement(AdSlot))).toBe("<p>empty</p>");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects the hook entry from a React Server Component", async () => {
    await expect(import("../src/react.react-server")).rejects.toThrow(
      '@specify-sh/publisher-sdk/react can only be imported from a Client Component. Add "use client" to the component that calls useSpecifyAd(), or import { serve } from "@specify-sh/publisher-sdk/server" to serve during server rendering.'
    );
  });
});

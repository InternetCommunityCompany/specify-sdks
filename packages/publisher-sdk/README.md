<div align="center">
  <h1>Specify Publisher SDK</h1>

  <p>
    JavaScript SDK for Specify Publishers to serve targeted content based on wallet addresses
  </p>

  <div>
  <a href="https://github.com/InternetCommunityCompany/specify-sdks">
     <img alt="Version JSON Badge" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Finternetcommunitycompany%2Fspecify-sdks%2Fmain%2Fpackages%2Fpublisher-sdk%2Fpackage.json&query=%24.version&label=Version">
    </a>
    <a href="https://github.com/InternetCommunityCompany/specify-sdks">
     <img alt="Release Workflow Status" src="https://img.shields.io/github/actions/workflow/status/internetcommunitycompany/specify-sdks/release.yml?style=flat&label=Release">
    </a>
  </div>
</div>

---

> **Not on npm yet.** `@specify-sh/publisher-sdk` has not been published. The SDK currently on npm is
> [`@specify-sh/sdk`](https://www.npmjs.com/package/@specify-sh/sdk), which is deprecated and no longer updated.

> Now in beta!

The Specify Publisher SDK enables publishers to serve targeted ad content to users based on their wallet addresses.

## Installation

```bash
# Using bun
bun add @specify-sh/publisher-sdk

# Using npm
npm install @specify-sh/publisher-sdk

# Using yarn
yarn add @specify-sh/publisher-sdk

```

## Basic Usage

```js
import Specify, { ImageFormat, ValidationError } from "@specify-sh/publisher-sdk";

const specify = new Specify({
  publisherKey: "your_publisher_key"
});

// Consent starts false; grant it from your consent management platform.
specify.setCookieConsent(true);

// Serve content based on wallet address
async function serveContent() {
  try {
    const walletAddress = "0x1234567890123456789012345678901234567890";

    // Serve content with a provided wallet address.
    const content = await specify.serve(walletAddress, {imageFormat: ImageFormat.LANDSCAPE, adUnitId: "header-banner-1"});

    // With cookie consent, a request can also rely on Specify's identity cookie without a wallet.
    const cookieContent = await specify.serve(undefined, {imageFormat: ImageFormat.SHORT_BANNER, adUnitId: "sidebar-ad-1"});
  } catch (error) {
    if (error instanceof ValidationError) {
      // Handle validation errors
    }
  }
}

serveContent();

// Reflect a consent change reported by your CMP mid-page, without a reload.
cmp.on("consent", (granted) => {
  specify.setCookieConsent(granted);
});
```

## Advanced Usage

### Serving content matching across ads multiple addresses

You can provide a list of wallet addresses and we will find the best ad across all of them. This is useful if your users have multiple wallets connected at a given time for example.

```js
// Serve content matching across multiple wallet addresses (max 50).
const addresses = [
  "0x1234567890123456789012345678901234567890",
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  "0x9876543210987654321098765432109876543210"
];

// Serve content with multiple provided addresses.
const content = await specify.serve(addresses, {imageFormat: ImageFormat.LONG_BANNER, adUnitId: "ad-unit-2"});
```

### Registering connected wallets

Call `identify()` when your user connects a wallet. Registered addresses ride along on every later `serve()` call, in either form, so you do not have to thread them through each call site.

```js
// When the user connects a wallet:
specify.identify(walletAddress);
// Or several at once:
specify.identify([walletAddress, secondWalletAddress]);

// Every later serve() sends the registered addresses.
const content = await specify.serve({imageFormat: ImageFormat.LANDSCAPE});
```

`identify()` does nothing outside a browser, such as during a server render. Registration merges and never removes: several wallets can be one person, and a disconnect does not retract one. The SDK sends at most 50 addresses, and addresses passed to `serve()` take priority over registered ones.

## Server usage

Use the server entry when serving an ad outside a browser:

```js
import { ImageFormat, serve } from "@specify-sh/publisher-sdk/server";

const ad = await serve({
  publisherKey: "your_publisher_key",
  walletAddresses: ["0x1234567890123456789012345678901234567890"],
  imageFormat: ImageFormat.LANDSCAPE,
  adUnitId: "header-banner-1"
});
```

`walletAddresses` is required and must contain at least one address. A server request has no identity cookie to match when the list is empty, so `serve()` throws `ValidationError` instead of returning `null` without a request.

The server entry has no consent state, identity cookie, `identify()` method, or credentials. Invalid publisher keys and wallet addresses throw before the request. After the request starts, no-fill responses, API errors, network failures, and invalid response bodies resolve to `null`.

Importing the bare `@specify-sh/publisher-sdk` package from a React Server Component throws an error that directs you to `@specify-sh/publisher-sdk/server`.

## API Reference

### `new Specify(config)`

Creates a new instance of the Specify client.

- `config.publisherKey` - Your publisher API key (required, format: `spk_` followed by 30 alphanumeric characters)

A new instance starts without consent, and `setCookieConsent()` is how consent is given. Consent can only be granted in a browser: the setter does nothing during a server render, so a server-side `serve()` with no addresses returns `null` without sending a request.

### `specify.serve({imageFormat, adUnitId})`

Serves content using the wallets registered through `identify()` and the consent signal, without passing addresses at the call site.

- `imageFormat` - Required image format, one of the `ImageFormat` members
- `adUnitId` - Optional arbitrary string identifier to identify where the ad is being displayed
- Returns: Promise resolving to an ad content object on a successful 200 response. Returns `null` for no-fill, any API failure, or a network failure.

Registered addresses are merged with any the caller passes, up to the 50-address limit. Without consent, without registered addresses, and without addresses at the call site, no request is sent and `null` is returned.

### `specify.serve(addressOrAddresses, {imageFormat, adUnitId})`

Serves content based on the provided wallet address(es).

- `addressOrAddresses` - Optional. Single wallet address, array of wallet addresses (max 50), or `undefined`. After `setCookieConsent(true)`, an empty value still sends a request so the service can use its identity cookie.
  - Format: Standard EVM address format: `0x123...`
  - Automatically deduplicated by the SDK
- `imageFormat` - Required image format, one of the `ImageFormat` members
- `adUnitId` - Optional arbitrary string identifier to identify where the ad is being displayed
- Returns: Promise resolving to an ad content object on a successful 200 response. Returns `null` for no-fill, any API failure, or a network failure.

Addresses passed here take priority over the ones registered through `identify()`: they are sent first, and the SDK sends at most 50 addresses in total.

Requests are sent to `https://spfsrv.com/v1/ads` with credentials included so the service can read or set its consent-gated identity cookie.

### `specify.identify(addressOrAddresses)`

Registers wallet address(es) to send on every later `serve()` call.

- `addressOrAddresses` - Single wallet address, array of wallet addresses, an empty array, or `undefined`
- Returns: Nothing

Call this when the user connects a wallet. Registration merges and never removes: several wallets can be one person, and a disconnect does not retract one. The SDK keeps the 50 most recent registrations and sends at most 50 addresses in total, with the ones passed to `serve()` taking priority. Does nothing outside a browser, such as during a server render. Throws `ValidationError` when any address in the batch is malformed, and nothing from that call is registered.

### `specify.setCookieConsent(granted)`

Updates the consent signal for Specify's identity cookie after construction, so the next `serve()` reflects it without a page reload.

- `granted` - Boolean, whether the user consented to Specify's identity cookie
- Returns: Nothing

The SDK never stores the value: your consent management platform is the source of truth, and the SDK reads the current value from the instance on every `serve()`. Does nothing outside a browser, such as during a server render.

### `specify.hasCookieConsent()`

Returns the current consent value.

- Returns: Boolean, the current consent value; `false` until `setCookieConsent(true)` grants it

#### Response Object

```typescript
interface SpecifyAd {
  campaignId: string;
  adId: string;
  headline: string;
  content: string;
  ctaUrl: string;
  ctaLabel: string;
  imageUrl: string | null;
  communityName: string;
  communityLogo: string;
  imageFormat: "LANDSCAPE" | "LONG_BANNER" | "SHORT_BANNER" | "NO_IMAGE";  
  adUnitId?: string;
}
```

### `ImageFormat`

`ImageFormat` defines the available image format options:

- `ImageFormat.LANDSCAPE` - 16:9 - Landscape-oriented images
- `ImageFormat.LONG_BANNER` - 8.09:1 - Long banner format
- `ImageFormat.SHORT_BANNER` - 16:5 - Short banner format
- `ImageFormat.NO_IMAGE` - No image, text-only ads

### `adUnitId` String
- Optional
- Arbitrary string identifier to identify where the ad is being displayed

### Error Types

- `ValidationError` - Invalid publisher key format, invalid wallet address format, or too many unique addresses (>50).

`serve()` does not throw for network failures or API responses, including authentication and validation responses from the service. Those outcomes resolve to `null`, allowing the host page to continue without rendering an ad.

---

## Build from Source

### Requirements:

- [Bun](https://bun.sh)

```bash
# Clone the repository
git clone https://github.com/internetcommunitycompany/specify-sdks.git
cd specify-sdks

# Install dependencies
bun install

# Run tests
bun run test

# Build the library (output to dist directory)
bun run build
```

## Examples

Check out our [examples repository](https://github.com/InternetCommunityCompany/specify-publisher-sdk-examples) for complete implementation examples in different frameworks and environments.

## License

MIT

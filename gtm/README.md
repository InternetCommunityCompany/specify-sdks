# Specify for Google Tag Manager

Send conversion events to Specify. This template loads the SDK for you.

1. In GTM, open **Templates → New**. Import [template.tpl](template.tpl) from the three-dot menu.
2. Create a **Specify Advertiser** tag. Set **Action** to **Initialize**, enter your advertiser key, and use the **Initialization – All Pages** trigger.
3. Add separate tags for consent, identity, events, and logout. Choose when each runs.
4. Test in **Preview**. Check for successful requests in the browser's Network panel.

Run the template tests from the repository root:

```sh
bun run test packages/advertiser-sdk/test/gtm-template.test.ts
```

// A Server Component importing the hook entry is an integration error that must fail during its build.
throw new Error(
  '@specify-sh/publisher-sdk/react can only be imported from a Client Component. Add "use client" to the component that calls useSpecifyAd(), or import { serve } from "@specify-sh/publisher-sdk/server" to serve during server rendering.'
);

export {};

// A Server Component importing the browser entry is an integration error that must fail during its build.
throw new Error(
  '@specify-sh/publisher-sdk cannot be imported from a React Server Component. Import { serve } from "@specify-sh/publisher-sdk/server" instead.'
);

export {};

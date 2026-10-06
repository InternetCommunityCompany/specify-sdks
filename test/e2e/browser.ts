import Specify from "@specify-sh/advertiser-sdk";

declare global {
  interface Window {
    consent: boolean;
    Specify: typeof Specify;
    specify: Specify;
  }
}

window.Specify = Specify;
window.consent = false;
window.specify = new Specify({
  advertiserKey: "test-production-key",
  getConsent: () => window.consent,
});

document.querySelector("button")?.addEventListener("click", () => {
  document.querySelector("output")?.replaceChildren("Host still works");
});

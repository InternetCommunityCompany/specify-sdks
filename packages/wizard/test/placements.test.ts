import { describe, expect, it } from "vitest";
import { parsePlacements } from "../src/placements";

const PLAN = `## What I found

A Next.js app with the App Router.

## Placements

- \`app/page.tsx\` - above the fold on the home page
* \`app/blog/[slug]/page.tsx\` - between the article and the footer

## Notes

- Nothing here is a placement.
`;

describe("parsePlacements", () => {
  it("takes each list item under the placements heading as written", () => {
    expect(parsePlacements(PLAN)).toEqual([
      "`app/page.tsx` - above the fold on the home page",
      "`app/blog/[slug]/page.tsx` - between the article and the footer",
    ]);
  });

  it("reads any heading level and any wording that mentions placements", () => {
    const plan = "#### Suggested ad placements\n  - Sidebar, on every page\n";

    expect(parsePlacements(plan)).toEqual(["Sidebar, on every page"]);
  });

  it("returns nothing when the plan ignores the suggested shape", () => {
    const plan = "# Adding Specify\n\nI would put an ad in app/page.tsx.\n";

    expect(parsePlacements(plan)).toEqual([]);
  });

  it("keeps one entry when a plan lists the same placement twice", () => {
    const plan = "## Placements\n- `app/page.tsx`\n- `app/page.tsx`\n";

    expect(parsePlacements(plan)).toEqual(["`app/page.tsx`"]);
  });
});

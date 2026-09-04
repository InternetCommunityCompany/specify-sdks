export interface IntegrationPlan {
  changes: {
    path: string;
    action: "create" | "modify";
    summary: string;
  }[];
  clientModule: { path: string; reason: string };
  consent: {
    present: boolean;
    platform: string | null;
    decisionSite: string | null;
  };
  envFile: { path: string; variable: string };
  framework: "nextjs" | "react" | "vanilla" | "other";
  frameworkNotes: string;
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  placements: {
    file: string;
    imageFormat: "LANDSCAPE" | "LONG_BANNER" | "NO_IMAGE" | "SHORT_BANNER";
    adUnitId: string;
    reason: string;
  }[];
  typescript: boolean;
  wallets: {
    connected: boolean;
    library: string | null;
    connectionSite: string | null;
  };
}

const stringSchema = { type: "string" } as const;
const nullableStringSchema = { type: ["string", "null"] } as const;

export const integrationPlanSchema = {
  additionalProperties: false,
  properties: {
    changes: {
      items: {
        additionalProperties: false,
        properties: {
          action: { enum: ["create", "modify"], type: "string" },
          path: stringSchema,
          summary: stringSchema,
        },
        required: ["path", "action", "summary"],
        type: "object",
      },
      type: "array",
    },
    clientModule: {
      additionalProperties: false,
      properties: { path: stringSchema, reason: stringSchema },
      required: ["path", "reason"],
      type: "object",
    },
    consent: {
      additionalProperties: false,
      properties: {
        decisionSite: nullableStringSchema,
        platform: nullableStringSchema,
        present: { type: "boolean" },
      },
      required: ["present", "platform", "decisionSite"],
      type: "object",
    },
    envFile: {
      additionalProperties: false,
      properties: { path: stringSchema, variable: stringSchema },
      required: ["path", "variable"],
      type: "object",
    },
    framework: {
      enum: ["nextjs", "react", "vanilla", "other"],
      type: "string",
    },
    frameworkNotes: stringSchema,
    packageManager: {
      enum: ["npm", "pnpm", "yarn", "bun"],
      type: "string",
    },
    placements: {
      items: {
        additionalProperties: false,
        properties: {
          adUnitId: stringSchema,
          file: stringSchema,
          imageFormat: {
            enum: ["LANDSCAPE", "LONG_BANNER", "NO_IMAGE", "SHORT_BANNER"],
            type: "string",
          },
          reason: stringSchema,
        },
        required: ["file", "imageFormat", "adUnitId", "reason"],
        type: "object",
      },
      type: "array",
    },
    typescript: { type: "boolean" },
    wallets: {
      additionalProperties: false,
      properties: {
        connected: { type: "boolean" },
        connectionSite: nullableStringSchema,
        library: nullableStringSchema,
      },
      required: ["connected", "library", "connectionSite"],
      type: "object",
    },
  },
  required: [
    "framework",
    "frameworkNotes",
    "packageManager",
    "typescript",
    "clientModule",
    "envFile",
    "consent",
    "wallets",
    "placements",
    "changes",
  ],
  type: "object",
} as const satisfies Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(
  value: unknown,
  keys: readonly string[],
  location: string
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${location} must be an object.`);
  }
  const actualKeys = Object.keys(value);
  if (
    actualKeys.length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error(`${location} has an invalid shape.`);
  }
  return value;
}

function string(value: unknown, location: string): string {
  if (typeof value !== "string") {
    throw new Error(`${location} must be a string.`);
  }
  return value;
}

function nullableString(value: unknown, location: string): string | null {
  return value === null ? null : string(value, location);
}

function boolean(value: unknown, location: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${location} must be a boolean.`);
  }
  return value;
}

function oneOf<const Value extends string>(
  value: unknown,
  choices: readonly Value[],
  location: string
): Value {
  if (typeof value !== "string" || !choices.some((item) => item === value)) {
    throw new Error(`${location} has an unsupported value.`);
  }
  return value as Value;
}

export function parseIntegrationPlan(value: unknown): IntegrationPlan {
  const plan = record(
    value,
    [
      "framework",
      "frameworkNotes",
      "packageManager",
      "typescript",
      "clientModule",
      "envFile",
      "consent",
      "wallets",
      "placements",
      "changes",
    ],
    "Integration plan"
  );
  const clientModule = record(
    plan.clientModule,
    ["path", "reason"],
    "clientModule"
  );
  const envFile = record(plan.envFile, ["path", "variable"], "envFile");
  const consent = record(
    plan.consent,
    ["present", "platform", "decisionSite"],
    "consent"
  );
  const wallets = record(
    plan.wallets,
    ["connected", "library", "connectionSite"],
    "wallets"
  );
  if (!(Array.isArray(plan.placements) && Array.isArray(plan.changes))) {
    throw new Error("Integration plan placements and changes must be arrays.");
  }

  return {
    changes: plan.changes.map((rawChange, index) => {
      const change = record(
        rawChange,
        ["path", "action", "summary"],
        `changes[${index}]`
      );
      return {
        action: oneOf(change.action, ["create", "modify"], "change.action"),
        path: string(change.path, "change.path"),
        summary: string(change.summary, "change.summary"),
      };
    }),
    clientModule: {
      path: string(clientModule.path, "clientModule.path"),
      reason: string(clientModule.reason, "clientModule.reason"),
    },
    consent: {
      decisionSite: nullableString(
        consent.decisionSite,
        "consent.decisionSite"
      ),
      platform: nullableString(consent.platform, "consent.platform"),
      present: boolean(consent.present, "consent.present"),
    },
    envFile: {
      path: string(envFile.path, "envFile.path"),
      variable: string(envFile.variable, "envFile.variable"),
    },
    framework: oneOf(
      plan.framework,
      ["nextjs", "react", "vanilla", "other"],
      "framework"
    ),
    frameworkNotes: string(plan.frameworkNotes, "frameworkNotes"),
    packageManager: oneOf(
      plan.packageManager,
      ["npm", "pnpm", "yarn", "bun"],
      "packageManager"
    ),
    placements: plan.placements.map((rawPlacement, index) => {
      const placement = record(
        rawPlacement,
        ["file", "imageFormat", "adUnitId", "reason"],
        `placements[${index}]`
      );
      return {
        adUnitId: string(placement.adUnitId, "placement.adUnitId"),
        file: string(placement.file, "placement.file"),
        imageFormat: oneOf(
          placement.imageFormat,
          ["LANDSCAPE", "LONG_BANNER", "NO_IMAGE", "SHORT_BANNER"],
          "placement.imageFormat"
        ),
        reason: string(placement.reason, "placement.reason"),
      };
    }),
    typescript: boolean(plan.typescript, "typescript"),
    wallets: {
      connected: boolean(wallets.connected, "wallets.connected"),
      connectionSite: nullableString(
        wallets.connectionSite,
        "wallets.connectionSite"
      ),
      library: nullableString(wallets.library, "wallets.library"),
    },
  };
}

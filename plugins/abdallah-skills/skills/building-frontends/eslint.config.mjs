// ESLint 9 flat config — Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import i18next from "eslint-plugin-i18next";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier/flat";

// ---------------------------------------------------------------------------
// Shared file globs
// ---------------------------------------------------------------------------
const SOURCE = ["app/**/*.{ts,tsx,js,jsx}", "src/**/*.{ts,tsx,js,jsx}"];
const TS = ["**/*.{ts,tsx,mts,cts}"];
const TESTS = [
  "**/*.{test,spec}.{ts,tsx,js,jsx}",
  "**/__tests__/**",
  "e2e/**",
  "tests/**",
];
const CONFIGS = ["*.config.{js,mjs,cjs,ts,mts}", "**/*.config.{js,mjs,cjs,ts,mts}"];
const UI_KIT = ["src/components/ui/**"];
const API_LAYER = ["src/lib/**"];

// ---------------------------------------------------------------------------
// Class-string helpers (shared by the Tailwind rules)
// ---------------------------------------------------------------------------
const CLASS_FUNCTIONS = new Set(["cn", "clsx", "cva", "twMerge", "classnames", "cx"]);
const CLASS_ATTRS = new Set(["className", "class"]);

/** Collect every string fragment (Literal / TemplateLiteral quasi) reachable in a class expression. */
function collectStrings(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") out.push({ node, value: node.value });
      break;
    case "TemplateLiteral":
      for (const q of node.quasis) out.push({ node: q, value: q.value.cooked ?? q.value.raw });
      for (const e of node.expressions) collectStrings(e, out);
      break;
    case "JSXExpressionContainer":
      collectStrings(node.expression, out);
      break;
    case "ConditionalExpression":
      collectStrings(node.consequent, out);
      collectStrings(node.alternate, out);
      break;
    case "LogicalExpression":
    case "BinaryExpression":
      collectStrings(node.left, out);
      collectStrings(node.right, out);
      break;
    case "ArrayExpression":
      for (const el of node.elements) collectStrings(el, out);
      break;
    case "ObjectExpression": // clsx({ "pl-4": cond }) / cva variants
      for (const p of node.properties) {
        if (p.type !== "Property") continue;
        if (p.key.type === "Literal") collectStrings(p.key, out);
        collectStrings(p.value, out);
      }
      break;
    case "CallExpression": // nested cn(...) — handled by its own visitor, skip here
      break;
    case "TSAsExpression":
    case "TSSatisfiesExpression":
      collectStrings(node.expression, out);
      break;
    default:
      break;
  }
  return out;
}

function calleeName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") return callee.property.name;
  return null;
}

/** Visitor factory: call `check(fragment)` for each class-string fragment in className attrs and cn()/clsx()/cva()/twMerge() args. */
function classStringVisitors(check) {
  return {
    JSXAttribute(node) {
      if (node.name.type === "JSXIdentifier" && CLASS_ATTRS.has(node.name.name) && node.value) {
        for (const f of collectStrings(node.value)) check(f);
      }
    },
    CallExpression(node) {
      const name = calleeName(node.callee);
      if (name && CLASS_FUNCTIONS.has(name)) {
        for (const arg of node.arguments) for (const f of collectStrings(arg)) check(f);
      }
    },
  };
}

/** Strip variant prefixes (md:, hover:, [&>*]:), important (!) and negative (-) markers. */
function baseUtility(token) {
  let depth = 0;
  let lastColon = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === ":" && depth === 0) lastColon = i;
  }
  let u = token.slice(lastColon + 1);
  u = u.replace(/^!/, "").replace(/!$/, "");
  u = u.replace(/^-/, "");
  return u;
}

// Physical → logical map. Order matters: longer prefixes first.
const PHYSICAL = [
  ["scroll-ml", "scroll-ms"], ["scroll-mr", "scroll-me"],
  ["scroll-pl", "scroll-ps"], ["scroll-pr", "scroll-pe"],
  ["rounded-tl", "rounded-ss"], ["rounded-tr", "rounded-se"],
  ["rounded-bl", "rounded-es"], ["rounded-br", "rounded-ee"],
  ["rounded-l", "rounded-s"], ["rounded-r", "rounded-e"],
  ["border-l", "border-s"], ["border-r", "border-e"],
  ["pl", "ps"], ["pr", "pe"], ["ml", "ms"], ["mr", "me"],
  ["left", "start"], ["right", "end"],
];

function physicalFix(util) {
  if (util === "text-left") return "text-start";
  if (util === "text-right") return "text-end";
  for (const [phys, logical] of PHYSICAL) {
    // exact (rounded-l, border-r) or followed by "-" (pl-4, left-0, border-l-2, rounded-tl-lg)
    if (util === phys || util.startsWith(`${phys}-`)) {
      // `left`/`right` only exist with a value (left-0); bare pl/ml etc. are not classes
      if ((phys === "left" || phys === "right" || /^(p|m)[lr]$|^scroll-/.test(phys)) && util === phys) return null;
      return logical + util.slice(phys.length);
    }
  }
  return null;
}

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
const COLOR_PREFIX =
  "bg|text|border(?:-[xytrblse])?|ring|ring-offset|fill|stroke|from|via|to|outline|divide|placeholder|caret|accent|shadow|decoration";
const PALETTE_RE = new RegExp(`^(?:${COLOR_PREFIX})-(?:${PALETTE})(?:-\\d{2,3})?(?:/(?:\\d{1,3}|\\[[^\\]]+\\]))?$`);
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/;

const localPlugin = {
  meta: { name: "local" },
  rules: {
    "no-physical-direction": {
      meta: {
        type: "problem",
        docs: { description: "Ban physical Tailwind direction utilities; use logical ones so RTL mirrors." },
        messages: {
          physical: "'{{token}}' is a physical direction utility and breaks RTL. Use the logical utility '{{fix}}' instead.",
        },
        schema: [],
      },
      create(context) {
        return classStringVisitors(({ node, value }) => {
          for (const token of value.split(/\s+/).filter(Boolean)) {
            const util = baseUtility(token);
            const fixedUtil = physicalFix(util);
            if (fixedUtil) {
              const at = token.lastIndexOf(util);
              const fix = token.slice(0, at) + fixedUtil + token.slice(at + util.length);
              context.report({ node, messageId: "physical", data: { token, fix } });
            }
          }
        });
      },
    },
    "no-raw-colors": {
      meta: {
        type: "problem",
        docs: { description: "Ban raw hex / Tailwind palette colours; use semantic design tokens." },
        messages: {
          hex: "Raw hex colour in '{{token}}'. Use a semantic token class (e.g. bg-primary, text-muted-foreground) or a CSS variable.",
          palette: "'{{token}}' uses the raw Tailwind palette. Use a semantic token class (e.g. bg-primary, text-muted-foreground, border-border).",
          styleHex: "Raw hex colour '{{value}}' in style object. Use a CSS variable (e.g. var(--primary)) or a token class.",
        },
        schema: [],
      },
      create(context) {
        const classVisitors = classStringVisitors(({ node, value }) => {
          for (const token of value.split(/\s+/).filter(Boolean)) {
            const util = baseUtility(token);
            if (HEX_RE.test(token)) context.report({ node, messageId: "hex", data: { token } });
            else if (PALETTE_RE.test(util)) context.report({ node, messageId: "palette", data: { token } });
          }
        });
        const checkStyleObject = (obj) => {
          for (const p of obj.properties) {
            if (p.type !== "Property") continue;
            for (const f of collectStrings(p.value)) {
              if (HEX_RE.test(f.value)) context.report({ node: f.node, messageId: "styleHex", data: { value: f.value } });
            }
            if (p.value.type === "ObjectExpression") checkStyleObject(p.value);
          }
        };
        return {
          ...classVisitors,
          JSXAttribute(node) {
            classVisitors.JSXAttribute(node);
            if (
              node.name.type === "JSXIdentifier" &&
              node.name.name === "style" &&
              node.value?.type === "JSXExpressionContainer" &&
              node.value.expression.type === "ObjectExpression"
            ) {
              checkStyleObject(node.value.expression);
            }
          },
          // const styles: CSSProperties = { color: "#fff" }
          VariableDeclarator(node) {
            const ann = node.id.typeAnnotation?.typeAnnotation;
            const typeName = ann?.type === "TSTypeReference" ? context.sourceCode.getText(ann.typeName) : "";
            if (/CSSProperties$/.test(typeName) && node.init?.type === "ObjectExpression") checkStyleObject(node.init);
          },
        };
      },
    },
  },
};

// Rule 6 — native controls (outside src/components/ui/)
const NATIVE_INPUT_TYPES = {
  checkbox: "<Checkbox> (@/components/ui/checkbox)",
  radio: "<RadioGroup>/<RadioGroupItem> (@/components/ui/radio-group)",
  date: "<DatePicker> built on <Calendar> + <Popover> (@/components/ui/calendar)",
  "datetime-local": "<DatePicker> + time field built on <Calendar> (@/components/ui/calendar)",
  time: "a time picker built on shadcn <Input>/<Select> (@/components/ui)",
  file: "a file-upload component built on shadcn <Button>/<Input> (@/components/ui)",
  range: "<Slider> (@/components/ui/slider)",
  color: "a colour picker built on shadcn <Popover> (@/components/ui/popover)",
};
const nativeControlSelectors = [
  {
    selector: "JSXOpeningElement[name.name='select']",
    message: "Native <select> is banned. Use shadcn <Select> (@/components/ui/select).",
  },
  {
    selector: "JSXOpeningElement[name.name='progress']",
    message: "Native <progress> is banned. Use shadcn <Progress> (@/components/ui/progress).",
  },
  {
    selector: "JSXOpeningElement[name.name='details']",
    message: "Native <details> is banned. Use shadcn <Collapsible> or <Accordion> (@/components/ui/collapsible).",
  },
  ...Object.entries(NATIVE_INPUT_TYPES).map(([type, replacement]) => ({
    selector: `JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value='${type}']`,
    message: `Native <input type="${type}"> is banned. Use shadcn ${replacement}.`,
  })),
];

export default defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts", "coverage/**"]),

  // 1. Next.js core-web-vitals + typescript (native flat configs in eslint-config-next >= 16)
  ...nextVitals,
  ...nextTs,

  // 2. typescript-eslint with type information — only the listed type-aware rules
  {
    files: TS,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // 3. No hard-coded user-facing JSX text (app/ + src/, not tests/config)
  {
    files: SOURCE,
    ignores: [...TESTS, ...CONFIGS],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": ["error", { mode: "jsx-text-only" }],
    },
  },

  // 4. Physical direction utilities (everywhere in app/ + src/, including ui kit)
  // 5. Raw colours (outside src/components/ui/)
  {
    files: SOURCE,
    plugins: { local: localPlugin },
    rules: { "local/no-physical-direction": "error" },
  },
  {
    files: SOURCE,
    ignores: UI_KIT,
    plugins: { local: localPlugin },
    rules: { "local/no-raw-colors": "error" },
  },

  // 6. Native form controls (outside src/components/ui/)
  {
    files: SOURCE,
    ignores: UI_KIT,
    rules: { "no-restricted-syntax": ["error", ...nativeControlSelectors] },
  },

  // 7. fetch() only in the API layer (src/lib/)
  {
    files: SOURCE,
    ignores: API_LAYER,
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Don't call fetch() directly. Go through the API layer in src/lib/." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "fetch", message: "Don't call fetch() directly. Go through the API layer in src/lib/." },
        { object: "globalThis", property: "fetch", message: "Don't call fetch() directly. Go through the API layer in src/lib/." },
        { object: "self", property: "fetch", message: "Don't call fetch() directly. Go through the API layer in src/lib/." },
      ],
    },
  },

  // 8. Feature boundaries: src/features/<a> may not import src/features/<b>
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
      },
      "boundaries/elements": [
        { type: "feature", pattern: "src/features/*", capture: ["featureName"] },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { element: { type: "feature" } },
              disallow: {
                to: {
                  element: {
                    type: "feature",
                    captured: { featureName: "!{{ from.element.captured.featureName }}" },
                  },
                },
              },
              message:
                "Features must not import from other features. Move shared code to src/components or src/lib, or compose features in app/.",
            },
          ],
        },
      ],
    },
  },

  // 9. Prettier last — turns off stylistic rules that conflict with Prettier
  prettier,
]);

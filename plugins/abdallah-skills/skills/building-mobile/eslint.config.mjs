// ESLint 9 flat config — Expo (expo-router) + React Native + TypeScript + NativeWind + React Native Reusables
import { defineConfig, globalIgnores } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";
import { parser as tsParser, plugin as tsPlugin } from "typescript-eslint";
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
const UI_KIT = ["src/ui/**"];
const API_LAYER = ["src/lib/**"];
const SCREENS = ["app/**/*.{ts,tsx,js,jsx}", "src/features/**/*.{ts,tsx,js,jsx}"];

// ---------------------------------------------------------------------------
// Class-string helpers (NativeWind className / *ClassName props, cn()/clsx()/cva())
// ---------------------------------------------------------------------------
const CLASS_FUNCTIONS = new Set(["cn", "clsx", "cva", "twMerge", "classnames", "cx"]);
// className, contentContainerClassName, columnWrapperClassName, ... (NativeWind cssInterop props)
const isClassAttr = (name) => name === "class" || /[cC]lassName$/.test(name);
// style, contentContainerStyle, columnWrapperStyle, ...
const isStyleAttr = (name) => name === "style" || /Style$/.test(name);
// Typed style variables: const s: ViewStyle = { ... }
const STYLE_TYPE_RE = /(?:ViewStyle|TextStyle|ImageStyle|StyleProp)$/;

/** Collect every string fragment (Literal / TemplateLiteral quasi) reachable in an expression. */
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
    case "ObjectExpression": // clsx({ "pl-4": cond }) / cva variants / nested style objects
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

/** Visitor factory: call `check(fragment)` for each class-string fragment in className props and cn()/clsx()/cva() args. */
function classStringVisitors(check) {
  return {
    JSXAttribute(node) {
      if (node.name.type === "JSXIdentifier" && isClassAttr(node.name.name) && node.value) {
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

/** Strip variant prefixes (ios:, dark:, active:), important (!) and negative (-) markers. */
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

// ---------------------------------------------------------------------------
// Style-object helpers (style={{...}}, style={[...]}, StyleSheet.create({...}), typed ViewStyle vars)
// ---------------------------------------------------------------------------
const propKey = (p) =>
  p.type === "Property" && !p.computed
    ? p.key.type === "Identifier"
      ? p.key.name
      : p.key.type === "Literal"
        ? String(p.key.value)
        : null
    : null;

/** Collect the style ObjectExpressions reachable from a style prop value (arrays, conditionals, `cond && {...}`). */
function styleObjects(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case "ObjectExpression":
      out.push(node);
      break;
    case "JSXExpressionContainer":
    case "TSAsExpression":
    case "TSSatisfiesExpression":
      styleObjects(node.expression, out);
      break;
    case "ArrayExpression":
      for (const el of node.elements) styleObjects(el, out);
      break;
    case "ConditionalExpression":
      styleObjects(node.consequent, out);
      styleObjects(node.alternate, out);
      break;
    case "LogicalExpression":
      styleObjects(node.left, out);
      styleObjects(node.right, out);
      break;
    case "ArrowFunctionExpression": // Pressable style={({ pressed }) => [...]}
      if (node.body.type !== "BlockStatement") styleObjects(node.body, out);
      break;
    default:
      break;
  }
  return out;
}

/** Visitor factory: call `check(styleObject)` for every style object literal in the file. */
function styleObjectVisitors(check) {
  return {
    JSXAttribute(node) {
      if (node.name.type === "JSXIdentifier" && isStyleAttr(node.name.name) && node.value) {
        for (const obj of styleObjects(node.value)) check(obj);
      }
    },
    // StyleSheet.create({ container: { ... } })
    CallExpression(node) {
      const c = node.callee;
      if (
        c.type === "MemberExpression" &&
        c.object.type === "Identifier" &&
        c.object.name === "StyleSheet" &&
        c.property.type === "Identifier" &&
        c.property.name === "create" &&
        node.arguments[0]?.type === "ObjectExpression"
      ) {
        for (const p of node.arguments[0].properties) {
          if (p.type === "Property") for (const obj of styleObjects(p.value)) check(obj);
        }
      }
    },
    // const s: ViewStyle = { ... }
    VariableDeclarator(node, context) {
      const ann = node.id.typeAnnotation?.typeAnnotation;
      const typeName = ann?.type === "TSTypeReference" ? context.sourceCode.getText(ann.typeName) : "";
      if (STYLE_TYPE_RE.test(typeName)) for (const obj of styleObjects(node.init)) check(obj);
    },
  };
}

function withContext(visitors, context) {
  return {
    ...visitors,
    VariableDeclarator: (node) => visitors.VariableDeclarator(node, context),
  };
}

/** Merge several visitor maps, running every handler for a shared node type. */
function mergeVisitors(...maps) {
  const merged = {};
  for (const m of maps) {
    for (const [k, fn] of Object.entries(m)) {
      const prev = merged[k];
      merged[k] = prev ? (n) => (prev(n), fn(n)) : fn;
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Rule data
// ---------------------------------------------------------------------------

// Physical → logical NativeWind class map. Order matters: longer prefixes first.
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
    if (util === phys || util.startsWith(`${phys}-`)) {
      if ((phys === "left" || phys === "right" || /^(p|m)[lr]$|^scroll-/.test(phys)) && util === phys) return null;
      return logical + util.slice(phys.length);
    }
  }
  return null;
}

// Physical → logical React Native style keys.
const PHYSICAL_STYLE_KEYS = {
  marginLeft: "marginStart",
  marginRight: "marginEnd",
  paddingLeft: "paddingStart",
  paddingRight: "paddingEnd",
  left: "start",
  right: "end",
  borderLeftWidth: "borderStartWidth",
  borderRightWidth: "borderEndWidth",
  borderLeftColor: "borderStartColor",
  borderRightColor: "borderEndColor",
  borderTopLeftRadius: "borderTopStartRadius",
  borderTopRightRadius: "borderTopEndRadius",
  borderBottomLeftRadius: "borderBottomStartRadius",
  borderBottomRightRadius: "borderBottomEndRadius",
};

// Spacing / typography keys that must come from tokens, not raw numbers.
const SIZE_KEYS = new Set([
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "marginStart", "marginEnd",
  "marginHorizontal", "marginVertical", "marginBlock", "marginBlockStart", "marginBlockEnd",
  "marginInline", "marginInlineStart", "marginInlineEnd",
  "padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "paddingStart", "paddingEnd",
  "paddingHorizontal", "paddingVertical", "paddingBlock", "paddingBlockStart", "paddingBlockEnd",
  "paddingInline", "paddingInlineStart", "paddingInlineEnd",
  "gap", "rowGap", "columnGap",
  "fontSize", "lineHeight", "letterSpacing",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
  "borderTopStartRadius", "borderTopEndRadius", "borderBottomStartRadius", "borderBottomEndRadius",
]);

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
const COLOR_PREFIX =
  "bg|text|border(?:-[xytrblse])?|ring|ring-offset|fill|stroke|from|via|to|outline|divide|placeholder|caret|accent|shadow|decoration|tint";
const PALETTE_RE = new RegExp(`^(?:${COLOR_PREFIX})-(?:${PALETTE})(?:-\\d{2,3})?(?:/(?:\\d{1,3}|\\[[^\\]]+\\]))?$`);
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/;
const FN_COLOR_RE = /\b(?:rgba?|hsla?|hwb)\(/i;
const isRawColor = (s) => HEX_RE.test(s) || FN_COLOR_RE.test(s);

/** Numeric literal (or -literal) that is not 0. */
function rawNumber(node) {
  if (node?.type === "Literal" && typeof node.value === "number") return node.value !== 0 ? node.value : null;
  if (node?.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "Literal" && typeof node.argument.value === "number")
    return node.argument.value !== 0 ? -node.argument.value : null;
  return null;
}

const localPlugin = {
  meta: { name: "local" },
  rules: {
    "no-physical-direction": {
      meta: {
        type: "problem",
        docs: { description: "Ban physical direction classes / style keys; use logical ones so RTL mirrors." },
        messages: {
          physical: "'{{token}}' is a physical direction class and breaks RTL. Use the logical class '{{fix}}' instead.",
          styleKey: "Style key '{{key}}' is physical and breaks RTL. Use '{{fix}}' instead.",
          textAlign: "textAlign '{{value}}' does not mirror in RTL. Use the NativeWind class 'text-start'/'text-end' (or omit textAlign so it follows the writing direction).",
        },
        schema: [],
      },
      create(context) {
        const classVisitors = classStringVisitors(({ node, value }) => {
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
        const styleVisitors = styleObjectVisitors((obj) => {
          for (const p of obj.properties) {
            const key = propKey(p);
            if (!key) continue;
            if (Object.hasOwn(PHYSICAL_STYLE_KEYS, key)) {
              context.report({ node: p.key, messageId: "styleKey", data: { key, fix: PHYSICAL_STYLE_KEYS[key] } });
            } else if (key === "textAlign") {
              for (const f of collectStrings(p.value)) {
                if (f.value === "left" || f.value === "right")
                  context.report({ node: f.node, messageId: "textAlign", data: { value: f.value } });
              }
            }
          }
        });
        return mergeVisitors(classVisitors, withContext(styleVisitors, context));
      },
    },

    "no-raw-colors": {
      meta: {
        type: "problem",
        docs: { description: "Ban raw hex / rgb / Tailwind palette colours; use semantic design tokens." },
        messages: {
          hex: "Raw colour in class '{{token}}'. Use a semantic token class (e.g. bg-primary, text-muted-foreground).",
          palette: "'{{token}}' uses the raw Tailwind palette. Use a semantic token class (e.g. bg-primary, text-muted-foreground, border-border).",
          styleColor: "Raw colour '{{value}}' in a style. Use a NativeWind token class (e.g. bg-primary) or a colour from the theme (`@/ui/theme`).",
          propColor: "Raw colour '{{value}}' in the '{{prop}}' prop. Use a colour from the theme (`@/ui/theme`).",
        },
        schema: [],
      },
      create(context) {
        const classVisitors = classStringVisitors(({ node, value }) => {
          for (const token of value.split(/\s+/).filter(Boolean)) {
            const util = baseUtility(token);
            if (isRawColor(token)) context.report({ node, messageId: "hex", data: { token } });
            else if (PALETTE_RE.test(util)) context.report({ node, messageId: "palette", data: { token } });
          }
        });
        const styleVisitors = styleObjectVisitors((obj) => {
          for (const f of collectStrings(obj)) {
            if (isRawColor(f.value)) context.report({ node: f.node, messageId: "styleColor", data: { value: f.value } });
          }
        });
        // color="#fff" / thumbColor / tintColor / placeholderTextColor / trackColor={{ true: "#..." }}
        const colorProps = {
          JSXAttribute(node) {
            if (node.name.type !== "JSXIdentifier" || !/colou?rs?$/i.test(node.name.name) || !node.value) return;
            for (const f of collectStrings(node.value)) {
              if (isRawColor(f.value))
                context.report({ node: f.node, messageId: "propColor", data: { value: f.value, prop: node.name.name } });
            }
          },
        };
        return mergeVisitors(classVisitors, withContext(styleVisitors, context), colorProps);
      },
    },

    "no-raw-sizes": {
      meta: {
        type: "problem",
        docs: { description: "Ban raw numeric spacing / typography values in styles; use tokens." },
        messages: {
          rawSize:
            "Raw size {{value}} for '{{key}}'. Use a NativeWind token class (e.g. p-4, gap-2, text-lg, rounded-md) or a value from the theme (`@/ui/theme`).",
        },
        schema: [],
      },
      create(context) {
        const styleVisitors = styleObjectVisitors((obj) => {
          for (const p of obj.properties) {
            const key = propKey(p);
            if (!key || !SIZE_KEYS.has(key)) continue;
            const n = rawNumber(p.value);
            if (n !== null) context.report({ node: p.value, messageId: "rawSize", data: { key, value: String(n) } });
          }
        });
        return withContext(styleVisitors, context);
      },
    },
  },
};

// Rule 2 — raw React Native controls (outside src/ui/): React Native Reusables replacements
const KIT_REPLACEMENTS = {
  Button: "<Button> from '@/ui/button'",
  Switch: "<Switch> from '@/ui/switch'",
  TextInput: "<Input> from '@/ui/input' (or <Textarea> from '@/ui/textarea')",
  ActivityIndicator: "a spinner from the kit (e.g. '@/ui/spinner') or <Skeleton> from '@/ui/skeleton'",
  Alert: "<AlertDialog> from '@/ui/alert-dialog'",
  Modal: "<Dialog> from '@/ui/dialog' (or <AlertDialog> from '@/ui/alert-dialog')",
  TouchableOpacity: "<Pressable> from 'react-native' (or <Button> from '@/ui/button')",
  TouchableHighlight: "<Pressable> from 'react-native' (or <Button> from '@/ui/button')",
  TouchableWithoutFeedback: "<Pressable> from 'react-native'",
};
const restrictedRnImports = [
  ...Object.entries(KIT_REPLACEMENTS).map(([name, replacement]) => ({
    name: "react-native",
    importNames: [name],
    message: `Raw React Native '${name}' is banned outside src/ui/. Use the kit component: ${replacement}.`,
  })),
  {
    name: "@react-native-picker/picker",
    message: "The raw RN Picker is banned outside src/ui/. Use <Select> from '@/ui/select'.",
  },
];

const FETCH_MESSAGE = "Don't call fetch() directly. Go through the API layer in src/lib/.";

export default defineConfig([
  globalIgnores([
    ".expo/**", "dist/**", "web-build/**", "android/**", "ios/**", "node_modules/**",
    "coverage/**", "expo-env.d.ts", "nativewind-env.d.ts",
  ]),

  // 1. Expo's flat config (core + typescript + react + expo plugin)
  ...expoConfig,
  {
    // Resolve the `@/*` tsconfig paths for eslint-plugin-import + boundaries
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
        node: true,
      },
    },
  },

  // typescript-eslint with type information — only the listed type-aware rules
  {
    files: TS,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // 2. Raw React Native controls (outside src/ui/)
  {
    files: SOURCE,
    ignores: UI_KIT,
    rules: { "no-restricted-imports": ["error", { paths: restrictedRnImports }] },
  },

  // 3. Raw colours (outside src/ui/)
  {
    files: SOURCE,
    ignores: UI_KIT,
    plugins: { local: localPlugin },
    rules: { "local/no-raw-colors": "error" },
  },

  // 4. Raw numeric spacing / typography in styles (screens: app/ + src/features/)
  {
    files: SCREENS,
    plugins: { local: localPlugin },
    rules: { "local/no-raw-sizes": "error" },
  },

  // 5. Physical direction classes / style keys (everywhere in app/ + src/, including the ui kit)
  {
    files: SOURCE,
    plugins: { local: localPlugin },
    rules: { "local/no-physical-direction": "error" },
  },

  // 6. No hard-coded user-facing JSX text (app/ + src/, not tests/config)
  {
    files: SOURCE,
    ignores: [...TESTS, ...CONFIGS],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": ["error", { mode: "jsx-text-only" }],
    },
  },

  // 7. fetch() only in the API layer (src/lib/)
  {
    files: SOURCE,
    ignores: API_LAYER,
    rules: {
      "no-restricted-globals": ["error", { name: "fetch", message: FETCH_MESSAGE }],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "fetch", message: FETCH_MESSAGE },
        { object: "globalThis", property: "fetch", message: FETCH_MESSAGE },
        { object: "global", property: "fetch", message: FETCH_MESSAGE },
        { object: "self", property: "fetch", message: FETCH_MESSAGE },
      ],
    },
  },

  // 8. Feature boundaries: src/features/<a> may not import src/features/<b>
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    plugins: { boundaries },
    settings: {
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
                "Features must not import from other features. Move shared code to src/ui or src/lib, or compose features in an app/ route.",
            },
          ],
        },
      ],
    },
  },

  // 9. Prettier last — turns off stylistic rules that conflict with Prettier
  prettier,
]);

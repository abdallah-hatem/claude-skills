// @ts-check
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/*
 * Several core rules (no-restricted-imports, no-restricted-properties,
 * no-restricted-syntax) REPLACE their options when a later block matches the
 * same file — they do not merge. So each zone below composes its full option
 * list from these shared pieces instead of relying on inheritance.
 */

const MSG_PRISMA_VALUE =
  'Value imports from @prisma/client belong only in repositories (src/domains/*/repositories, src/common/repositories) or src/database. Use `import type { ... } from \'@prisma/client\'` elsewhere and go through a repository for data access.';

const MSG_CONTROLLER_PRISMA =
  'Controllers must not import @prisma/client (not even types). Controllers delegate to services; return what the service returns and let it own persistence types.';

const MSG_CONTROLLER_DB =
  'Controllers must not import DatabaseService or anything under database/. Controllers delegate to services; services use repositories for data access.';

const MSG_PROCESS_ENV =
  'Do not read process.env outside src/config. Inject ConfigService (backed by src/config/configuration.ts) instead.';

const MSG_RAW_UNSAFE =
  'Unsafe raw SQL is banned: string-built queries are an injection risk. Use $queryRaw / $executeRaw with a tagged template (Prisma.sql) so values are parameterised.';

const prismaValueImportBan = {
  name: '@prisma/client',
  allowTypeImports: true,
  message: MSG_PRISMA_VALUE,
};

const processEnvImportBans = ['process', 'node:process'].map((name) => ({
  name,
  importNames: ['env'],
  message: MSG_PROCESS_ENV,
}));

const rawUnsafeBans = ['$queryRawUnsafe', '$executeRawUnsafe'].map(
  (property) => ({ property, message: MSG_RAW_UNSAFE }),
);

const processEnvPropertyBan = {
  object: 'process',
  property: 'env',
  message: MSG_PROCESS_ENV,
};

/** Zones where a value import of @prisma/client is legitimate. */
const PRISMA_ZONES = [
  'src/domains/*/repositories/**/*.ts',
  'src/database/**/*.ts',
  'src/common/repositories/**/*.ts',
];

/** Zones where process.env is legitimate. */
const ENV_ZONES = [
  'src/config/**/*.ts',
  'prisma.config.ts',
  'test/**/setup*.ts',
  'test/**/*.setup.ts',
];

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'generated/**'],
  },

  js.configs.recommended,

  // ---------------------------------------------------------------- 1. TS
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Type-checked rules that are clean on idiomatic Nest + Prisma code:
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      // Nest injects by constructor-parameter type; keep class imports as values.
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // 3. + 4. (default zone)
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: [prismaValueImportBan, ...processEnvImportBans] },
      ],
      // 4. + 5. (default zone)
      'no-restricted-properties': [
        'error',
        processEnvPropertyBan,
        ...rawUnsafeBans,
      ],
    },
  },

  // Plain JS (this config file etc.) — no type info.
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node } },
  },

  // ------------------------------------- 3. Prisma value imports allowed here
  {
    files: PRISMA_ZONES,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: [...processEnvImportBans] },
      ],
    },
  },

  // ----------------------------------------------- 4. process.env allowed here
  {
    files: ENV_ZONES,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { paths: [prismaValueImportBan] },
      ],
      'no-restricted-properties': ['error', ...rawUnsafeBans],
    },
  },

  // --------------------------------------------------------- 2. Controllers
  {
    files: ['**/*.controller.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@prisma/client', message: MSG_CONTROLLER_PRISMA },
            ...processEnvImportBans,
          ],
          patterns: [
            {
              group: [
                '**/database',
                '**/database/**',
                '@/database',
                '@/database/**',
              ],
              message: MSG_CONTROLLER_DB,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Decorator > CallExpression[callee.name=/^(Res|Response)$/]",
          message:
            'Do not inject the raw response with @Res()/@Response() in controllers. Controllers delegate to services and return values; throw HttpExceptions (NotFoundException, BadRequestException, ...) for error statuses and use @HttpCode() for success codes.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(status|sendStatus)$/]",
          message:
            'Do not set status codes on the response object in controllers. Throw HttpExceptions for errors and use @HttpCode() for success codes; controllers delegate to services.',
        },
      ],
    },
  },

  // ------------------------------------------------------------- 6. console
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': ['error'],
    },
  },
  {
    files: ['test/**', 'scripts/**'],
    rules: { 'no-console': 'off' },
  },

  // ---------------------------------------------- 7. Domain repository walls
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: './tsconfig.json' },
        node: true,
      },
      'boundaries/elements': [
        // Order matters: first match wins.
        {
          type: 'domain-repository',
          pattern: 'src/domains/*/repositories',
          capture: ['domain'],
        },
        { type: 'domain', pattern: 'src/domains/*', capture: ['domain'] },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          message:
            "Domain '{{from.element.captured.domain}}' must not import repositories of domain '{{to.element.captured.domain}}'. Inject that domain's service (exported from its module) instead.",
          policies: [
            {
              from: {
                element: {
                  types: { anyOf: ['domain', 'domain-repository'] },
                },
              },
              disallow: {
                to: {
                  element: {
                    type: 'domain-repository',
                    captured: {
                      domain: '!{{ from.element.captured.domain }}',
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    },
  },

  // 8. Must be last: turns off stylistic rules that fight Prettier.
  prettier,
);

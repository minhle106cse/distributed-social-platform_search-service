// @ts-check
import eslint from '@eslint/js'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'src/generated/**',
      'generated/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Architectural boundary enforcement (Hexagonal / Clean Architecture).
  // See directives/folder_structure_sop.md + eventing_patterns.md.
  // ───────────────────────────────────────────────────────────────────────────

  // Domain — pure TypeScript. shared-kernel + same-domain relative imports only.
  {
    files: ['src/modules/*/domain/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                'fastify',
                'prisma',
                '@prisma/*',
                '@/generated',
                '@/generated/**',
                '@/infrastructure/**',
                '@/common/**',
                '@/modules/*/application/**',
                '@/modules/*/infrastructure/**',
                '@/modules/*/presentation/**',
              ],
              message:
                'Domain phải pure TypeScript: chỉ shared-kernel + relative cùng domain. Cấm framework (NestJS/Fastify), ORM (Prisma/generated), và mọi tầng ngoài.',
            },
          ],
        },
      ],
    },
  },

  // Application — orchestrates via interfaces. No ORM/HTTP/DB; no HTTP exceptions.
  {
    files: ['src/modules/*/application/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@nestjs/common',
              importNames: [
                'NotFoundException',
                'BadRequestException',
                'ForbiddenException',
                'UnauthorizedException',
                'ConflictException',
                'GoneException',
                'HttpException',
                'InternalServerErrorException',
                'UnprocessableEntityException',
                'NotAcceptableException',
              ],
              message:
                'Application không được throw HTTP exception. Dùng ApplicationError subclass — GlobalExceptionFilter sẽ map statusCode.',
            },
          ],
          patterns: [
            {
              group: [
                'prisma',
                '@prisma/*',
                '@/generated',
                '@/generated/**',
                'fastify',
                '@/infrastructure/database/**',
                '@/infrastructure/http/**',
              ],
              message:
                'Application không được phụ thuộc ORM/HTTP/DB. Dùng repository interface; infra hợp lệ duy nhất là @/infrastructure/kafka và @/infrastructure/cqrs.',
            },
          ],
        },
      ],
    },
  },

  // Presentation — translate HTTP <-> handlers. Never touch the ORM/DB.
  {
    files: ['src/modules/*/presentation/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'prisma',
                '@prisma/*',
                '@/generated',
                '@/generated/**',
                '@/infrastructure/database/**',
              ],
              message: 'Presentation không được chạm ORM/DB trực tiếp.',
            },
          ],
        },
      ],
    },
  },

  // Relax strict type rules inside test files (Jest mocks are inherently loosely typed).
  // Mirrors the block auth-service has had all along — its absence here is why
  // `unbound-method` alone accounted for 81 of the 261 pre-existing lint errors
  // (2026-08-21 audit): `expect(mock.method).toHaveBeenCalled()` trips it by design,
  // and that is the standard Jest assertion, not a defect worth 81 rewrites.
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-empty': 'off',
    },
  },

)

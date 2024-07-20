import { type CodegenConfig } from '@graphql-codegen/cli';

export default {
  watch: true,
  overwrite: true,
  emitLegacyCommonJSImports: false,
  schema: '../finance-data-service/src/initGqlSchema/**/*.graphql',
  generates: {
    '../finance-data-service/src/generated/graphql-schema.d.ts': {
      plugins: [
        'typescript',
        'typescript-resolvers',
        { add: { content: "import { DeepPartial } from 'utility-types';" } },
      ],
      config: {
        useIndexSignature: false,
        enumsAsTypes: true,
        contextType: '../initGqlSchema/appGqlContext.ts#AppGqlContextValue',
        defaultMapper: 'DeepPartial<{T}>',
        mappers: {
          // SymbolHolding: '../SymbolHoldingModel#SymbolHoldingModel',
        },
      },
    },
  },
} satisfies CodegenConfig;

import { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  watch: true,
  emitLegacyCommonJSImports: true,
  schema: 'http://127.0.0.1:3001/graphql',
  documents: ['./src/**/*.tsx'],
  ignoreNoDocuments: true, // for better experience with the watcher
  generates: {
    './src/generated/gql/': { preset: 'client' },
  },
};

export default config;

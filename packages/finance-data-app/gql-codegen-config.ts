import dotenv from 'dotenv';
dotenv.config({ path: `${__dirname}/.env.local` });
import { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  watch: true,
  emitLegacyCommonJSImports: true,
  schema: `${process.env.VITE_API_URL}/graphql`,
  documents: ['./src/**/*.{ts,tsx}'],
  ignoreNoDocuments: true, // for better experience with the watcher
  generates: {
    './src/generated/gql/': { preset: 'client' },
  },
};

export default config;

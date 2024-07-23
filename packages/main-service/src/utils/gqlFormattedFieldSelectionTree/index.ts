import { DeepNonNullable } from 'utility-types';
import {
  responsePathAsArray,
  Kind,
  getArgumentValues,
  isObjectType,
  getNamedType,
  type GraphQLResolveInfo,
  type FieldNode,
  type GraphQLNamedOutputType,
  type SelectionNode,
} from 'graphql/index.js';
import type { Resolver, Resolvers } from '../../generated/graphql-schema.d.js';

export { gqlFormattedFieldSelectionTree };

function gqlFormattedFieldSelectionTree<TPossibleFields extends {}>(
  gqlResolveInfo: GraphQLResolveInfo
): FieldSelectionNode<TPossibleFields> {
  const operationBasePath = responsePathAsArray(gqlResolveInfo.path);

  let currGqlSelectionsArr = gqlResolveInfo.operation.selectionSet.selections;

  for (const currPathKey of operationBasePath) {
    const nextGqlSelectionsArr = currGqlSelectionsArr.find(
      (selection): selection is FieldNode =>
        selection.kind === Kind.FIELD && selection.name.value === currPathKey
    )?.selectionSet?.selections;

    if (nextGqlSelectionsArr === undefined) {
      break;
    }
    currGqlSelectionsArr = nextGqlSelectionsArr;
  }

  const gqlBaseSelectionArr = currGqlSelectionsArr;
  const gqlBaseReturnTypeDef = getNamedType(gqlResolveInfo.returnType);
  const formattedSelectionTreeResult = {} as Record<string, { subFields: {}; args: {} }>;

  (function recurse(
    currGqlSelectionsArr: readonly SelectionNode[],
    currGqlParentCurrFieldDef: GraphQLNamedOutputType,
    currResultNode: Record<string, { subFields: {}; args: {} }>
  ) {
    const currChildFieldMap = isObjectType(currGqlParentCurrFieldDef)
      ? currGqlParentCurrFieldDef.getFields()
      : {};

    for (const sel of currGqlSelectionsArr) {
      if (sel.kind === Kind.FIELD) {
        const selFieldDef = currChildFieldMap[sel.name.value];

        const newResultNode = {
          subFields: {},
          args: getArgumentValues(selFieldDef, sel),
        };

        currResultNode[sel.name.value] = newResultNode;

        gqlResolveInfo.schema.getType(selFieldDef.name);

        const selFieldTypeUnwrapped = getNamedType(selFieldDef.type);

        if (sel.selectionSet && isObjectType(selFieldTypeUnwrapped)) {
          recurse(sel.selectionSet.selections, selFieldTypeUnwrapped, newResultNode.subFields);
        }
      }
    }
  })(gqlBaseSelectionArr, gqlBaseReturnTypeDef, formattedSelectionTreeResult);

  return formattedSelectionTreeResult as FieldSelectionNode<TPossibleFields>;
}

type FieldSelectionNode<TPossibleFields, TCurrTypename extends string = ''> = {
  [K in keyof FlattenArrayType<TPossibleFields>]?: {
    subFields: FlattenArrayType<NonNullable<FlattenArrayType<TPossibleFields>[K]>> extends {
      __typename?: string;
    }
      ? FieldSelectionNode<
          NonNullable<FlattenArrayType<TPossibleFields>[K]>,
          NonNullable<
            FlattenArrayType<NonNullable<FlattenArrayType<TPossibleFields>[K]>>['__typename']
          >
        >
      : {};

    args: (AllResolvers & Record<string, never>)[TCurrTypename][K] extends Resolver<
      any,
      any,
      any,
      infer Args
    >
      ? Args
      : never;
  };
};

// type FlattenedNonNullable<T> = NonNullable<FlattenArrayType<NonNullable<FlattenArrayType<T>>>>;

type FlattenArrayType<T> = T extends unknown[] ? T[number] : T;

type AllResolvers = DeepNonNullable<Resolvers>;

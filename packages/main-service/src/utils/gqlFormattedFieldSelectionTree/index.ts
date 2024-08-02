import { type DeepNonNullable } from 'utility-types';
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
import { type Resolver, type Resolvers } from '../../generated/graphql-schema.d.js';

export { gqlFormattedFieldSelectionTree };

function gqlFormattedFieldSelectionTree<TPossibleFields extends {} | undefined | null>(
  gqlResolveInfo: GraphQLResolveInfo
): FieldSelectionNode<DeepNonNullable<TPossibleFields>> {
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

  return formattedSelectionTreeResult as FieldSelectionNode<DeepNonNullable<TPossibleFields>>;
}

type FieldSelectionNode<TFieldTree, TCurrTypename extends string = ''> =
  TFieldTree extends Exclude<infer FieldTreeNonNull, undefined | null>
    ? {
        [K in keyof FlattenArrayType<FieldTreeNonNull>]?: {
          subFields: FlattenArrayType<FlattenArrayType<FieldTreeNonNull>[K]> extends {
            __typename?: string;
          }
            ? FieldSelectionNode<
                FlattenArrayType<FieldTreeNonNull>[K],
                NonNullable<FlattenArrayType<FlattenArrayType<FieldTreeNonNull>[K]>['__typename']>
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
      }
    : never;

// type FlattenedNonNullable<T> = NonNullable<FlattenArrayType<NonNullable<FlattenArrayType<T>>>>;

type FlattenArrayType<T> = T extends unknown[] ? T[number] : T;

type AllResolvers = DeepNonNullable<Resolvers>;

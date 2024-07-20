import {
  responsePathAsArray,
  Kind,
  type GraphQLResolveInfo,
  type FieldNode,
} from 'graphql/index.js';

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
  const formattedSelectionTree = {} as Record<string, { subFields: {} }>;

  (function recurse(currGqlSelectionsArr, currSelectionNode) {
    for (const sel of currGqlSelectionsArr) {
      if (sel.kind === Kind.FIELD) {
        const newFieldNode = { subFields: {} };
        currSelectionNode[sel.name.value] = newFieldNode;
        if (sel.selectionSet) {
          recurse(sel.selectionSet.selections, newFieldNode.subFields);
        }
      }
    }
  })(gqlBaseSelectionArr, formattedSelectionTree);

  return formattedSelectionTree as FieldSelectionNode<TPossibleFields>;
}

type FieldSelectionNode<TPossibleFields> = {
  [K in keyof FlattenArrayType<TPossibleFields>]: {
    subFields: FlattenArrayType<NonNullable<FlattenArrayType<TPossibleFields>[K]>> extends {
      __typename?: string;
    }
      ? FieldSelectionNode<NonNullable<FlattenArrayType<TPossibleFields>[K]>>
      : {};
  };
};

type FlattenArrayType<T> = T extends unknown[] ? T[number] : T;

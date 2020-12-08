import {
  AsyncExecutionResult,
  GraphQLSchema,
  getOperationRootType,
  getOperationAST,
  Kind,
  GraphQLObjectType,
  FieldNode,
  GraphQLOutputType,
  isListType,
  getNullableType,
  isAbstractType,
  isObjectType,
  OperationDefinitionNode,
} from 'graphql';

import { Request, collectFields, GraphQLExecutionContext, ExecutionResult } from '@graphql-tools/utils';

export async function asyncIterableToIncrementalResult(
  asyncIterable: AsyncIterable<AsyncExecutionResult>,
  request: Request,
  schema: GraphQLSchema
): Promise<ExecutionResult> {
  const asyncIterator = asyncIterable[Symbol.asyncIterator]();
  const payload = await asyncIterator.next();
  const result = payload.value;

  const partialExecutionContext = {
    schema,
    fragments: request.document.definitions.reduce((acc, def) => {
      if (def.kind === Kind.FRAGMENT_DEFINITION) {
        acc[def.name.value] = def;
      }
      return acc;
    }, {}),
    variableValues: request.variables,
  } as GraphQLExecutionContext;

  const data = result.data;

  if (data != null) {
    result.data = visitRoot(data, getOperationAST(request.document, undefined), partialExecutionContext);
  }

  return result;
}

function visitRoot(root: any, operation: OperationDefinitionNode, exeContext: GraphQLExecutionContext): any {
  const operationRootType = getOperationRootType(exeContext.schema, operation);
  const collectedFields = collectFields(
    exeContext,
    operationRootType,
    operation.selectionSet,
    Object.create(null),
    Object.create(null)
  );

  return visitObjectValue(root, operationRootType, collectedFields, exeContext);
}

function visitObjectValue(
  object: Record<string, any>,
  type: GraphQLObjectType,
  fieldNodeMap: Record<string, Array<FieldNode>>,
  exeContext: GraphQLExecutionContext
): Record<string, any> {
  const fieldMap = type.getFields();

  Object.keys(fieldNodeMap).forEach(responseKey => {
    const subFieldNodes = fieldNodeMap[responseKey];
    const fieldName = subFieldNodes[0].name.value;
    const fieldType = fieldMap[fieldName].type;

    const newValue = visitFieldValue(object[responseKey], fieldType, subFieldNodes, exeContext);

    object[responseKey] = newValue;
  });

  return object;
}

function visitListValue(
  list: Array<any>,
  returnType: GraphQLOutputType,
  fieldNodes: Array<FieldNode>,
  exeContext: GraphQLExecutionContext
): Array<any> {
  return list.map(listMember => visitFieldValue(listMember, returnType, fieldNodes, exeContext));
}

function visitFieldValue(
  value: any,
  returnType: GraphQLOutputType,
  fieldNodes: Array<FieldNode>,
  exeContext: GraphQLExecutionContext
): any {
  if (value === undefined) {
    // TODO:
    // replace this hard-coded promise with a promise that properly resolves
    // when stream finally gives an execution result from the stream for this path.
    return new Promise(resolve => setTimeout(() => resolve('test'), 1000));
  }

  const nullableType = getNullableType(returnType);
  if (isListType(nullableType)) {
    return visitListValue(value as Array<any>, nullableType.ofType, fieldNodes, exeContext);
  } else if (isAbstractType(nullableType)) {
    const finalType = exeContext.schema.getType(value.__typename) as GraphQLObjectType;
    const collectedFields = collectSubFields(exeContext, finalType, fieldNodes);
    return visitObjectValue(value, finalType, collectedFields, exeContext);
  } else if (isObjectType(nullableType)) {
    const collectedFields = collectSubFields(exeContext, nullableType, fieldNodes);
    return visitObjectValue(value, nullableType, collectedFields, exeContext);
  }

  return value;
}

function collectSubFields(
  exeContext: GraphQLExecutionContext,
  type: GraphQLObjectType,
  fieldNodes: Array<FieldNode>
): Record<string, Array<FieldNode>> {
  let subFieldNodes: Record<string, Array<FieldNode>> = Object.create(null);
  const visitedFragmentNames = Object.create(null);

  fieldNodes.forEach(fieldNode => {
    subFieldNodes = collectFields(exeContext, type, fieldNode.selectionSet, subFieldNodes, visitedFragmentNames);
  });

  return subFieldNodes;
}

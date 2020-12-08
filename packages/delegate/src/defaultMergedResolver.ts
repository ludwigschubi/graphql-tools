import { defaultFieldResolver, GraphQLResolveInfo } from 'graphql';

import isPromise from 'is-promise';

import { getResponseKeyFromInfo } from '@graphql-tools/utils';

import { resolveExternalValue } from './resolveExternalValue';
import { getSubschema, getUnpathedErrors, isExternalObject } from './externalObjects';
import { ExternalObject } from './types';

/**
 * Resolver that knows how to:
 * a) handle aliases for proxied schemas
 * b) handle errors from proxied schemas
 * c) handle external to internal enum coversion
 */
export function defaultMergedResolver(
  parent: ExternalObject,
  args: Record<string, any>,
  context: Record<string, any>,
  info: GraphQLResolveInfo
): any {
  if (!parent) {
    return null;
  }

  const responseKey = getResponseKeyFromInfo(info);

  // check to see if parent is not a proxied result, i.e. if parent resolver was manually overwritten
  // See https://github.com/apollographql/graphql-tools/issues/967
  if (!isExternalObject(parent)) {
    return defaultFieldResolver(parent, args, context, info);
  }

  const data = parent[responseKey];
  const unpathedErrors = getUnpathedErrors(parent);
  const subschema = getSubschema(parent, responseKey);

  if (isPromise(data)) {
    return data.then(resolvedData => resolveExternalValue(resolvedData, unpathedErrors, subschema, context, info));
  }

  return resolveExternalValue(data, unpathedErrors, subschema, context, info);
}

import type {
  GraphQLResolveInfo,
  GraphQLSchema,
  GraphQLNamedType,
  GraphQLScalarType,
  GraphQLFieldResolver,
  GraphQLTypeResolver,
  GraphQLIsTypeOfFn,
} from 'graphql';

declare type IResolverOptions = {
  resolve?: GraphQLFieldResolver<any, any>;
  subscribe?: GraphQLFieldResolver<any, any>;
  __resolveType?: GraphQLTypeResolver<any, any>;
  __isTypeOf?: GraphQLIsTypeOfFn<any, any>;
};

declare type IResolverObject = {
  [key: string]: GraphQLFieldResolver<any, any> | IResolverOptions;
};

declare type IResolvers = {
  [key: string]: (() => any) | IResolverObject | GraphQLScalarType;
};

declare type MergeInfo = {
  delegate: (
    type: 'query' | 'mutation',
    fieldName: string,
    args: { [key: string]: any },
    context: { [key: string]: any },
    info: GraphQLResolveInfo,
  ) => any;
};

declare function getMergeSchemaResolver(mergeInfo: MergeInfo): IResolvers;

declare type MergeSchemaOptions = {
  schemas: Array<GraphQLSchema | string>;
  onTypeConflict?: (
    leftType: GraphQLNamedType,
    rightType: GraphQLNamedType,
  ) => GraphQLNamedType;
  resolvers: getMergeSchemaResolver
};

declare type MergeSchemas = (options: MergeSchemaOptions) => GraphQLSchema

/**
 * @file Generate a mixin with graphql!
 */

import {
  makeExecutableSchema,
} from 'graphql-tools';
import { graphql as execute } from 'graphql';

const createGraphqlMixin = ({
  typeName,
  schema,
  resolvers,
  relationships,
  relationDefinitions
}) => ({
  settings: {
    typeName,
    schema,
    relationships,
    relationDefinitions,
    hasGraphQLSchema: true,
  },
  actions: {
    graphql: {
      params: {
        query: { type: 'string' },
        variables: { type: 'object', optional: true },
      },
      handler(ctx) {
        return execute(this.schema, ctx.params.query, this.resolvers, ctx, ctx.params.variables);
      },
    },
  },
  created() {
    this.resolvers = resolvers;
    this.schema = makeExecutableSchema({ typeDefs: [schema], resolvers });
  },
  started() {
    this.broker.broadcast('graphqlService.connected', {
      typeName,
      scema,
      relationships,
      relationDefinitions,
    });
  },
  stopped() {
    this.broker.broadcast('graphqlService.disconnected', { typeName });
  },
});

export default createGraphqlMixin;

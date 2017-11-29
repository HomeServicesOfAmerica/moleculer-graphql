## Moleculer GraphQL

The goal of this utility is to introduce a way to co-locate GraphQL Type definitions with the microservices that manage access to those resources. This allows for looser couplings with microservices and a centralized GraphQL api gateway.

To achieve this, a microservice system must exist that accounts for the following architectural challenges:

1. The api gateway service must discover other services on the network that define graphql schemas.
2. Once the api gateway service has collected all schemas from the network, it must stitch them together to create a single schema.
3. The api gateway service should handle routing of requests to individual services in order to resolve segments of incoming GraphQL queries, depending on where the schema originated from.
4. The discovery aspect must account for inter-dependencies between services, ie: related types.

Moleculer GraphQL provides a couple of tools to make this super easy.

### GraphQLGateway

This class is where the magic happens. This is all you need to create a GraphQL api gateway into your microservice architecture. All that is required is that you provide it a moleculer broker that is configured to communicate with your other services on the network.

```js
  gateway = new GraphQLGateway(broker);

  gateway.start().then(() => {
    console.log('gateway is ready! Schema is accessible via gateway.schema');
  });
```

The gateway will register a service on this broker that listens for nodes connecting to the network and updates the schema dynamically anytime a GraphQL service joins the network. It will also initialize the schema by checking already connected services for schemas.

When the gateway discovers a new GraphQL service it will grab values from the network that are provided via the createGraphqlMixin generated moleculer mixin. The details provided here are enough to use Apollo Link and Schema Stitching to build a collection of remote schemas with interdependcies that traverse the network to fulfill data requirements.

##### options
In addition to providing the broker you may also provide an object as the second argument with some configuration options. The list below shows the possible settings plus the default configuration.
```js
  gateway = new GraphQLGateway(broker, {
    // An array of services you want to ignore if they connect
    blacklist: [],
    // An array of services you wish to wait for before .start is fulfilled
    expectedServices: [],
    // If true, will save a snapshot of your schema to a file you specify in snapshotPath
    generateSnapshot: false,
    // A method that if provided will be called when a new remote schema is discovered
    onSchemaDiscovery: null,
    // path to save the snapshot file to
    snapshotPath: `${process.cwd()}/schema.snapshot.graphql`,
    // maximum length of time in milliseconds to wait for services
    waitTimeout: 5000,
    // length of time in milliseconds to wait in between polling.
    waitInterval: 100,
  });
```

if you want to provide an onSchemaDiscovery handler, the format is as follow:
```js
const onSchemaDiscovery = (remoteSchemaDefinition) {
  //NOOP
}
```

The argument in this method has the following properties:

```js
/**
 * RemoteSchemaDefinition
 *
 * This type defines the format of data expected from
 * graphql services when they broadcast graphqlService.connected
 * or graphqlService.disconnected
 */
type RemoteSchemaDefinition = {
  // The raw string schema set in the service
  schema: GraphQLRawSchema,
  // The remoteExecutableSchema created after discovery
  remoteExecutableSchema?: GraphQLSchema,
  // The raw string schema defining relationships in the service
  relationships: GraphQLRawSchema,
  // An object defining how to handle relationships set in the service
  relationDefinitions: RelationDefinitions,
  // The service name
  serviceName: GraphQLServiceName,
};
```

### createGraphqlMixin

This function can be called to generate a moleculer mixin that defines a schema on the settings key that allows it to be discovered by an api gateway service. Lets start with a fully baked example (see the tests folder for more)

```js
import createGraphqlMixin from '../../src/createGraphqlMixin';
import { authors } from './data';

// Define our schema specific to our type
// Include all queries and mutations related to this type
const schema = `
  type Author {
    id: Int,
    name: String,
  }

  type Query {
    author(id: Int!): Author,
    authors: [Author],
    authorOf(bookId: Int!): Author,
  }

  input UpdateAuthorInput {
    id: Int!
    clientMutationId: Int!
    name: String
  }

  type UpdateAuthorPayload {
    author: Author
    clientMutationId: Int
  }

  type Mutation {
    updateAuthor(input: UpdateAuthorInput!): UpdateAuthorPayload,
  }
`;

// Using apollo's extend type, lets add in any fields that are
// dependencies on other services
const relationships = `
  extend type Author {
    books: [Book],
  }
`;

// Now lets tell the gateway how to handle resolving those dependencies
const relationDefinitions = {
  books: {
    type: 'query', // Fetch via a 'query'
    operationName: 'booksByAuthor', // Use this query to resolve data
    args: {
      authorId: 'parent.id', // pass parent.id as authorId arg in the query
    },
  },
};

// Here's the resolvers for our author queries defined in schema
const Query = {
  authors: () => authors,
  author: (_, { id }) => authors.find(author => author.id === id),
};

// And our mutation resolvers
const Mutation = {
  updateAuthor(_, { id, name, clientMutationId }) {
    const authorIdx = authors.findIndex(author => author.id === id);
    const author = authors[authorIdx];
    if (!name) return author;
    author.name = name;
    authors[authorIdx] = author;
    return { author, clientMutationId };
  }
};

const resolvers = {
  Query,
  Mutation
};

// Call the createGraphqlMixin to build our mixin
const authorGraphQL = createGraphqlMixin({
  schema,
  resolvers,
  relationships,
  relationDefinitions,
});

// Export a moleculer service definition with the mixin!
export default {
  name: 'Author',
  mixins: [authorGraphQL],
};
```

Now the schema is attached to the service and will be discovered by the GraphQLGateway!

## how to use
```yarn add moleculer-graphql```

Then in your code:
```js
import { GraphQLGateway, createGraphqlMixin } from 'moleculer-graphql';
```

for Node 6:
```js
import { GraphQLGateway, createGraphqlMixin } from 'moleculer-graphql/node6';
```


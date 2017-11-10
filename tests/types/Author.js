import { createGraphqlMixin } from '../../src/createGraphqlMixin';
import { authors } from './data';

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

const relationships = `
  extend type Author {
    books: [Book],
  }
`;

const relationDefinitions = {
  books: {
    type: 'query',
    operationName: 'booksByAuthor',
    args: {
      authorId: 'parent.id',
    },
  },
};

const Query = {
  authors: () => authors,
  author: (_, { id }) => authors.find(author => author.id === id),
};

const Mutation = {
  updateAuthor(_, { id, name, clientMutationId }) {
    const authorIdx = authors.findIndex(author => author.id === id);
    const author = authors[authorIdx];
    if (!name) return author;
    author.name = name;
    authors[authorIdx] = author;
    return { author, clientMutationId };
  }
}

const resolvers = {
  Query,
  Mutation
};

const authorGraphQL = createGraphqlMixin({
  typeName: 'Author',
  schema,
  resolvers,
  relationships,
  relationDefinitions,
});

export default {
  name: 'Author',
  mixins: [authorGraphQL],
};

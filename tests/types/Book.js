import { createGraphqlMixin } from '../../src/createGraphqlMixin';
import { books } from './data';

const schema = `
  type Book {
    id: Int,
    title: String,
    authorId: Int,
    year: Int,
  }

  type Query {
    book(id: Int!): Book,
    books: [Book],
    booksByAuthor(authorId: Int!): [Book],
  }

  input UpdateBookInput {
    id: Int!
    clientMutationId: Int!
    title: String
  }

  type UpdateBookPayload {
    book: Book
    clientMutationId: Int
  }

  type Mutation {
    updateBook(input: UpdateBookInput!): UpdateBookPayload,
  }
`;

const relationships = `
  extend type Book {
    author: Author,
    chapters: [Chapter],
  }
`;

const relationDefinitions = {
  chapters: {
    type: 'query',
    operationName: 'chaptersInBook',
    args: {
      bookId: 'parent.id',
    },
  },
  author: {
    type: 'query',
    operationName: 'author',
    args: {
      id: 'parent.authorId',
    },
  },
};

const Query = {
  books: () => books,
  book: (_, { id }) => books.find(book => book.id === id),
  booksByAuthor: (_, { authorId }) => books.filter(book => book.authorId === authorId),
};

const Mutation = {
  updateBook(_, { id, title, clientMutationId }) {
    const bookIdx = books.findIndex(book => book.id === id);
    const book = books[authorIdx];
    if (!title) return book;
    book.title = title;
    books[authorIdx] = book;
    return { book, clientMutationId };
  }
}

const resolvers = {
  Query,
  Mutation,
};

const bookGraphQL = createGraphqlMixin({
  schema,
  resolvers,
  relationships,
  relationDefinitions,
});

export default {
  name: 'Book',
  mixins: [bookGraphQL],
};

import createGraphqlMixin from '../../src/createGraphqlMixin';
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

const queries = {
  books: () => books,
  book: (_, { id }) => books.find(book => book.id === id),
  booksByAuthor: (_, { authorId }) => books.filter(book => book.authorId === authorId),
};

const resolvers = {
  Query: queries,
};

const bookGraphQL = createGraphqlMixin({
  typeName: 'Book',
  schema,
  resolvers,
  relationships,
  relationDefinitions,
});

export default {
  name: 'Book',
  mixins: [bookGraphQL],
};

import { createGraphqlMixin } from '../../src/createGraphqlMixin';
import { chapters } from './data';

const schema = `
  type Chapter {
    id: Int,
    title: String,
    bookId: Int,
  }

  type Query {
    chapter(id: Int!): Chapter,
    chapters: [Chapter],
    chaptersInBook(bookId: Int!): [Chapter],
  }
`;

const relationships = `
  extend type Chapter {
    book: Book,
  }
`;

const relationDefinitions = {
  book: {
    type: 'query',
    operationName: 'book',
    args: {
      id: 'parent.bookId',
    },
  },
};

const queries = {
  chapters: () => chapters,
  chapter: (_, { id }) => chapters.find(chapter => chapter.id === id),
  chaptersInBook: (_, { bookId }) => chapters.filter(chapter => chapter.bookId === bookId),
};

const resolvers = {
  Query: queries,
};

const chapterGraphQL = createGraphqlMixin({
  schema,
  resolvers,
  relationships,
  relationDefinitions,
});

export default {
  name: 'Chapter',
  mixins: [chapterGraphQL],
};

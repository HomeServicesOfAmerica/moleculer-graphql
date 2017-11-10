import { ServiceBroker, Transporters } from 'moleculer';
import { graphql as execute, printSchema } from 'graphql';
import { GraphQLGateway } from '../src/Gateway/GraphQLGateway';
import authorSvc from './types/Author';
import bookSvc from './types/Book';
import chapterSvc from './types/chapter';
import * as dataSource from './types/data';

jest.setTimeout(10000);

async function authorsQuery(schema) {
  const { data } = await execute(schema, `{
    authors {
      name,
      id,
    }
  }`);
  expect(data).toEqual({ authors: dataSource.authors });
}

async function authorsWithBooksQuery(schema) {
  const { data } = await execute(schema, `{
    authors {
      name,
      id,
      books {
        title,
        year,
        authorId,
        id
      }
    }
  }`);
  expect(data).toEqual({
    authors: dataSource.authors.map(author => ({
      ...author,
      books: dataSource.books.filter(book => book.authorId === author.id),
    })),
  });
}

async function authorsWithBooksAndChaptersQuery(schema) {
  const { data } = await execute(schema, `{
    authors {
      name,
      id,
      books {
        title,
        year,
        authorId,
        id
        chapters {
          title,
          id,
          bookId,
        }
      }
    }
  }`);
  expect(data).toEqual({
    authors: dataSource.authors.map(author => ({
      ...author,
      books: dataSource.books.filter(book => book.authorId === author.id).map(book => ({
        ...book,
        chapters: dataSource.chapters.filter(chapter => chapter.bookId === book.id)
      }))
    })),
  });
}

async function booksQuery(schema) {
  const { data } = await execute(schema, `{
    books {
      title,
      year,
      id,
      authorId
    }
  }`);
  expect(data).toEqual({ books: dataSource.books });
}

async function booksWithAuthorQuery(schema) {
  const { data } = await execute(schema, `{
    books {
      title,
      year,
      id,
      authorId
      author {
        name
        id
      }
    }
  }`);
  expect(data).toEqual({ books: dataSource.books.map(book => ({
    ...book,
    author: dataSource.authors.find(author => author.id === book.authorId)
  })) });
}

async function booksWithChaptersQuery(schema) {
  const { data } = await execute(schema, `{
    books {
      title,
      year,
      id,
      authorId
      chapters {
        bookId
        title
        id
      }
    }
  }`);
  expect(data).toEqual({ books: dataSource.books.map(book => ({
    ...book,
    chapters: dataSource.chapters.filter(chapter => chapter.bookId === book.id)
  })) });
}

describe('Schema Generation', () => {
  describe('With A Single Broker', () => {
    // Globals for With a Single Broker
    let broker = null;
    let gateway = null;

    beforeAll((done) => {
      broker = new ServiceBroker({
        nodeID: 'gatewaySingle',
      });

      broker.createService(authorSvc);
      broker.createService(bookSvc);
      broker.createService(chapterSvc);

      broker.start();

      gateway = new GraphQLGateway({
        broker,
      });

      gateway.start().then(() => done());
    });

    afterAll(() => broker.stop());

    test('Should be able to query for all authors', async () => {
      return await authorsQuery(gateway.schema);
    });

    test('Should be able to include books on author query', async () => {
      return await authorsWithBooksQuery(gateway.schema);
    });

    test('Should be able to include chapters inside books on author query', async () => {
      await authorsWithBooksAndChaptersQuery(gateway.schema);
    });

    test('Should be able to query for all books', async () => {
      await booksQuery(gateway.schema);
    });

    test('Should be able to include the author in the books query', async () => {
      await booksWithAuthorQuery(gateway.schema);
    });

    test('Should be able to include the chapters in the books query', async () => {
      await booksWithChaptersQuery(gateway.schema);
    });

    test('Should generate a consistant schema', () => {
      expect(printSchema(gateway.schema)).toMatchSnapshot();
    });
  });

  describe('With Multiple Brokers', () => {
    // Globals for With a Single Broker
    let broker = null;
    let authorBroker = null;
    let bookBroker = null;
    let chapterBroker = null;
    let gateway = null;

    beforeAll((done) => {
      broker = new ServiceBroker({
        nodeID: 'gatewayMultiple',
        transporter: new Transporters.MQTT('mqtt://localhost:1883')
      });

      authorBroker = new ServiceBroker({
        nodeID: 'author',
        transporter: new Transporters.MQTT('mqtt://localhost:1883')
      });

      bookBroker = new ServiceBroker({
        nodeID: 'book',
        transporter: new Transporters.MQTT('mqtt://localhost:1883')
      });

      chapterBroker = new ServiceBroker({
        nodeID: 'chapter',
        transporter: new Transporters.MQTT('mqtt://localhost:1883')
      });

      broker.start();

      gateway = new GraphQLGateway({
        broker,
      });

      gateway.start().then(() => done());

      authorBroker.createService(authorSvc);
      bookBroker.createService(bookSvc);
      chapterBroker.createService(chapterSvc);

      authorBroker.start();
      bookBroker.start();
      chapterBroker.start();
    });

    afterAll(() => {
      broker.stop();
      authorBroker.stop();
      bookBroker.stop();
      chapterBroker.stop();
    })

    test('Should be able to query for all authors', async () => {
      return await authorsQuery(gateway.schema);
    });

    test('Should be able to include books on author query', async () => {
      return await authorsWithBooksQuery(gateway.schema);
    });

    test('Should be able to include chapters inside books on author query', async () => {
      await authorsWithBooksAndChaptersQuery(gateway.schema);
    });

    test('Should be able to query for all books', async () => {
      await booksQuery(gateway.schema);
    });

    test('Should be able to include the author in the books query', async () => {
      await booksWithAuthorQuery(gateway.schema);
    });

    test('Should be able to include the chapters in the books query', async () => {
      await booksWithChaptersQuery(gateway.schema);
    });

    test('Should generate a consistant schema', () => {
      expect(printSchema(gateway.schema)).toMatchSnapshot();
    });
  });
});

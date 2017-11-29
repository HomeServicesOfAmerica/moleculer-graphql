/**
 * @file Test the resolution of queries (remotely and within gateway)
 * @author Nathan Schwartz <nathan.schwartz95@gmail.com>
 *
 * This file ends up feeling a bit abstract because it reuses suites and assertions.
 *
 * The only thing that really changes between runs is how the queries are resolved.
 *
 * This is done by passing in a resolveQuery function. The resolveQuery function is partially
 * applied within the test suite to provide access to a moleculer broker and the gateway.
 */
import { ServiceBroker, Transporters } from 'moleculer';
import { graphql as execute } from 'graphql';
import { GraphQLGateway } from '..';
import authorSvc from './types/Author';
import bookSvc from './types/Book';
import chapterSvc from './types/chapter';
import * as dataSource from './types/data';

jest.setTimeout(10000);

/**
 * @param {function} resolveQuery
 *
 * This function will run queries using a passed in resolution method. The only thing passed to
 * the resolveQuery function is a string containing the GraphQL query.
 */
const runTests = (resolveQuery) => {
  test('Should be able to query for all authors', async () => {
    const { data } = await resolveQuery(`{
      authors {
        name,
        id,
      }
    }`);

    expect(data).toEqual({ authors: dataSource.authors });
  });

  test('Should be able to include books on author query', async () => {
    const { data } = await resolveQuery(`{
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
  });

  test('Should be able to include chapters inside books on author query', async () => {
    const { data } = await resolveQuery(`{
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
  });

  test('Should be able to query for all books', async () => {
    const { data } = await resolveQuery(`{
      books {
        title,
        year,
        id,
        authorId
      }
    }`);
    expect(data).toEqual({ books: dataSource.books });
  });

  test('Should be able to include the author in the books query', async () => {
    const { data } = await resolveQuery(`{
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
  });

  test('Should be able to include the chapters in the books query', async () => {
    const { data } = await resolveQuery(`{
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
  });
}

/**
 * @param {string} suiteName
 * @param {function} buildQueryResolver
 *
 * The query resolvers need access to either a moleculer client, or the schema property on
 * the gateway service. Because the gateway and client are intialized to a null value and will be
 * reassigned between tests, the best we can do is to pass a reference to them.
 *
 * This is why all brokers are contained in an object called ref.
 */
const runSuites = (suiteName, buildQueryResolver) => {
  describe(suiteName, () => {
    describe('With A Single Broker', () => {
      // Globals for With a Single Broker
      const ref = {
        broker: null,
        gateway: null,
      }

      beforeAll(() => {
        ref.broker = new ServiceBroker({
          nodeID: 'gatewaySingle',
        });

        ref.broker.createService(authorSvc);
        ref.broker.createService(bookSvc);
        ref.broker.createService(chapterSvc);

        ref.broker.start();

        ref.gateway = new GraphQLGateway(ref.broker);

        return ref.gateway.start();
      });

      afterAll(() => ref.gateway.stop());

      runTests(buildQueryResolver({ ref, clientKey: 'broker' }));
    });

    describe('With Multiple Brokers', () => {
      // Globals for With a Single Broker
      const ref = {
        broker: null,
        authorBroker: null,
        bookBroker: null,
        chapterBroker: null,
        gateway: null,
        client: null,
      }

      beforeAll(() => {
        ref.client = new ServiceBroker({
          nodeID: 'client',
          namespace: 'queryResolution',
          transporter: new Transporters.MQTT('mqtt://localhost:1883')
        });

        ref.broker = new ServiceBroker({
          nodeID: 'gatewayMultiple',
          namespace: 'queryResolution',
          transporter: new Transporters.MQTT('mqtt://localhost:1883')
        });

        ref.authorBroker = new ServiceBroker({
          nodeID: 'author',
          namespace: 'queryResolution',
          transporter: new Transporters.MQTT('mqtt://localhost:1883')
        });

        ref.bookBroker = new ServiceBroker({
          nodeID: 'book',
          namespace: 'queryResolution',
          transporter: new Transporters.MQTT('mqtt://localhost:1883')
        });

        ref.chapterBroker = new ServiceBroker({
          nodeID: 'chapter',
          namespace: 'queryResolution',
          transporter: new Transporters.MQTT('mqtt://localhost:1883')
        });

        ref.authorBroker.createService(authorSvc);
        ref.bookBroker.createService(bookSvc);
        ref.chapterBroker.createService(chapterSvc);

        ref.gateway = new GraphQLGateway(ref.broker);

        return Promise.all([
          ref.client.start(),
          ref.authorBroker.start(),
          ref.bookBroker.start(),
          ref.chapterBroker.start(),
          ref.gateway.start(),
        ])
      });

      afterAll(() => Promise.all([
        ref.client.stop(),
        ref.authorBroker.stop(),
        ref.bookBroker.stop(),
        ref.chapterBroker.stop(),
        ref.gateway.stop(),
      ]))

      runTests(buildQueryResolver({ ref, clientKey: 'client' }));
    });
  });
}


runSuites(
  'Moleculer Action Query Resolution',
  ({ ref, clientKey }) => query => {
    // We use clientKey because in the "single broker" suite, the "client" is the broker.
    // Making a wrapper object, duplicating the key, or misnaming broker seemed like worse options.
    const client = ref[clientKey];
    return client.call('gateway.graphql', { query });
  }
);

runSuites(
  'Schema Execution Query Resolution',
  ({ ref }) => query => execute(ref.gateway.schema, query)
);

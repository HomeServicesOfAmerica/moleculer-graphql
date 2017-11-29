import { ServiceBroker, Transporters } from 'moleculer';
import { graphql as execute, printSchema } from 'graphql';
import { promisify } from 'util';
import { GraphQLGateway } from '..';
import authorSvc from './types/Author';
import bookSvc from './types/Book';
import chapterSvc from './types/chapter';

const waitFor = promisify(setTimeout);

describe('Service Discovery', () => {
  let broker;
  let authorBroker;
  let bookBroker;
  let chapterBroker;
  let gateway;
  let onSchemaDiscovery;
  let handleNodeConnectionSpy;

  beforeAll(() => {
    broker = new ServiceBroker({
      nodeID: 'gateway',
      namespace: 'serviceDiscovery',
      transporter: new Transporters.MQTT('mqtt://localhost:1883'),
    });

    broker.start();

    onSchemaDiscovery = jest.fn();

    gateway = new GraphQLGateway(broker, {
      onSchemaDiscovery,
    });

    authorBroker = new ServiceBroker({
      nodeID: 'author',
      namespace: 'serviceDiscovery',
      transporter: new Transporters.MQTT('mqtt://localhost:1883'),
    });

    bookBroker = new ServiceBroker({
      nodeID: 'book',
      namespace: 'serviceDiscovery',
      transporter: new Transporters.MQTT('mqtt://localhost:1883'),
    });

    chapterBroker = new ServiceBroker({
      nodeID: 'chapter',
      namespace: 'serviceDiscovery',
      transporter: new Transporters.MQTT('mqtt://localhost:1883'),
    });

    authorBroker.createService(authorSvc);
    bookBroker.createService(bookSvc);
    chapterBroker.createService(chapterSvc);
  });

  afterAll(() => {
    broker.stop();
    authorBroker.stop();
    bookBroker.stop();
    chapterBroker.stop();
  });

  test('New gateway should include a gateway service', () => {
    expect(gateway.service.name).toBe('gateway');
  });

  test('Starting a broker with a type service should be discovered by main broker', (done) => {
    authorBroker.start()
      .then(() => waitFor(500))
      .then(() => {
        const authorService = authorBroker.getLocalService('Author');
        expect(onSchemaDiscovery).toHaveBeenCalledTimes(1);
        expect(onSchemaDiscovery.mock.calls[0][0].serviceName).toBe('Author');
        expect(gateway.discoveredGraphQLTypes).toContain('Author');
        onSchemaDiscovery.mockReset();
        done();
      });

  });

  test('Should fail if all required services cannot be found within the timeout', async () => {
    const testBroker = new ServiceBroker({
      nodeID: 'test',
    });
    const g = new GraphQLGateway(testBroker, {
      waitTimeout: 300,
    });
    await expect(g.start()).rejects.toHaveProperty('message', 'Timeout');
  });

  test('Starting gateway up should wait for necessary types before producing a schema', (done) => {
    gateway.start().then(() => {
      expect(onSchemaDiscovery).toHaveBeenCalledTimes(2);
      expect(gateway.discoveredGraphQLTypes).toContain('Book');
      expect(gateway.discoveredGraphQLTypes).toContain('Chapter');
      expect(gateway.schema).toMatchSnapshot();
      onSchemaDiscovery.mockReset();
      done();
    });
    bookBroker.start();
    chapterBroker.start();
  });
});
import { ServiceBroker, Transporters } from 'moleculer';
import { graphql as execute, printSchema } from 'graphql';
import { promisify } from 'util';
import GraphQLGateway from '../src/Gateway/GraphQLGateway';
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
  let onServiceDiscovery;
  let handleNodeConnectionSpy;

  beforeAll(() => {
    broker = new ServiceBroker({
      nodeID: 'gateway',
      namespace: 'serviceDiscovery',
      transporter: new Transporters.MQTT('mqtt://localhost:1883'),
    });

    broker.start();

    onServiceDiscovery = jest.fn();

    gateway = new GraphQLGateway({
      broker,
      onServiceDiscovery,
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

  test('Starting a broker with a type service should be discovered by main broker', async () => {
    await authorBroker.start();

    const authorService = authorBroker.getLocalService('Author');

    expect(onServiceDiscovery).toHaveBeenCalledTimes(1);
    expect(onServiceDiscovery.mock.calls[0][0].name).toBe('Author');
    expect(gateway.discoveredTypes.Author).toBeDefined();
    onServiceDiscovery.mockReset();
  });

  test('Should fail if all required services cannot be found within the timeout', async () => {
    const testBroker = new ServiceBroker({
      nodeID: 'test',
    });
    const g = new GraphQLGateway({
      broker: testBroker,
      waitTimeout: 300,
    });
    await expect(g.start()).rejects.toHaveProperty('message', 'Timeout');
  });

  test('Starting gateway up should wait for necessary types before producing a schema', (done) => {
    gateway.start().then(() => {
      expect(onServiceDiscovery).toHaveBeenCalledTimes(2);
      expect(gateway.discoveredTypes.Book).toBeDefined();
      expect(gateway.discoveredTypes.Chapter).toBeDefined();
      expect(gateway.schema).toMatchSnapshot();
      done();
    });
    bookBroker.start();
    chapterBroker.start();
  });
});
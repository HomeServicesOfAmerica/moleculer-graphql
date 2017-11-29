import { ServiceBroker, Transporters } from 'moleculer';
import { printSchema } from 'graphql';
import { GraphQLGateway } from '..';
import authorSvc from './types/Author';
import bookSvc from './types/Book';
import chapterSvc from './types/chapter';

jest.setTimeout(10000);

describe('Schema Generation', () => {
  describe('With A Single Broker', () => {
    // Globals for With a Single Broker
    let broker = null;
    let gateway = null;

    beforeAll(() => {
      broker = new ServiceBroker({
        nodeID: 'gatewaySingle',
        namespace: 'schemaGeneration',
      });

      broker.createService(authorSvc);
      broker.createService(bookSvc);
      broker.createService(chapterSvc);

      broker.start();

      gateway = new GraphQLGateway(broker);

      return gateway.start();
    });

    afterAll(() => gateway.stop);

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
        namespace: 'schemaGeneration',
        transporter: new Transporters.MQTT('mqtt://localhost:1883')
      });

      authorBroker = new ServiceBroker({
        nodeID: 'author',
        namespace: 'schemaGeneration',
        transporter: new Transporters.MQTT('mqtt://localhost:1883')
      });

      bookBroker = new ServiceBroker({
        nodeID: 'book',
        namespace: 'schemaGeneration',
        transporter: new Transporters.MQTT('mqtt://localhost:1883')
      });

      chapterBroker = new ServiceBroker({
        nodeID: 'chapter',
        namespace: 'schemaGeneration',
        transporter: new Transporters.MQTT('mqtt://localhost:1883')
      });

      broker.start();

      gateway = new GraphQLGateway(broker);

      gateway.start().then(() => done());

      authorBroker.createService(authorSvc);
      bookBroker.createService(bookSvc);
      chapterBroker.createService(chapterSvc);

      authorBroker.start();
      bookBroker.start();
      chapterBroker.start();
    });

    afterAll(() => Promise.all([
      gateway.stop(),
      authorBroker.stop(),
      bookBroker.stop(),
      chapterBroker.stop(),
    ]));

    test('Should generate a consistant schema', () => {
      expect(printSchema(gateway.schema)).toMatchSnapshot();
    });
  });
});

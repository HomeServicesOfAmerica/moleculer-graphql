import { ServiceBroker, Transporters } from 'moleculer';
import GraphQLGateway from './Gateway/GraphQLGateway';
import { promisify } from 'util';

const AmqpTransporter = Transporters.AMQP;

const broker2 = new ServiceBroker({
  nodeID: 'test2',
  logger: console,
  transporter: new AmqpTransporter('amqp://guest:guest@127.0.0.1:5672'),
});

const gateway = new GraphQLGateway({
  broker: broker2,
});


gateway.buildSchema().then(() => broker2.start());
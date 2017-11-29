/**
 * @file creates a remotely executable schema using Moleculer
 * @flow
 */
import { introspectSchema, makeRemoteExecutableSchema } from 'graphql-tools';
import type { ServiceBroker, Service } from 'moleculer';
import { MoleculerLink } from './MoleculerLink';

type RemoteSchemaOptions = {
  broker: ServiceBroker,
  service: string,
}

export async function createRemoteSchema({ broker, service }: RemoteSchemaOptions) {
  const link = new MoleculerLink({ broker, service: service });
  const schema = await introspectSchema(link);
  return makeRemoteExecutableSchema({ schema, link });
}

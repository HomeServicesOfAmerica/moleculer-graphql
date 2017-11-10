/**
 * @file createGraphQLGateway
 * @author Brad Decker <brad.decker@conciergeauctions.com>
 *
 * The primary purpose of this file is to build a schema that stitches
 * together the schemas of all remote services that have been defined
 * using the graphql mixin also provided by this library.
 * @flow
 */
import { mergeSchemas } from 'graphql-tools';
import { printSchema, parse } from 'graphql';
import difference from 'lodash.difference';
import selectn from 'selectn';
import fs from 'fs';
import { createRemoteSchema } from './createRemoteSchema';
import { buildRelationalResolvers } from './buildRelationalResolvers';
import { getRelatedTypes } from './utilities';

import type { GraphQLSchema, DocumentNode } from 'graphql';
import type { ServiceBroker, ServiceWorker } from 'moleculer';
import type { TypeRelationDefinitions } from '../Types/ServiceConfiguration';

opaque type ServiceName = string;

type GatewayOptions = {
  broker: ServiceBroker,
  expectedTypes?: Array<string>,
  waitTimeout?: number,
  waitInterval?: number,
  blacklist?: Array<string>,
  generateSnapshot?: boolean,
  snapshotPath?: string,
};

type RemoteSchemaMap = {
  [TypeName: string]: GraphQLSchema,
};

type RelationshipSchemas = {
  [TypeName: string]: string,
};

type GraphQLTypeServiceMap = {
  [type: GraphQLTypeName]: ServiceName
};

export class GraphQLGateway {
  // Services to ignore
  blacklist: Array<string> = ['$node'];
  // Passed in service broker used to make calls
  broker: ServiceBroker;
  // Running list of discovered types and the service that they belong to
  discoveredTypes: GraphQLTypeServiceMap = {};
  // Define absolutely necessary types before schema can be complete
  expectedTypes: Array<string> = [];
  // If true, save a snapshot schema file everytime the schema changes
  generateSnapshot: boolean = false;
  // Boolean to track whether the schema has been initialized
  initialized: boolean = false;
  // Method to hook into service discovery.
  onServiceDiscovery: (service: ServiceWorker) => void;
  // All relationship resolver definitions in the remote schemas
  relationDefinitions: TypeRelationDefinitions = {};
  // Additional Schemas for relating objects across services
  relationships: RelationshipSchemas = {};
  // Remove Schema map for storing the remote schemas created
  remoteSchemas: RemoteSchemaMap = {};
  // The current schema for the gateway, computed by stitching remote schemas
  schema: ?GraphQLSchema = null;
  // Internal service for listening for events
  service: ?ServiceWorker = null;
  // Path to save the snapshot to
  snapshotPath: string = `${process.cwd()}/schema.snapshot.graphql`;
  // Length of time in milliseconds to wait for expectedTypes
  waitTimeout: number = 5000;
  // Interval in milliseconds to poll for expectedTypes
  waitInterval: number = 100;

  handleServiceUpdate = async(opts): Promise<void> => {
    const services = this.broker.services
      .filter(service => service.settings.hasGraphQLSchema)
      .filter(service => !this.blacklist.includes(service.name))
      .filter(service => !this.discoveredTypes[service.settings.typeName]);

    if (services.length > 0) {
      for (const service of services) {
        this.discoveredTypes[service.settings.typeName] = service.name;
        await this.buildRemoteSchema(service);
        if (this.onServiceDiscovery) {
          this.onServiceDiscovery(service);
        }
      }
      this.generateSchema();
    }
  };

  // When nodes connect we scan their services for schemas and add stitch them in
  handleNodeConnection = async ({ node }: Object): Promise<void> => {
    const services = node.services.filter(
      service => !this.discoveredTypes[service.settings.typeName]
        && !this.blacklist.includes(service.name)
        && service.settings.hasGraphQLSchema
    );
    if (services.length > 0) {
      for (const service of services) {
        this.discoveredTypes[service.settings.typeName] = service.name;
        await this.buildRemoteSchema(service);
        if (this.onServiceDiscovery) {
          this.onServiceDiscovery(service);
        }
      }
      this.generateSchema();
    }
  };

  // When nodes disconnect we scan their services for schemas and remove them
  handleNodeDisconnected = async ({ node }: Object): Promise<void> => {
    const services = node.services.filter(
      service => this.remoteSchemas[service.settings.typeName]
    );
    if (services.length > 0) {
      for (const service of services) {
        await this.buildRemoteSchema(service);
      }
      this.generateSchema();
    }
  };

  constructor(opts: GatewayOptions) {
    this.broker = opts.broker;
    if (opts.expectedTypes) this.expectedTypes = opts.expectedTypes;
    if (opts.waitInterval) this.waitInterval = opts.waitInterval;
    if (opts.waitTimeout) this.waitTimeout = opts.waitTimeout;
    if (opts.blacklist) this.blacklist.concat(opts.blacklist);
    if (opts.generateSnapshot) this.generateSnapshot = opts.generateSnapshot;
    if (opts.snapshotPath) this.snapshotPath = opts.snapshotPath;
    if (opts.onServiceDiscovery) this.onServiceDiscovery = opts.onServiceDiscovery;
    this.service = this.broker.createService({
      name: 'gateway',
      events: {
        '$services.changed': this.handleServiceUpdate,
        '$node.connected': this.handleNodeConnection,
        '$node.disconnected': this.handleNodeDisconnected,
      },
    });
  }

  alphabetizeSchema(schema: GraphQLSchema): GraphQLSchema {
    const queryType = schema._queryType;
    const fields = queryType.getFields();
    const unordered = Object.keys(fields);
    const ordered = Object.keys(fields).sort();
    if (JSON.stringify(unordered) !== JSON.stringify(ordered)) {
      const alphabetized = {};
      ordered.forEach((field) => {
        alphabetized[field] = fields[field];
      });
      queryType._fields = alphabetized;
      schema._queryType = queryType;
    }
    return schema;
  }

  async buildRemoteSchema(service: ServiceWorker): Promise<void> {
    const { settings: { typeName, relationships, relationDefinitions } } = service;
    if (!this.remoteSchemas[typeName]) {
      this.remoteSchemas[typeName] = await createRemoteSchema({
        broker: this.broker,
        service
      });
      if (relationships) {
        this.relationships[typeName] = relationships;
        this.relationDefinitions[typeName] = relationDefinitions;
        const relatedTypes = getRelatedTypes(parse(relationships));
        const missingTypes = difference(relatedTypes, this.discoveredTypes);
        this.expectedTypes = this.expectedTypes.concat(missingTypes);
      }
    }
  }

  generateSchema(): GraphQLSchema {
    const schemas = Object.values(this.remoteSchemas).concat(Object.values(this.relationships));
    const resolvers = buildRelationalResolvers(this.relationDefinitions);
    this.schema = mergeSchemas({
      schemas,
      resolvers,
    });
    this.schema = this.alphabetizeSchema(this.schema);
    if (this.generateSnapshot) this.recordSnapshot();
    return this.schema;
  }

  recordSnapshot(): void {
    if (this.schema) {
      fs.writeFileSync(this.snapshotPath, printSchema(this.schema));
    }
  }

  /**
   * Wait for services expected
   */
  start(): Promise<GraphQLSchema> {
    return new Promise((resolve, reject) => {
      const maxTries = this.waitTimeout / this.waitInterval;
      let tries = 0;
      this.timer = setInterval(() => {
        tries++;
        if (tries >= maxTries) {
          reject(new Error('Timeout'));
        }
        const discoveredTypes = Object.keys(this.discoveredTypes);
        const undiscovered = difference(this.expectedTypes, discoveredTypes);
        if (discoveredTypes.length === 0) return;
        if (discoveredTypes.some(type => !this.remoteSchemas[type])) return;
        if (undiscovered.length > 0) {
          if (this.broker.logger) {
            const msg = `Still waiting for ${undiscovered.join(', ')} types to be discovered`;
            this.broker.logger.warn(msg);
          }
          return;
        }
        clearInterval(this.timer);
        this.generateSchema();
        resolve(this.schema);
      }, this.waitInterval);
    });
  }
}

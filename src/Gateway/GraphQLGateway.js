/**
 * @file createGraphQLGateway
 * @author Brad Decker <brad@merlinlabs.com>
 *
 * The primary purpose of this file is to build a schema that stitches
 * together the schemas of all remote services that have been defined
 * using the graphql mixin also provided by this library.
 * @flow
 */
import { mergeSchemas } from 'graphql-tools';
import { printSchema, parse, graphql as execute } from 'graphql';
import { isEqual, difference } from 'lodash';
import selectn from 'selectn';
import fs from 'fs';
import { promisify } from 'util';
import { createRemoteSchema } from './createRemoteSchema';
import { buildRelationalResolvers } from './buildRelationalResolvers';
import { getRelatedTypes } from './utilities';

import type { GraphQLSchema, DocumentNode, GraphQLType } from 'graphql';
import type { ServiceBroker, ServiceWorker } from 'moleculer';
import type { RelationDefinitions } from '../Types/ServiceConfiguration';

const waitFor = promisify(setTimeout);

opaque type GraphQLServiceName = string;
opaque type GraphQLTypeName = string;
opaque type GraphQLRawSchema = string;
opaque type FilePath = string;

/**
 * RemoteSchemaDefinition
 *
 * This type defines the format of data expected from
 * graphql services when they broadcast graphqlService.connected
 * or graphqlService.disconnected
 */
type RemoteSchemaDefinition = {
  // The raw string schema set in the service
  schema: GraphQLRawSchema,
  // The remoteExecutableSchema created after discovery
  remoteExecutableSchema?: GraphQLSchema,
  // The raw string schema defining relationships in the service
  relationships: GraphQLRawSchema,
  // An object defining how to handle relationships set in the service
  relationDefinitions: RelationDefinitions,
  // The service name
  serviceName: GraphQLServiceName,
};

/**
 * GatewayOptions
 *
 * This type defines the format of options passed in the second
 * parameter to the GraphQLGateway constructor
 */
type GatewayOptions = {
  // An array of services the user has requested to be ignored
  blacklist?: Array<GraphQLServiceName>,
  // An array of services the user has marked as required before start
  expectedServices?: Array<GraphQLServiceName>,
  // Boolean provided by user. If true, save a schema snapshot.
  generateSnapshot?: boolean,
  // Method provided by user that will be called when service is discovered.
  onSchemaDiscovery?: (RemoteSchemaDefinition) => void,
  // User provided file path to location for snapshot saving
  snapshotPath?: FilePath,
  // maximum length of time in milliseconds to wait for services
  waitTimeout?: number,
  // length of time in milliseconds to wait in between polling.
  waitInterval?: number,
};

/**
 * GatewaySettings
 *
 * This type defines the shape of the settings instance property on
 * GraphQLGateway. It is computed from GatewayOptions.
 */
type GatewaySettings = {
  // An array of service names to ignore when they connect
  blacklist: Array<GraphQLServiceName>,
  // An array of service names that are required before starting the gateway
  expectedServices: Array<GraphQLServiceName>,
  // Boolean to determine if a snapshot of the schema should be persisted to file
  generateSnapshot: boolean,
  // Method to call when a schema is discovered by the gateway
  onSchemaDiscovery?: (RemoteSchemaDefinition) => void,
  // Path to save the snapshot to
  snapshotPath: FilePath,
  // maximum length of time in milliseconds to wait for services to connect
  waitTimeout: number,
  // length of time in milliseconds to wait in between polling
  waitInterval: number,
}

/**
 * ConnectedServices
 *
 * This type defines a Map shape for the instance property on
 * GraphQLGateway. The shape is an object with keys that are
 * service's names, and values that are RemoteSchemaDefinitions.
 * This map is used internally to store connected services for
 * future use.
 */
type ConnectedServices = {
  [service: GraphQLServiceName]: RemoteSchemaDefinition,
};

/**
 * concatDifference
 *
 * Compute the items from target that are not in source and then add them to
 * the source.
 */
function concatDifference(source: Array<any>, target: Array<any>): Array<any> {
  const diff = difference(target, source);
  return source.concat(diff);
}

/**
 * computeTimeDiff
 *
 * Computers the number of milliseconds that have passed since start
 */
function computeTimeDiff(start: [number, number]): number {
  const elapsed = process.hrtime(start);
  const milliseconds = (elapsed[0] * 1000000) + (elapsed[1] / 1000000);
  return Number(milliseconds.toFixed(0));
}

export class GraphQLGateway {
  settings: GatewaySettings = {
    // Services to ignore
    blacklist: ['$node'],
    expectedServices: [],
    generateSnapshot: false,
    snapshotPath: `${process.cwd()}/schema.snapshot.graphql`,
    waitTimeout: 5000,
    waitInterval: 100,
  };

  // Passed in service broker used to make calls
  broker: ServiceBroker;

  // An array of types that are required across services
  requiredGraphQLTypes: Array<GraphQLTypeName> = [];

  // An array of types that have already been discovered
  discoveredGraphQLTypes: Array<GraphQLTypeName> = [];

  // An object used to store connected service data
  connectedServices: ConnectedServices = {};

  // The current schema for the gateway, computed by stitching remote schemas
  schema: ?GraphQLSchema = null;

  // Internal service for listening for events
  service: ?ServiceWorker = null;

  /**
   * handleServiceConnected
   *
   * When a graphql service connects build a remote schema if the service is new
   * or has updated definitions from the currently connected remote schema. If the
   * remote schema is added or updated, rebuild the local gateway schema as well.
   */
  handleServiceConnected = async (
    remoteSchemaDef: RemoteSchemaDefinition,
  ): Promise<void> => {
    const {
      schema,
      serviceName,
      relationships,
      relationDefinitions
    } = remoteSchemaDef;
    let changed = false;
    if (this.connectedServices[serviceName]) {
      const currentDefinition = this.connectedServices[serviceName];
      if (schema !== currentDefinition.schema) changed = true;
      if (!changed && relationships !== currentDefinition.relationships) changed = true;
      if (!changed && !isEqual(relationDefinitions, currentDefinition.relationDefinitions)) {
        changed = true;
      }
      if (!changed) return;
    }
    if (this.settings.onSchemaDiscovery) {
      this.settings.onSchemaDiscovery(remoteSchemaDef);
    }
    this.connectedServices[serviceName] = remoteSchemaDef;
    await this.buildRemoteSchema(remoteSchemaDef);
    this.rebuildSchema();
  };

  /**
   * handleServiceDisconnected
   *
   * When a service reports disconnect, remove it from our connected services
   * and rebuild the local stitched schema.
   */
  handleServiceDisconnected = async (remoteSchemaDef: RemoteSchemaDefinition): Promise<void> => {
    this.removeExecutableSchema(remoteSchemaDef);
  };

  constructor(broker: ServiceBroker, options: GatewayOptions) {
    this.broker = broker;
    this.settings = {
      ...this.settings,
      ...options
    }

    this.service = this.broker.createService({
      name: 'gateway',
      events: {
        'graphqlService.connected': this.handleServiceConnected,
        'graphqlService.disconnected': this.handleServiceDisconnected,
      },
      actions: {
        graphql: {
          params: {
            query: { type: 'string' },
            variables: { type: 'object', optional: true }
          },
          handler: ctx => execute(this.schema, ctx.params.query, null, null, ctx.params.variables),
        },
      },
      started: async () => {
        const services = await this.broker.call('$node.services');
        services
          .filter(service => service.settings.hasGraphQLSchema)
          .forEach(service => {
            this.handleServiceConnected({ ...service.settings, serviceName: service.name }, true);
          });
      }
    });
  }

  /**
   * alphabetizeSchema
   *
   * In order to make sure snapshots are consistent we alphabetize types
   * so that the order of types is reliable.
   */
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

  /**
   * buildRemoteSchema
   *
   * Builds a remoteExecutableSchema for a service and computes required types
   * that might span across multiple services. Also tracks already discovered types.
   */
  async buildRemoteSchema(remoteSchemaDef: RemoteSchemaDefinition): Promise<void> {
    const { serviceName, relationships, schema, relationDefinitions } = remoteSchemaDef;
    this.connectedServices[serviceName].remoteExecutableSchema = await createRemoteSchema({
      broker: this.broker,
      service: serviceName
    });
    const computedSchema = parse(schema);
    const definedTypes = computedSchema
      .definitions
      .filter(d => {
        if (d.kind === 'ObjectTypeDefinition') {
          return !['Mutation', 'Query'].includes(d.name.value);
        }
        return false;
      })
      .map(d => selectn('name.value', d));

    this.discoveredGraphQLTypes = concatDifference(this.discoveredGraphQLTypes, definedTypes);

    if (relationships) {
      const relatedTypes = getRelatedTypes(parse(relationships));
      this.requiredGraphQLTypes = concatDifference(this.requiredGraphQLTypes, relatedTypes);
    }
  }

  /**
   * generateSchema
   *
   * Builds a single local schema using graphql-tools 'mergeSchemas' tool.
   * Merges together all remote schemas and relationship definitions that
   * span across services.
   */
  generateSchema(): GraphQLSchema {
    const remoteSchemas = [];
    const relationshipSchemas = [];
    const relationDefinitions = {};
    this.getConnectedServiceNames().forEach(serviceName => {
      const remoteSchemaDef = this.connectedServices[serviceName];
      if (remoteSchemaDef.remoteExecutableSchema) {
        remoteSchemas.push(remoteSchemaDef.remoteExecutableSchema);
      }
      if (remoteSchemaDef.relationships) {
        relationshipSchemas.push(remoteSchemaDef.relationships);
      }
      if (remoteSchemaDef.relationDefinitions) {
        relationDefinitions[serviceName] = remoteSchemaDef.relationDefinitions;
      }
    });

    const schemas = remoteSchemas.concat(relationshipSchemas);
    const resolvers = buildRelationalResolvers(relationDefinitions);
    this.schema = mergeSchemas({
      schemas,
      resolvers,
    });

    this.schema = this.alphabetizeSchema(this.schema);
    if (this.generateSnapshot) this.recordSnapshot();
    return this.schema;
  }

  /**
   * getConnectedServiceNames
   *
   * Returns an array of service names currently connected to the gateway that
   * also have a fully formed remoteExecutableSchema defined.
   */
  getConnectedServiceNames(): Array<GraphQLServiceName> {
    return Object.keys(this.connectedServices)
      .filter(serviceName => this.connectedServices[serviceName].remoteExecutableSchema);
  }

  /**
   * rebuildSchema
   *
   * Rebuilds the schema if the schema already existed and no required types are missing
   */
  rebuildSchema(): void {
    if (this.schema) {
      const required = difference(this.requiredGraphQLTypes, this.discoveredGraphQLTypes);
      if (required.length > 0) {
        if (this.broker.logger) {
          this.broker
            .logger
            .warn(`Schema refresh found ${required.join(', ')} types yet to be discovered`);
        }
        return;
      }
      this.generateSchema();
    }
  }

  /**
   * recordSnapshot
   *
   * Persists a pretty printed schema to file if schema exists
   */
  recordSnapshot(): void {
    if (this.schema) {
      fs.writeFileSync(this.settings.snapshotPath, printSchema(this.schema));
    }
  }

  /**
   * removeExecutableSchema
   *
   * When a service goes offline we remove the schema. This is not the long term
   * approach. Ideally long term we will stub the resolvers on said type to return
   * some sort of null response so that it doesn't cause outages on the client side
   */
  removeExecutableSchema(remoteSchemaDef: RemoteSchemaDefinition) {
    const { serviceName, relationships, schema, relationDefinitions } = remoteSchemaDef;
    const computedSchema = parse(schema);
    const definedTypes = computedSchema
      .definitions
      .filter(d => {
        if (d.kind === 'ObjectTypeDefinition') {
          return !['Mutation', 'Query'].includes(d.name.value);
        }
        return false;
      })
      .map(d => selectn('name.value', d));

    // remove the types defined in this schema from the discovered types
    this.discoveredGraphQLTypes = difference(this.discoveredGraphQLTypes, definedTypes);
    delete this.connectedServices[serviceName];
    this.rebuildSchema();
  }

  /**
   * start
   *
   * Starts the connected broker if required, then waits for required types
   * and expected services to be discovered. It will also wait until at least
   * one service is discovered.
   *
   * Calculates total time spent in each iteration and passes it recursively
   * so that the waitTimeout setting can be respected.
   */
  async start(totalTime: number = 0): Promise<GraphQLSchema> {
    const startTime = process.hrtime();
    if (totalTime > this.settings.waitTimeout) {
      throw new Error('Timeout');
    }

    let shouldRetry = false;
    if (!this.broker._started) await this.broker.start();

    const connectedServices = this.getConnectedServiceNames();
    if (connectedServices.length === 0) {
      shouldRetry = true;
    }

    if (!shouldRetry) {
      const required = difference(this.requiredGraphQLTypes, this.discoveredGraphQLTypes);
      const expected = difference(this.settings.expectedServices, connectedServices);
      if (required.length > 0 || expected.length > 0) {
        shouldRetry = true;
        if (this.broker.logger) {
          if (required.length > 0) {
            this.broker
              .logger
              .warn(`Still waiting for ${required.join(', ')} types to be discovered`);
          }
          if (expected.length > 0) {
            this.broker
              .logger
              .warn(`Still waiting for ${expected.join(', ')} services to be discovered`);
          }
        }
      }
    }

    if (shouldRetry) {
      await waitFor(this.settings.waitInterval);
      return await this.start(totalTime + computeTimeDiff(startTime));
    }
    if (this.broker.logger) {
      this.broker
        .logger
        .info(`Initial schema generation took ${totalTime + computeTimeDiff(startTime)}ms`);
    }
    const schema = this.generateSchema();
    return schema;
  }

  /**
   * stop
   *
   * Resets internal stores of connected services and data
   * then stops the broker.
   */
  stop() {
    this.connectedServices = {};
    this.requiredGraphQLTypes = [];
    this.discoveredGraphQLTypes = [];
    return this.broker.stop();
  }
}

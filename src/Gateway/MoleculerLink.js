// @flow
import { ApolloLink, Observable, RequestHandler } from 'apollo-link';
import { print } from 'graphql/language/printer';
import type { ExecutionResult } from 'graphql';

type ServiceOptions = {
  broker: {
    call: Function,
  },
  service: string,
};

function createMoleculerLink(opts: ServiceOptions): ApolloLink {
  return new ApolloLink(
    operation =>
      new Observable(observer => {
        const { credentials, fetcherOptions, graphqlContext } = operation.getContext();
        const { operationName, extensions, variables, query } = operation;
        const { broker, service } = opts;

        broker.call(`${service}.graphql`, {
          credentials,
          query: print(query),
          variables,
          extensions,
          operationName,
          graphqlContext
        })
          .then(result => {
            observer.next(result);
            observer.complete();
            return result;
          })
          .catch(err => {
            observer.error(err);
          });
      }),
  );
}

export class MoleculerLink extends ApolloLink {
  requester: RequestHandler;

  constructor(opts: ServiceOptions) {
    super();
    this.requester = createMoleculerLink(opts).request;
  }

  request(op): Observable<ExecutionResult> | null {
    return this.requester(op);
  }
}

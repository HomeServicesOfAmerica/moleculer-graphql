// @flow
import type { DocumentNode, TypeNode, NamedTypeNode, ObjectTypeDefinitionNode } from 'graphql';
import type { GraphQLTypeName } from '../Types/GraphQL';

type TypeExtensionDefinition = {
  kind: 'TypeExtensionDefinition',
  definition: ObjectTypeDefinitionNode,
  loc: { start: number, end: number },
};

type RelationshipDocumentNode = {
  kind: 'Document',
  definitions: Array<TypeExtensionDefinition>
}

function getNamedTypeNode(typeNode: TypeNode): NamedTypeNode {
  let unmodifiedTypeNode = typeNode;
  while (
    unmodifiedTypeNode.kind === 'ListType' ||
    unmodifiedTypeNode.kind === 'NonNullType'
  ) {
    unmodifiedTypeNode = unmodifiedTypeNode.type;
  }
  return unmodifiedTypeNode;
}

export function getRelatedTypes(documentNode: RelationshipDocumentNode): Array<GraphQLTypeName> {
  let types = [];
  documentNode.definitions.forEach((definition) => {
    if (definition.kind === 'TypeExtensionDefinition' && definition.definition) {
      types = types.concat(definition.definition.fields.map(field => {
        if (field.type) {
          const namedTypeNode = getNamedTypeNode(field.type);
          return namedTypeNode.name.value;
        }
        return null;
      }));
    }
  });
  return types;
}
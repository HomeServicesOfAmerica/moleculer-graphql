export opaque type dotNotationPath = string;

type ArgumentDefinitionMap = {
  [propName: string]: dotNotationPath,
}

export type RelationDefinition = {
  type: 'query' | 'mutation',
  args?: ArgumentDefinitionMap,
  operationName: string,
};

export type RelationDefinitions = {
  [fieldName: string]: RelationDefinition,
};

export type TypeRelationDefinitions = {
  [typeName: string]: RelationDefinitions,
}

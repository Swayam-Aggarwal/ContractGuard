
const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const normalizeForComparison = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizeForComparison);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [
        key,
        normalizeForComparison(value[key]),
      ])
  );
};

const serialize = (value) => {
  try {
    return JSON.stringify(normalizeForComparison(value));
  } catch {
    return String(value);
  }
};

const isSubset = (subset, superset) => {
  return subset.every((value) =>
    superset.some(
      (candidate) => serialize(candidate) === serialize(value)
    )
  );
};

// JSON Schema's "number" type includes integers. Keep this relationship
// explicit when comparing type sets so integer -> number is an expansion,
// while number -> integer is a narrowing.
const isJsonSchemaTypeSubset = (subsetType, supersetType) => {
  return (
    subsetType === supersetType ||
    (subsetType === "integer" && supersetType === "number")
  );
};

const isTypeSubset = (subset, superset) => {
  return subset.every((type) =>
    superset.some((candidate) =>
      isJsonSchemaTypeSubset(type, candidate)
    )
  );
};

const typeSetsOverlap = (left, right) => {
  return left.some((leftType) =>
    right.some((rightType) =>
      isJsonSchemaTypeSubset(leftType, rightType) ||
      isJsonSchemaTypeSubset(rightType, leftType)
    )
  );
};

const makeWarning = (field, message) => ({
  field,
  message,
});

const compareSchemas = (
  baseline,
  candidate,
  {
    direction = "request",
    field = "schema",
    openApiVersion,
    resolveBaselineReference,
    resolveCandidateReference,
    allowBaselineRefSiblings = true,
    allowCandidateRefSiblings = true,
  } = {}
) => {
  if (!["request", "response"].includes(direction)) {
    throw new TypeError(
      "Schema comparison direction must be request or response."
    );
  }

  const changes = [];
  const warnings = [];

  const visitedPairs = new WeakMap();
  const resolvingReferences = new Set();

  const addChange = (
    changeType,
    severity,
    changeField,
    message,
    oldValue = null,
    newValue = null
  ) => {
    changes.push({
      category: "schema",
      changeType,
      severity,
      breaking: severity === "BREAKING",
      field: changeField,
      message,
      oldValue,
      newValue,
    });
  };

  const addWarning = (changeField, message) => {
    const exists = warnings.some(
      (warning) =>
        warning.field === changeField &&
        warning.message === message
    );

    if (!exists) {
      warnings.push(makeWarning(changeField, message));
    }
  };

  const resolveSchema = (
    schema,
    side,
    changeField
  ) => {
    if (!isRecord(schema) || typeof schema.$ref !== "string") {
      return schema;
    }

    const identity = `${side}\u0000${schema.$ref}`;

    if (resolvingReferences.has(identity)) {
      addWarning(
        changeField,
        "Circular schema references prevent complete compatibility analysis."
      );

      return null;
    }

    const resolver = side === "baseline"
      ? resolveBaselineReference
      : resolveCandidateReference;

    if (typeof resolver !== "function") {
      addWarning(
        changeField,
        "The schema reference cannot be resolved by the compatibility analyzer."
      );

      return null;
    }

    resolvingReferences.add(identity);

    try {
      const resolved = resolver(schema.$ref);

      if (!isRecord(resolved) && typeof resolved !== "boolean") {
        addWarning(
          changeField,
          "The schema reference does not resolve to a valid schema."
        );

        return null;
      }

      const allowSiblings = side === "baseline"
        ? allowBaselineRefSiblings
        : allowCandidateRefSiblings;

      if (!allowSiblings) {
        return resolved;
      }

      // OpenAPI 3.1+ Schema Object $ref siblings are evaluated
      // together with the referenced schema.
      const siblings = Object.fromEntries(
        Object.entries(schema).filter(
          ([key]) => key !== "$ref"
        )
      );

      if (Object.keys(siblings).length === 0) {
        return resolved;
      }

      return {
        allOf: [
          resolved,
          siblings,
        ],
      };
    } catch {
      addWarning(
        changeField,
        "The schema reference could not be resolved."
      );

      return null;
    } finally {
      resolvingReferences.delete(identity);
    }
  };

  const getTypes = (schema) => {
    if (Array.isArray(schema.type)) {
      return schema.type;
    }

    if (typeof schema.type === "string") {
      return [schema.type];
    }

    return null;
  };

  const compareNode = (
    oldInput,
    newInput,
    changeField,
    depth = 0
  ) => {
    if (depth > 50) {
      addWarning(
        changeField,
        "Schema comparison exceeded the maximum nesting depth."
      );

      return;
    }

    const oldSchema = resolveSchema(
      oldInput,
      "baseline",
      changeField
    );

    const newSchema = resolveSchema(
      newInput,
      "candidate",
      changeField
    );

    if (oldSchema === null || newSchema === null) {
      return;
    }

    const oldBoolean = typeof oldSchema === "boolean";
    const newBoolean = typeof newSchema === "boolean";

    if (oldBoolean && newBoolean) {
      if (oldSchema !== newSchema) {
        const candidateExpands =
          oldSchema === false && newSchema === true;

        const breaking = direction === "request"
          ? !candidateExpands
          : candidateExpands;

        addChange(
          "SCHEMA_BOOLEAN_CHANGED",
          breaking ? "BREAKING" : "NON_BREAKING",
          changeField,
          "The candidate changes a boolean JSON Schema constraint.",
          oldSchema,
          newSchema
        );
      }

      return;
    }

    if (oldBoolean !== newBoolean) {
      addWarning(
        changeField,
        "A boolean schema was changed to or from an object schema; complete equivalence cannot be established automatically."
      );

      return;
    }

    if (!isRecord(oldSchema) || !isRecord(newSchema)) {
      if (serialize(oldInput) !== serialize(newInput)) {
        addWarning(
          changeField,
          "A schema reference or schema value could not be completely resolved."
        );
      }

      return;
    }

    let pairedSchemas = visitedPairs.get(oldSchema);

    if (!pairedSchemas) {
      pairedSchemas = new WeakSet();
      visitedPairs.set(oldSchema, pairedSchemas);
    }

    if (pairedSchemas.has(newSchema)) {
      return;
    }

    pairedSchemas.add(newSchema);

    // Changes to these keywords require logical JSON Schema evaluation.
    const unsupportedKeywords = [
      "allOf",
      "oneOf",
      "anyOf",
      "not",
      "if",
      "then",
      "else",
      "dependentSchemas",
      "dependentRequired",
      "patternProperties",
      "unevaluatedProperties",
      "unevaluatedItems",
      "$dynamicRef",
      "$dynamicAnchor",
      "$recursiveRef",
      "$recursiveAnchor",
      "$vocabulary",
      "$schema",
      "$anchor",
    ];

    for (const keyword of unsupportedKeywords) {
      if (
        serialize(oldSchema[keyword]) !==
        serialize(newSchema[keyword])
      ) {
        addWarning(
          `${changeField}.${keyword}`,
          `Changes to ${keyword} require more advanced JSON Schema evaluation.`
        );
      }
    }

    // Data type changes.
    const oldTypes = getTypes(oldSchema);
    const newTypes = getTypes(newSchema);

    if (
      serialize(oldTypes && [...oldTypes].sort()) !==
      serialize(newTypes && [...newTypes].sort())
    ) {
      const oldTypesAreSubset =
        oldTypes !== null &&
        newTypes !== null &&
        isTypeSubset(oldTypes, newTypes);

      const newTypesAreSubset =
        oldTypes !== null &&
        newTypes !== null &&
        isTypeSubset(newTypes, oldTypes);

      const hasTypeOverlap =
        oldTypes === null ||
        newTypes === null ||
        typeSetsOverlap(oldTypes, newTypes);

      const partiallyOverlappingTypes =
        oldTypes !== null &&
        newTypes !== null &&
        hasTypeOverlap &&
        !oldTypesAreSubset &&
        !newTypesAreSubset;

      if (partiallyOverlappingTypes) {
        addWarning(
          `${changeField}.type`,
          "The candidate type sets overlap without a clear compatibility relationship."
        );
      } else {
        const candidateExpandsTypes = oldTypes === null
          ? false
          : newTypes === null
            ? true
            : oldTypesAreSubset;

        // A completely disjoint replacement cannot preserve compatibility
        // in either direction: no previously valid value remains valid.
        const breaking = !hasTypeOverlap || (
          direction === "request"
            ? !candidateExpandsTypes
            : candidateExpandsTypes
        );

        addChange(
          "SCHEMA_TYPE_CHANGED",
          breaking ? "BREAKING" : "NON_BREAKING",
          `${changeField}.type`,
          "The candidate changes the permitted data types.",
          oldTypes,
          newTypes
        );
      }
    }

    // Required properties.
    const oldRequired = Array.isArray(oldSchema.required)
      ? oldSchema.required
      : [];

    const newRequired = Array.isArray(newSchema.required)
      ? newSchema.required
      : [];

    const addedRequired = newRequired.filter(
      (name) => !oldRequired.includes(name)
    );

    const removedRequired = oldRequired.filter(
      (name) => !newRequired.includes(name)
    );

    for (const name of addedRequired) {
      const breaking = direction === "request";

      addChange(
        "SCHEMA_REQUIRED_ADDED",
        breaking ? "BREAKING" : "NON_BREAKING",
        `${changeField}.required.${name}`,
        breaking
          ? `The candidate request schema now requires ${name}.`
          : `The candidate response schema guarantees ${name}.`,
        false,
        true
      );
    }

    for (const name of removedRequired) {
      const breaking = direction === "response";

      addChange(
        "SCHEMA_REQUIRED_REMOVED",
        breaking ? "BREAKING" : "NON_BREAKING",
        `${changeField}.required.${name}`,
        breaking
          ? `The candidate response schema no longer guarantees ${name}.`
          : `The candidate request schema no longer requires ${name}.`,
        true,
        false
      );
    }

    const oldProperties = isRecord(oldSchema.properties)
      ? oldSchema.properties
      : {};

    const newProperties = isRecord(newSchema.properties)
      ? newSchema.properties
      : {};

    const oldAdditional = oldSchema.additionalProperties ?? true;
    const newAdditional = newSchema.additionalProperties ?? true;

    // Properties removed from the candidate.
    for (const [name, oldProperty] of Object.entries(oldProperties)) {
      if (Object.hasOwn(newProperties, name)) {
        compareNode(
          oldProperty,
          newProperties[name],
          `${changeField}.properties.${name}`,
          depth + 1
        );

        continue;
      }

      if (direction === "response") {
        addChange(
          "SCHEMA_PROPERTY_REMOVED",
          "BREAKING",
          `${changeField}.properties.${name}`,
          `The candidate response schema removes the ${name} property.`,
          oldProperty,
          null
        );

        continue;
      }

      // For request schemas, removing a declared property does not
      // automatically prohibit it. additionalProperties defaults to true.
      if (newAdditional === false) {
        addChange(
          "SCHEMA_PROPERTY_REMOVED",
          "BREAKING",
          `${changeField}.properties.${name}`,
          `The candidate request schema removes ${name} and prohibits additional properties.`,
          oldProperty,
          null
        );

        continue;
      }

      if (isRecord(newAdditional)) {
        if (serialize(oldProperty) !== serialize(newAdditional)) {
          addWarning(
            `${changeField}.properties.${name}`,
            `The removed property ${name} may now be validated by additionalProperties; compatibility requires further schema evaluation.`
          );
        }

        continue;
      }

      addChange(
        "SCHEMA_PROPERTY_REMOVED",
        "NON_BREAKING",
        `${changeField}.properties.${name}`,
        `The candidate no longer declares ${name}, but additional properties remain accepted.`,
        oldProperty,
        null
      );
    }

    // Properties newly declared by the candidate.
    for (const [name, newProperty] of Object.entries(newProperties)) {
      if (Object.hasOwn(oldProperties, name)) {
        continue;
      }

      const isRequired = newRequired.includes(name);
      const breaking =
        direction === "request" && isRequired;

      addChange(
        "SCHEMA_PROPERTY_ADDED",
        breaking ? "BREAKING" : "NON_BREAKING",
        `${changeField}.properties.${name}`,
        breaking
          ? `The candidate request schema adds ${name} as a required property.`
          : `The candidate schema adds the ${name} property.`,
        null,
        newProperty
      );
    }

    // Enum changes are compared as sets, not ordered arrays.
    const oldHasEnum = Array.isArray(oldSchema.enum);
    const newHasEnum = Array.isArray(newSchema.enum);

    const oldEnum = oldHasEnum ? oldSchema.enum : null;
    const newEnum = newHasEnum ? newSchema.enum : null;

    const sameEnum =
      oldHasEnum === newHasEnum &&
      (
        !oldHasEnum ||
        (
          oldEnum.length === newEnum.length &&
          isSubset(oldEnum, newEnum) &&
          isSubset(newEnum, oldEnum)
        )
      );

    if (!sameEnum) {
      const candidateExpandsEnum = oldEnum === null
        ? false
        : newEnum === null
          ? true
          : isSubset(oldEnum, newEnum);

      const breaking = direction === "request"
        ? !candidateExpandsEnum
        : candidateExpandsEnum;

      addChange(
        "SCHEMA_ENUM_CHANGED",
        breaking ? "BREAKING" : "NON_BREAKING",
        `${changeField}.enum`,
        "The candidate changes the set of permitted enumeration values.",
        oldEnum,
        newEnum
      );
    }

    // const changes.
    const oldHasConst = Object.hasOwn(oldSchema, "const");
    const newHasConst = Object.hasOwn(newSchema, "const");

    if (
      oldHasConst !== newHasConst ||
      (
        oldHasConst &&
        serialize(oldSchema.const) !== serialize(newSchema.const)
      )
    ) {
      const candidateExpands =
        oldHasConst && !newHasConst;

      const breaking =
        oldHasConst && newHasConst
          ? true
          : direction === "request"
            ? !candidateExpands
            : candidateExpands;

      addChange(
        "SCHEMA_CONST_CHANGED",
        breaking ? "BREAKING" : "NON_BREAKING",
        `${changeField}.const`,
        "The candidate changes the schema's single permitted value.",
        oldHasConst ? oldSchema.const : null,
        newHasConst ? newSchema.const : null
      );
    }

    // Numeric and cardinality bounds.
    const lowerBounds = [
      "minimum",
      "minLength",
      "minItems",
      "minProperties",
      "minContains",
    ];

    const upperBounds = [
      "maximum",
      "maxLength",
      "maxItems",
      "maxProperties",
      "maxContains",
    ];

    for (const keyword of lowerBounds) {
      const oldValue = typeof oldSchema[keyword] === "number"
        ? oldSchema[keyword]
        : null;

      const newValue = typeof newSchema[keyword] === "number"
        ? newSchema[keyword]
        : null;

      if (oldValue === newValue) continue;

      const stricter =
        newValue !== null &&
        (oldValue === null || newValue > oldValue);

      const breaking = direction === "request"
        ? stricter
        : !stricter;

      addChange(
        "SCHEMA_CONSTRAINT_CHANGED",
        breaking ? "BREAKING" : "NON_BREAKING",
        `${changeField}.${keyword}`,
        `The ${keyword} lower-bound constraint has changed.`,
        oldValue,
        newValue
      );
    }

    for (const keyword of upperBounds) {
      const oldValue = typeof oldSchema[keyword] === "number"
        ? oldSchema[keyword]
        : null;

      const newValue = typeof newSchema[keyword] === "number"
        ? newSchema[keyword]
        : null;

      if (oldValue === newValue) continue;

      const stricter =
        newValue !== null &&
        (oldValue === null || newValue < oldValue);

      const breaking = direction === "request"
        ? stricter
        : !stricter;

      addChange(
        "SCHEMA_CONSTRAINT_CHANGED",
        breaking ? "BREAKING" : "NON_BREAKING",
        `${changeField}.${keyword}`,
        `The ${keyword} upper-bound constraint has changed.`,
        oldValue,
        newValue
      );
    }

    // Constraints whose full semantic equivalence is not implemented.
    const manualReviewKeywords = [
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf",
      "uniqueItems",
      "propertyNames",
      "contains",
      "prefixItems",
      "contentEncoding",
      "contentMediaType",
      "contentSchema",
    ];

    for (const keyword of manualReviewKeywords) {
      if (
        serialize(oldSchema[keyword]) !==
        serialize(newSchema[keyword])
      ) {
        addWarning(
          `${changeField}.${keyword}`,
          `Changes to ${keyword} require additional JSON Schema evaluation.`
        );
      }
    }

    // additionalProperties defaults to true.
    if (
      serialize(oldAdditional) !==
      serialize(newAdditional)
    ) {
      const oldIsBoolean = typeof oldAdditional === "boolean";
      const newIsBoolean = typeof newAdditional === "boolean";

      if (oldIsBoolean && newIsBoolean) {
        const candidateExpands =
          oldAdditional === false &&
          newAdditional === true;

        const breaking = direction === "request"
          ? !candidateExpands
          : candidateExpands;

        addChange(
          "SCHEMA_ADDITIONAL_PROPERTIES_CHANGED",
          breaking ? "BREAKING" : "NON_BREAKING",
          `${changeField}.additionalProperties`,
          "The candidate changes whether undeclared object properties are accepted.",
          oldAdditional,
          newAdditional
        );
      } else if (
        isRecord(oldAdditional) &&
        isRecord(newAdditional)
      ) {
        compareNode(
          oldAdditional,
          newAdditional,
          `${changeField}.additionalProperties`,
          depth + 1
        );
      } else {
        addWarning(
          `${changeField}.additionalProperties`,
          "The additionalProperties schema changed between boolean and object forms; its full compatibility cannot be established automatically."
        );
      }
    }

    // Array item schemas.
    const oldItems = oldSchema.items ?? true;
    const newItems = newSchema.items ?? true;

    if (serialize(oldItems) !== serialize(newItems)) {
      if (
        (isRecord(oldItems) || typeof oldItems === "boolean") &&
        (isRecord(newItems) || typeof newItems === "boolean")
      ) {
        compareNode(
          oldItems,
          newItems,
          `${changeField}.items`,
          depth + 1
        );
      } else {
        addWarning(
          `${changeField}.items`,
          "The items constraint changed and requires additional JSON Schema evaluation."
        );
      }
    }

    if (oldSchema.pattern !== newSchema.pattern) {
      addWarning(
        `${changeField}.pattern`,
        "Changes to regular expression patterns require implementation-specific validation."
      );
    }

    if (oldSchema.format !== newSchema.format) {
      addWarning(
        `${changeField}.format`,
        "Changes to schema formats require implementation-specific validation."
      );
    }

    for (const keyword of ["readOnly", "writeOnly"]) {
      if (
        (oldSchema[keyword] === true) !==
        (newSchema[keyword] === true)
      ) {
        addWarning(
          `${changeField}.${keyword}`,
          `Changes to ${keyword} affect request and response behavior and require contextual review.`
        );
      }
    }

    // nullable is an OpenAPI 3.0 keyword. It is not used as a
    // nullability constraint for OpenAPI 3.1 or 3.2 schemas.
    const isOpenApi30 =
      openApiVersion === undefined ||
      /^3\.0\./u.test(openApiVersion);

    if (isOpenApi30 && oldSchema.nullable !== newSchema.nullable) {
      const newlyNullable = newSchema.nullable === true;

      const breaking = direction === "response"
        ? newlyNullable
        : !newlyNullable;

      addChange(
        "SCHEMA_NULLABILITY_CHANGED",
        breaking ? "BREAKING" : "NON_BREAKING",
        `${changeField}.nullable`,
        "The schema's nullability has changed.",
        oldSchema.nullable ?? false,
        newSchema.nullable ?? false
      );
    }
  };

  compareNode(baseline, candidate, field);

  return {
    changes,
    warnings,
  };
};

export default compareSchemas;

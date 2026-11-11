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
    classification,
    changeField,
    message,
    oldValue = null,
    newValue = null
  ) => {
    const severity = classification === "BREAKING"
      ? "BREAKING"
      : classification === "NON_BREAKING"
        ? "NON_BREAKING"
        : "INFO";

    changes.push({
      category: "schema",
      changeType,
      classification,
      severity,
      breaking: classification === "BREAKING",
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
      "discriminator",
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

    // Data type changes. A response type expansion is potentially breaking
    // when it preserves the old type but permits additional output types.
    // A fully disjoint type replacement remains breaking in either direction.
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
        let candidateExpandsTypes;

        if (oldTypes === null && newTypes !== null) {
          candidateExpandsTypes = false;
        } else if (oldTypes !== null && newTypes === null) {
          candidateExpandsTypes = true;
        } else {
          candidateExpandsTypes = oldTypesAreSubset;
        }

        let classification;

        if (!hasTypeOverlap) {
          classification = "BREAKING";
        } else if (direction === "request") {
          classification = candidateExpandsTypes
            ? "NON_BREAKING"
            : "BREAKING";
        } else {
          classification = candidateExpandsTypes
            ? "POTENTIALLY_BREAKING"
            : "NON_BREAKING";
        }

        addChange(
          "SCHEMA_TYPE_CHANGED",
          classification,
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
        compareNode(
          oldProperty,
          newAdditional,
          `${changeField}.properties.${name}.additionalProperties`,
          depth + 1
        );

        addChange(
          "SCHEMA_PROPERTY_REMOVED",
          "POTENTIALLY_BREAKING",
          `${changeField}.properties.${name}`,
          `The candidate no longer declares ${name}; its values are now governed by additionalProperties.`,
          oldProperty,
          newAdditional
        );

        continue;
      }

      addChange(
        "SCHEMA_PROPERTY_REMOVED",
        "POTENTIALLY_BREAKING",
        `${changeField}.properties.${name}`,
        `The candidate no longer declares ${name}, but additional properties remain accepted.`,
        oldProperty,
        null
      );
    }

    // Properties newly declared by the candidate must be evaluated against
    // the baseline's effective additionalProperties rule. A baseline schema
    // with additionalProperties: false does not accept this property at all;
    // a schema-valued rule may already constrain its value.
    for (const [name, newProperty] of Object.entries(newProperties)) {
      if (Object.hasOwn(oldProperties, name)) {
        continue;
      }

      const isRequired = newRequired.includes(name);
      let classification = direction === "request" && isRequired
        ? "BREAKING"
        : "NON_BREAKING";

      if (direction === "response") {
        if (oldAdditional === false) {
          classification = "POTENTIALLY_BREAKING";
        } else if (isRecord(oldAdditional)) {
          const beforeChanges = changes.length;
          const beforeWarnings = warnings.length;

          compareNode(
            oldAdditional,
            newProperty,
            `${changeField}.properties.${name}.baselineAdditionalProperties`,
            depth + 1
          );

          const nestedChanges = changes.slice(beforeChanges);
          const nestedWarnings = warnings.length > beforeWarnings;

          if (nestedChanges.some((item) =>
            item.classification === "BREAKING" ||
            item.classification === "POTENTIALLY_BREAKING"
          ) || nestedWarnings) {
            classification = "POTENTIALLY_BREAKING";

            // A newly declared response property is a RES-005-style risk:
            // strict baseline validators may reject it, but ordinary
            // consumers commonly ignore unknown fields. Do not overstate
            // the finding as unconditionally breaking.
            for (const nested of nestedChanges) {
              if (nested.classification === "BREAKING") {
                nested.classification = "POTENTIALLY_BREAKING";
                nested.severity = "INFO";
                nested.breaking = false;
              }
            }
          }
        }
      } else if (isRecord(oldAdditional)) {
        const beforeChanges = changes.length;
        const beforeWarnings = warnings.length;

        compareNode(
          oldAdditional,
          newProperty,
          `${changeField}.properties.${name}.baselineAdditionalProperties`,
          depth + 1
        );

        const nestedChanges = changes.slice(beforeChanges);
        const nestedWarnings = warnings.length > beforeWarnings;

        if (nestedChanges.some((item) =>
          item.classification === "BREAKING"
        )) {
          classification = "BREAKING";
        } else if (nestedWarnings) {
          classification = "POTENTIALLY_BREAKING";
        }
      }

      addChange(
        "SCHEMA_PROPERTY_ADDED",
        classification,
        `${changeField}.properties.${name}`,
        classification === "BREAKING"
          ? `The candidate request schema adds ${name} in a way that can reject baseline-valid values or requires it.`
          : classification === "POTENTIALLY_BREAKING"
            ? `The candidate adds ${name}, but the baseline's additionalProperties rule may not accept every candidate value.`
            : `The candidate schema adds the ${name} property without narrowing the baseline contract.`,
        null,
        newProperty
      );
    }

    // enum and const jointly define one effective finite value set. Compare
    // that set once so a simultaneous enum/const edit cannot create
    // contradictory findings for a semantically compatible expansion.
    const getFiniteValues = (schema) => {
      const hasConst = Object.hasOwn(schema, "const");
      const hasEnum = Array.isArray(schema.enum);

      if (!hasConst && !hasEnum) {
        return { constrained: false, values: null, usesEnum: false };
      }

      let values = hasConst ? [schema.const] : [...schema.enum];

      if (hasConst && hasEnum) {
        values = values.filter((value) =>
          serialize(value) === serialize(schema.const)
        );
      }

      return {
        constrained: true,
        values,
        usesEnum: hasEnum,
      };
    };

    const oldFinite = getFiniteValues(oldSchema);
    const newFinite = getFiniteValues(newSchema);

    if (
      (oldFinite.constrained && oldFinite.values.length === 0) ||
      (newFinite.constrained && newFinite.values.length === 0)
    ) {
      addWarning(
        `${changeField}.enum`,
        "The schema's const and enum constraints have an empty intersection; compatibility cannot be established for an invalid finite-value constraint."
      );
    } else {
      const oldValues = oldFinite.values;
      const newValues = newFinite.values;
      const sameFiniteSet =
        oldFinite.constrained === newFinite.constrained &&
        (
          !oldFinite.constrained ||
          (
            oldValues.length === newValues.length &&
            isSubset(oldValues, newValues) &&
            isSubset(newValues, oldValues)
          )
        );

      if (!sameFiniteSet) {
        const candidateExpandsValues = !oldFinite.constrained
          ? false
          : !newFinite.constrained
            ? true
            : isSubset(oldValues, newValues);

        const candidateNarrowsValues = !newFinite.constrained
          ? false
          : !oldFinite.constrained
            ? true
            : isSubset(newValues, oldValues);

        let classification;

        if (direction === "request") {
          classification = candidateExpandsValues
            ? "NON_BREAKING"
            : "BREAKING";
        } else if (candidateNarrowsValues) {
          classification = "NON_BREAKING";
        } else if (candidateExpandsValues) {
          classification = "POTENTIALLY_BREAKING";
        } else {
          const overlaps = oldValues?.some((value) =>
            newValues?.some((candidate) =>
              serialize(value) === serialize(candidate)
            )
          );

          classification = overlaps
            ? "POTENTIALLY_BREAKING"
            : "BREAKING";
        }

        const changeType =
          oldFinite.usesEnum || newFinite.usesEnum
            ? "SCHEMA_ENUM_CHANGED"
            : "SCHEMA_CONST_CHANGED";

        addChange(
          changeType,
          classification,
          `${changeField}.${changeType === "SCHEMA_ENUM_CHANGED" ? "enum" : "const"}`,
          "The candidate changes the effective set of permitted finite values.",
          oldValues,
          newValues
        );
      }
    }

    // Compare a bound only when both schema versions allow at least one
    // instance type to which that keyword applies. Otherwise a keyword can
    // appear to have been removed merely because the candidate changed to a
    // disjoint type where the old constraint has no semantic effect. For
    // example, minimum applies to numbers, not to a string replacement.
    const constraintTypes = {
      minimum: ["number", "integer"],
      maximum: ["number", "integer"],
      minLength: ["string"],
      maxLength: ["string"],
      minItems: ["array"],
      maxItems: ["array"],
      minProperties: ["object"],
      maxProperties: ["object"],
      minContains: ["array"],
      maxContains: ["array"],
    };

    const supportsConstraintType = (types, applicableTypes) => {
      // An omitted type keyword leaves the schema applicable to every JSON
      // type, so the constraint can still matter on that side.
      if (types === null) return true;

      return types.some((type) => applicableTypes.includes(type));
    };

    const shouldCompareConstraint = (keyword) => {
      const applicableTypes = constraintTypes[keyword];

      return (
        supportsConstraintType(oldTypes, applicableTypes) &&
        supportsConstraintType(newTypes, applicableTypes)
      );
    };

    // Numeric and cardinality lower bounds.
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
      if (!shouldCompareConstraint(keyword)) continue;

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

      const classification = direction === "request"
        ? stricter ? "BREAKING" : "NON_BREAKING"
        : stricter ? "NON_BREAKING" : "POTENTIALLY_BREAKING";

      addChange(
        "SCHEMA_CONSTRAINT_CHANGED",
        classification,
        `${changeField}.${keyword}`,
        `The ${keyword} lower-bound constraint has changed.`,
        oldValue,
        newValue
      );
    }

    for (const keyword of upperBounds) {
      if (!shouldCompareConstraint(keyword)) continue;

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

      const classification = direction === "request"
        ? stricter ? "BREAKING" : "NON_BREAKING"
        : stricter ? "NON_BREAKING" : "POTENTIALLY_BREAKING";

      addChange(
        "SCHEMA_CONSTRAINT_CHANGED",
        classification,
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
      if (
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
        // false accepts no undeclared values; true accepts every value.
        // A schema-valued additionalProperties sits between those extremes.
        let candidateExpands;

        if (oldAdditional === false) {
          candidateExpands = newAdditional !== false;
        } else if (newAdditional === false) {
          candidateExpands = false;
        } else if (oldAdditional === true) {
          candidateExpands = false;
        } else if (newAdditional === true) {
          candidateExpands = true;
        } else {
          candidateExpands = null;
        }

        if (candidateExpands === null) {
          addWarning(
            `${changeField}.additionalProperties`,
            "The additionalProperties schema changed between boolean and object forms in a way that cannot be proven by the supported subset."
          );
        } else {
          const classification = direction === "request"
            ? candidateExpands ? "NON_BREAKING" : "BREAKING"
            : candidateExpands ? "POTENTIALLY_BREAKING" : "NON_BREAKING";

          addChange(
            "SCHEMA_ADDITIONAL_PROPERTIES_CHANGED",
            classification,
            `${changeField}.additionalProperties`,
            "The candidate changes the set of values accepted for undeclared object properties.",
            oldAdditional,
            newAdditional
          );
        }
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

    if (isOpenApi30) {
      const oldNullable = oldSchema.nullable === true;
      const newNullable = newSchema.nullable === true;

      if (oldNullable !== newNullable) {
        const classification = direction === "request"
          ? newNullable ? "NON_BREAKING" : "BREAKING"
          : newNullable ? "POTENTIALLY_BREAKING" : "NON_BREAKING";

        addChange(
          "SCHEMA_NULLABILITY_CHANGED",
          classification,
          `${changeField}.nullable`,
          "The schema's nullability has changed.",
          oldNullable,
          newNullable
        );
      }
    }
  };

  compareNode(baseline, candidate, field);

  return {
    changes,
    warnings,
  };
};

export default compareSchemas;
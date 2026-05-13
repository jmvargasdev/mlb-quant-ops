const fs = require('fs');
const path = require('path');
const { buildDecisionPanel } = require('../backend/data-service');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'contracts', 'schemas', 'executive_allocation.schema.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function resolveRef(schema, ref) {
  if (!ref.startsWith('#/')) {
    throw new Error(`Unsupported schema ref: ${ref}`);
  }

  return ref
    .slice(2)
    .split('/')
    .reduce((node, segment) => node?.[segment], schema);
}

function validateNode({ rootSchema, schema, value, pathLabel, errors }) {
  if (schema.$ref) {
    const target = resolveRef(rootSchema, schema.$ref);
    if (!target) {
      errors.push(`${pathLabel}: unresolved ref ${schema.$ref}`);
      return;
    }
    validateNode({ rootSchema, schema: target, value, pathLabel, errors });
    return;
  }

  if (schema.anyOf) {
    const branchErrors = schema.anyOf.map((branch) => {
      const nestedErrors = [];
      validateNode({ rootSchema, schema: branch, value, pathLabel, errors: nestedErrors });
      return nestedErrors;
    });
    if (branchErrors.every((nestedErrors) => nestedErrors.length > 0)) {
      errors.push(`${pathLabel}: does not match any allowed schema`);
    }
    return;
  }

  if (schema.type) {
    const allowedTypes = asArray(schema.type);
    const actualType = typeOf(value);
    if (!allowedTypes.includes(actualType)) {
      errors.push(`${pathLabel}: expected ${allowedTypes.join(' or ')}, got ${actualType}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${pathLabel}: expected one of ${schema.enum.join(', ')}, got ${value}`);
  }

  if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
    errors.push(`${pathLabel}: expected at least ${schema.minLength} characters`);
  }

  if (schema.pattern && typeof value === 'string') {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      errors.push(`${pathLabel}: does not match pattern ${schema.pattern}`);
    }
  }

  if (schema.type === 'object' || typeOf(value) === 'object') {
    const required = schema.required || [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${pathLabel}.${key}: missing required property`);
      }
    }

    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        validateNode({
          rootSchema,
          schema: childSchema,
          value: value[key],
          pathLabel: `${pathLabel}.${key}`,
          errors,
        });
      }
    }
  }

  if ((schema.type === 'array' || typeOf(value) === 'array') && schema.items) {
    value.forEach((item, index) => {
      validateNode({
        rootSchema,
        schema: schema.items,
        value: item,
        pathLabel: `${pathLabel}[${index}]`,
        errors,
      });
    });
  }
}

function validateSchema({ schema, value, label }) {
  const errors = [];
  validateNode({
    rootSchema: schema,
    schema,
    value,
    pathLabel: label,
    errors,
  });
  return errors;
}

function validateExecutiveAllocationPolicies(executiveAllocation) {
  const errors = [];
  const primary = executiveAllocation.primary_allocation;
  const passPolicy = (executiveAllocation.policy_gates || []).find((gate) => gate.code === 'PASS_CANNOT_BE_PRIMARY');

  if (primary?.action === 'Pass') {
    errors.push('executive_allocation.primary_allocation: PASS_CANNOT_BE_PRIMARY violated');
  }

  if (!passPolicy) {
    errors.push('executive_allocation.policy_gates: missing PASS_CANNOT_BE_PRIMARY');
  }

  if (passPolicy && !['passed', 'active'].includes(passPolicy.status)) {
    errors.push('executive_allocation.policy_gates.PASS_CANNOT_BE_PRIMARY: invalid status');
  }

  return errors;
}

function main() {
  const schema = readJson(SCHEMA_PATH);
  const decisionPanel = buildDecisionPanel();
  const executiveAllocation = decisionPanel.executive_allocation;
  const errors = [
    ...validateSchema({
      schema,
      value: executiveAllocation,
      label: 'executive_allocation',
    }),
    ...validateExecutiveAllocationPolicies(executiveAllocation),
  ];

  if (errors.length) {
    console.error('Contract validation failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(JSON.stringify({
    status: 'passed',
    contracts: ['executive_allocation'],
    policies: ['PASS_CANNOT_BE_PRIMARY'],
    allocation_rows: executiveAllocation.allocation_rows.length,
    primary_allocation: executiveAllocation.primary_allocation?.team || null,
  }, null, 2));
}

main();

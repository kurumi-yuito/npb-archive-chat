import { z } from 'zod'

const outputKinds = ['player_information', 'staff_information', 'event_records', 'game_results', 'series_result', 'game_schedule', 'game_details', 'team_statistics', 'appearance_records', 'batting_records', 'pitching_records', 'batting_statistics', 'pitching_statistics', 'fielding_statistics', 'affiliations', 'roster', 'awards'] as const
const scalar = z.union([z.string(), z.number(), z.boolean()])
const year = z.number().int().min(1936).max(2200)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Semantic request before identity resolution. IDs belong to execution evidence. */
const queryScopeSchema = z.object({
  entities: z.array(z.object({
    kind: z.enum(['player', 'team', 'venue']),
    role: z.enum(['subject', 'batter', 'pitcher', 'runner', 'opponent']),
    mention: z.string().min(1),
  }).strict()),
  temporal_scope: z.object({
    years: z.array(year),
    year_from: year.nullable(),
    year_to: year.nullable(),
    date_from: date.nullable(),
    date_to: date.nullable(),
    relative: z.string().min(1).nullable(),
  }).strict(),
  competition_scope: z.object({
    level: z.enum(['first', 'farm', 'both', 'unspecified']),
    competitions: z.array(z.string().min(1)),
  }).strict(),
  predicates: z.array(z.object({
    field: z.string().min(1),
    operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
    value: z.union([scalar, z.array(scalar)]),
  }).strict()),
  aggregation: z.array(z.object({
    operation: z.enum(['count', 'sum', 'average', 'min', 'max', 'rate']),
    field: z.string().min(1),
  }).strict()),
  grouping: z.array(z.string().min(1)),
  ordering: z.array(z.object({ field: z.string().min(1), direction: z.enum(['asc', 'desc']) }).strict()),
  completeness: z.object({
    mode: z.enum(['all', 'top_n', 'bounded', 'unspecified']),
    limit: z.number().int().positive().nullable(),
  }).strict(),
  context_references: z.array(z.object({ field: z.string().min(1), reference: z.string().min(1) }).strict()),
  unresolved_constraints: z.array(z.string().min(1)),
}).strict()

const scopedOutputSchema = z.preprocess((value) => {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'scope' in value && value.scope === null) {
    const { scope: _scope, ...output } = value
    void _scope
    return output
  }
  return value
}, z.object({ kind: z.enum(outputKinds), fields: z.array(z.string().min(1)), scope: queryScopeSchema.optional() }).strict())

export const queryContractSchema = queryScopeSchema.extend({
  version: z.literal(1), requested_output: z.array(scopedOutputSchema).min(1),
}).strict().transform((contract) => {
  const { version: _version, requested_output, ...common } = contract
  void _version
  const shared = JSON.stringify(common)
  return { ...contract, requested_output: requested_output.map((output): z.infer<typeof scopedOutputSchema> => {
    if (!output.scope || JSON.stringify(output.scope) !== shared) return output
    const { scope: _scope, ...projection } = output
    void _scope
    return projection
  }) }
})

export type QueryContract = z.infer<typeof queryContractSchema>

// JSON schema for the provider. Runtime validation above remains authoritative.
const text = { type: 'string', minLength: 1 }
const nullableText = { type: ['string', 'null'] }
const strings = { type: 'array', items: text }
const object = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
})
const array = (items: unknown) => ({ type: 'array', items })
const enumeration = (values: readonly string[]) => ({ type: 'string', enum: values })
const nullableYear = { type: ['integer', 'null'], minimum: 1936, maximum: 2200 }
const relativeTemporalKinds = ['career', 'current_season', 'previous_season', 'recent_appearances', 'latest_appearance',
  'today', 'yesterday', 'tomorrow', 'current_month', 'previous_month', 'next_month', 'current_week', 'previous_week', 'next_week'] as const
const queryScopeJsonSchema = object({
  entities: array(object({ kind: enumeration(['player', 'team', 'venue']), role: enumeration(['subject', 'batter', 'pitcher', 'runner', 'opponent']), mention: text })),
  temporal_scope: object({ years: array({ type: 'integer', minimum: 1936, maximum: 2200 }), year_from: nullableYear, year_to: nullableYear, date_from: nullableText, date_to: nullableText, relative: { type: ['string', 'null'], enum: [...relativeTemporalKinds, null] } }),
  competition_scope: object({ level: enumeration(['first', 'farm', 'both', 'unspecified']), competitions: strings }),
  predicates: array(object({ field: text, operator: enumeration(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']), value: { anyOf: [{ type: ['string', 'number', 'boolean'] }, array({ type: ['string', 'number', 'boolean'] })] } })),
  aggregation: array(object({ operation: enumeration(['count', 'sum', 'average', 'min', 'max', 'rate']), field: text })),
  grouping: strings,
  ordering: array(object({ field: text, direction: enumeration(['asc', 'desc']) })),
  completeness: object({ mode: enumeration(['all', 'top_n', 'bounded', 'unspecified']), limit: { type: ['integer', 'null'], minimum: 1 } }),
  context_references: array(object({ field: text, reference: text })),
  unresolved_constraints: strings,
})

export const queryContractJsonSchema = object({
  version: { type: 'integer', enum: [1] },
  requested_output: { ...array(object({ kind: enumeration(outputKinds), fields: strings,
    scope: { anyOf: [queryScopeJsonSchema, { type: 'null' }] } })), minItems: 1 },
  ...queryScopeJsonSchema.properties,
})

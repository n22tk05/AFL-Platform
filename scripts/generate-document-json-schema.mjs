import fs from 'node:fs';
const str = { type: 'string' }, nullableStr = { type: ['string', 'null'] }, int = { type: 'integer', minimum: 0 }, page = { type: 'integer', minimum: 1 }, nullablePage = { anyOf: [page, { type: 'null' }] };
const ref = name => ({ $ref: '#/$defs/' + name });
const list = items => ({ type: 'array', items });
const strings = { ...list(str), uniqueItems: true };
const enumeration = (...values) => ({ enum: values });
const object = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const refs = { sourceLineIds: strings, sourceBlockIds: strings };
const status = enumeration('needs_review', 'confirmed');
const bbox = { anyOf: [{ type: 'null' }, { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number', minimum: 0, maximum: 1 } }] };
const dimensions = { anyOf: [{ type: 'null' }, { type: 'integer', minimum: 1, maximum: 8192 }] };
const confidence = { anyOf: [{ type: 'null' }, { type: 'number', minimum: 0, maximum: 1 }] };
const evidence = object({ method: enumeration('regex', 'none', 'provider_layout', 'pixel_heuristic'), rule: nullableStr, verified: { type: 'boolean' } });
const reviewed = { status, evidence: ref('evidence'), reviewReasons: list(str) };
const block = object({ id: str, providerId: str, page, order: int, text: str, bbox: ref('bbox'), confidence, kind: enumeration('line', 'token') });
const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#', $id: 'urn:afl:document-export:1.0.0',
  title: 'AFL grounded document JSON export v1',
  ...object({
    schemaVersion: { const: '1.0.0' }, documentId: { type: 'string', minLength: 1, maxLength: 120 },
    status: enumeration('success', 'partial', 'failed'),
    provider: object({ name: { type: 'string', minLength: 1 }, model: nullableStr }),
    source: object({ mimeType: enumeration('image/png', 'image/jpeg'), pageCount: { ...page, maximum: 100 }, frame: { const: 'processed-primary' }, deskewApplied: { type: ['boolean', 'null'] } }),
    rawText: str,
    pages: list(object({ page, status: enumeration('success', 'failed'), error: nullableStr, width: dimensions, height: dimensions,
      coordinateSystem: { const: 'normalized-xyxy' }, readingOrder: enumeration('provider', 'geometric-heuristic', 'text-splitting') })),
    lines: list(object({ id: str, page: nullablePage, order: int, text: str, newline: enumeration('', '\n', '\r', '\r\n'), start: int, end: int, provenance: { const: 'text-splitting' } })),
    blocks: list(ref('block')),
    nodes: list(object({ id: str, type: enumeration('national_heading', 'motto', 'document_title', 'document_code', 'date_line', 'section_heading', 'field_label_value', 'field_label', 'blank_input', 'checkbox_item', 'signature_title', 'signature_instruction', 'bullet_item', 'legal_reference', 'blank_line', 'unknown'),
      text: str, page: nullablePage, order: int, ...refs, ...reviewed })),
    structure: object({
      headers: strings, titles: strings, dateLines: strings,
      sections: list(object({ id: str, headingNodeId: str, nodeIds: strings })),
      fields: list(object({ id: str, nodeId: str, label: str, rawValue: nullableStr, normalizedValue: nullableStr,
        valueState: enumeration('observed', 'blank', 'unreadable'), ...refs, ...reviewed })),
      checkboxes: list(object({ id: str, nodeId: str, label: str, state: enumeration('checked', 'unchecked', 'unknown'), ...refs, ...reviewed })),
      tables: list(object({ id: str, page, headerRowCount: int, status: { const: 'needs_review' }, evidence: ref('evidence'),
        rows: list(list(object({ rowIndex: int, columnIndex: int, rowSpan: page, columnSpan: page, rawValue: str, normalizedValue: nullableStr, ...refs,
          sourceRanges: list(object({ start: int, end: int })) }))) })),
      signatures: list(object({ nodeId: str, identity: { type: 'null' }, evidence: ref('evidence'), status: { const: 'needs_review' } })),
      freeText: strings, unclassified: strings,
    }),
    warnings: list(str), requiresReview: { type: 'boolean' },
    review: object({ selectedAttempt: nullablePage, selectionReason: nullableStr,
      attempts: list(object({ attempt: page, variant: str, provider: str, rawText: nullableStr, blocks: list(ref('block')), errorCode: nullableStr })),
      regions: list(object({ bbox: ref('bbox'), reason: str, status: str })),
    }),
  }),
  $defs: { bbox, block, evidence },
};
fs.writeFileSync(new URL('../src/shared/document-export.schema.json', import.meta.url), JSON.stringify(schema, null, 2) + '\n');

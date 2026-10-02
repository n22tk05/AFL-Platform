type PreviewNode = { type: string; value?: string; children?: PreviewNode[] };

/** Render only the assembler's exact line-break tag; other source HTML stays inert. */
export function rehypeTableLineBreaks() {
  return function transform(node: PreviewNode): void {
    if (node.type === 'raw' && node.value === '<br>') {
      Object.assign(node, { type: 'element', tagName: 'br', properties: {}, children: [] });
      delete node.value;
    }
    node.children?.forEach(transform);
  };
}

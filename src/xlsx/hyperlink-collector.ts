import { type Hyperlink, type Relationships, RelationshipType } from './xlsx-types'

export class HyperlinkCollector {
  private relMap = new Map<string, number>()
  private rels: Relationships['relationships'] = []
  private hyperlinks: Hyperlink[] = []

  add(row: number, col: number, href: string) {
    let id = this.relMap.get(href)

    if (!id) {
      id = this.rels.length + 1
      this.relMap.set(href, id)

      this.rels.push({
        id: { id },
        target: href,
        targetMode: 'External',
        type: RelationshipType.HYPERLINK,
      })
    }

    this.hyperlinks.push({
      ref: { row, col },
      id: { id },
    })
  }

  getHyperlinks(): Hyperlink[] | null {
    return this.hyperlinks.length ? this.hyperlinks : null
  }

  getRelationships(): Relationships | undefined {
    return this.rels.length ? { relationships: this.rels } : undefined
  }
}

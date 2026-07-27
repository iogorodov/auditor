// Мини-парсер XML под машинный XML из xlsx: элементы, атрибуты, текст, entities, CDATA;
// комментарии, PI и DOCTYPE пропускаются. Префиксы неймспейсов срезаются — сопоставление
// в ридере идёт по локальным именам. Текст сохраняется как есть (без trim): переносы строк
// и пробелы в значениях ячеек значимы.

export type XmlElement = {
  name: string // локальное имя (без префикса)
  attributes: Record<string, string> // локальное имя -> значение
  children: XmlElement[]
  text: string // конкатенация текстовых узлов первого уровня
}

function localName(name: string): string {
  const i = name.indexOf(':')
  return i >= 0 ? name.slice(i + 1) : name
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ENTITIES[body] ?? match
  })
}

class Parser {
  private pos = 0

  constructor(private readonly src: string) {}

  private error(message: string): Error {
    return new Error(`XML: ${message} (позиция ${this.pos})`)
  }

  private skipUntil(end: string): void {
    const i = this.src.indexOf(end, this.pos)
    if (i < 0) throw this.error(`не найдено «${end}»`)
    this.pos = i + end.length
  }

  // Пропуск прологов/мусора между узлами: <?...?>, <!--...-->, <!DOCTYPE...>.
  // Возвращает false, если дальше не элемент.
  private skipNonElements(): boolean {
    for (;;) {
      const i = this.src.indexOf('<', this.pos)
      if (i < 0) return false
      this.pos = i
      if (this.src.startsWith('<?', this.pos)) this.skipUntil('?>')
      else if (this.src.startsWith('<!--', this.pos)) this.skipUntil('-->')
      else if (this.src.startsWith('<!', this.pos)) this.skipUntil('>')
      else return true
    }
  }

  private readName(): string {
    const m = /^[^\s=/>]+/.exec(this.src.slice(this.pos))
    if (!m) throw this.error('ожидалось имя')
    this.pos += m[0].length
    return m[0]
  }

  private skipSpace(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos]!)) this.pos++
  }

  private readAttributes(el: XmlElement): void {
    for (;;) {
      this.skipSpace()
      const ch = this.src[this.pos]
      if (ch === '>' || ch === '/' || ch === undefined) return
      const name = this.readName()
      this.skipSpace()
      if (this.src[this.pos] !== '=') throw this.error(`у атрибута «${name}» нет значения`)
      this.pos++
      this.skipSpace()
      const quote = this.src[this.pos]
      if (quote !== '"' && quote !== "'") throw this.error('значение атрибута без кавычек')
      this.pos++
      const end = this.src.indexOf(quote, this.pos)
      if (end < 0) throw this.error('незакрытое значение атрибута')
      el.attributes[localName(name)] = decodeEntities(this.src.slice(this.pos, end))
      this.pos = end + 1
    }
  }

  // Содержимое элемента до </name>; заполняет children и text.
  private readContent(el: XmlElement, name: string): void {
    for (;;) {
      const lt = this.src.indexOf('<', this.pos)
      if (lt < 0) throw this.error(`незакрытый элемент «${name}»`)
      if (lt > this.pos) el.text += decodeEntities(this.src.slice(this.pos, lt))
      this.pos = lt
      if (this.src.startsWith('</', this.pos)) {
        this.pos += 2
        const closing = this.readName()
        if (localName(closing) !== el.name) throw this.error(`ожидался </${name}>, найден </${closing}>`)
        this.skipSpace()
        if (this.src[this.pos] !== '>') throw this.error('незакрытый закрывающий тег')
        this.pos++
        return
      }
      if (this.src.startsWith('<![CDATA[', this.pos)) {
        const end = this.src.indexOf(']]>', this.pos)
        if (end < 0) throw this.error('незакрытая CDATA')
        el.text += this.src.slice(this.pos + 9, end)
        this.pos = end + 3
      } else if (this.src.startsWith('<!--', this.pos)) {
        this.skipUntil('-->')
      } else if (this.src.startsWith('<?', this.pos)) {
        this.skipUntil('?>')
      } else {
        el.children.push(this.readElement())
      }
    }
  }

  readElement(): XmlElement {
    if (this.src[this.pos] !== '<') throw this.error('ожидался элемент')
    this.pos++
    const name = this.readName()
    const el: XmlElement = { name: localName(name), attributes: {}, children: [], text: '' }
    this.readAttributes(el)
    if (this.src.startsWith('/>', this.pos)) {
      this.pos += 2
      return el
    }
    if (this.src[this.pos] !== '>') throw this.error(`незакрытый тег «${name}»`)
    this.pos++
    this.readContent(el, el.name)
    return el
  }

  parse(): XmlElement {
    if (!this.skipNonElements()) throw this.error('в документе нет корневого элемента')
    return this.readElement()
  }
}

export function parseXml(src: string): XmlElement {
  // Срезаем возможный BOM.
  return new Parser(src.charCodeAt(0) === 0xfeff ? src.slice(1) : src).parse()
}

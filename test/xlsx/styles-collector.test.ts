import { describe, expect, test } from 'bun:test'
import { StylesCollector } from '../../src/xlsx/styles-collector'
import { STYLE_SHEET_SCHEMA } from '../../src/xlsx/xlsx-style-types'
import { write } from '../../src/xlsx/serialize'
import { XmlWriter } from '../../src/xlsx/xml'

function clearXml(xml: string): string {
  const lines = xml
    .split('\n')
    .map(s => s.replace(/^\s+$/g, ''))
    .filter(s => s)
  const indent = lines[0].length - lines[0].trimStart().length
  return lines
    .map(s => s.slice(indent))
    .concat([''])
    .join('\n')
}

describe('StylesCollector tests', () => {
  test('Serialize single style in StylesCollector', () => {
    const s = new StylesCollector()

    s.getStyleIndex({ font: 'normal', format: 'general', indent: 0, wrapText: false })
    const w = write(s.getStyleSheet(), STYLE_SHEET_SCHEMA, new XmlWriter({ pretty: true, indent: '  ' }))
    expect(w.flush()).toBe(
      clearXml(`
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <styleSheet mc:Ignorable="x14ac" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac">
          <numFmts count="3">
            <numFmt formatCode="yyyy-mm-dd" numFmtId="165"/>
            <numFmt formatCode="yyyy-mm-dd HH:MM" numFmtId="166"/>
            <numFmt formatCode="0.0#" numFmtId="167"/>
          </numFmts>
          <fonts count="4" x14ac:knownFonts="1">
            <font>
              <sz val="12"/>
              <name val="Calibri"/>
            </font>
            <font>
              <sz val="12"/>
              <name val="Calibri"/>
              <b/>
            </font>
            <font>
              <sz val="12"/>
              <name val="Calibri"/>
              <u/>
              <color rgb="FF0000FF"/>
            </font>
            <font>
              <sz val="12"/>
              <name val="Calibri"/>
              <i/>
              <color rgb="FF808080"/>
            </font>
          </fonts>
          <fills count="1">
            <fill>
              <patternFill patternType="none">
                <bgColor/>
              </patternFill>
            </fill>
          </fills>
          <borders count="1">
            <border>
              <left/>
              <right/>
              <top/>
              <bottom/>
              <diagonal/>
            </border>
          </borders>
          <cellStyleXfs>
            <xf borderId="0" fillId="0" fontId="0" numFmtId="0"/>
          </cellStyleXfs>
          <cellXfs count="1">
            <xf borderId="0" fillId="0" fontId="0" numFmtId="0" xfId="0"/>
          </cellXfs>
          <cellStyles>
            <cellStyle builtinId="0" name="Normal" xfId="0"/>
          </cellStyles>
          <dxfs count="0"/>
          <tableStyles count="0" defaultPivotStyle="PivotStyleMedium9" defaultTableStyle="TableStyleMedium9"/>
        </styleSheet>
      `),
    )
  })
})

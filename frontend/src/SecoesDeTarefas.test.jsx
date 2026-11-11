import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SecoesDeTarefas from './SecoesDeTarefas.jsx'

const noop = () => {}

function tarefa(id, titulo, criadaEm, concluida = false) {
  return { id, lista_id: 1, titulo, concluida, criada_em: criadaEm }
}

const html = (tarefas) => renderToStaticMarkup(<SecoesDeTarefas tarefas={tarefas} onAlternar={noop} />)

describe('SecoesDeTarefas', () => {
  it('lista sem tarefas mostra exatamente "Nenhuma tarefa nesta lista" e nenhum item', () => {
    const markup = html([])

    expect(markup).toContain('>Nenhuma tarefa nesta lista<')
    expect(markup).not.toContain('<li')
    expect(markup).not.toContain('Pendentes')
    expect(markup).not.toContain('Concluídas')
  })

  it('só com pendentes mostra "Pendentes" e não mostra "Concluídas"', () => {
    const markup = html([tarefa(1, 'Enviar relatório', '2026-11-09T12:00:00')])

    expect(markup).toContain('Pendentes')
    expect(markup).not.toContain('Concluídas')
    expect(markup).not.toContain('Nenhuma tarefa nesta lista')
    expect(markup).toContain('Enviar relatório')
  })

  it('com tarefa concluída mostra "Concluídas" abaixo de "Pendentes", com a caixa marcada', () => {
    const markup = html([
      tarefa(1, 'Ler e-mails', '2026-11-09T12:00:00'),
      tarefa(2, 'Enviar relatório 🚀', '2026-11-09T12:05:00', true),
    ])

    expect(markup.indexOf('Pendentes')).toBeLessThan(markup.indexOf('Ler e-mails'))
    expect(markup.indexOf('Ler e-mails')).toBeLessThan(markup.indexOf('Concluídas'))
    expect(markup.indexOf('Concluídas')).toBeLessThan(markup.indexOf('Enviar relatório 🚀'))
    expect(markup).toMatch(/id="tarefa-2"[^>]*checked=""/)
    expect(markup).not.toMatch(/id="tarefa-1"[^>]*checked=""/)
  })
})

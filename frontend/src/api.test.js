import { describe, expect, it, vi } from 'vitest'
import {
  alterarConclusao,
  buscarListas,
  buscarTarefas,
  criarLista,
  criarTarefa,
  FALHA_AO_ALTERAR_TAREFA,
  FALHA_AO_CRIAR_LISTA,
  FALHA_AO_CRIAR_TAREFA,
} from './api.js'

function respostaJson(status, corpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  }
}

describe('criarLista', () => {
  it('envia o valor digitado sem aparar e devolve a lista com o nome aparado da resposta', async () => {
    const lista = { id: 7, nome: 'Trabalho', criada_em: '2026-11-09T12:00:00' }
    const fetchFn = vi.fn(async () => respostaJson(201, lista))

    const resultado = await criarLista('  Trabalho  ', fetchFn)

    expect(fetchFn).toHaveBeenCalledWith('/api/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: '  Trabalho  ' }),
    })
    expect(resultado).toEqual({ ok: true, lista })
  })

  it.each([
    [400, 'O nome é obrigatório.'],
    [400, 'O nome deve possuir no máximo 60 caracteres.'],
    [409, 'Já existe uma lista com esse nome'],
  ])('devolve a mensagem exata do backend para o status %i: %s', async (status, mensagem) => {
    const fetchFn = vi.fn(async () =>
      respostaJson(status, { erro: { campo: 'nome', mensagem } }),
    )

    expect(await criarLista('x', fetchFn)).toEqual({ ok: false, mensagem })
  })

  it('usa uma mensagem genérica quando a rede falha', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    expect(await criarLista('Trabalho', fetchFn)).toEqual({
      ok: false,
      mensagem: FALHA_AO_CRIAR_LISTA,
    })
  })

  it('não considera salva uma resposta de erro sem corpo JSON', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
    }))

    expect(await criarLista('Trabalho', fetchFn)).toEqual({
      ok: false,
      mensagem: FALHA_AO_CRIAR_LISTA,
    })
  })
})

describe('buscarListas', () => {
  it('devolve as listas de GET /api/lists', async () => {
    const listas = [{ id: 1, nome: 'Casa', criada_em: '2026-11-09T12:00:00' }]
    const fetchFn = vi.fn(async () => respostaJson(200, listas))

    expect(await buscarListas(fetchFn)).toEqual(listas)
    expect(fetchFn).toHaveBeenCalledWith('/api/lists')
  })

  it('lança erro quando o backend falha', async () => {
    const fetchFn = vi.fn(async () => respostaJson(500, { erro: {} }))

    await expect(buscarListas(fetchFn)).rejects.toThrow('Não foi possível carregar as listas.')
  })
})

const tarefa = {
  id: 3,
  lista_id: 2,
  titulo: 'Enviar relatório 🚀',
  concluida: false,
  criada_em: '2026-11-09T12:05:00',
}

describe('buscarTarefas', () => {
  it('devolve as tarefas de GET /api/lists/<id>/tasks', async () => {
    const fetchFn = vi.fn(async () => respostaJson(200, [tarefa]))

    expect(await buscarTarefas(2, fetchFn)).toEqual([tarefa])
    expect(fetchFn).toHaveBeenCalledWith('/api/lists/2/tasks')
  })

  it('lança erro quando o backend falha', async () => {
    const fetchFn = vi.fn(async () =>
      respostaJson(404, { erro: { campo: null, mensagem: 'Lista não encontrada.' } }),
    )

    await expect(buscarTarefas(99, fetchFn)).rejects.toThrow('Não foi possível carregar as tarefas.')
  })
})

describe('criarTarefa', () => {
  it('envia o título digitado sem aparar e devolve a tarefa gravada', async () => {
    const fetchFn = vi.fn(async () => respostaJson(201, tarefa))

    const resultado = await criarTarefa(2, '  Enviar relatório 🚀  ', fetchFn)

    expect(fetchFn).toHaveBeenCalledWith('/api/lists/2/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: '  Enviar relatório 🚀  ' }),
    })
    expect(resultado).toEqual({ ok: true, tarefa })
  })

  it.each(['O título é obrigatório.', 'O título deve possuir no máximo 200 caracteres.'])(
    'devolve a mensagem exata do backend: %s',
    async (mensagem) => {
      const fetchFn = vi.fn(async () => respostaJson(400, { erro: { campo: 'titulo', mensagem } }))

      expect(await criarTarefa(2, ' ', fetchFn)).toEqual({ ok: false, mensagem })
    },
  )

  it('usa uma mensagem genérica quando a rede falha', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    expect(await criarTarefa(2, 'x', fetchFn)).toEqual({ ok: false, mensagem: FALHA_AO_CRIAR_TAREFA })
  })
})

describe('alterarConclusao', () => {
  it('envia PATCH /api/tasks/<id> com concluida e devolve a tarefa gravada', async () => {
    const gravada = { ...tarefa, concluida: true }
    const fetchFn = vi.fn(async () => respostaJson(200, gravada))

    const resultado = await alterarConclusao(3, true, fetchFn)

    expect(fetchFn).toHaveBeenCalledWith('/api/tasks/3', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concluida: true }),
    })
    expect(resultado).toEqual({ ok: true, tarefa: gravada })
  })

  it('devolve a mensagem do backend quando o PATCH é recusado', async () => {
    const fetchFn = vi.fn(async () =>
      respostaJson(404, { erro: { campo: null, mensagem: 'Tarefa não encontrada.' } }),
    )

    expect(await alterarConclusao(3, true, fetchFn)).toEqual({
      ok: false,
      mensagem: 'Tarefa não encontrada.',
    })
  })

  it.each([
    ['a rede falha', async () => { throw new TypeError('Failed to fetch') }],
    ['a resposta não é JSON', async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('x') } })],
  ])('usa uma mensagem genérica quando %s', async (_, fetchImpl) => {
    expect(await alterarConclusao(3, false, vi.fn(fetchImpl))).toEqual({
      ok: false,
      mensagem: FALHA_AO_ALTERAR_TAREFA,
    })
  })
})

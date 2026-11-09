import { describe, expect, it, vi } from 'vitest'
import { buscarListas, criarLista, FALHA_AO_CRIAR_LISTA } from './api.js'

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

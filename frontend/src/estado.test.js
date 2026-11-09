import { describe, expect, it, vi } from 'vitest'
import { enviarNovaLista, estadoInicial, reduzirListas } from './estado.js'

const casa = { id: 1, nome: 'Casa', criada_em: '2026-11-09T12:00:00' }
const trabalho = { id: 2, nome: 'Trabalho', criada_em: '2026-11-09T12:05:00' }

// Executa o envio do formulário aplicando cada ação ao redutor, como o useReducer faz.
async function enviar(estadoAntes, criar) {
  let estado = estadoAntes
  const dispatch = (acao) => {
    estado = reduzirListas(estado, acao)
  }
  const evento = { preventDefault: vi.fn() }
  await enviarNovaLista(evento, estadoAntes.nome, dispatch, criar)
  return { estado, evento }
}

describe('criação de lista', () => {
  it('em caso de sucesso impede o recarregamento e mostra a lista na barra lateral', async () => {
    const antes = { ...estadoInicial, listas: [casa], nome: 'Trabalho' }
    const criar = vi.fn(async () => ({ ok: true, lista: trabalho }))

    const { estado, evento } = await enviar(antes, criar)

    expect(evento.preventDefault).toHaveBeenCalledOnce()
    expect(criar).toHaveBeenCalledWith('Trabalho')
    expect(estado.listas).toEqual([casa, trabalho])
    expect(estado.nome).toBe('')
    expect(estado.erroNome).toBeNull()
    expect(estado.salvando).toBe(false)
  })

  it('seleciona a lista criada no lugar da seleção anterior', async () => {
    const antes = { ...estadoInicial, listas: [casa], selecionadaId: casa.id, nome: 'Trabalho' }

    const { estado } = await enviar(antes, async () => ({ ok: true, lista: trabalho }))

    expect(estado.selecionadaId).toBe(trabalho.id)
  })

  it('envia o valor digitado e exibe o nome aparado devolvido pelo backend', async () => {
    const antes = { ...estadoInicial, nome: '  Trabalho  ' }
    const criar = vi.fn(async () => ({ ok: true, lista: trabalho }))

    const { estado } = await enviar(antes, criar)

    expect(criar).toHaveBeenCalledWith('  Trabalho  ')
    expect(estado.listas.map((lista) => lista.nome)).toEqual(['Trabalho'])
  })

  it('quando a API recusa, mantém listas, seleção e texto digitado e mostra a mensagem exata', async () => {
    const antes = { ...estadoInicial, listas: [casa], selecionadaId: casa.id, nome: ' casa ' }
    const mensagem = 'Já existe uma lista com esse nome'

    const { estado, evento } = await enviar(antes, async () => ({ ok: false, mensagem }))

    expect(evento.preventDefault).toHaveBeenCalledOnce()
    expect(estado.listas).toEqual([casa])
    expect(estado.selecionadaId).toBe(casa.id)
    expect(estado.nome).toBe(' casa ')
    expect(estado.erroNome).toBe(mensagem)
    expect(estado.salvando).toBe(false)
  })

  it('marca o envio em andamento até a resposta chegar', () => {
    const estado = reduzirListas({ ...estadoInicial, erroNome: 'antigo' }, { tipo: 'criacao-iniciada' })

    expect(estado.salvando).toBe(true)
    expect(estado.erroNome).toBeNull()
  })
})

describe('outras transições', () => {
  it('editar o nome limpa a mensagem de erro do campo', () => {
    const antes = { ...estadoInicial, erroNome: 'O nome é obrigatório.' }

    const estado = reduzirListas(antes, { tipo: 'nome-alterado', nome: 'T' })

    expect(estado.nome).toBe('T')
    expect(estado.erroNome).toBeNull()
  })

  it('a carga inicial não descarta uma lista criada antes de terminar', () => {
    const antes = { ...estadoInicial, listas: [trabalho], selecionadaId: trabalho.id }

    const estado = reduzirListas(antes, { tipo: 'listas-carregadas', listas: [casa] })

    expect(estado.listas).toEqual([casa, trabalho])
    expect(estado.selecionadaId).toBe(trabalho.id)
  })

  it('selecionar uma lista na barra lateral muda a seleção', () => {
    const antes = { ...estadoInicial, listas: [casa, trabalho] }

    expect(reduzirListas(antes, { tipo: 'lista-selecionada', id: casa.id }).selecionadaId).toBe(casa.id)
  })
})

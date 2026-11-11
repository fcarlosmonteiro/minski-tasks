import { describe, expect, it, vi } from 'vitest'
import {
  alternarConclusao,
  enviarNovaTarefa,
  estadoInicialTarefas,
  reduzirTarefas,
  secoesDaLista,
} from './tarefas.js'

const LISTA_ID = 2

function tarefa(id, titulo, criadaEm, concluida = false) {
  return { id, lista_id: LISTA_ID, titulo, concluida, criada_em: criadaEm }
}

const antiga = tarefa(1, 'Ler e-mails', '2026-11-09T12:00:00')
const media = tarefa(2, 'Revisar planilha', '2026-11-09T12:00:00.250000')
const relatorio = tarefa(3, 'Enviar relatório', '2026-11-09T12:05:00')
const relatorioConcluido = { ...relatorio, concluida: true }

const carregado = (tarefas, extras = {}) => ({
  ...estadoInicialTarefas,
  carregando: false,
  tarefas,
  ...extras,
})

// Aplica cada ação ao redutor, como o useReducer faz.
function despachante(estadoAntes) {
  const registro = { estado: estadoAntes, intermediarios: [] }
  registro.dispatch = (acao) => {
    registro.estado = reduzirTarefas(registro.estado, acao)
    registro.intermediarios.push(registro.estado)
  }
  return registro
}

async function criar(estadoAntes, criarFn) {
  const r = despachante(estadoAntes)
  const evento = { preventDefault: vi.fn() }
  await enviarNovaTarefa(evento, LISTA_ID, estadoAntes.titulo, r.dispatch, criarFn)
  return { ...r, evento }
}

async function alternar(estadoAntes, alvo, alterarFn) {
  const r = despachante(estadoAntes)
  await alternarConclusao(alvo, r.dispatch, alterarFn)
  return r
}

describe('criação de tarefa', () => {
  it('em caso de sucesso impede o recarregamento e põe a tarefa no topo das pendentes', async () => {
    const antes = carregado([antiga, media], { titulo: '  Enviar relatório  ' })
    const criarFn = vi.fn(async () => ({ ok: true, tarefa: relatorio }))

    const { estado, evento } = await criar(antes, criarFn)

    expect(evento.preventDefault).toHaveBeenCalledOnce()
    expect(criarFn).toHaveBeenCalledWith(LISTA_ID, '  Enviar relatório  ')
    expect(secoesDaLista(estado.tarefas).pendentes.map((t) => t.titulo)).toEqual([
      'Enviar relatório',
      'Revisar planilha',
      'Ler e-mails',
    ])
    expect(estado.titulo).toBe('')
    expect(estado.erroTitulo).toBeNull()
    expect(estado.salvando).toBe(false)
  })

  it('exibe o título aparado devolvido pelo backend, com acentos e emoji intactos', async () => {
    const unicode = tarefa(9, 'Ação 🚀 café', '2026-11-09T13:00:00')
    const antes = carregado([], { titulo: '   Ação 🚀 café   ' })

    const { estado } = await criar(antes, async () => ({ ok: true, tarefa: unicode }))

    expect(secoesDaLista(estado.tarefas).pendentes.map((t) => t.titulo)).toEqual(['Ação 🚀 café'])
  })

  it.each(['O título é obrigatório.', 'O título deve possuir no máximo 200 caracteres.'])(
    'quando o backend recusa, mostra no campo a mensagem exata "%s" e não altera a lista',
    async (mensagem) => {
      const antes = carregado([antiga], { titulo: '   ' })

      const { estado, evento } = await criar(antes, async () => ({ ok: false, mensagem }))

      expect(evento.preventDefault).toHaveBeenCalledOnce()
      expect(estado.tarefas).toEqual([antiga])
      expect(estado.titulo).toBe('   ')
      expect(estado.erroTitulo).toBe(mensagem)
      expect(estado.salvando).toBe(false)
    },
  )

  it('marca o envio em andamento e editar o título limpa a mensagem do campo', () => {
    const emAndamento = reduzirTarefas(carregado([], { erroTitulo: 'x' }), { tipo: 'criacao-iniciada' })
    expect(emAndamento.salvando).toBe(true)
    expect(emAndamento.erroTitulo).toBeNull()

    const editado = reduzirTarefas(carregado([], { erroTitulo: 'x' }), {
      tipo: 'titulo-alterado',
      titulo: 'E',
    })
    expect(editado.titulo).toBe('E')
    expect(editado.erroTitulo).toBeNull()
  })
})

describe('seções da lista', () => {
  it('lista sem tarefas fica vazia, sem itens em nenhuma seção', () => {
    expect(secoesDaLista([])).toEqual({ vazia: true, pendentes: [], concluidas: [] })
  })

  it('pendentes e concluídas vêm da mais recente para a mais antiga pela data de criação', () => {
    const concluidaAntiga = tarefa(4, 'Pagar conta', '2026-11-08T09:00:00', true)
    const concluidaNova = tarefa(5, 'Comprar pão', '2026-11-09T18:00:00', true)

    const secoes = secoesDaLista([antiga, concluidaAntiga, relatorio, concluidaNova, media])

    expect(secoes.vazia).toBe(false)
    expect(secoes.pendentes).toEqual([relatorio, media, antiga])
    expect(secoes.concluidas).toEqual([concluidaNova, concluidaAntiga])
  })

  it('no empate da data de criação, a tarefa gravada depois (id maior) vem primeiro', () => {
    const a = tarefa(10, 'A', '2026-11-09T12:00:00')
    const b = tarefa(11, 'B', '2026-11-09T12:00:00')

    expect(secoesDaLista([a, b]).pendentes).toEqual([b, a])
  })
})

describe('conclusão', () => {
  it('marcar só move a tarefa para "Concluídas" depois que o PATCH confirma', async () => {
    const antes = carregado([antiga, relatorio])
    const alterarFn = vi.fn(async () => ({ ok: true, tarefa: relatorioConcluido }))

    const { estado, intermediarios } = await alternar(antes, relatorio, alterarFn)

    expect(alterarFn).toHaveBeenCalledWith(relatorio.id, true)
    const durante = intermediarios[0]
    expect(durante.alterando).toEqual([relatorio.id])
    expect(secoesDaLista(durante.tarefas).pendentes).toContain(relatorio)

    const secoes = secoesDaLista(estado.tarefas)
    expect(secoes.pendentes).toEqual([antiga])
    expect(secoes.concluidas).toEqual([relatorioConcluido])
    expect(estado.alterando).toEqual([])
  })

  it('desmarcar devolve a tarefa às pendentes', async () => {
    const antes = carregado([antiga, relatorioConcluido])
    const alterarFn = vi.fn(async () => ({ ok: true, tarefa: relatorio }))

    const { estado } = await alternar(antes, relatorioConcluido, alterarFn)

    expect(alterarFn).toHaveBeenCalledWith(relatorio.id, false)
    const secoes = secoesDaLista(estado.tarefas)
    expect(secoes.pendentes).toEqual([relatorio, antiga])
    expect(secoes.concluidas).toEqual([])
  })

  it.each([
    ['marcar', relatorio],
    ['desmarcar', relatorioConcluido],
  ])('quando o PATCH falha ao %s, mantém o estado persistido e mostra o erro', async (_, alvo) => {
    const antes = carregado([antiga, alvo])
    const mensagem = 'Tarefa não encontrada.'

    const { estado } = await alternar(antes, alvo, async () => ({ ok: false, mensagem }))

    expect(estado.tarefas).toEqual(antes.tarefas)
    expect(estado.erroConclusao).toBe(mensagem)
    expect(estado.alterando).toEqual([])
  })

  it('uma nova tentativa limpa o erro anterior', () => {
    const antes = carregado([relatorio], { erroConclusao: 'falhou' })

    const estado = reduzirTarefas(antes, { tipo: 'conclusao-iniciada', id: relatorio.id })

    expect(estado.erroConclusao).toBeNull()
  })
})

describe('carga da lista aberta', () => {
  it('a carga não descarta uma tarefa criada antes de terminar', () => {
    const antes = { ...estadoInicialTarefas, tarefas: [relatorio] }

    const estado = reduzirTarefas(antes, { tipo: 'tarefas-carregadas', tarefas: [antiga] })

    expect(estado.carregando).toBe(false)
    expect(estado.tarefas).toEqual([antiga, relatorio])
  })

  it('falha na carga encerra o carregamento e guarda a mensagem', () => {
    const estado = reduzirTarefas(estadoInicialTarefas, {
      tipo: 'carregamento-falhou',
      mensagem: 'Não foi possível carregar as tarefas.',
    })

    expect(estado.carregando).toBe(false)
    expect(estado.erroCarregar).toBe('Não foi possível carregar as tarefas.')
  })
})

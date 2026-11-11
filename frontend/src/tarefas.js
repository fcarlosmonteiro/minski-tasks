// Estado das tarefas da lista aberta: transições puras, testáveis sem navegador.
import { alterarConclusao, criarTarefa } from './api.js'
import { mesclarPorId } from './estado.js'

export const NENHUMA_TAREFA = 'Nenhuma tarefa nesta lista'

export const estadoInicialTarefas = {
  tarefas: [],
  carregando: true,
  erroCarregar: null,
  titulo: '',
  erroTitulo: null,
  salvando: false,
  erroConclusao: null,
  alterando: [],
}

// Mais recente primeiro pela data de criação (decisão 01M70HPSYFMQ85YM25TKN13ND1).
// criada_em vem do backend sempre no mesmo formato ISO, sem fuso, então a
// comparação de texto segue a ordem cronológica; no empate, o id maior foi
// gravado depois.
function maisRecentePrimeiro(a, b) {
  if (a.criada_em !== b.criada_em) return a.criada_em < b.criada_em ? 1 : -1
  return b.id - a.id
}

// Separa as tarefas nas seções da tela, cada uma da mais recente para a mais antiga.
export function secoesDaLista(tarefas) {
  const ordenadas = [...tarefas].sort(maisRecentePrimeiro)
  return {
    vazia: tarefas.length === 0,
    pendentes: ordenadas.filter((tarefa) => !tarefa.concluida),
    concluidas: ordenadas.filter((tarefa) => tarefa.concluida),
  }
}

function substituir(tarefas, gravada) {
  return [...tarefas.filter((tarefa) => tarefa.id !== gravada.id), gravada]
}

export function reduzirTarefas(estado, acao) {
  switch (acao.tipo) {
    case 'tarefas-carregadas':
      return {
        ...estado,
        tarefas: mesclarPorId(acao.tarefas, estado.tarefas),
        carregando: false,
        erroCarregar: null,
      }
    case 'carregamento-falhou':
      return { ...estado, carregando: false, erroCarregar: acao.mensagem }
    case 'titulo-alterado':
      return { ...estado, titulo: acao.titulo, erroTitulo: null }
    case 'criacao-iniciada':
      return { ...estado, salvando: true, erroTitulo: null }
    case 'criacao-concluida':
      return {
        ...estado,
        tarefas: substituir(estado.tarefas, acao.tarefa),
        titulo: '',
        erroTitulo: null,
        salvando: false,
      }
    case 'criacao-falhou':
      return { ...estado, salvando: false, erroTitulo: acao.mensagem }
    case 'conclusao-iniciada':
      return { ...estado, erroConclusao: null, alterando: [...estado.alterando, acao.id] }
    case 'conclusao-confirmada':
      return {
        ...estado,
        tarefas: substituir(estado.tarefas, acao.tarefa),
        alterando: estado.alterando.filter((id) => id !== acao.tarefa.id),
      }
    case 'conclusao-falhou':
      return {
        ...estado,
        erroConclusao: acao.mensagem,
        alterando: estado.alterando.filter((id) => id !== acao.id),
      }
    default:
      return estado
  }
}

// Envio do formulário: impede o recarregamento da página e só inclui a tarefa
// na tela depois que o backend confirma a gravação.
export async function enviarNovaTarefa(evento, listaId, titulo, dispatch, criar = criarTarefa) {
  evento.preventDefault()
  dispatch({ tipo: 'criacao-iniciada' })
  const resultado = await criar(listaId, titulo)
  if (resultado.ok) {
    dispatch({ tipo: 'criacao-concluida', tarefa: resultado.tarefa })
  } else {
    dispatch({ tipo: 'criacao-falhou', mensagem: resultado.mensagem })
  }
  return resultado
}

// Marca ou desmarca: a tela só muda com a tarefa que o PATCH devolveu; se ele
// falhar, a tarefa fica como estava e a mensagem é exibida.
export async function alternarConclusao(tarefa, dispatch, alterar = alterarConclusao) {
  dispatch({ tipo: 'conclusao-iniciada', id: tarefa.id })
  const resultado = await alterar(tarefa.id, !tarefa.concluida)
  if (resultado.ok) {
    dispatch({ tipo: 'conclusao-confirmada', tarefa: resultado.tarefa })
  } else {
    dispatch({ tipo: 'conclusao-falhou', id: tarefa.id, mensagem: resultado.mensagem })
  }
  return resultado
}

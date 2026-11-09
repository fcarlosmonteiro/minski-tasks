// Estado da tela de listas: transições puras, testáveis sem navegador.
import { criarLista } from './api.js'

export const estadoInicial = {
  listas: [],
  selecionadaId: null,
  nome: '',
  erroNome: null,
  salvando: false,
  erroCarregar: null,
}

// Mantém listas criadas antes de a carga inicial terminar.
function mesclarListas(carregadas, atuais) {
  const ids = new Set(carregadas.map((lista) => lista.id))
  return [...carregadas, ...atuais.filter((lista) => !ids.has(lista.id))]
}

export function reduzirListas(estado, acao) {
  switch (acao.tipo) {
    case 'listas-carregadas':
      return {
        ...estado,
        listas: mesclarListas(acao.listas, estado.listas),
        erroCarregar: null,
      }
    case 'carregamento-falhou':
      return { ...estado, erroCarregar: acao.mensagem }
    case 'nome-alterado':
      return { ...estado, nome: acao.nome, erroNome: null }
    case 'lista-selecionada':
      return { ...estado, selecionadaId: acao.id }
    case 'criacao-iniciada':
      return { ...estado, salvando: true, erroNome: null }
    case 'criacao-concluida':
      return {
        ...estado,
        listas: [
          ...estado.listas.filter((lista) => lista.id !== acao.lista.id),
          acao.lista,
        ],
        selecionadaId: acao.lista.id,
        nome: '',
        erroNome: null,
        salvando: false,
      }
    case 'criacao-falhou':
      return { ...estado, salvando: false, erroNome: acao.mensagem }
    default:
      return estado
  }
}

// Envio do formulário: impede o recarregamento da página e só inclui a lista
// na tela depois que o backend confirma a gravação.
export async function enviarNovaLista(evento, nome, dispatch, criar = criarLista) {
  evento.preventDefault()
  dispatch({ tipo: 'criacao-iniciada' })
  const resultado = await criar(nome)
  if (resultado.ok) {
    dispatch({ tipo: 'criacao-concluida', lista: resultado.lista })
  } else {
    dispatch({ tipo: 'criacao-falhou', mensagem: resultado.mensagem })
  }
  return resultado
}

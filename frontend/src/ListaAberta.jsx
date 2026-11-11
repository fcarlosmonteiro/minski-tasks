import { useEffect, useReducer } from 'react'
import { buscarTarefas, FALHA_AO_CARREGAR_TAREFAS } from './api.js'
import SecoesDeTarefas from './SecoesDeTarefas.jsx'
import {
  alternarConclusao,
  enviarNovaTarefa,
  estadoInicialTarefas,
  reduzirTarefas,
} from './tarefas.js'

// Lista aberta na área principal. O App a monta com key={lista.id}, então
// trocar de lista recomeça o estado e a carga.
export default function ListaAberta({ lista }) {
  const [estado, dispatch] = useReducer(reduzirTarefas, estadoInicialTarefas)
  const { tarefas, carregando, erroCarregar, titulo, erroTitulo, salvando, erroConclusao, alterando } =
    estado

  useEffect(() => {
    let ativo = true
    buscarTarefas(lista.id)
      .then((carregadas) => {
        if (ativo) dispatch({ tipo: 'tarefas-carregadas', tarefas: carregadas })
      })
      .catch(() => {
        if (ativo) dispatch({ tipo: 'carregamento-falhou', mensagem: FALHA_AO_CARREGAR_TAREFAS })
      })
    return () => {
      ativo = false
    }
  }, [lista.id])

  return (
    <>
      <h2 className="h4 text-break">{lista.nome}</h2>

      <form
        noValidate
        className="mt-3"
        onSubmit={(evento) => enviarNovaTarefa(evento, lista.id, titulo, dispatch)}
      >
        <label htmlFor="titulo-tarefa" className="form-label fw-semibold">
          Nova tarefa
        </label>
        <div className="input-group has-validation">
          <input
            id="titulo-tarefa"
            type="text"
            className={`form-control${erroTitulo ? ' is-invalid' : ''}`}
            placeholder="Título da tarefa"
            autoComplete="off"
            value={titulo}
            onChange={(evento) => dispatch({ tipo: 'titulo-alterado', titulo: evento.target.value })}
            aria-invalid={erroTitulo ? 'true' : undefined}
            aria-describedby={erroTitulo ? 'erro-titulo-tarefa' : undefined}
          />
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? 'Adicionando…' : 'Adicionar'}
          </button>
          {erroTitulo && (
            <div id="erro-titulo-tarefa" className="invalid-feedback">
              {erroTitulo}
            </div>
          )}
        </div>
      </form>

      {erroConclusao && (
        <div className="alert alert-danger py-2 mt-3 mb-0" role="alert">
          {erroConclusao}
        </div>
      )}

      {carregando ? (
        <p className="text-body-secondary mt-4">Carregando tarefas…</p>
      ) : erroCarregar ? (
        <div className="alert alert-danger py-2 mt-4" role="alert">
          {erroCarregar}
        </div>
      ) : (
        <SecoesDeTarefas
          tarefas={tarefas}
          alterando={alterando}
          onAlternar={(tarefa) => alternarConclusao(tarefa, dispatch)}
        />
      )}
    </>
  )
}

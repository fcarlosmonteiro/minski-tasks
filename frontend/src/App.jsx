import { useEffect, useReducer } from 'react'
import { buscarListas, FALHA_AO_CARREGAR_LISTAS } from './api.js'
import { enviarNovaLista, estadoInicial, reduzirListas } from './estado.js'
import ListaAberta from './ListaAberta.jsx'

export default function App() {
  const [estado, dispatch] = useReducer(reduzirListas, estadoInicial)
  const { listas, selecionadaId, nome, erroNome, salvando, erroCarregar } = estado
  const selecionada = listas.find((lista) => lista.id === selecionadaId) ?? null

  useEffect(() => {
    let ativo = true
    buscarListas()
      .then((carregadas) => {
        if (ativo) dispatch({ tipo: 'listas-carregadas', listas: carregadas })
      })
      .catch(() => {
        if (ativo) dispatch({ tipo: 'carregamento-falhou', mensagem: FALHA_AO_CARREGAR_LISTAS })
      })
    return () => {
      ativo = false
    }
  }, [])

  return (
    <div className="min-vh-100 d-flex flex-column">
      <header className="navbar bg-body-tertiary border-bottom px-3">
        <h1 className="navbar-brand mb-0 h1">Minski Tasks</h1>
      </header>

      <div className="container-fluid flex-grow-1">
        <div className="row h-100">
          <aside className="col-md-4 col-lg-3 border-end py-3">
            <form noValidate onSubmit={(evento) => enviarNovaLista(evento, nome, dispatch)}>
              <label htmlFor="nome-lista" className="form-label fw-semibold">
                Nova lista
              </label>
              <div className="input-group has-validation">
                <input
                  id="nome-lista"
                  type="text"
                  className={`form-control${erroNome ? ' is-invalid' : ''}`}
                  placeholder="Nome da lista"
                  autoComplete="off"
                  value={nome}
                  onChange={(evento) => dispatch({ tipo: 'nome-alterado', nome: evento.target.value })}
                  aria-invalid={erroNome ? 'true' : undefined}
                  aria-describedby={erroNome ? 'erro-nome-lista' : undefined}
                />
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Criando…' : 'Criar'}
                </button>
                {erroNome && (
                  <div id="erro-nome-lista" className="invalid-feedback">
                    {erroNome}
                  </div>
                )}
              </div>
            </form>

            <h2 className="h6 text-uppercase text-body-secondary mt-4">Listas</h2>
            {erroCarregar && (
              <div className="alert alert-danger py-2" role="alert">
                {erroCarregar}
              </div>
            )}
            {listas.length === 0 ? (
              <p className="text-body-secondary small">Nenhuma lista criada ainda.</p>
            ) : (
              <nav className="list-group" aria-label="Listas">
                {listas.map((lista) => (
                  <button
                    key={lista.id}
                    type="button"
                    className={`list-group-item list-group-item-action text-break${
                      lista.id === selecionadaId ? ' active' : ''
                    }`}
                    aria-current={lista.id === selecionadaId ? 'true' : undefined}
                    onClick={() => dispatch({ tipo: 'lista-selecionada', id: lista.id })}
                  >
                    {lista.nome}
                  </button>
                ))}
              </nav>
            )}
          </aside>

          <main className="col py-3 px-4">
            {selecionada ? (
              <ListaAberta key={selecionada.id} lista={selecionada} />
            ) : (
              <p className="text-body-secondary">
                Selecione uma lista na barra lateral ou crie uma nova.
              </p>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

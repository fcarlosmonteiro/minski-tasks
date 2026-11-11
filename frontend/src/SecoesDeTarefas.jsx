import { NENHUMA_TAREFA, secoesDaLista } from './tarefas.js'

function ItemDeTarefa({ tarefa, alterando, onAlternar }) {
  const idCampo = `tarefa-${tarefa.id}`
  return (
    <li className="list-group-item">
      <div className="form-check mb-0">
        <input
          id={idCampo}
          type="checkbox"
          className="form-check-input"
          checked={tarefa.concluida}
          disabled={alterando}
          onChange={() => onAlternar(tarefa)}
        />
        <label
          htmlFor={idCampo}
          className={`form-check-label text-break${
            tarefa.concluida ? ' text-decoration-line-through text-body-secondary' : ''
          }`}
        >
          {tarefa.titulo}
        </label>
      </div>
    </li>
  )
}

function Secao({ titulo, tarefas, alterando, onAlternar }) {
  return (
    <section className="mt-4" aria-label={titulo}>
      <h3 className="h6 text-uppercase text-body-secondary">{titulo}</h3>
      <ul className="list-group">
        {tarefas.map((tarefa) => (
          <ItemDeTarefa
            key={tarefa.id}
            tarefa={tarefa}
            alterando={alterando.includes(tarefa.id)}
            onAlternar={onAlternar}
          />
        ))}
      </ul>
    </section>
  )
}

// Seções da lista aberta. Sem tarefas, só a mensagem; "Concluídas" aparece
// apenas quando há alguma tarefa concluída.
export default function SecoesDeTarefas({ tarefas, alterando = [], onAlternar }) {
  const { vazia, pendentes, concluidas } = secoesDaLista(tarefas)
  if (vazia) {
    return <p className="text-body-secondary mt-4">{NENHUMA_TAREFA}</p>
  }
  return (
    <>
      <Secao titulo="Pendentes" tarefas={pendentes} alterando={alterando} onAlternar={onAlternar} />
      {concluidas.length > 0 && (
        <Secao titulo="Concluídas" tarefas={concluidas} alterando={alterando} onAlternar={onAlternar} />
      )}
    </>
  )
}

import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Route, Routes } from "react-router";
import { api, criarQueryClient } from "./api.js";

export function BoasVindas() {
  return (
    <main className="container py-5 text-center">
      <h1 className="display-4">Minski Tasks</h1>
      <p className="lead">
        Separe suas tarefas em listas temáticas e conclua cada uma com um
        clique.
      </p>
      <Link to="/listas" className="btn btn-primary btn-lg">
        Entrar
      </Link>
    </main>
  );
}

export function Listas() {
  const { data: listas = [] } = useQuery({
    queryKey: ["listas"],
    queryFn: () => api("/listas"),
  });
  return (
    <main className="container py-4">
      <h1 className="h3">Listas</h1>
      <ul className="list-group">
        {listas.map((lista) => (
          <li key={lista.id} className="list-group-item">
            {lista.nome}
          </li>
        ))}
      </ul>
    </main>
  );
}

function Aviso({ mensagem, fechar }) {
  if (!mensagem) return null;
  return (
    <div
      className="alert alert-danger alert-dismissible position-fixed bottom-0 end-0 m-3"
      role="alert"
    >
      {mensagem}
      <button
        type="button"
        className="btn-close"
        aria-label="Fechar"
        onClick={fechar}
      />
    </div>
  );
}

export default function App() {
  const [aviso, setAviso] = useState(null);
  const [queryClient] = useState(() => criarQueryClient(setAviso));
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<BoasVindas />} />
        <Route path="/listas" element={<Listas />} />
      </Routes>
      <Aviso mensagem={aviso} fechar={() => setAviso(null)} />
    </QueryClientProvider>
  );
}

# Minski Tasks

Aplicação de gerenciamento de tarefas pessoais e compartilhadas, organizada por listas temáticas, como Trabalho, Universidade e Pessoal. Inspirada na simplicidade do Google Tasks, com priorização inteligente e planejamento diário.

## Objetivo

Ajudar pessoas e equipes a organizar tarefas e responsabilidades, decidir o que fazer primeiro e concluir o que importa com menos esforço e maior previsibilidade.

## O que a aplicação oferece

- **Listas temáticas** para separar contextos, como Trabalho, Universidade e Pessoal.
- **Tarefas pessoais e compartilhadas**, para uso individual ou em equipe.
- **Priorização inteligente**, para destacar o que deve ser feito primeiro.
- **Planejamento diário**, para transformar a lista em um plano do dia.

## Stack

| Camada | Escolha |
| --- | --- |
| Nuvem | AWS |
| Banco de dados | SQLite |
| Linguagens | Python, HTML, CSS, JavaScript |
| Arquitetura | Monolito |

O backend e a interface convivem no mesmo aplicativo: Python no servidor, HTML, CSS e JavaScript no cliente, e SQLite como banco local da aplicação, hospedado na AWS.

## Desenvolvimento

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
pytest && ruff check .        # gates do backend
flask --app minski run        # cria backend/instance/minski.db (ou $MINSKI_DB_PATH)
```

### Docker Compose (desenvolvimento local)

```bash
docker compose up --build     # abre em http://localhost:5173
```

O backend grava o SQLite em `/data/minski.db` (`MINSKI_DB_PATH`), num volume
nomeado `minski-dados` que sobrevive a `docker compose down` e à recriação dos
contêineres; `docker compose down -v` apaga os dados. Só a porta 5173 do
frontend é publicada, e só em 127.0.0.1; o Vite repassa `/api` ao backend.

### Testes ponta a ponta (Playwright)

```bash
FRONTEND_PORT=5174 docker compose -p minski-e2e up -d --build   # projeto e volume próprios
cd frontend && npx playwright install chromium && npx playwright test
```

Os testes criam só dados com prefixo `E2E ` e os apagam no fim; reiniciam e
recriam os contêineres do projeto `minski-e2e` para provar a persistência.

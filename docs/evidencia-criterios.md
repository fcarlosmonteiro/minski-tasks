# Evidência dos critérios de aceite

Item `cmvmvxkvs02r6oe01l7igl38m` — Listas temáticas e tarefas com caixa de seleção.

Arquivos de teste:
[pytest] `backend/tests/test_api.py`, `backend/tests/test_modelos.py` ·
[vitest] `frontend/src/App.test.jsx`, `frontend/src/Listas.test.jsx`, `frontend/src/api.test.js` ·
[e2e] `frontend/e2e/fluxos.e2e.js` (Playwright sobre o docker-compose).

## Como reproduzir

```bash
python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
export PATH=$PWD/.venv/bin:$PATH
pytest && ruff check .
(cd frontend && npm ci && npx vitest run && npx eslint . && npx prettier --check . && npx vite build)
docker compose config -q
FRONTEND_PORT=5174 docker compose -p minski-e2e up -d --build
(cd frontend && npx playwright install chromium && npx playwright test)
FRONTEND_PORT=5174 docker compose -p minski-e2e down -v   # volume só do E2E
pip install semgrep==1.163.0 pip-audit==2.9.0
semgrep scan --config p/default --metrics off --severity ERROR --error
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.28.0 git /repo --redact
pip-audit -r backend/requirements.txt
(cd frontend && npm audit --audit-level=high)
```

Resultado em 2026-10-27, commit deste arquivo: pytest 107 passed · vitest 35
passed · Playwright 11 passed · ruff, eslint, prettier, vite build e
`docker compose config` sem erro · Semgrep 0 achados · gitleaks sem vazamentos ·
pip-audit e npm audit sem vulnerabilidades.

## Critérios

| AC | Critério (resumo) | Evidência |
|----|-------------------|-----------|
| 1 | Boas-vindas com «Minski Tasks», frase e «Entrar» | e2e «AC1/AC2…»; vitest `tela inicial mostra nome, frase e Entrar, sem login` |
| 2 | «Entrar» leva às listas sem login; rota direta | e2e «AC1/AC2…»; vitest `Entrar leva às listas`, `rota das listas abre direto pelo endereço` |
| 3 | Criar e ver lista | e2e «AC3/AC15–17…»; pytest `test_criar_lista_grava_sem_espacos_e_vai_para_o_fim` |
| 4 | Renomear lista | e2e «AC4/AC5/AC14…»; vitest `renomear lista com Enter…`; pytest `test_renomear_lista` |
| 5 | Excluir lista | e2e «AC4/AC5/AC14…»; vitest `excluir lista vazia não pede confirmação` |
| 6 | Lista selecionada mostra suas pendentes | e2e «AC6/AC7…»; vitest `seleciona a primeira lista pela ordem e mostra só suas pendentes` |
| 7 | Título + Enter cria tarefa pendente | e2e «AC6/AC7…» (5 tarefas em 2 listas); vitest `criar tarefa com Enter; vazio não cria nada` |
| 8 | Marcar conclui e vai para «Concluídas» recolhida | e2e «AC8/AC9/AC19…»; vitest `marcar conclui e desmarcar devolve às pendentes…` |
| 9 | Desmarcar devolve às pendentes | e2e «AC8/AC9/AC19…»; pytest `test_reabrir_manda_a_tarefa_para_o_fim_das_pendentes` |
| 10 | Arrastar listas e manter a ordem | e2e «AC10/AC11…»; vitest `arrastar lista envia todos os ids…`; pytest `test_reordenar_listas` |
| 11 | Arrastar pendentes e manter a ordem | e2e «AC10/AC11…» (com reload); vitest `arrastar tarefa envia só as pendentes…`; pytest `test_reordenar_pendentes` |
| 12 | Dados e ordens após reiniciar | e2e «persistência…» (`restart` e `up --force-recreate` de backend e frontend); pytest `test_dados_persistem_apos_reiniciar_o_processo` |
| 13 | Janela de 30 min: 2 listas, 5 tarefas, 1 conclusão sem pedir instruções | **Não aprovado por teste.** Exige a observação manual do PO (decisão Q5), roteiro abaixo. O e2e «AC6/AC7…» só mostra que o fluxo existe. |
| 14 | Excluir lista com tarefas pede confirmação e apaga em cascata | e2e «AC4/AC5/AC14…» (cancelar e confirmar; 404 nas tarefas depois); vitest `excluir lista com tarefas pede confirmação`; pytest `test_excluir_lista_apaga_suas_tarefas_em_cascata` |
| 15 | Texto vazio ou só espaços é recusado com a mensagem do servidor | e2e «AC3/AC15–17…», «AC6/AC7…»; vitest `criar lista "   " é recusado…`; pytest `test_validacao_do_nome`, `test_validacao_do_titulo` |
| 16 | Duplicata sem diferenciar maiúsculas (lista e tarefa na lista) | e2e «AC3/AC15–17…», «AC4/AC5/AC14…», «AC6/AC7…»; pytest `test_nome_duplicado_responde_409`, `test_titulo_duplicado_na_lista_responde_409` |
| 17 | Mais de 60 / 200 caracteres é recusado | e2e «AC3/AC15–17…», «AC6/AC7…»; pytest `test_nome_aceita_limite_exato_e_unicode`, `test_titulo_aceita_limite_exato_e_unicode` |
| 18 | Primeira lista selecionada; estado vazio sem listas | e2e «AC18…», «AC3/AC15–17…»; vitest `sem listas mostra estado vazio…` |
| 19 | «Concluídas» da mais recente para a mais antiga; abrir/fechar não altera dados | e2e «AC8/AC9/AC19…»; vitest `Concluídas começa recolhida, abre/fecha sem chamar a API…`; pytest `test_listar_pendentes_por_ordem_e_concluidas_mais_recentes_primeiro` |

Casos de borda da Spec: clique duplo (e2e «edge: clique duplo…», conforme a
resposta 01M5WZHK10EEM81GPCQB4J9E27; vitest `cliques rápidos…`, `clique duplo
volta ao estado inicial…`; pytest `test_patch_grava_o_valor_enviado_e_repetir_e_idempotente`),
lista excluída em outra aba (e2e e vitest «lista excluída em outra aba…»), ordem
desatualizada (e2e «edge: reordenar com dados desatualizados…»; vitest «ordem
desatualizada…»; pytest `test_reordenar_*_com_ids_desatualizados_responde_400`),
lista sem tarefas e falha de rede (vitest).

## AC13 — roteiro de observação para o PO (decisão Q5)

Sem telemetria de uso: o PO observa e registra no Learn.

1. Com o banco vazio ou anotando as contagens iniciais (passo 5), rode
   `docker compose up --build` e entregue `http://localhost:5173` à pessoa.
2. Diga só: «Organize algumas tarefas suas em listas.» Não mostre a interface
   nem dê instruções passo a passo; responda a dúvidas gerais sem guiar cliques.
3. Marque o início e encerre aos 30 minutos.
4. Anote se a pessoa pediu orientação passo a passo (sim/não). Pela regra já
   decidida, só pedido de passo a passo invalida a observação.
5. Leia as contagens do banco:

   ```bash
   docker compose exec backend python -c "import sqlite3; c = sqlite3.connect('/data/minski.db'); \
   print('listas', c.execute('select count(*) from lista').fetchone()[0]); \
   print('tarefas', c.execute('select count(*) from tarefa').fetchone()[0]); \
   print('concluidas', c.execute('select count(*) from tarefa where concluida').fetchone()[0])"
   ```

6. Registre no Learn: listas, tarefas, concluídas (descontando as contagens
   iniciais) e o sim/não do passo 4. Aprovado se listas ≥ 2, tarefas ≥ 5,
   concluídas ≥ 1 e nenhum pedido de passo a passo.

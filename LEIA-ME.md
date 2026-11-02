# BancoP — Sistema de Provas

Gestão dos eventos de elaboração de questões (bancas de concurso): metas, valores,
status, planejamento, questões C/E e ME, e geração da prova em Google Docs ou Word.

Substitui o antigo Apps Script ligado à planilha **Banco de Questões - Dados**.
A planilha continua intacta; os dados entram no BancoP pelo botão
**Ferramentas → Importar da planilha antiga**, que só traz o que ainda não existe
(pode repetir sem duplicar nem sobrescrever).

## Tecnologia

React + Vite + Tailwind, banco Firestore (projeto Firebase `sistema-de-provas-dce27`),
publicado no GitHub Pages a cada push na `main` (`.github/workflows/deploy.yml`).

## Quem acessa

| Conta | Como entra | Pode |
|---|---|---|
| `thiagovinicius7@gmail.com` | Login Google | Tudo |
| `claude@sitioescolageranium.com.br` | E-mail e senha (criado no Console) | Ler e editar eventos e questões |

Qualquer outra conta vê "Acesso não autorizado" e o banco recusa leitura e gravação.
A lista fica em dois lugares, que precisam ser iguais: `firestore.rules` e
`src/lib/acesso.ts`.

Outras proteções:
- as questões não ficam gravadas no aparelho (sem cache offline);
- o sistema sai sozinho depois de 60 minutos sem uso (se não houver questão sem salvar);
- o Google Drive e a leitura da planilha só são liberados no momento do uso, com permissão
  mínima (`drive.file`: o app só enxerga os arquivos que ele mesmo criou).

## Publicar as regras do banco

Sempre que `firestore.rules` mudar:

1. Abra <https://console.firebase.google.com/project/sistema-de-provas-dce27/firestore/rules>.
2. Apague o conteúdo, cole o arquivo `firestore.rules` inteiro e clique em **Publicar**.

## Configuração do Firebase (feita uma vez)

1. Firestore Database criado em `southamerica-east1`, modo de produção.
2. Authentication → Método de login: **Google** e **E-mail/senha** ativos.
3. Authentication → Configurações → Domínios autorizados: `thiagovinicius7.github.io`.
4. Authentication → Usuários: `claude@sitioescolageranium.com.br` criado.
5. `firebase-config.json` com os dados do app Web.

## Backup

O plano gratuito do Firebase não faz backup automático. Use
**Ferramentas → Baixar backup** de vez em quando e guarde o `.json`.
**Restaurar** regrava os eventos e questões do arquivo (não apaga os demais).

## Dados (Firestore)

- `eventos/{id}`: titulo, cargo, data (aaaa-mm-dd, data de entrega), tipo (CE/ME), status, meta,
  valorUnit, metaF, metaM, metaD (%), link, conteudo (edital), obs, planejamento,
  topicos (lista editada à mão; vazia = lida do conteúdo), valorRecebido (null = não registrado),
  dataPagamento.
- `questoes/{id}`: eventoId, numero, enunciado, tipo, dif e gab (só ME),
  itens [{ letra (ME), dif (CE), texto, gab, edital, justificativa, fonte }].

## Regras automáticas

- **Prazo**: conta os dias até a data do evento enquanto o status for "Evento não iniciado" ou
  "Em elaboração".
- **Recebido no ano**: usa o valor e a data do pagamento registrado. Eventos finalizados antes do
  registro de pagamento existir contam pelo total previsto, na data do evento.
- **Cobertura do edital**: o item cita um tópico pelo número ("1.2", "2.5 —") ou pelo texto.
- **Justificativa**: ao marcar o gabarito do item, o texto passa a começar com "Item certo." ou
  "Item errado." (se já começava, só a palavra é trocada).
- **Fonte**: justificativas antigas com "Fonte:"/"Fontes:" no fim têm a fonte separada no campo
  próprio ao abrir a questão; nada do texto é perdido. Na prova, a fonte volta para o fim da
  justificativa, como antes.

Os IDs da planilha antiga foram mantidos na importação.

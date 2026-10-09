# Medição de mutação no diff da PR

O job opcional `mutation-score` usa `scripts/mutation-diff.mjs` e
`stryker.diff.config.json`. A configuração completa `stryker.config.json` e
suas metas existentes permanecem inalteradas.

## Execução

Apenas arquivos TypeScript adicionados ou modificados no diff com a base da PR
são analisados. O seletor respeita os globs simples/recursivos e exclusões da
configuração; arquivos `.test.ts` ficam fora da mutação. Quando nenhum arquivo
se enquadra no escopo, a execução informa o skip sem iniciar Stryker.

O script passa a lista completa em uma configuração temporária e executa o
Stryker sem shell. O relatório anterior é removido para evitar leitura de dados
antigos. Falhas de execução, relatório inválido ou ausência de mutantes válidos
nos arquivos selecionados são informadas como falhas de medição.

- Score abaixo de 50%: script retorna 1.
- Entre 50% e 80%: script retorna 0 com aviso.
- A partir de 80%: script retorna 0.

Na fase atual o job usa `continue-on-error: true`: seus resultados são
informativos, sem bloquear merge nem alterar os gates obrigatórios. Tornar a
medição obrigatória exige mudança explícita de política, workflow e regras.

## Interpretação

Score bruto = (Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage).
Erros de compilação/runtime e mutantes ignorados não contam como mortos.
Survivors reais indicam testes que não detectaram a alteração. Mutantes
comprovadamente equivalentes podem ser documentados para análise humana;
essa documentação não transforma um survivor em morto nem modifica o score
bruto publicado. Guards defensivos não são automaticamente equivalentes.

## Uso local

```sh
node --test scripts/__tests__/mutation-diff.test.mjs
node scripts/mutation-diff.mjs
node scripts/mutation-diff.mjs --base origin/staging
```

O relatório fica em `reports/mutation/mutation-diff.json` e é enviado como
artifact pelo CI. O arquivo incremental é um cache gerado pelo Stryker, não
prova de validação; a primeira execução deve funcionar sem um cache pronto.
Não execute dois Strykers simultaneamente nesta máquina.

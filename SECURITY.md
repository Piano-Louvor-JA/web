# Security Policy

## Versões Suportadas

| Versão | Suportada          |
|--------|--------------------|
| 1.x    | :white_check_mark: |

## Reportando uma Vulnerabilidade

Se você descobrir uma vulnerabilidade de segurança, **NÃO** abra uma issue pública.

Use o [canal privado de vulnerabilidades do GitHub](https://github.com/Piano-Louvor-JA/web/security/advisories/new) deste repositório. Inclua:

1. Descrição da vulnerabilidade
2. Passos para reproduzir
3. Impacto possível
4. Sugestão de correção (se houver)

### Acompanhamento

A equipe acompanha o relato pelo canal privado do GitHub. A prioridade e os próximos passos serão definidos conforme impacto, gravidade e possibilidade de reprodução. Não há prazo fixo de resposta ou correção garantido.

Não inclua credenciais, dados pessoais reais ou informações sensíveis desnecessárias na reprodução.

### Escopo

- Vulnerabilidades no código do aplicativo web
- Problemas de autenticação/autorização
- Exposição de dados sensíveis
- Injeção de conteúdo executável (XSS) e falhas de validação de arquivos importados

### Fora de Escopo

- Vulnerabilidades em dependências de terceiros sem PoC no nosso código
- Ataques de força bruta ou DoS sem bypass de rate limiting
- Reports de scanners automatizados sem análise manual

## Práticas de Segurança

- Nunca commite secrets, tokens ou credenciais
- Use variáveis de ambiente para configuração sensível
- Valide dados recebidos da API e arquivos importados antes de utilizá-los
- Evite inserir conteúdo não confiável como HTML e preserve as proteções de autenticação

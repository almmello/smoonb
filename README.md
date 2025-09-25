# smoonb 🚀

> **⚠️ VERSÃO EXPERIMENTAL - NÃO TESTADA - USE POR SUA CONTA E RISCO ⚠️**

## 🚨 **AVISO IMPORTANTE - LEIA ANTES DE USAR**

**Este software está em desenvolvimento inicial e NUNCA foi testado em produção.**

- ❌ **NÃO TESTE** este aplicativo em projetos importantes
- ❌ **NÃO USE** em dados críticos ou produção
- ⚠️ **RESULTADOS IMPREVISÍVEIS** - podem causar perdas irreparáveis de dados
- ⚠️ **NÃO NOS RESPONSABILIZAMOS** por qualquer perda de dados
- ⚠️ **USE POR SUA CONTA E RISCO** - você é o único responsável

**Desenvolvido por:** [Goalmoon Tecnologia LTDA](https://goalmoon.com)

## 🎯 O Problema que Resolvemos

As ferramentas existentes fazem apenas backup da database PostgreSQL, ignorando componentes críticos:

- ❌ **Edge Functions** - Código serverless perdido
- ❌ **Auth Settings** - Configurações de autenticação perdidas  
- ❌ **Storage Objects** - Arquivos e buckets perdidos
- ❌ **Realtime Settings** - Configurações de tempo real perdidas

**Resultado**: Falhas na restauração e perda de funcionalidades essenciais.

## ✅ Nossa Solução

smoonb é a **primeira ferramenta** que faz backup **COMPLETO** do Supabase:

- ✅ **Database PostgreSQL** - Backup completo com pg_dump
- ✅ **Edge Functions** - Código e configurações
- ✅ **Auth Settings** - Políticas e configurações
- ✅ **Storage Objects** - Arquivos e metadados
- ✅ **Realtime Settings** - Configurações de tempo real
- ✅ **Metadados** - Todas as configurações do projeto

## 🚀 Comandos Principais

```bash
# Backup completo do projeto
smoonb backup

# Restauração completa
smoonb restore

# Gerenciamento de secrets
smoonb secrets export
smoonb secrets import

# Deploy de Edge Functions
smoonb functions push

# Checklist pós-restore
smoonb check
```

## 📊 Comparação: smoonb vs Outras Ferramentas

| Funcionalidade | smoonb | Outras Ferramentas |
|---|---|---|
| Database PostgreSQL | ✅ Completo | ✅ Completo |
| Edge Functions | ✅ Backup + Restore | ❌ Não suportado |
| Auth Settings | ✅ Backup + Restore | ❌ Não suportado |
| Storage Objects | ✅ Backup + Restore | ❌ Não suportado |
| Realtime Settings | ✅ Backup + Restore | ❌ Não suportado |
| Metadados | ✅ Completo | ❌ Parcial |
| CLI Simples | ✅ Intuitivo | ⚠️ Complexo |
| Restauração Confiável | ✅ 100% | ⚠️ Parcial |

## 🛠️ Instalação

```bash
# Instalação global
npm install -g smoonb

# Ou uso local
npx smoonb --help
```

## ⚡ Quick Start

```bash
# 1. Configure suas credenciais Supabase
smoonb config

# 2. Faça backup completo
smoonb backup --project-id your-project-id

# 3. Restaure em outro projeto
smoonb restore --project-id target-project-id

# 4. Verifique a restauração
smoonb check --project-id target-project-id
```

## 📋 Exemplos de Uso

### Backup Completo
```bash
smoonb backup \
  --project-id abc123def456 \
  --output ./backup-$(date +%Y%m%d) \
  --include-functions \
  --include-storage \
  --include-auth
```

### Restauração com Verificação
```bash
smoonb restore \
  --project-id xyz789uvw012 \
  --backup-dir ./backup-20241201 \
  --verify \
  --clean-restore
```

### Migração Entre Projetos
```bash
# 1. Backup do projeto origem
smoonb backup --project-id source-project

# 2. Export secrets (opcional)
smoonb secrets export --project-id source-project

# 3. Restore no projeto destino
smoonb restore --project-id target-project

# 4. Import secrets (opcional)
smoonb secrets import --project-id target-project

# 5. Verificação final
smoonb check --project-id target-project
```

## 🔧 Configuração

Crie um arquivo `.smoonbrc` na raiz do seu projeto:

```json
{
  "supabase": {
    "url": "https://your-project.supabase.co",
    "serviceKey": "your-service-key"
  },
  "backup": {
    "includeFunctions": true,
    "includeStorage": true,
    "includeAuth": true,
    "outputDir": "./backups"
  }
}
```

## 📝 Licenciamento

### 🆓 Versão Experimental Gratuita (Versões 0.x.x)

- ✅ **Uso gratuito** para projetos pessoais e comerciais
- ✅ **Sem restrições** de funcionalidades
- ❌ **SEM SUPORTE** - apenas aceitamos contribuições
- ⚠️ **USE POR SUA CONTA E RISCO** - software não testado

### 💼 Licença Comercial (Versões 1.0.0+)

**AVISO**: A partir da versão 1.0.0, o smoonb será licenciado comercialmente.

- 📧 **Aviso prévio**: Mudanças serão anunciadas 90 dias antes
- 💰 **Desconto especial**: Usuários experimentais terão condições preferenciais
- 🔄 **Migração suave**: Processo transparente e bem comunicado

[📖 Leia a licença completa](./LICENSE.md)

## 🤝 Contribuição

**Este é um projeto experimental - contribuições são bem-vindas!**

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 🐛 Reportar Bugs

Encontrou um bug? [Abra uma issue](https://github.com/almmello/smoonb/issues) com:

- Descrição detalhada do problema
- Passos para reproduzir
- Logs de erro (se houver)
- Versão do smoonb e Node.js

## 📞 Suporte e Contato

- 🐛 **Bugs**: [GitHub Issues](https://github.com/almmello/smoonb/issues)
- 💬 **Discussões**: [GitHub Discussions](https://github.com/almmello/smoonb/discussions)
- 📧 **Licenciamento**: licensing@goalmoon.com
- 🏢 **Empresa**: [Goalmoon Tecnologia LTDA](https://goalmoon.com)

### ☕ Apoie o Desenvolvimento

Se este projeto te ajudou e você gostaria de apoiar o desenvolvimento:

- ☕ **Compre um café**: [Link de pagamento](https://pag.ae/7Yj8QjQjQ) 
- ⭐ **Dê uma estrela** no GitHub
- 🐛 **Reporte bugs** e contribua com melhorias
- 📢 **Compartilhe** com outros desenvolvedores

**⚠️ IMPORTANTE**: Este software está em desenvolvimento inicial e NUNCA foi testado em produção. Não oferecemos suporte técnico neste estágio - apenas aceitamos contribuições da comunidade.

## 📄 Changelog

### v0.0.1 (EXPERIMENTAL)
- 🎉 Lançamento inicial da versão experimental
- ⚠️ **NUNCA TESTADO EM PRODUÇÃO** - use por sua conta e risco
- ✅ Backup completo de projetos Supabase (implementação inicial)
- ✅ Restauração com verificação (implementação inicial)
- ✅ Suporte a Edge Functions, Auth, Storage e Realtime (implementação inicial)
- ✅ CLI intuitivo e documentação completa
- 🏢 Desenvolvido por Goalmoon Tecnologia LTDA

---

**smoonb** - A ferramenta definitiva para backup e migração de projetos Supabase 🚀

*Desenvolvido com ❤️ para a comunidade Supabase*

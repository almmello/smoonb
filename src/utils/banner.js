const chalk = require('chalk');

/**
 * Banner da versão experimental
 */
function showBetaBanner() {
  console.log(chalk.red.bold(`
╔══════════════════════════════════════════════════════════════╗
║                    🚀 smoonb                                ║
║                                                              ║
║              ⚠️  EXPERIMENTAL VERSION - NÃO TESTADA!        ║
║                                                              ║
║  🚨 AVISO: Este software NUNCA foi testado em produção!     ║
║  ⚠️  USE POR SUA CONTA E RISCO - Pode causar perda de dados ║
║  ❌ NÃO NOS RESPONSABILIZAMOS por qualquer perda de dados   ║
║                                                              ║
║  A primeira ferramenta CLI completa para backup e migração  ║
║  de projetos Supabase. Resolve o problema de backup        ║
║  incompleto das ferramentas existentes.                     ║
║                                                              ║
║  ✅ Database PostgreSQL + Edge Functions + Auth Settings     ║
║  ✅ Storage Objects + Realtime Settings + Metadados          ║
║                                                              ║
║  🏢 Desenvolvido por: Goalmoon Tecnologia LTDA              ║
║  🌐 Website: https://goalmoon.com                           ║
║  📖 Documentação: https://github.com/almmello/smoonb       ║
║  🐛 Issues: https://github.com/almmello/smoonb/issues      ║
╚══════════════════════════════════════════════════════════════╝
`));
}

module.exports = { showBetaBanner };

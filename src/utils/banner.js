const chalk = require('chalk');

/**
 * Banner principal do smoonb
 */
function showBetaBanner() {
  console.log(chalk.cyan.bold('\n🚀 Supa Moonbase (smoonb)\n'));
  console.log(chalk.white('A primeira ferramenta CLI completa para backup e migração de projetos Supabase.'));
  console.log(chalk.white('Resolve o problema de backup incompleto das ferramentas existentes.\n'));
  
  console.log(chalk.cyan.bold('📦 Componentes de Backup:\n'));
  console.log(chalk.white('  ✅ Database PostgreSQL (pg_dumpall + SQL separados)'));
  console.log(chalk.white('  ✅ Database Extensions and Settings'));
  console.log(chalk.white('  ✅ Custom Roles'));
  console.log(chalk.white('  ✅ Edge Functions'));
  console.log(chalk.white('  ✅ Auth Settings'));
  console.log(chalk.white('  ✅ Storage Buckets'));
  console.log(chalk.white('  ✅ Realtime Settings'));
  console.log(chalk.white('  ✅ Supabase .temp'));
  console.log(chalk.white('  ✅ Migrations\n'));
  
  console.log(chalk.white('🏢 Desenvolvido por: Goalmoon Tecnologia LTDA'));
  console.log(chalk.cyan('🌐 Website: https://smoonb.com'));
  console.log(chalk.cyan('📖 Documentação: https://github.com/almmello/smoonb'));
  console.log(chalk.cyan('🐛 Issues: https://github.com/almmello/smoonb/issues\n'));
}

module.exports = { showBetaBanner };

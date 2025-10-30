const chalk = require('chalk');

/**
 * Função para mostrar mensagens educativas e encerrar elegantemente
 */
function showDockerMessagesAndExit(reason) {
  console.log('');
  
  switch (reason) {
    case 'docker_not_installed':
      console.log(chalk.red('❌ DOCKER DESKTOP NÃO ENCONTRADO'));
      console.log('');
      console.log(chalk.yellow('📋 Para fazer backup completo do Supabase, você precisa:'));
      console.log(chalk.yellow('   1. Instalar Docker Desktop'));
      console.log(chalk.yellow('   2. Executar Docker Desktop'));
      console.log(chalk.yellow('   3. Repetir o comando de backup'));
      console.log('');
      console.log(chalk.blue('🔗 Download: https://docs.docker.com/desktop/install/'));
      console.log('');
      console.log(chalk.gray('💡 O Docker Desktop é obrigatório para backup completo do Supabase'));
      console.log(chalk.gray('   - Database PostgreSQL'));
      console.log(chalk.gray('   - Edge Functions'));
      console.log(chalk.gray('   - Todos os componentes via Supabase CLI'));
      break;

    case 'docker_not_running':
      console.log(chalk.red('❌ DOCKER DESKTOP NÃO ESTÁ EXECUTANDO'));
      console.log('');
      console.log(chalk.yellow('📋 Para fazer backup completo do Supabase, você precisa:'));
      console.log(chalk.yellow('   1. Abrir Docker Desktop'));
      console.log(chalk.yellow('   2. Aguardar inicialização completa'));
      console.log(chalk.yellow('   3. Repetir o comando de backup'));
      console.log('');
      console.log(chalk.blue('💡 Dica: Docker Desktop deve estar rodando em segundo plano'));
      console.log('');
      console.log(chalk.gray('💡 O Docker Desktop é obrigatório para backup completo do Supabase'));
      console.log(chalk.gray('   - Database PostgreSQL'));
      console.log(chalk.gray('   - Edge Functions'));
      console.log(chalk.gray('   - Todos os componentes via Supabase CLI'));
      break;

    case 'supabase_cli_not_found':
      console.log(chalk.red('❌ SUPABASE CLI NÃO ENCONTRADO'));
      console.log('');
      console.log(chalk.yellow('📋 Para fazer backup completo do Supabase, você precisa:'));
      console.log(chalk.yellow('   1. Instalar Supabase CLI'));
      console.log(chalk.yellow('   2. Repetir o comando de backup'));
      console.log('');
      console.log(chalk.blue('🔗 Instalação: npm install -g supabase'));
      console.log('');
      console.log(chalk.gray('💡 O Supabase CLI é obrigatório para backup completo do Supabase'));
      console.log(chalk.gray('   - Database PostgreSQL'));
      console.log(chalk.gray('   - Edge Functions'));
      console.log(chalk.gray('   - Todos os componentes via Docker'));
      break;
  }

  console.log('');
  console.log(chalk.red('🚫 Backup cancelado - Pré-requisitos não atendidos'));
  console.log(chalk.gray('   Instale os componentes necessários e tente novamente'));
  console.log('');
  
  process.exit(1);
}

module.exports = {
  showDockerMessagesAndExit
};


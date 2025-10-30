const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');

/**
 * Etapa 1: Backup Database via pg_dumpall Docker (idêntico ao Dashboard)
 */
module.exports = async ({ databaseUrl, backupDir }) => {
  try {
    console.log(chalk.gray('   - Criando backup completo via pg_dumpall...'));
    
    // Extrair credenciais da databaseUrl
    const urlMatch = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    
    if (!urlMatch) {
      throw new Error('Database URL inválida');
    }
    
    const [, username, password, host, port] = urlMatch;
    
    // Gerar nome do arquivo igual ao dashboard
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const fileName = `db_cluster-${day}-${month}-${year}@${hours}-${minutes}-${seconds}.backup`;
    
    // Usar caminho absoluto igual às Edge Functions
    const backupDirAbs = path.resolve(backupDir);
    
    // Comando pg_dumpall via Docker
    const dockerCmd = [
      'docker run --rm --network host',
      `-v "${backupDirAbs}:/host"`,
      `-e PGPASSWORD="${password}"`,
      'postgres:17 pg_dumpall',
      `-h ${host}`,
      `-p ${port}`,
      `-U ${username}`,
      `-f /host/${fileName}`
    ].join(' ');
    
    console.log(chalk.gray('   - Executando pg_dumpall via Docker...'));
    execSync(dockerCmd, { stdio: 'pipe' });
    
    // Compactar igual ao Supabase Dashboard
    const gzipCmd = [
      'docker run --rm',
      `-v "${backupDirAbs}:/host"`,
      `postgres:17 gzip /host/${fileName}`
    ].join(' ');
    
    execSync(gzipCmd, { stdio: 'pipe' });
    
    const finalFileName = `${fileName}.gz`;
    const stats = await fs.stat(path.join(backupDir, finalFileName));
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    console.log(chalk.green(`     ✅ Database backup: ${finalFileName} (${sizeKB} KB)`));
    
    return { success: true, size: sizeKB, fileName: finalFileName };
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro no backup do database: ${error.message}`));
    return { success: false };
  }
};

